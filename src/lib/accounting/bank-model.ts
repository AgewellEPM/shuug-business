import { z } from "zod";
import type { StatementRow } from "./bank-import";
import { statementMappingInput, type StatementMapping } from "./bank-import";
import type { JournalEntry } from "./ledger";
import { entriesDigest } from "./periods";
export interface Match { rowId: string; entryIds: string[]; digest: string }
export interface BankStatement { id: string; revision: number; accountNumber: number; from: string; through: string; openingCents: number; closingCents: number; reference: string; rows: StatementRow[]; mapping?: StatementMapping; matches: Match[]; openingEntryIds: string[]; openingDigest: string; status: "review" | "reconciled"; createdAt: string; actor: string; reconciledAt?: string; reconciledBy?: string; endingBookCents?: number; outstanding?: { id: string; date: string; memo: string; amountCents: number }[] }
export interface BankState { statements: BankStatement[]; commands: Record<string, { hash: string; result: { id: string } }> }
const amount = z.number().int().min(-99_999_999_999).max(99_999_999_999);
export const statementCreate = z.object({ accountNumber: z.number().int().positive(), from: z.iso.date(), through: z.iso.date(), openingCents: amount, closingCents: amount, reference: z.string().trim().min(1).max(160), csv: z.string().max(2_000_000), mapping: statementMappingInput.optional(), openingEntryIds: z.array(z.string().min(1).max(150)).max(10000).default([]), reviewed: z.literal(true) }).strict();
export const statementMatch = z.object({ id: z.uuid(), revision: z.number().int().positive(), rowId: z.string(), entryIds: z.array(z.string().min(1).max(150)).min(1).max(200), reviewed: z.literal(true) }).strict();
export const statementPost = z.object({ id: z.uuid(), revision: z.number().int().positive(), rowId: z.string(), allocations: z.array(z.object({ accountNumber: z.number().int().positive(), amountCents: z.number().int().positive().max(99_999_999_999) }).strict()).min(1).max(100), reviewed: z.literal(true) }).strict();
export const statementFinish = z.object({ id: z.uuid(), revision: z.number().int().positive(), reviewed: z.literal(true) }).strict();
export const bankCommandInput = z.object({ requestId: z.uuid(), action: z.enum(["statement.import", "statement.match", "statement.post", "statement.unmatch", "statement.finish"]), input: z.record(z.string(), z.unknown()) }).strict();
export function bankAmount(entry: JournalEntry, account: number) { return entry.lines.filter(l => l.accountNumber === account).reduce((n,l) => n + l.debitCents - l.creditCents, 0); }
export function selectedEntries(entries: JournalEntry[], ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error("An entry was selected more than once.");
  return ids.map(id => { const entry = entries.find(e => e.id === id); if (!entry) throw new Error("A selected journal entry is unavailable. Reload the ledger."); return entry; });
}
export function verifyStatementMatches(statement: BankStatement, entries: JournalEntry[]) {
  if (entriesDigest(selectedEntries(entries, statement.openingEntryIds)) !== statement.openingDigest) throw new Error("Opening entries changed after import. Review the original statement.");
  for (const match of statement.matches) if (entriesDigest(selectedEntries(entries, match.entryIds)) !== match.digest) throw new Error("A matched journal entry changed. Unmatch and review it before reconciliation.");
}
