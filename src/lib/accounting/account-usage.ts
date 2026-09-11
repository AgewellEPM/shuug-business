import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ACCOUNT_CLASSES, accountType, standardAccounts, validateAccountTree, type WorkspaceAccount } from "./account-model";
const schema = z.array(z.object({
  number: z.number().int().positive(), name: z.string().min(1), type: z.enum(["asset", "liability", "equity", "income", "cogs", "expense"]),
  statement: z.enum(["balance-sheet", "profit-and-loss"]), classification: z.enum(ACCOUNT_CLASSES.map(c => c.id)),
  parentNumber: z.number().int().positive().nullable(), active: z.boolean(), revision: z.number().int().positive(), system: z.boolean(),
}));
/** Read within the caller's SQLite transaction: posting and account edits must
 * serialize together without opening a nested connection to the same database. */
export function transactionAccounts(db: DatabaseSync): WorkspaceAccount[] {
  const stored = db.prepare("SELECT body FROM documents WHERE id='state:manual-journal' AND kind='state'").get() as { body: string } | undefined;
  const raw = stored ? JSON.parse(stored.body).accounts : undefined;
  if (raw === undefined) return standardAccounts();
  const accounts = schema.parse(raw);
  if (accounts.some(a => a.type !== accountType(a.classification) || a.statement !== (["asset", "liability", "equity"].includes(a.type) ? "balance-sheet" : "profit-and-loss"))) throw new Error("The saved account directory is inconsistent. Repair it before posting.");
  validateAccountTree(accounts); return accounts;
}
export function markAccountUsed(db: DatabaseSync, number: number, source: string) {
  db.prepare("INSERT INTO documents(id,kind,body) VALUES(?,'account-use',?) ON CONFLICT(id) DO NOTHING").run(`account-use:${number}`, JSON.stringify({ source, at: new Date().toISOString() }));
}
export function accountHasSourceHistory(db: DatabaseSync, number: number) { return !!db.prepare("SELECT id FROM documents WHERE id=? AND kind='account-use'").get(`account-use:${number}`); }
