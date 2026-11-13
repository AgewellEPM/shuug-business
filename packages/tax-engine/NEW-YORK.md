# New York resident preparation, 2023–2025

The encrypted individual-return editor now prepares a scoped New York resident
calculation and populates the original annual IT-201 and IT-2 PDFs. State results
remain separate from federal totals. This is tested preparation software; it is
not New York software approval, an accepted filing, or complete state coverage.
The assembled packet retains Shuug's draft/review marking.

## Sources and annual provenance

The rules were checked against the Department of Taxation and Finance's
[2023 IT-201 instructions](https://www.tax.ny.gov/forms/html-instructions/2023/it/it201i-2023.htm),
[2024 IT-201 instructions](https://www.tax.ny.gov/forms/html-instructions/2024/it/it201i-2024.htm),
and [2025 IT-201 instructions](https://www.tax.ny.gov/forms/html-instructions/2025/it/it201i-2025.htm).
The source inventory in `data/ny-sources.json` records the original annual URLs,
SHA-256 digests, template sizes, page counts and field counts. Each year's
published state and NYC tax tables was downloaded and parsed separately; their
1,302 rows per table are identical across these three years. The shared data in
`state-ny-tables.mjs` contains those exact rows, including the special initial
intervals, rather than an approximation from bracket midpoints.

Each annual pack contains its own original `nyit201.pdf` (four pages) and
`nyit2.pdf` (two pages), plus natural-field inventories. The renderer verifies
bytes, hash, page count and field count before writing. It refuses missing annual
forms, altered templates, overflowing amounts and text it cannot fit. It flattens
the completed fields and removes PDF actions. The IT-2 instructions page remains
in the output, with two W-2 records on each first page.

Original source differences are preserved: the 2023/2024 line 36 field holds a
dependent count beside a preprinted `000`; the 2025 field holds the full exemption
amount. Two reversed 2025 field rectangles are normalized to the same physical
bounds for appearance generation. NY's multi-widget checkbox fields use distinct
native on-values; the renderer selects the exact widget and preserves the
original appearance instead of relying on a single-checkbox convenience method.

## Supported preparation

- Full-year New York residency, matching federal/state filing status, standard
  deduction, dependent exemptions and reviewed annual additions/subtractions.
  Dependent IDs are normalized and cannot repeat a filer or another dependent;
  incomplete dependent identities leave related exemptions and credits unknown.
- Federal wages, interest, dividends, ordinary Schedule C and capital income,
  taxable IRA/pension income, taxable Social Security and the deductible portion
  of self-employment tax. State income detail must reconcile to federal total
  income and AGI. Unknown federal income produces unknown state AGI.
- The automatic subtraction of federally taxable Social Security and source
  reviewed government pension, pension/annuity, bond and NY 529 adjustments.
  Source amounts are eligible worksheet results, not automatically inferred
  exclusions. Pension inputs name each recipient: line 29 accepts qualifying
  income before the calculated $20,000 individual limit, capped against that
  recipient’s included non-inherited income after the government subtraction.
  An unused spouse allowance cannot transfer. Ordinary treatment requires age
  59½ by January 1; birthday-year and decedent/beneficiary allocations need
  additional source structure. Line 28 records its included interest/dividend
  source line and cannot exceed that income. NY 529 contribution deductions
  respect the $5,000 limit ($10,000 jointly); taxable QTP-distribution deductions
  need a supported federal distribution source.
- Exact state/NYC tax tables, rate schedules and all 16 state tax-benefit recapture
  worksheets, including rounded four-decimal phase-in fractions and the
  highest-income flat calculation.
- Household credits, including the separate-filer combined-income table; the two
  NYC school credits with their distinct income definitions and limits. Taxable
  IRA distributions are excluded only from the fixed school-credit income test.
- Full-year NYC resident tax and ordinary full-year Yonkers resident surcharge.
  Locality and disclosure answers are mandatory. Mixed/part-year residency or
  Yonkers work as a nonresident requires additional calculation.
- MCTMT using reviewed Schedule SE earnings and zone allocations for each spouse,
  separate individual/zone thresholds, and the annual zone rates. An allocation
  cannot exceed matching federal net earnings.
- Mandatory IT-2 source records for every federal W-2, including statements with
  no New York withholding. Federal employee/wage data comes from the linked W-2;
  employer EIN/address, state/local amounts, boxes 12/14 and supported checkboxes
  are retained as encrypted source inputs. Missing/stale/unreviewed records keep
  payments unknown. Recorded 414(h) contributions require an explicit reviewed
  line 21 decision.
- Reviewed state/local withholding, estimates, prior-year-applied payments,
  extension payments, use tax and next-year refund application. Unreviewed filing
  penalties/interest leave both refund and balance due unresolved.

The editor includes New York permanent-home fields when the mailing address is
elsewhere, birth dates, county, school district, dependent details, source
references and explicit reviews. Completing an earlier `{state: 'NY'}` requirement
merges the defaults without discarding its stored fields. Other states remain in
the encrypted return when New York records are edited or removed. Clearing or
locking the return clears the visible private state sources.

## Explicit remaining scope

No IT-203 nonresident/part-year, IT-196 itemized deduction, IT-225/IT-558 other
modification, IT-112 resident credit, IT-201-ATT additional credit/tax, IT-1099-R
retirement withholding, IT-270 2025 NYC elimination credit, IT-360.1 mixed-locality,
Y-203 nonresident earnings, IT-135 use-tax supplement, dependent continuation,
IT-201-X amended return or penalty worksheet is generated here. Birthday-year
pension receipt allocations, inherited pension exclusions, business/pass-through
government-bond allocations and taxable QTP-distribution subtractions also need
additional source workflows. These requirements
are retained and diagnosed. The pack does not infer that an unimplemented credit
is zero: children, 2025 NYC dependents and recorded other-state tax withholding
trigger review gates; additional treatments selected by the preparer leave
affected totals unknown. More than seven dependents and use tax of at least $1,700
retain their calculated source values but block a complete preparation packet
until the required attachment is implemented.

No 2026 New York annual pack is substituted from an earlier year. The jurisdiction
registry reports installed resident scope; it does not turn a recorded state
requirement into implemented coverage. Agency enrollment, software/transmitter
approval, actual submission, acceptance/rejection handling and real filing remain
separate unfinished requirements.

## Verification

`node --test packages/tax-engine/test/state-ny.test.mjs
packages/secure-tax-client/test/ny-state-editor.test.mjs` exercises exact published
table values, every recapture worksheet selection, boundary amounts, official
MCTMT examples, NYC/Yonkers flows, federal retirement reconciliation, unknown
source gates, annual rendered PDF rows, two IT-2 records, template tampering and
the actual editor's calculation/save/reopen/remove/clear path under JSDOM.
The official married-pension example ($30,000 and $15,000 of qualifying income
producing a $35,000 exclusion), normalized dependent identities, source bounds and
recipient selectors have focused regressions.

The rendered annual form amounts are extracted with `pdftotext` and checked inside
the original field coordinates, including the annual exemption-field difference.
Rasterized synthetic IT-201/IT-2 pages were inspected with local image viewing:
the identity/disclosure choices, numeric rows and IT-2 retirement checkbox appear
in their original boxes. This is local PDF inspection and synthetic DOM testing;
it does not establish Luke's visual acceptance, an installed customer workflow or
an agency-approved filing. The root project checkpoint records compiled-package
and authenticated API verification separately.
