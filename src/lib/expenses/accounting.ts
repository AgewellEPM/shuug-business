import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { validateEntry, type JournalEntry, type JournalLine } from "../accounting/ledger";
import { markAccountUsed, transactionAccounts } from "../accounting/account-usage";
import type { WorkspaceAccount } from "../accounting/account-model";
import { businessDay } from "../history/dates";
import { expenseState, expenseById, saveExpense, saveExpenseHistory, type ExpenseState } from "./store";
import type { Expense, ExpenseFields } from "./model";
import { expenseCommandInput, expenseSchemas, expenseCreateInput, expensePostInput, expenseCorrectInput, expenseSettleInput, expenseReverseSettlementInput, expenseVoidInput, expenseTransferInput, expenseOutstanding, type ExpenseAllocation, type ExpenseSettlement, type valuationInput, type settlementDetailsInput } from "./accounting-model";

function must(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const debit = (accountNumber: number, debitCents: number): JournalLine => ({ accountNumber, debitCents, creditCents: 0 });
const credit = (accountNumber: number, creditCents: number): JournalLine => ({ accountNumber, creditCents, debitCents: 0 });
function reverse(lines: JournalLine[]) { return lines.map(l => ({ accountNumber: l.accountNumber, debitCents: l.creditCents, creditCents: l.debitCents })); }
function activeAccount(accounts: WorkspaceAccount[], number: number) { const account = accounts.find(a => a.number === number); must(account?.active, "Choose an active posting account."); return account; }
function dateBetween(date: string, first: string, today: string) { must(date >= first && date <= today, "Choose an actual date on or after the preceding accounting event and no later than today."); }
function valuation(fields: ExpenseFields, v: z.infer<typeof valuationInput>, accounts: WorkspaceAccount[]) {
  must(fields.amountCents && fields.merchant, "Record the vendor and receipt amount before posting.");
  must(fields.treatment !== "transfer", "Post transfers using the bank/card transfer form.");
  must(v.dueDate >= fields.date, "The due date cannot precede the bill date.");
  must(fields.currency !== "USD" || v.homeAmountCents === fields.amountCents, "USD receipts must retain their exact USD total.");
  must(fields.currency === "USD" || v.conversionEvidence.length >= 3, "Record the reviewed USD conversion evidence for this foreign-currency receipt.");
  must(v.allocations.reduce((n, l) => n + l.amountCents, 0) === v.homeAmountCents, "Account allocations must equal the reviewed USD total, including any tax allocation.");
  for (const line of v.allocations) {
    const account = activeAccount(accounts, line.accountNumber);
    const permitted = line.purpose === "operating" ? ["expense", "other_expense"].includes(account.classification)
      : line.purpose === "cost_of_sales" ? account.classification === "cogs"
      : line.purpose === "asset" ? ["fixed_asset", "other_asset"].includes(account.classification)
        : account.classification === "current_asset" && (!account.system || line.purpose === "inventory" && account.number === 1300);
    must(permitted, "The selected account does not match this allocation's expense, inventory, asset or recoverable-tax purpose.");
  }
}
function recognition(fields: ExpenseFields, total: number, allocations: ExpenseAllocation[]) {
  const lines = [...allocations.map(l => debit(l.accountNumber, l.amountCents)), credit(2000, total)];
  return fields.kind === "refund" ? reverse(lines) : lines;
}
function post(state: ExpenseState, db: DatabaseSync, accounts: WorkspaceAccount[], date: string, source: string, memo: string, lines: JournalLine[], allowInactive = false) {
  const entry: JournalEntry = { id: `expense-journal:${randomUUID()}`, date, source, memo, lines: lines.filter(l => l.debitCents || l.creditCents) };
  const error = validateEntry(entry, allowInactive ? accounts : accounts.filter(a => a.active)); must(!error, error ?? "Invalid expense journal.");
  state.journals.push(entry); for (const line of entry.lines) markAccountUsed(db, line.accountNumber, source); return entry.id;
}
function originalJournal(s: ExpenseState, id: string) { const entry = s.journals.find(e => e.id === id); must(entry, "The original expense posting is missing. Restore accounting history before continuing."); return entry; }
function uniquePaymentReference(s: ExpenseState, account: number, reference: string) {
  must(!s.records.some(e => e.accounting?.settlements.some(p => p.accountNumber === account && (p.reference.toLowerCase() === reference.toLowerCase() || p.reversal?.reference.toLowerCase() === reference.toLowerCase()))), "This payment account reference is already recorded. Check its original record before proceeding.");
}
function settle(s: ExpenseState, db: DatabaseSync, accounts: WorkspaceAccount[], row: Expense, input: z.infer<typeof settlementDetailsInput>, actor: string, today: string) {
  const a = row.accounting!; must(a.status === "posted" && a.mode === "bill", "Choose an active posted bill or vendor credit.");
  dateBetween(input.date, a.lastEventDate, today);
  const account = activeAccount(accounts, input.accountNumber); must(["bank", "credit_card"].includes(account.classification), "Choose the bank or credit-card account that actually settled this amount.");
  uniquePaymentReference(s, input.accountNumber, input.reference);
  const outstanding = expenseOutstanding(a); must(input.amountCents <= outstanding.amountCents, "Settlement exceeds the remaining bill or credit amount.");
  must(a.fields.currency !== "USD" || input.homeAmountCents === input.amountCents, "USD settlements must retain their exact USD amount.");
  const carrying = input.amountCents === outstanding.amountCents ? outstanding.homeAmountCents : Number((BigInt(outstanding.homeAmountCents) * BigInt(input.amountCents) + BigInt(outstanding.amountCents) / BigInt(2)) / BigInt(outstanding.amountCents));
  const refund = a.fields.kind === "refund", difference = input.homeAmountCents - carrying;
  if (difference) {
    must(input.fxAccountNumber !== null, "Select the reviewed exchange gain or loss account for this settlement.");
    const fx = activeAccount(accounts, input.fxAccountNumber), loss = refund ? difference < 0 : difference > 0;
    must(loss ? ["expense", "other_expense"].includes(fx.classification) : ["income", "other_income"].includes(fx.classification), loss ? "Choose an expense account for the exchange loss." : "Choose an income account for the exchange gain.");
  }
  must(!refund || input.feeCents <= input.homeAmountCents, "Refund receipt fees cannot exceed the received USD amount.");
  const lines = refund ? [debit(input.accountNumber, input.homeAmountCents), credit(2000, carrying)] : [debit(2000, carrying), credit(input.accountNumber, input.homeAmountCents)];
  if (difference) lines.push((refund ? difference < 0 : difference > 0) ? debit(input.fxAccountNumber!, Math.abs(difference)) : credit(input.fxAccountNumber!, Math.abs(difference)));
  if (input.feeCents) lines.push(debit(6400, input.feeCents), credit(input.accountNumber, input.feeCents));
  const id = randomUUID(), journalId = post(s, db, accounts, input.date, `expense-settlement:${id}`, `${refund ? "Vendor refund received" : "Bill payment"}: ${a.fields.merchant} · ${input.reference}`, lines);
  const payment: ExpenseSettlement = { ...input, id, carryingAmountCents: carrying, journalId, actor, recordedAt: new Date().toISOString(), reversal: null };
  a.settlements.push(payment); a.lastEventDate = input.date;
  row.fields.paymentStatus = expenseOutstanding(a).amountCents === 0 ? "paid" : "unpaid"; a.fields.paymentStatus = row.fields.paymentStatus;
  return payment.id;
}

export function executeExpenseAccountingCommand(raw: unknown, actor: string, today = businessDay(new Date().toISOString())): { id: string; kind: string } {
  const command = expenseCommandInput.parse(raw), input = expenseSchemas[command.action].parse(command.input);
  const hash = createHash("sha256").update(JSON.stringify({ action: command.action, input, actor })).digest("hex");
  return expenseState.change((s, db) => {
    const retry = s.commands[command.requestId];
    if (retry) { must(retry.hash === hash, "This request ID belongs to another expense action or author."); return { id: retry.id, kind: "expense-accounting" }; }
    if (command.action === "expense.create") {
      const { fields, confirmDuplicate, ...posting } = expenseCreateInput.parse(input);
      const created = saveExpense({ fields, status: "recorded", confirmDuplicate }, actor);
      must(created.expense, "A receipt with this vendor, date, currency, kind and amount already exists. Review it before explicitly confirming a separate document.");
      const result = executeExpenseAccountingCommand({ requestId: randomUUID(), action: "expense.post", input: { ...posting, id: created.expense.id, revision: created.expense.revision } }, actor, today);
      s.commands[command.requestId] = { hash, id: result.id }; return result;
    }
    const identity = z.object({ id: z.uuid(), revision: z.number().int().positive() }).parse(input);
    const row = expenseById(s, identity.id); must(row.revision === identity.revision, "This expense changed. Reload its current revision before continuing.");
    must(s.journals.length < 100000, "The expense journal archive is full. Review deployment capacity before posting.");
    const accounts = transactionAccounts(db), at = new Date().toISOString();
    switch (command.action) {
      case "expense.post": {
        const v = expensePostInput.parse(input);
        must(row.status === "recorded" && !row.accounting, "Choose a recorded expense that has not already been posted.");
        dateBetween(row.fields.date, "1900-01-01", today); valuation(row.fields, v, accounts);
        must(row.fields.paymentStatus !== "paid" || v.settlement?.amountCents === row.fields.amountCents, "This receipt is marked paid. Supply the actual full settlement evidence, or correct its document payment status before posting.");
        const journalId = post(s, db, accounts, row.fields.date, `expense:${row.id}`, `${row.fields.kind === "refund" ? "Vendor credit" : "Vendor bill"}: ${row.fields.merchant} · ${row.fields.reference}`, recognition(row.fields, v.homeAmountCents, v.allocations));
        row.accounting = { mode: "bill", status: "posted", fields: structuredClone(row.fields), homeAmountCents: v.homeAmountCents, allocations: v.allocations, conversionEvidence: v.conversionEvidence, dueDate: v.dueDate, recognitionJournalId: journalId, postedAt: at, postedBy: actor, evidence: v.evidence, settlements: [], lastEventDate: row.fields.date };
        if (v.settlement) settle(s, db, accounts, row, v.settlement, actor, today);
        break;
      }
      case "expense.settle": { const v = expenseSettleInput.parse(input); must(row.accounting, "Review and post this receipt before recording a settlement."); const { id, revision, reviewed, ...details } = v; void id; void revision; void reviewed; settle(s, db, accounts, row, details, actor, today); break; }
      case "expense.correct": {
        const v = expenseCorrectInput.parse(input), a = row.accounting;
        must(a?.mode === "bill" && a.status === "posted", "Choose an active posted bill or vendor credit for correction.");
        dateBetween(v.date, a.lastEventDate, today);
        must(v.fields.kind === a.fields.kind && v.fields.currency === a.fields.currency && v.fields.merchant === a.fields.merchant && v.fields.date === a.fields.date, "Preserve the original vendor, currency, document type and date. Void an unpaid mistaken document and record its replacement instead.");
        valuation(v.fields, v, accounts); const outstanding = expenseOutstanding(a);
        must(v.fields.amountCents! >= outstanding.settledAmountCents && v.homeAmountCents >= outstanding.settledHomeAmountCents, "The corrected amount cannot be below amounts already settled. Record a separate vendor credit instead.");
        must((v.fields.amountCents === outstanding.settledAmountCents) === (v.homeAmountCents === outstanding.settledHomeAmountCents), "The corrected currency and USD balances must both settle together or both remain outstanding.");
        const original = originalJournal(s, a.recognitionJournalId);
        post(s, db, accounts, v.date, `expense-correction:${row.id}`, `Reverse prior bill allocation: ${row.fields.merchant} · ${v.evidence}`, reverse(original.lines), true);
        const journalId = post(s, db, accounts, v.date, `expense-correction:${row.id}`, `Corrected bill allocation: ${row.fields.merchant} · ${v.evidence}`, recognition(v.fields, v.homeAmountCents, v.allocations));
        row.fields = { ...v.fields, paymentStatus: v.fields.amountCents === outstanding.settledAmountCents ? "paid" : "unpaid" };
        Object.assign(a, { fields: structuredClone(row.fields), homeAmountCents: v.homeAmountCents, conversionEvidence: v.conversionEvidence, allocations: v.allocations, dueDate: v.dueDate, recognitionJournalId: journalId, lastEventDate: v.date }); break;
      }
      case "expense.settlement.reverse": {
        const v = expenseReverseSettlementInput.parse(input), a = row.accounting;
        must(a?.status === "posted" && a.mode === "bill", "Choose an active posted bill or vendor credit."); dateBetween(v.date, a.lastEventDate, today);
        const payment = a.settlements.find(p => p.id === v.settlementId); must(payment && !payment.reversal, "This settlement is unavailable or already reversed.");
        uniquePaymentReference(s, payment.accountNumber, v.reference);
        must(v.feeRefundCents <= payment.feeCents, "Fee refunds cannot exceed fees on the original settlement.");
        must(a.fields.currency !== "USD" || v.homeAmountCents === payment.amountCents, "A returned USD settlement must reverse its full original principal.");
        const refund = a.fields.kind === "refund", difference = v.homeAmountCents - payment.carryingAmountCents;
        const lines = refund ? [debit(2000, payment.carryingAmountCents), credit(payment.accountNumber, v.homeAmountCents)] : [debit(payment.accountNumber, v.homeAmountCents), credit(2000, payment.carryingAmountCents)];
        if (difference) {
          must(v.fxAccountNumber !== null, "Select the reviewed exchange gain or loss account for the returned funds.");
          const fx = activeAccount(accounts, v.fxAccountNumber), loss = refund ? difference > 0 : difference < 0;
          must(loss ? ["expense", "other_expense"].includes(fx.classification) : ["income", "other_income"].includes(fx.classification), "The exchange account classification does not match the return's gain or loss.");
          lines.push(loss ? debit(fx.number, Math.abs(difference)) : credit(fx.number, Math.abs(difference)));
        }
        if (v.feeRefundCents) lines.push(debit(payment.accountNumber, v.feeRefundCents), credit(6400, v.feeRefundCents));
        if (v.additionalFeeCents) lines.push(debit(6400, v.additionalFeeCents), credit(payment.accountNumber, v.additionalFeeCents));
        const journalId = post(s, db, accounts, v.date, `expense-settlement-return:${payment.id}`, `Returned settlement: ${v.reference} · ${v.evidence}`, lines, true);
        payment.reversal = { date: v.date, homeAmountCents: v.homeAmountCents, feeRefundCents: v.feeRefundCents, additionalFeeCents: v.additionalFeeCents, fxAccountNumber: v.fxAccountNumber, reference: v.reference, evidence: v.evidence, actor, recordedAt: at, journalId }; a.lastEventDate = v.date;
        row.fields.paymentStatus = "unpaid"; a.fields.paymentStatus = "unpaid"; break;
      }
      case "expense.void": {
        const v = expenseVoidInput.parse(input), a = row.accounting;
        must(a?.status === "posted", "Choose an active posted document."); dateBetween(v.date, a.lastEventDate, today);
        must(expenseOutstanding(a).settledAmountCents === 0, "A settled bill cannot be voided. Record a vendor credit or a verified returned settlement first.");
        post(s, db, accounts, v.date, `expense-void:${row.id}`, `Voided posting: ${row.fields.merchant} · ${v.evidence}`, reverse(originalJournal(s, a.recognitionJournalId).lines), true);
        a.status = "voided"; a.voidedAt = v.date; a.voidedBy = actor; a.voidEvidence = v.evidence; a.lastEventDate = v.date; break;
      }
      case "expense.transfer": {
        const v = expenseTransferInput.parse(input);
        must(!row.accounting && row.status === "recorded" && row.fields.treatment === "transfer" && row.fields.kind === "expense" && row.fields.paymentStatus === "paid", "Record a paid transfer document before reviewing its accounts.");
        must(row.fields.currency === "USD" && row.fields.amountCents && !row.fields.taxCents, "Transfers require an exact USD amount and no purchase tax."); dateBetween(row.fields.date, "1900-01-01", today);
        const from = activeAccount(accounts, v.fromAccount), to = activeAccount(accounts, v.toAccount);
        must(from.number !== to.number && [from, to].every(a => ["bank", "credit_card", "long_term_liability", "equity"].includes(a.classification)) && [from, to].some(a => a.classification === "bank"), "Choose different bank, credit-card, loan or equity accounts, including at least one bank account.");
        const journalId = post(s, db, accounts, row.fields.date, `expense-transfer:${row.id}`, `Transfer: ${row.fields.reference} · ${v.evidence}`, [debit(to.number, row.fields.amountCents), credit(from.number, row.fields.amountCents)]);
        row.accounting = { mode: "transfer", status: "posted", fields: structuredClone(row.fields), homeAmountCents: row.fields.amountCents, conversionEvidence: "", allocations: [], dueDate: row.fields.date, recognitionJournalId: journalId, postedAt: at, postedBy: actor, evidence: v.evidence, settlements: [], lastEventDate: row.fields.date }; break;
      }
    }
    row.revision++; saveExpenseHistory(s, row, command.action, actor); s.commands[command.requestId] = { hash, id: row.id };
    return { id: row.id, kind: "expense-accounting" };
  });
}
export function expenseAccountingData() {
  return expenseState.change((s, db) => ({ today: businessDay(new Date().toISOString()), accounts: transactionAccounts(db), records: s.records, entries: s.journals, audit: s.audit,
    issues: s.records.filter(r => !r.accounting && (r.status === "recorded" || r.archivedFrom === "recorded")).map(r => `${r.fields.merchant || "Expense"} (${r.fields.date}): receipt saved; its ledger posting and actual payment dates still need review.`) }));
}
