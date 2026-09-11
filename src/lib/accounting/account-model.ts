import { z } from "zod";
import { STANDARD_COA, type Account, type AccountType } from "./coa";
export const ACCOUNT_CLASSES = [
  { id: "bank", label: "Bank", type: "asset" }, { id: "receivable", label: "Accounts receivable", type: "asset" },
  { id: "current_asset", label: "Other current asset", type: "asset" }, { id: "fixed_asset", label: "Fixed asset", type: "asset" }, { id: "other_asset", label: "Other asset", type: "asset" },
  { id: "payable", label: "Accounts payable", type: "liability" }, { id: "credit_card", label: "Credit card", type: "liability" }, { id: "current_liability", label: "Other current liability", type: "liability" }, { id: "long_term_liability", label: "Long-term liability", type: "liability" },
  { id: "equity", label: "Equity", type: "equity" }, { id: "income", label: "Income", type: "income" }, { id: "cogs", label: "Cost of goods sold", type: "cogs" }, { id: "expense", label: "Expense", type: "expense" }, { id: "other_income", label: "Other income", type: "income" }, { id: "other_expense", label: "Other expense", type: "expense" },
] as const;
export type AccountClass = typeof ACCOUNT_CLASSES[number]["id"];
export interface WorkspaceAccount extends Account { classification: AccountClass; parentNumber: number | null; active: boolean; revision: number; system: boolean }
export const accountSaveInput = z.object({ number: z.number().int().min(1).max(999999999), revision: z.number().int().min(0), name: z.string().trim().min(1).max(150), classification: z.enum(ACCOUNT_CLASSES.map(c => c.id)), parentNumber: z.number().int().positive().nullable(), active: z.boolean(), reviewed: z.literal(true) }).strict();
export const accountCommandInput = z.object({ requestId: z.uuid(), action: z.literal("account.save"), input: accountSaveInput }).strict();
export function accountCatalog() { return { classifications: ACCOUNT_CLASSES, commands: [{ action: "account.save", inputSchema: z.toJSONSchema(accountSaveInput) }], maxLevels: 5 }; }
export function accountType(classification: AccountClass): AccountType { return ACCOUNT_CLASSES.find(c => c.id === classification)!.type; }
export function standardAccounts(): WorkspaceAccount[] {
  return STANDARD_COA.map(a => ({ ...a, classification: (a.number === 1000 || a.number === 1005 ? "bank" : a.number === 1200 ? "receivable" : a.type === "asset" ? "current_asset" : a.number === 2000 ? "payable" : a.type === "liability" ? "current_liability" : a.type), parentNumber: null, active: true, revision: 1, system: true }));
}
/** Validate every branch after a move, including descendants whose depth changed. */
export function validateAccountTree(accounts: WorkspaceAccount[]) {
  const byNumber = new Map(accounts.map(a => [a.number, a]));
  if (byNumber.size !== accounts.length) throw new Error("Account numbers must be unique.");
  for (const account of accounts) {
    const visited = new Set([account.number]); let cursor = account;
    while (cursor.parentNumber !== null) {
      const parent = byNumber.get(cursor.parentNumber);
      if (!parent) throw new Error("Choose an existing parent account.");
      if (visited.has(parent.number)) throw new Error("An account cannot become its own ancestor.");
      if (parent.classification !== cursor.classification) throw new Error("Parent and subaccount must have the same accounting classification.");
      if (cursor.active && !parent.active) throw new Error("An active subaccount needs an active parent. Inactivate children first.");
      visited.add(parent.number); if (visited.size > 5) throw new Error("Accounts support at most five levels, including the root account.");
      cursor = parent;
    }
  }
}
export function accountDepth(account: WorkspaceAccount, accounts: WorkspaceAccount[]): number {
  let depth = 0, current = account; const seen = new Set([account.number]);
  while (current.parentNumber !== null) { const parent = accounts.find(a => a.number === current.parentNumber); if (!parent || seen.has(parent.number)) break; seen.add(parent.number); depth++; current = parent; }
  return depth;
}
