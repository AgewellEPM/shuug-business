/**
 * Double-entry general ledger (QBD Ch. 2–3 — the real bookkeeping core).
 *
 * Every financial event is a balanced Journal Entry: total debits == total credits,
 * cents-only, no floats. The Trial Balance proves the books balance; the P&L and
 * Balance Sheet are then DERIVED FROM THE LEDGER (not computed ad-hoc), so the
 * statements always tie out to the accounts. Pure + fully tested.
 */
import { STANDARD_COA, type Account, type AccountType } from "./coa";

export interface JournalLine {
  accountNumber: number;
  /** exactly one of debit/credit is > 0 on a well-formed line. */
  debitCents: number;
  creditCents: number;
}

export interface JournalEntry {
  manual?: { revision: 1; actor: string; recordedAt: string; reversesId: string | null; reversedById: string | null; reason: string | null; imported: boolean };
  id: string;
  /** posting date, YYYY-MM-DD. */
  date: string;
  memo: string;
  /** provenance: "manual" or "order:<id>", "payment:<id>", "expense:<id>", etc. */
  source: string;
  lines: JournalLine[];
}

const accountByNumber = new Map(STANDARD_COA.map((a) => [a.number, a]));

/** Debit-normal account types increase with debits; credit-normal with credits. */
export function isDebitNormal(type: AccountType): boolean {
  return type === "asset" || type === "expense" || type === "cogs";
}

export function entryDebitTotal(entry: JournalEntry): number {
  return entry.lines.reduce((n, l) => n + l.debitCents, 0);
}
export function entryCreditTotal(entry: JournalEntry): number {
  return entry.lines.reduce((n, l) => n + l.creditCents, 0);
}

/** A valid entry: ≥2 lines, every line has exactly one non-zero side (≥0 ints), and debits==credits>0. */
export function validateEntry(entry: Pick<JournalEntry, "lines">, accounts: Account[] = STANDARD_COA): string | null {
  const accountByNumber = new Map(accounts.map(a => [a.number, a]));
  if (entry.lines.length < 2) return "A journal entry needs at least two lines.";
  for (const l of entry.lines) {
    if (!accountByNumber.has(l.accountNumber)) return `Unknown account ${l.accountNumber}.`;
    if (!Number.isSafeInteger(l.debitCents) || !Number.isSafeInteger(l.creditCents) || l.debitCents < 0 || l.creditCents < 0) return "Amounts must be safe whole cents ≥ 0.";
    if ((l.debitCents > 0) === (l.creditCents > 0)) return "Each line must be either a debit or a credit, not both or neither.";
  }
  const d = entryDebitTotal(entry as JournalEntry), c = entryCreditTotal(entry as JournalEntry);
  if (!Number.isSafeInteger(d) || !Number.isSafeInteger(c)) return "Journal totals exceed supported whole-cent precision.";
  if (d === 0) return "An entry can't be for zero.";
  if (d !== c) return `Debits (${d}) must equal credits (${c}).`;
  return null;
}

export function isBalanced(entry: JournalEntry): boolean {
  return validateEntry(entry) === null;
}

export interface TrialBalanceRow {
  accountNumber: number;
  name: string;
  type: AccountType;
  debitCents: number;   // shown in the debit column (0 if this account nets credit)
  creditCents: number;  // shown in the credit column
}
export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  balanced: boolean;
}

