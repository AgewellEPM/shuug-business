# Annual federal draft packs: 2023–2025

The ordinary-income preparation workflow now selects 2023, 2024 or 2025 for
1040/Schedule C, 1065, 1120-S and 1120. Each year uses its published IRS tax table,
computation worksheet, standard deductions, Social Security wage base, simplified
QBI threshold and original annual PDF blanks. This extends the existing limited
model; it does not complete federal or state tax coverage.

Choose **Tax year** before saving a new return. Changing the year of unsaved input
preserves its fields and recalculates using that year. Existing return corrections
keep their original year; the private commitment rejects changes to another
supported year as well as an unsupported one. Cases select 2023–2026, and book
periods and linked returns must match the case year. **2026 is case intake and
bookkeeping only.** Its return calculations and forms remain unavailable.

The published 2023 and 2024 tables are imported from pinned original IRS PDFs,
including all 2,062 intervals and the Tax Computation Worksheets. The importer
checks continuity, source SHA-256 and the IRS's $25,300 joint-filer examples
($2,599 for 2023; $2,575 for 2024). Provenance and source links are embedded in the
annual data and form manifests. Annual constants link to the corresponding
1040, Schedule SE and Form 8995 instructions/forms.

The PDF exporter checks annual blank byte count, SHA-256, page and field counts.
A correct blank from a different year fails integrity validation. Year-specific
maps include the older 1040 line layout, filing-status groups, combined entity
address fields, 2023 S-corporation K-1 allocation field and annual Schedule J.
The original IRS blanks are not modified. Exported packets are flattened and
watermarked as drafts, with workpapers and remaining preparation diagnostics.

## Verified execution

[Receipt](verification/tax-years-20261112.json) records:

- 180 passing checks in the broad Node suite, one existing unavailable native
  Journal fixture helper skipped. Actual Swift envelope checks passed.
- 15 focused boundary/approval checks after the final test additions, including
  annual book/draft bindings and rejection of cross-year return corrections.
- 469 compiled HTTP checks against the unchanged opaque-host API: all 12 annual
  return combinations originate as encrypted firm-approved revisions, reopen
  for client and staff, export local PDFs, and survive backup/restore. Annual
  1040/1120 case links are also verified. Synthetic data only.
- The shipped independent client executes 109 ESM modules and exports all 12
  annual return combinations through its bundled template loader in Node V8/DOM.
  This is artifact integration, not Safari or screenshot acceptance.
- Both offline and cloud custody packages include the updated annual validation
  while preserving the existing public envelope/approval protocol. Neither kit
  contains real keys or is initialized/provisioned.

## Remaining product scope

All drafts remain `filingReady:false`. Credits, capital/rental/retirement income,
depreciation, complete entity disclosures/K-1s, state returns, 2026 calculations,
actual filing and acknowledgments still need completed implementation and review.
Selected unimplemented treatments prevent complete totals. This release is a
prototype, not approved tax filing software.

Customer enrollment/recovery, comprehensive legacy migration and installed
rollout remain unfinished. Customer names and sign-in email must stay encrypted
or outside the app host; plaintext authentication metadata is not an exception.
Real activation also needs a separately controlled key environment. A real
approved transmitter or filing-provider account is absent. No production service,
customer account, payment, signature or return was activated or transmitted.
