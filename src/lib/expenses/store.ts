import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { dataDirectory } from "../connections/vault";
import { persistentState } from "../workspace/state";
import type { JournalEntry } from "../accounting/ledger";
import { expenseFieldsSchema, type Expense, type ExpenseFields, type ReceiptFile } from "./model";

export interface ExpenseState {
  records: Expense[]; journals: JournalEntry[];
  commands: Record<string, { hash: string; id: string }>;
  audit: { id: string; action: string; expenseId: string; actor: string; at: string; snapshot: Expense }[];
}
export function expenseDirectory() { const dir = path.join(dataDirectory(), "expenses"); mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir; }
const legacyReceipt = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), name: z.string(), extension: z.enum(["png", "jpg", "webp", "pdf", "heic"]), mime: z.string(), bytes: z.number().int().positive(), text: z.string(), extraction: z.enum(["read", "unavailable", "failed"]), message: z.string() });
const legacyExpense = z.object({ id: z.uuid(), revision: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), status: z.enum(["draft", "recorded", "archived"]), archivedFrom: z.enum(["draft", "recorded"]).optional(), fields: expenseFieldsSchema, receipt: legacyReceipt.nullable(), history: z.array(z.object({ revision: z.number().int().positive(), at: z.iso.datetime(), action: z.string(), status: z.enum(["draft", "recorded", "archived"]), fields: expenseFieldsSchema, actor: z.string().optional() })) });
/** Import once, without changing original JSON files or inventing past payments.
 * Those documents previously generated a mutable ledger estimate on every read. */
