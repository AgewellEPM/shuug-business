# Receipts and returned payments

Money → Collections supports dated receipt records against product invoices, partial payments, actual fees withheld at receipt, bank returns, reviewed customer return charges, and collection follow-ups. Product invoices currently come from product orders; service and nonprofit payments keep their separate workflows.

## Record a receipt

1. Open the invoice and choose **Record receipt**.
2. Enter the actual receipt date, amount, method, reference and supporting bank evidence. The fee field is the amount actually withheld when this receipt reached the bank.
3. Review the details and save. The remaining invoice balance, receipt history and ledger update together.

The server checks the source invoice, actual date, integer cents and available allocation. An excess payment is rejected; unapplied-credit handling is not yet implemented here. A duplicate reference for the same customer and method must be reviewed against its original receipt. Retrying an unchanged command returns its first result; concurrent requests cannot allocate the same remaining balance twice.

The captured receipt journal debits bank and credits receivables on the receipt date. A withheld processing fee has its own debit to fee expense and credit to bank. The workflow records already-verified money; it does not charge cards or initiate transfers. Deposits still use the fixed system bank account; bank account selection, undeposited funds and grouped deposits are outstanding.

## Record a bank return

Show paid invoices, open the original receipt and choose **Record returned payment**. Enter the actual return date, bank reference, reason and evidence. Record any additional bank fee. A customer return charge requires a reviewed basis; enter its total and included tax explicitly. Tax is recorded as entered, not calculated or assigned to a tax agency automatically.

The return appends opposite bank/receivable amounts on the return date while retaining the original receipt and its processing fee. Bank fees remain separate expenses. The customer charge increases the amount due; its net fee and included tax post separately. A replacement receipt can then settle the reopened amount and charge. Customer charge evidence is visible in Collections; separate printable fee invoices and customer statement delivery remain outstanding.

A receipt supports one recorded bank return. This is a returned-payment workflow, not a customer credit/refund workflow or a command to move funds. Refunds of a sale, partial returns, fee reimbursements, disputes and processor payout reconciliation require their own linked workflows; do not mislabel them as a bounced payment.

## Follow-up and visibility

**Edit follow-up** saves a promised date, responsible person and note with revision protection. **Log reminder** records the date and details of contact already made. It does not send mail or messages. Both retain actor/date history. Money viewers can inspect invoices and receipts but cannot post or change follow-ups. Private endpoints require Money authority, and app POST requests also check origin.

New APIs: `GET/POST /api/accounting/receivables`. MCP provides `receivable_catalog` and `receivable_command`; read the `receivables` business resource first for balances, receipts and revisions. Backend credentials authorize the whole workspace. Reuse the exact request ID and payload after an interrupted response.

## Existing data

The first use imports valid `ar.json` receipts and collection states into the private workspace SQLite database without modifying the original file. A corrupt file, duplicate receipt ID or invalid date fails closed. No process-global cache mixes clients or hides another process's edits.

Legacy refunded flags have no recorded return date. Their original receipts remain in the ledger, and an explicit warning identifies the missing return evidence. Use **Review imported return** only after finding the actual bank return and its date. Until reviewed, those historical accounting totals are incomplete. Original authors not recorded by the old app are labeled unavailable.

## Acceptance and remaining accounting scope

Tests cover an invoice issued in July, received in August and returned in September; each period preserves the correct receipt/return event. They also cover partial allocation, excess and duplicate rejection, retained fees and included tax, replacement payment, migration/restart/isolation, authenticated routes, real component controls and reminder/follow-up history. `scripts/receivable-http-check.ts` exercises the installed production server, competing posts/returns, genuine MCP writes, private access and cross-process captured journals in a disposable workspace.

The complete QuickBooks requirement remains open. Product invoice issue/terms snapshots, immutable order/expense postings, currency support, full period-close rules, unified specialist payment allocation, bank-feed reconciliation, customer credit/refund lifecycle and automatic external provider execution still require work. General ledger summaries and this workflow do not complete those features. Visual testing remains unavailable because the required IsolatedTester MCP transport returns `Transport closed`.

## Verified checkpoint — 2026-09-11

The full suite passed **1,032 tests across 162 files**. TypeScript, scoped lint and the production build passed. The installed disposable workspace passed simultaneous receipt/retry and competing-return requests, an actual MCP receipt command, retained source journals, fees and included tax, replacement settlement, reminder retry, Money restrictions and cross-process persistence. Existing restaurant/service/nonprofit/customer/employee paths passed in the same run. Streamable HTTP and stdio MCP passed with **37 tools / 31 business resources**. The test server exited and its PID was independently checked absent. No money or messages were sent. Visual acceptance remains open.
