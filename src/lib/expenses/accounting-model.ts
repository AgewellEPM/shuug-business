import { z } from "zod";
import { dateOnly, expenseFieldsSchema, type ExpenseFields } from "./model";
const cents = z.number().int().min(1).max(100_000_000);
const account = z.number().int().positive();
const evidence = z.string().trim().min(3).max(2000);
const version = { id: z.uuid(), revision: z.number().int().positive() };
export const allocationInput = z.object({ accountNumber: account, amountCents: cents, purpose: z.enum(["operating", "cost_of_sales", "inventory", "asset", "tax"]) }).strict();
export const valuationInput = z.object({ homeAmountCents: cents, conversionEvidence: z.string().trim().max(2000), allocations: z.array(allocationInput).min(1).max(100), dueDate: dateOnly }).strict();
export const settlementDetailsInput = z.object({ date: dateOnly, amountCents: cents, homeAmountCents: cents, accountNumber: account,
  feeCents: z.number().int().min(0).max(100_000_000), fxAccountNumber: account.nullable(), reference: z.string().trim().min(1).max(160), evidence,
}).strict();
export const expensePostInput = z.object({ ...version, ...valuationInput.shape, settlement: settlementDetailsInput.nullable(), evidence, reviewed: z.literal(true) }).strict();
export const expenseCreateInput = expensePostInput.omit({ id: true, revision: true }).extend({ fields: expenseFieldsSchema, confirmDuplicate: z.boolean().default(false) }).strict();
export const expenseSettleInput = z.object({ ...version, ...settlementDetailsInput.shape, reviewed: z.literal(true) }).strict();
export const expenseCorrectInput = z.object({ ...version, fields: expenseFieldsSchema, ...valuationInput.shape, date: dateOnly, evidence, reviewed: z.literal(true) }).strict();
export const expenseVoidInput = z.object({ ...version, date: dateOnly, evidence, reviewed: z.literal(true) }).strict();
export const expenseReverseSettlementInput = z.object({ ...version, settlementId: z.uuid(), date: dateOnly, homeAmountCents: cents,
  feeRefundCents: z.number().int().min(0).max(100_000_000), additionalFeeCents: z.number().int().min(0).max(100_000_000), fxAccountNumber: account.nullable(),
  reference: z.string().trim().min(1).max(160), evidence, reviewed: z.literal(true) }).strict();
export const expenseTransferInput = z.object({ ...version, fromAccount: account, toAccount: account, evidence, reviewed: z.literal(true) }).strict();
export const expenseSchemas = { "expense.create": expenseCreateInput, "expense.post": expensePostInput, "expense.settle": expenseSettleInput, "expense.correct": expenseCorrectInput, "expense.void": expenseVoidInput, "expense.settlement.reverse": expenseReverseSettlementInput, "expense.transfer": expenseTransferInput } as const;
export const expenseCommandInput = z.object({ requestId: z.uuid(), action: z.enum(Object.keys(expenseSchemas) as [keyof typeof expenseSchemas, ...(keyof typeof expenseSchemas)[]]), input: z.record(z.string(), z.unknown()) }).strict();
export function expenseAccountingCatalog() { return Object.entries(expenseSchemas).map(([action, schema]) => ({ action, inputSchema: z.toJSONSchema(schema) })); }
export type ExpenseAllocation = z.infer<typeof allocationInput>;
export interface ExpenseSettlement extends z.infer<typeof settlementDetailsInput> {
  id: string; carryingAmountCents: number; journalId: string; actor: string; recordedAt: string;
  reversal: { date: string; homeAmountCents: number; feeRefundCents: number; additionalFeeCents: number; fxAccountNumber: number | null; reference: string; evidence: string; actor: string; recordedAt: string; journalId: string } | null;
}
export interface ExpenseAccounting {
  mode: "bill" | "transfer"; status: "posted" | "voided"; fields: ExpenseFields;
  homeAmountCents: number; conversionEvidence: string; allocations: ExpenseAllocation[]; dueDate: string;
  recognitionJournalId: string; postedAt: string; postedBy: string; evidence: string;
  settlements: ExpenseSettlement[]; lastEventDate: string;
  voidedAt?: string; voidedBy?: string; voidEvidence?: string;
}
export function expenseOutstanding(a: ExpenseAccounting) {
  const settled = a.settlements.filter(p => !p.reversal), amount = settled.reduce((n, p) => n + p.amountCents, 0), home = settled.reduce((n, p) => n + p.carryingAmountCents, 0);
  return { amountCents: a.status === "voided" || a.mode === "transfer" ? 0 : (a.fields.amountCents ?? 0) - amount,
    homeAmountCents: a.status === "voided" || a.mode === "transfer" ? 0 : a.homeAmountCents - home, settledAmountCents: amount, settledHomeAmountCents: home };
}
