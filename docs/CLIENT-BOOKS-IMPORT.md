# Client books and bank CSV imports

Open Accounting, choose the client's separate book, then Bank reconciliation.
Use Import a bank statement to select the bank account, statement dates,
opening/ending balances and statement reference. The first statement also needs
the previously cleared opening entries when its opening balance is nonzero.

The original Shuug CSV format remains supported:
`date,description,amount,reference`, with ISO dates and signed USD amounts.
For a different bank export, choose **Map my bank's columns**. Select the date,
description and bank-reference columns, the header row, the exact date format,
and either one signed amount column or separate debit/credit columns.

- Date formats are explicitly selected: YYYY-MM-DD, MM/DD/YYYY or DD/MM/YYYY.
  Two-digit years and impossible calendar dates are rejected.
- Signed-column imports require choosing whether positive amounts mean money
  in or money out. Separate debit/credit columns use nonnegative amounts with
  only one nonzero amount per row.
- Mapped USD values support valid thousands grouping, dollar signs and negative
  parentheses. Incorrect grouping, ambiguous signs and fractional cents fail.
- If the export has no unique bank transaction ID, select generated statement
  row references. They use the statement dates and row order, and are labeled
  as Shuug bookkeeping references. They do not prove bank verification.
- All rows after the selected header must be transactions. Remove exported
  totals/footers in the editable CSV preview; the balance checks still apply.

Choose **Preview mapped transactions**. The preview validates every row and
checks that opening balance plus mapped transactions equals the ending balance.
It shows row count, net change and the first 20 normalized rows. Changes to the
CSV, mapping or statement details require another preview. Confirm review, then
import the statement. Its layout is retained and can be explicitly reused later.

Importing records a statement for reconciliation; it creates no journal entry.
Match existing postings first. Post an unrecorded transaction only after review,
with split allocations equaling its bank amount. Finishing requires every row
to match and cleared entries to equal the bank ending balance. Previously
imported transaction references, overlapping statement periods, stale changes,
changed retries and backdated postings to closed books remain blocked.

Automatic references are safe only with these existing account/statement overlap
and reconciliation checks. They are not a general transaction deduplication
service across arbitrary partial exports. Use a complete statement for its period.
Statement files remain limited to 2 MB, 5,000 transactions and 100 columns.

Cash, receivable and payable API summaries now include all accounts with those
classifications, including subaccounts and inactive accounts' posted history.
They sum direct posted balances, so parent/child accounts are not counted twice.
Detailed statements and totals retain the same ledger entries. Inventory and
other specialist subtotal mappings require their separately documented work.
These changes do not implement cash/accrual conversion or tax-return calculation.

Source, API and DOM checks are supplemented by the compiled synthetic accounting
flow invoked from `scripts/mfa-http-check.ts`. It verifies mapped import, explicit
posting, reconciliation, CSV export, close, overlap/backdate denial, client/office
separation and MFA-authenticated staff view grants/revocation.
See [the saved evidence](verification/accounting-import-20261107.json).
