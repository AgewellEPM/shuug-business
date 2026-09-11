# QuickBooks Level 1 manual acceptance

Source: [Intuit-hosted 2021 Level 1 manual](https://quickbooks.intuit.com/oidam/intuit/sbseg/en_us/priority-circle/content/QBD-Level1-Manual-2021.pdf), 210 PDF pages. The review includes all 20 chapters, the introductory Pro/Premier/Enterprise and industry/accountant capability lists, and the keyboard appendix. Page references use 1-based PDF positions; printed page labels differ. The source PDF is not redistributed.

The 187 original engineering requirements are in [`src/lib/quickbooks/manual.ts`](../src/lib/quickbooks/manual.ts). Each has an identifier, chapter, source page, acceptance condition, implementation status, available destination, evidence paths and outstanding work. The Books screen provides chapter/status/text filters; `accounting-manual` exposes the same data through the authenticated API/MCP. Editing a status does not implement the feature.

The older `quickbooks/features.ts` is a compatibility navigation/API index. It includes Shuug extensions outside the manual and must not be used to claim manual parity. Its previous readiness percentage incorrectly counted partial features. The Books screen no longer displays that percentage or claims a complete QuickBooks equivalent.

## Chapter scope

| Chapter | Required outcomes |
| --- | --- |
| 1 | Company conversion/preferences; edition capacities; specialized contractor, nonprofit, retail, wholesale, professional and accountant workflows; budgets, mileage, loans, currencies, assemblies, units, consolidated/advanced reports. |
| 2 | Separate directories, supporting lists, inline creation, edits, unused deletion, inactive records, merge, ordering and printing. |
| 3 | All 15 account classifications, editable accounts and five-level hierarchy, balanced journals, financial statements and report bases. |
| 4 | Every accounting item type, account mappings and item sales/purchase/profitability reports. |
| 5 | Customer/job settings, itemized invoices, delivery and batch print, allocated receipts, undeposited funds, bank deposits and collections. |
| 6 | Immediate sales, statement charges, direct income deposits, imported sales, credits, refunds and selectable customer statements. |
| 7 | Business-document branding, editable screen/print fields and layouts, all seven form types, template copy/import/export. |
| 8 | Financial calendar, contextual/history/global search and occurrence-safe recurring transactions. |
| 9 | Tax agencies, items/groups/codes, defaults/exemptions, transaction allocation, reports, adjustments and payments. |
| 10 | Vendors, expense/item bills, credits/discounts, selected partial payments, printed checks, cards and vendor/AP reports. |
| 11 | Bank feeds, online payments, match/add rules, reconciliation, discrepancies, prior reconciliations, voids and missing checks. |
| 12 | Returned customer payments and related bank/customer fees; deposits applied to later invoices. |
| 13 | Employer/provider configuration, payroll item types, schedules, taxes, deductions, benefits and employee payroll data. |
| 14 | Weekly employee/contractor time, printable timesheets, one-time billing of eligible costs and job/time reports. |
| 15 | Reviewed payroll runs, checks/paystubs, liabilities, Form 941/Schedule B, state/annual wage forms and payroll reports. |
| 16 | Protected identity, user/role permissions, concurrent work, exclusive maintenance and accounting audit history. |
| 17 | Report center, formatting/filtering, saved reports and batches, Excel creation/refresh, template and data exports. |
| 18 | Manual, automatic, scheduled and offsite backups, integrity checks, restoration and controlled upgrades. |
| 19 | Enforced closing dates and reviewed overrides; accountant-copy dividing dates and conflict-safe change exchange. |
| 20 | Reordering, units/locations, transfers, purchase orders, receiving/payables, physical counts, adjustments and valuation reports. |

## Journal implementation checkpoint

Manual entries use the private workspace SQLite database and atomic command receipts. Retrying the same request ID and actor/payload returns the original result; changing the payload or author fails. Dates must be valid calendar dates, money must be bounded integer cents, accounts must exist, and every entry must have equal nonzero debits and credits. UI/API/MCP posting requires explicit review.

A correction appends a linked, dated reversal with actor, reason and audit evidence. It cannot precede the original posting or duplicate an existing direct reversal. The original amounts remain intact. Reversing a reversal is possible and keeps the full chain. Automatically derived entries must be corrected in their own source workflow. Money viewers have no posting/reversal buttons; both HTTP routes and server actions enforce Money edit access.

Existing `journal.json` data imports once on first journal use. Invalid, duplicate or corrupt legacy entries fail closed; the original file is never replaced or silently dropped. The imported author is explicitly unavailable. Keep the original file with the backup until migration is accepted.

Validation covers migration, restart and workspace isolation, immutable history, validation failures, role/origin/payload controls, UI submission/retry/reversal, MCP commands, and installed HTTP concurrent post/reversal behavior. See `journal-store.test.ts`, journal route tests, `GeneralLedger.test.tsx`, backend tests and `scripts/journal-http-check.ts`.

## Chart-of-accounts implementation checkpoint

Money → Chart of accounts supports all 15 source classifications, custom account creation and edits, active/inactive status and up to five levels including the root. Parent/child classifications must match; cycle, missing-parent, excessive-depth and active-child/inactive-parent changes fail atomically. Used accounts cannot change classification. System accounts retain their posting classification and active status. Account names and hierarchy can be edited with a current revision and explicit review; before/after values and author are retained.

Custom accounts participate in manual journals, trial balance and financial totals. Unknown accounts fail closed instead of disappearing from reports. Inactive accounts cannot receive new manual postings but keep historical entries and allow linked corrective reversals. Account API and MCP writes share the journal transaction and request-retry rules. `account_catalog` provides schemas, `account_command` applies reviewed edits, and the `accounts` resource returns the current chart and history. Account changes do not establish bank feeds or generate customer/vendor subledger allocations.

The account acceptance checks cover 15 classifications, five-level creation and moves, cycles, protected accounts, concurrent creation/retry, stale edits, inactive posting restrictions, journal effects, audit history and installed account controls. Account deletion/merge, financial report expansion and full subledger accounting remain open.

## Work still required

Full accounting parity is **not complete**. Current summaries do not constitute a complete financial accounting system. Legacy order/expense postings can still be regenerated from mutable source records. Receipt and returned-payment journals now capture their actual reviewed dates, original amounts and fees in the same transaction as their source records. Unified immutable posting, the remaining account deletion/merge lifecycle, periods, opening balances, retained earnings, cash/accrual treatment and all source allocations remain necessary.

The manual catalog retains unresolved item/accounting, tax agency/remittance, payroll/provider, bank feed/reconciliation, document design, recurring work, report design/Excel refresh and accountant-copy requirements. Existing restaurant, service and nonprofit workflows are useful foundations; they do not automatically satisfy these accounting requirements. Provider setup or current tax/legal validation must not be represented by a fake button or a successful local fixture. No real payroll, tax filing, payment or message was sent during these checks.

The required IsolatedTester setup query returned `Transport closed`; no isolated app/VM was launched. Installed HTTP and component checks do not substitute for visual acceptance. Restore the configured MCP connection to finish that portion; prohibited browser runtimes are not used.

## Validation record — 2026-09-11

The complete test run passed **1,001 tests across 159 files**. After correcting new-entry defaults to skip inactive accounts and making edits reset the review checkbox, **85 focused tests across 13 files** passed. TypeScript, production compilation and scoped lint passed. Installed acceptance exercises custom account creation and retry, classified journal posting, simultaneous reversal requests, inactive-account rejection, persisted history across processes, permissions, Books/ledger/account rendering, and both MCP transports with **35 tools / 30 business resources**. The earlier restaurant, customer, employee, industry, service and nonprofit acceptance paths run in the same disposable workspace.

No external financial or communication action was performed. The UI MCP transport remains unavailable, so these checks do not establish visual acceptance or full enterprise/accounting parity.

## Receivable implementation checkpoint

Product-invoice receipts and bank returns now use durable command receipts and captured journal entries. References, date, author and evidence are retained. A return reopens the original allocation without deleting August's receipt when September's return is recorded; original processing fees remain expenses. Optional reviewed customer return fees retain their included tax and supporting basis. Follow-up updates use revisions, and reminder records describe actual contact instead of pretending to send messages. See [RECEIVABLES.md](RECEIVABLES.md) for boundaries, migration and verification. This advances chapters 5 and 12 without claiming complete invoice/deposit/refund parity.
