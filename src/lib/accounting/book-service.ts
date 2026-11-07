import { randomUUID } from "node:crypto";
import type { WorkspaceUser } from "../auth/identity";
import { z } from "zod";
import { requireBook, checkBook } from "./client-books";
import { chartOfAccounts, manualJournalData, executeJournalCommand, executeAccountCommand, journalState } from "./journal-store";
import { loadLedger } from "./ledger-load";
import { financialReports } from "./reports";
import { periodHistory, changePeriod, readPeriods } from "./periods";
import { bankStatements, executeBankCommand } from "./bank-store";
import { bankAmount, verifyStatementMatches } from "./bank-model";
import type { JournalEntry } from "./ledger";
export async function bookView(bookId: string, user: WorkspaceUser) {
  const book = requireBook(bookId, user);
  const ledger = bookId === "office" ? await loadLedger() : { entries: manualJournalData(bookId).entries, issues: [] as string[] };
  const accounts = chartOfAccounts(bookId).accounts;
  return { book: book ?? { id: "office", name: "Office books", currency: "USD" }, entries: ledger.entries, issues: ledger.issues, accounts,
    reports: financialReports(ledger.entries, accounts), statements: bankStatements(bookId), periods: periodHistory(bookId), canEdit: user.isOwner || !!book?.grants.some(g => g.accountId === user.id && g.level === "edit") };
}
export async function bookCommand(bookId: string, raw: unknown, user: WorkspaceUser) {
  requireBook(bookId, user, true);
  const v = z.object({ requestId: z.uuid(), action: z.string(), input: z.record(z.string(), z.unknown()) }).strict().parse(raw);
  const actor = `${user.name} (${user.id})`;
  if (v.action.startsWith("journal.")) return executeJournalCommand(v, actor, bookId);
  if (v.action === "account.save") return executeAccountCommand(v, actor, bookId);
  const view = await bookView(bookId, user);
  if (v.action.startsWith("statement.")) return executeBankCommand(v, user, bookId, view.entries);
  if (!["period.close", "period.reopen", "year.close"].includes(v.action)) throw new Error("Unknown accounting command.");
  if (!user.isOwner) throw new Error("The owner must approve closing or reopening books.");
  const input = z.object({ through: z.iso.date(), reason: z.string().trim().min(3).max(1000), reviewed: z.literal(true) }).strict().parse(v.input);
  if (view.issues.length && v.action !== "period.reopen") throw new Error("Resolve the accounting history warnings before closing.");
  return journalState(bookId).change((state, db) => {
    checkBook(db, bookId, user, true);
    const retry = db.prepare("SELECT request,result FROM commands WHERE id=?").get(v.requestId) as { request: string; result: string } | undefined;
    const request = JSON.stringify({ ...v, bookId, actor });
    if (retry) { if (retry.request !== request) throw new Error("This request ID belongs to a different action."); return JSON.parse(retry.result); }
    // Re-read manual postings under the write transaction; never close a stale UI snapshot.
    let entries: JournalEntry[] = [...view.entries.filter(e => !e.id.startsWith("manual:")), ...state.entries.map(r => r.entry)];
    if (v.action !== "period.reopen") {
      const statements = bankStatements(bookId);
      for (const account of view.accounts.filter(a => a.classification === "bank")) {
        if (!entries.some(e => e.date <= input.through && bankAmount(e, account.number))) continue;
        const statement = statements.find(s => s.accountNumber === account.number && s.through === input.through && s.status === "reconciled");
        if (!statement) throw new Error(`Reconcile ${account.name} through ${input.through} before closing.`);
        verifyStatementMatches(statement, entries);
      }
      if (statements.some(s => s.status === "review" && s.from <= input.through)) throw new Error("Finish open bank statements before closing.");
    }
    if (v.action === "year.close") {
      if (!input.through.endsWith("-12-31")) throw new Error("Calendar-year closing requires December 31.");
      if (state.entries.some(r => r.entry.source === `year-close:${input.through}`)) throw new Error("This year already has a retained-earnings closing entry.");
      if (readPeriods(db, bookId).active && input.through <= readPeriods(db, bookId).active!.through) throw new Error("Reopen the period before adding a year-end closing entry.");
      const report = financialReports(entries, view.accounts, { through: input.through });
      const lines = report.trialBalance.rows.filter(a => ["income", "cogs", "expense"].includes(a.type)).map(a => ({ accountNumber: a.accountNumber, debitCents: a.creditCents, creditCents: a.debitCents })).filter(l => l.debitCents || l.creditCents);
      const difference = lines.reduce((n,l) => n + l.debitCents - l.creditCents, 0);
      if (difference) lines.push({ accountNumber: 3900, debitCents: Math.max(0,-difference), creditCents: Math.max(0,difference) });
      if (lines.length) {
        const result = executeJournalCommand({ requestId: randomUUID(), action: "journal.post", input: { date: input.through, memo: `Year-end close: ${input.reason}`, reviewed: true, lines } }, actor, bookId);
        state.entries.find(r => r.entry.id === result.id)!.entry.source = `year-close:${input.through}`;
        entries = [...view.entries.filter(e => !e.id.startsWith("manual:")), ...state.entries.map(r => r.entry)];
      }
    }
    const result = changePeriod(db, bookId, { ...input, action: v.action === "period.reopen" ? "reopen" : "close" }, entries, actor);
    db.prepare("INSERT INTO commands VALUES(?,?,?)").run(v.requestId, request, JSON.stringify(result));
    return result;
  });
}
