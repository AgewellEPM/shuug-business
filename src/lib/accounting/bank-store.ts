import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { journalState, executeJournalCommand, type JournalState } from "./journal-store";
import { standardAccounts } from "./account-model";
import { assertPeriodOpen, entriesDigest } from "./periods";
import { parseStatementCsv } from "./bank-import";
import { bankCommandInput, statementCreate, statementMatch, statementPost, statementFinish, bankAmount, selectedEntries, verifyStatementMatches, type BankState, type BankStatement } from "./bank-model";
import type { JournalEntry } from "./ledger";
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceUser } from "../auth/identity";
import { checkBook } from "./client-books";
function state(s: JournalState): BankState { const value = s as JournalState & { bank?: BankState }; return value.bank ??= { statements: [], commands: {} }; }
function must(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function ledger(s: JournalState, external: JournalEntry[]) { return [...external.filter(e => !s.entries.some(r => r.entry.id === e.id)), ...s.entries.map(r => r.entry)]; }
export function bankStatements(bookId = "office") { return journalState(bookId).change(s => state(s).statements); }
/** Journal posting and matching share one SQLite transaction and retry receipt. */
export function executeBankCommand(raw: unknown, user: WorkspaceUser, bookId: string, external: JournalEntry[] = []) {
  const cmd = bankCommandInput.parse(raw), actor = `${user.name} (${user.id})`;
  const hash = createHash("sha256").update(JSON.stringify({ cmd, actor, bookId })).digest("hex");
  return journalState(bookId).change((s, db) => {
    checkBook(db, bookId, user, true);
    const bank = state(s), prior = bank.commands[cmd.requestId];
    if (prior) { must(prior.hash === hash, "This request ID was already used for another statement action."); return prior.result; }
    let entries = ledger(s, external), statement: BankStatement;
    const accounts = s.accounts ?? standardAccounts();
    if (cmd.action === "statement.import") {
      const v = statementCreate.parse(cmd.input), account = accounts.find(a => a.number === v.accountNumber);
      must(account?.active && account.classification === "bank", "Choose an active bank account from this book's chart.");
      must(v.from <= v.through && v.through <= new Date().toISOString().slice(0,10), "Choose an actual statement period ending no later than today.");
      assertPeriodOpen(db, v.from, bookId);
      must(!bank.statements.some(b => b.accountNumber === v.accountNumber && (b.status === "review" || b.reference === v.reference || !(b.through < v.from || b.from > v.through))), "Finish the existing statement, or choose a new non-overlapping statement and reference.");
      const preceding = bank.statements.filter(b => b.accountNumber === v.accountNumber).sort((a,b) => b.through.localeCompare(a.through))[0];
      if (preceding) { verifyStatementMatches(preceding, entries); must(v.from > preceding.through && v.openingCents === preceding.closingCents && !v.openingEntryIds.length, "The next statement must follow the prior close and carry its ending balance."); }
      const opening = selectedEntries(entries, v.openingEntryIds);
      if (!preceding) must(opening.every(e => e.date < v.from && bankAmount(e, v.accountNumber) !== 0) && opening.reduce((n,e) => n + bankAmount(e, v.accountNumber), 0) === v.openingCents, "Select the previously cleared journal entries that equal this first statement's opening balance.");
      const rows = parseStatementCsv(v.csv, v.mapping, `shuug-statement:${v.from}:${v.through}`);
      must(rows.every(r => r.date >= v.from && r.date <= v.through), "Every imported transaction must fall within the statement period.");
      must(v.openingCents + rows.reduce((n,r) => n + r.amountCents, 0) === v.closingCents, "Opening balance plus imported transactions must exactly equal the statement ending balance.");
      must(!rows.some(r => bank.statements.some(b => b.accountNumber === v.accountNumber && b.rows.some(old => old.reference === r.reference))), "A bank transaction reference was already imported for this account.");
      statement = { id: randomUUID(), revision: 1, accountNumber: v.accountNumber, from: v.from, through: v.through, openingCents: v.openingCents, closingCents: v.closingCents, reference: v.reference, rows, ...(v.mapping ? { mapping: v.mapping } : {}), openingEntryIds: v.openingEntryIds, openingDigest: entriesDigest(opening), matches: [], status: "review", actor, createdAt: new Date().toISOString() };
      bank.statements.push(statement);
    } else {
      const identity = z.object({ id: z.uuid(), revision: z.number().int().positive() }).parse(cmd.input);
      const found = bank.statements.find(b => b.id === identity.id); must(found && found.status === "review" && found.revision === identity.revision, "This statement changed or is already reconciled. Reload before continuing."); statement = found;
      assertPeriodOpen(db, statement.through, bookId);
      const used = new Set(bank.statements.filter(b => b.accountNumber === statement.accountNumber).flatMap(b => [...b.openingEntryIds, ...b.matches.flatMap(m => m.entryIds)]));
      if (cmd.action === "statement.unmatch") {
        const v = z.object({ id: z.uuid(), revision: z.number().int().positive(), rowId: z.string(), reviewed: z.literal(true) }).strict().parse(cmd.input);
        must(statement.matches.some(m => m.rowId === v.rowId), "No match exists for this transaction."); statement.matches = statement.matches.filter(m => m.rowId !== v.rowId);
      } else if (cmd.action === "statement.finish") {
        statementFinish.parse(cmd.input);
        for (const prior of bank.statements.filter(b => b.accountNumber === statement.accountNumber)) verifyStatementMatches(prior, entries);
        must(statement.rows.every(row => statement.matches.some(m => m.rowId === row.id)), "Match every statement transaction before finishing.");
        const relevant = entries.filter(e => e.date <= statement.through && bankAmount(e, statement.accountNumber) !== 0);
        const cleared = relevant.filter(e => used.has(e.id));
        must(cleared.reduce((n,e) => n + bankAmount(e, statement.accountNumber), 0) === statement.closingCents, "Cleared journal entries do not equal the statement ending balance.");
        statement.endingBookCents = relevant.reduce((n,e) => n + bankAmount(e, statement.accountNumber), 0);
        statement.outstanding = relevant.filter(e => !used.has(e.id)).map(e => ({ id: e.id, date: e.date, memo: e.memo, amountCents: bankAmount(e, statement.accountNumber) }));
        statement.status = "reconciled"; statement.reconciledAt = new Date().toISOString(); statement.reconciledBy = actor;
      } else {
        const v = cmd.action === "statement.post" ? statementPost.parse(cmd.input) : statementMatch.parse(cmd.input);
        const row = statement.rows.find(r => r.id === v.rowId); must(row && !statement.matches.some(m => m.rowId === row.id), "Select an unmatched statement transaction.");
        let entryIds: string[];
        if ("allocations" in v) {
          must(v.allocations.reduce((n,a) => n + a.amountCents, 0) === Math.abs(row.amountCents), "Split allocations must equal the statement transaction amount.");
          for (const a of v.allocations) must(a.accountNumber !== statement.accountNumber && accounts.some(ac => ac.number === a.accountNumber && ac.active), "Choose active offset accounts different from the statement bank account.");
          const lines = [{ accountNumber: statement.accountNumber, debitCents: Math.max(0,row.amountCents), creditCents: Math.max(0,-row.amountCents) }, ...v.allocations.map(a => ({ accountNumber: a.accountNumber, debitCents: row.amountCents < 0 ? a.amountCents : 0, creditCents: row.amountCents > 0 ? a.amountCents : 0 }))];
          const referenceLabel = statement.mapping?.referenceColumn === null ? "Statement row" : "Bank export";
          const result = executeJournalCommand({ requestId: cmd.requestId, action: "journal.post", input: { date: row.date, memo: `${row.description} · ${referenceLabel} ${row.reference}`, lines, reviewed: true } }, actor, bookId);
          entryIds = [result.id]; entries = ledger(s, external);
        } else entryIds = v.entryIds;
        const chosen = selectedEntries(entries, entryIds);
        must(chosen.every(e => !used.has(e.id) && e.date <= statement.through && bankAmount(e, statement.accountNumber) !== 0), "Select uncleared entries for this bank account, dated no later than the statement end.");
        must(chosen.reduce((n,e) => n + bankAmount(e, statement.accountNumber), 0) === row.amountCents, "Selected journal entries must exactly equal the signed bank amount.");
        statement.matches.push({ rowId: row.id, entryIds, digest: entriesDigest(chosen) });
      }
      statement.revision++;
    }
    audit(db, statement, cmd.action, actor);
    const result = { id: statement.id }; bank.commands[cmd.requestId] = { hash, result }; return result;
  });
}
function audit(db: DatabaseSync, statement: BankStatement, action: string, actor: string) { db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(statement.id, actor, action, new Date().toISOString(), JSON.stringify(statement)); }