export const expenseState = persistentState<ExpenseState>("expenses", () => {
  const records: Expense[] = [];
  try {
    for (const file of readdirSync(expenseDirectory()).filter(s => /^[a-f0-9-]{36}\.json$/.test(s))) {
      const raw = JSON.parse(readFileSync(path.join(expenseDirectory(), file), "utf8"));
      if (raw.accounting) throw new Error("Unexpected accounting metadata in legacy receipt.");
      const record = legacyExpense.parse(raw);
      if (record.id !== file.slice(0, -5) || records.some(r => r.id === record.id || r.receipt && r.receipt.hash === record.receipt?.hash)) throw new Error("Duplicate or mismatched expense identity.");
      records.push(record);
    }
  } catch { throw new Error("Existing expense records cannot be imported. Repair or restore their JSON before continuing; the originals have not been replaced."); }
  return { records, journals: [], commands: {}, audit: [] };
});
export function expenseById(state: ExpenseState, id: string) { z.uuid().parse(id); const row = state.records.find(r => r.id === id); if (!row) throw new Error("Expense unavailable. Refresh the expense history."); return row; }
export function readExpense(id: string): Expense { return expenseState.change(s => expenseById(s, id)); }
export function listExpenses(): Expense[] { return expenseState.change(s => [...s.records].sort((a, b) => b.fields.date.localeCompare(a.fields.date) || b.updatedAt.localeCompare(a.updatedAt))); }
export function saveExpenseHistory(state: ExpenseState, row: Expense, action: string, actor: string) {
  row.updatedAt = new Date().toISOString();
  row.history.push({ revision: row.revision, at: row.updatedAt, action, actor, status: row.status, fields: structuredClone(row.fields) });
  state.audit.push({ id: randomUUID(), action, expenseId: row.id, actor, at: row.updatedAt, snapshot: structuredClone(row) });
  return row;
}
export function receiptPath(file: ReceiptFile) { if (!/^[a-f0-9]{64}$/.test(file.hash) || !["png", "jpg", "webp", "pdf", "heic"].includes(file.extension)) throw new Error("Invalid receipt file."); return path.join(expenseDirectory(), `${file.hash}.${file.extension}`); }
export function findReceipt(hash: string) { return listExpenses().find(r => r.receipt?.hash === hash); }
export function receiptHash(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
export function createReceiptExpense(fields: ExpenseFields, receipt: ReceiptFile, bytes: Buffer, actor = "Internal receipt workflow") {
  const parsed = expenseFieldsSchema.parse(fields);
  return expenseState.change(s => {
    const duplicate = s.records.find(r => r.receipt?.hash === receipt.hash); if (duplicate) return { expense: duplicate, duplicate: true };
    if (receiptHash(bytes) !== receipt.hash) throw new Error("Receipt checksum did not match.");
    const file = receiptPath(receipt);
    try { writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; if (!readFileSync(file).equals(bytes)) throw new Error("The saved receipt file does not match its checksum. Restore the original before continuing."); }
    const now = new Date().toISOString();
    const row: Expense = { id: randomUUID(), revision: 1, createdAt: now, updatedAt: now, status: "draft", fields: parsed, receipt, history: [] };
    s.records.push(row); saveExpenseHistory(s, row, "Receipt uploaded; awaiting review", actor);
    return { expense: row, duplicate: false };
  });
}
export function financialExpenseFields(fields: ExpenseFields) { const { notes, channel, ...financial } = fields; void notes; void channel; return financial; }
export function saveExpense(input: { id?: string; revision?: number; fields: ExpenseFields; status: "draft" | "recorded"; confirmDuplicate?: boolean }, actor = "Internal expense workflow") {
  return expenseState.change(s => {
    const fields = expenseFieldsSchema.parse(input.fields);
    if (!["draft", "recorded"].includes(input.status)) throw new Error("Choose draft or recorded.");
    if (input.status === "recorded" && (!fields.merchant || fields.amountCents === null)) throw new Error("Enter the business name and receipt total before recording this expense.");
    const row = input.id ? expenseById(s, input.id) : null;
    if (row && (row.revision !== input.revision || row.status === "archived")) throw new Error("This expense changed. Reload it before saving.");
    if (row?.accounting && (input.status !== "recorded" || JSON.stringify(financialExpenseFields(row.fields)) !== JSON.stringify(financialExpenseFields(fields)))) throw new Error("Posted financial details are preserved. Use a reviewed accounting correction; ordinary edits may change notes or channel only.");
    const checkDuplicate = input.status === "recorded" && (!row || row.status !== "recorded" || JSON.stringify(financialExpenseFields(row.fields)) !== JSON.stringify(financialExpenseFields(fields)));
    const duplicate = checkDuplicate && s.records.find(r => r.id !== row?.id && r.status === "recorded" && r.fields.merchant.toLowerCase() === fields.merchant.toLowerCase() && r.fields.date === fields.date && r.fields.amountCents === fields.amountCents && r.fields.currency === fields.currency && r.fields.kind === fields.kind);
    if (duplicate && !input.confirmDuplicate) return { duplicate: duplicate.id, expense: null };
    const now = new Date().toISOString();
    const expense: Expense = row ?? { id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, fields, status: input.status, receipt: null, history: [] };
    if (!row) s.records.push(expense); expense.revision++; expense.fields = fields; expense.status = input.status;
    return { expense: saveExpenseHistory(s, expense, input.status === "recorded" ? "Reviewed and recorded" : "Draft saved", actor), duplicate: null };
  });
}
export function archiveExpense(id: string, revision: number, restore = false, actor = "Internal expense workflow") {
  return expenseState.change(s => {
    const row = expenseById(s, id); if (row.revision !== revision) throw new Error("This expense changed. Reload it before continuing.");
    if (restore) { if (row.status !== "archived") throw new Error("This expense is already active."); row.status = row.archivedFrom ?? "draft"; delete row.archivedFrom; }
    else { if (row.status === "archived") throw new Error("This expense is already archived."); row.archivedFrom = row.status; row.status = "archived"; }
    row.revision++; return saveExpenseHistory(s, row, restore ? "Restored" : "Archived; accounting history retained", actor);
  });
}