/** Roll every entry into per-account balances, presented in each account's normal column. */
export function trialBalance(entries: JournalEntry[], accounts: Account[] = STANDARD_COA): TrialBalance {
  const known = new Set(accounts.map(a => a.number));
  const net = new Map<number, number>(); // debit − credit, per account
  for (const e of entries) {
    for (const l of e.lines) {
      if (!known.has(l.accountNumber)) throw new Error(`Unknown ledger account ${l.accountNumber}; the report cannot omit it.`);
      if (!Number.isSafeInteger(l.debitCents) || !Number.isSafeInteger(l.creditCents)) throw new Error("Invalid ledger amount.");
      net.set(l.accountNumber, (net.get(l.accountNumber) ?? 0) + l.debitCents - l.creditCents);
    }
  }
  const rows: TrialBalanceRow[] = [];
  for (const acct of accounts) {
    const bal = net.get(acct.number) ?? 0;
    if (!Number.isSafeInteger(bal)) throw new Error("Account balance exceeds supported whole-cent precision.");
    if (bal === 0 && !net.has(acct.number)) continue; // untouched account — skip
    rows.push({
      accountNumber: acct.number, name: acct.name, type: acct.type,
      debitCents: bal > 0 ? bal : 0,
      creditCents: bal < 0 ? -bal : 0,
    });
  }
  const totalDebitCents = rows.reduce((n, r) => n + r.debitCents, 0);
  const totalCreditCents = rows.reduce((n, r) => n + r.creditCents, 0);
  if (!Number.isSafeInteger(totalDebitCents) || !Number.isSafeInteger(totalCreditCents)) throw new Error("Trial balance exceeds supported whole-cent precision.");
  return { rows, totalDebitCents, totalCreditCents, balanced: totalDebitCents === totalCreditCents };
}

/** The signed balance of an account in its NATURAL direction (debit-normal positive on debit). */
export function accountBalance(tb: TrialBalance, accountNumber: number): number {
  const row = tb.rows.find((r) => r.accountNumber === accountNumber);
  if (!row) return 0;
  const debitMinusCredit = row.debitCents - row.creditCents;
  if (debitMinusCredit === 0) return 0;
  return isDebitNormal(row.type) ? debitMinusCredit : -debitMinusCredit;
}

export interface LedgerIncomeStatement {
  incomeCents: number;
  cogsCents: number;
  grossProfitCents: number;
  expenseCents: number;
  netIncomeCents: number;
}

/** P&L straight from the ledger: sum credit-normal income, debit-normal cogs/expense. */
export function ledgerIncomeStatement(tb: TrialBalance): LedgerIncomeStatement {
  const sum = (type: AccountType) => tb.rows.filter((r) => r.type === type)
    .reduce((n, r) => n + (isDebitNormal(type) ? r.debitCents - r.creditCents : r.creditCents - r.debitCents), 0);
  const incomeCents = sum("income");
  const cogsCents = sum("cogs");
  const expenseCents = sum("expense");
  const grossProfitCents = incomeCents - cogsCents;
  return { incomeCents, cogsCents, grossProfitCents, expenseCents, netIncomeCents: grossProfitCents - expenseCents };
}

export interface LedgerBalanceSheet {
  assetsCents: number;
  liabilitiesCents: number;
  equityCents: number;
  /** current-period net income folded into equity so A = L + E holds. */
  netIncomeCents: number;
  balanced: boolean;
}

/** Balance sheet from the ledger. Equity includes period net income so it balances. */
export function ledgerBalanceSheet(tb: TrialBalance): LedgerBalanceSheet {
  const sum = (type: AccountType) => tb.rows.filter((r) => r.type === type)
    .reduce((n, r) => n + (isDebitNormal(type) ? r.debitCents - r.creditCents : r.creditCents - r.debitCents), 0);
  const assetsCents = sum("asset");
  const liabilitiesCents = sum("liability");
  const equityBookedCents = sum("equity");
  const netIncomeCents = ledgerIncomeStatement(tb).netIncomeCents;
  const equityCents = equityBookedCents + netIncomeCents;
  return { assetsCents, liabilitiesCents, equityCents, netIncomeCents, balanced: assetsCents === liabilitiesCents + equityCents };
}

export function accountName(accountNumber: number): string {
  return accountByNumber.get(accountNumber)?.name ?? `Account ${accountNumber}`;
}
export function coaAccounts(): Account[] {
  return STANDARD_COA;
}
