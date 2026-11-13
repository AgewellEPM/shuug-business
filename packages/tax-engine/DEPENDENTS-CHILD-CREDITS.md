# Federal dependents and Schedule 8812

The encrypted individual return now accepts federal dependent source records and calculates ordinary child tax credit (CTC), credit for other dependents (ODC), and additional child tax credit (ACTC). Original final Schedule 8812 PDFs are installed for 2023–2026. The original 2023–2025 Form 1040 dependency sections, annual credit lines and a continuation statement carry the result into the draft packet. This does not calculate every family credit, certify the software, or submit a return.

## Evidence and annual rules

`data/child-credits-sources.json` pins original annual forms, 2023–2025 Schedule 8812 instructions and Publication 501, Revenue Procedures 2025-32 and 2026-35, Revenue Ruling 2003-72, and the IRS's January 23, 2026 correction of the 2025 joint-filer SSN requirement. Each downloaded source records its URL, SHA-256 and byte count. Field inventories were extracted from each original annual form; an older blank is never substituted.

| Tax year | CTC per qualifying child | ACTC maximum per qualifying child | ODC | Qualifying-relative gross-income ceiling |
|---|---:|---:|---:|---:|
| 2023 | $2,000 | $1,600 | $500 | Less than $4,700 |
| 2024 | $2,000 | $1,700 | $500 | Less than $5,050 |
| 2025 | $2,200 | $1,700 | $500 | Less than $5,200 |
| 2026 | $2,200 | $1,700 | $500 | Less than $5,300 |
| 2027 | $2,300 | $1,800 | $500 | Less than $5,500 |

MAGI phaseout starts at $400,000 for married filing jointly and $200,000 for other filing statuses. Excess MAGI rounds up to the next $1,000; five percent reduces the combined credit. ACTC uses fifteen percent of earned income above $2,500, subject to remaining credit and the annual per-child cap. The three-or-more qualifying-child alternative uses actual supported Social Security/Medicare withholding, Additional Medicare adjustments, deductible half SE tax, EIC and excess Social Security credit. If a missing alternative input could change the result, ACTC remains unknown. A proven bound may establish that the ordinary earned-income branch dominates without inventing the missing EIC value.

For 2025 onward, one joint filer must have a timely employment-valid SSN and the other must have a timely SSN or ITIN. The dependent CTC employment-valid SSN requirement remains separate. A qualifying dependent who cannot support CTC may support ODC when its own requirements are established. The IRS correction is material; requiring employment-valid SSNs from both joint spouses would wrongly deny some credits.

Child dependency/CTC age is attained on the actual birthday under Revenue Ruling 2003-72. This differs from the filer's age-65 standard-deduction rule. A child born January 1, 2009 is still 16 on December 31, 2025.

The final 2026 Schedule 8812 was published by the IRS and is pinned. Final 2026 Schedule 8812 instructions were unavailable at review on November 13, 2026. The ordinary statutory calculation uses published annual limits, with that limitation disclosed in diagnostics. Missing 2026 Form 1040 and other annual templates retain the broader annual-pack gate.

The released [Revenue Procedure 2026-35, sections 3.05 and 3.25](https://www.irs.gov/pub/irs-drop/rp-26-35.pdf) supplies 2027 credit and relative-income amounts. Current statutory source tests and supported calculations extend to 2027, with a distinct annual-availability diagnostic. Final 2027 Schedule 8812, instructions and main returns are not installed, and a 2026 blank is never relabeled as 2027. The released procedure retains literal release-date placeholders; IRS release evidence and this anomaly remain recorded.

## Source model and workflow

`individual.dependents` stores a stable source ID, private name/TIN, birth date, relationship, citizenship/residence, home and U.S.-home days, qualifying school months, disability, support and gross-income amounts, joint-return and competing-claim facts, identifier evidence, and explicit source reviews. New records are unknown and unreviewed. The calculation determines qualifying-child/qualifying-relative and CTC/ODC treatment; users do not select a credit amount or assert a credit checkbox.

Shared `individual.eligibility` provides filer/spouse birth dates and claimability. When a potential qualifying child is not younger than a known filer, a missing other joint filer's birth date keeps classification unresolved. Both joint filers' dependency status must be reviewed. A reviewed claimability answer of yes does not permit another ordinary dependent claim; exceptional dependent-taxpayer situations need additional treatment.

`individual.taxpayerIdentifiers` holds reviewed SSN/ITIN issuance and employment-validity facts for both filers. Actual identifiers remain in the encrypted identity fields. This same source record supports Schedule 1-A. A source review does not validate a number with SSA or IRS. Dependents have their own SSN/ITIN/ATIN evidence. Normalized IDs reject duplicates and filer IDs in dependent rows.

`individual.childCredits` records scope/MAGI/earned-income/other-credit/prior-disallowance reviews, nontaxable combat pay and linked original W-2 box 4 sources. Box 6 remains in the existing W-2 source. No missing payroll amount is inferred from the tax rate. Combat pay belongs in ACTC earned income; the optional EIC election cannot be used to infer zero EIC from a higher ACTC earned-income amount.

The editor can copy missing New York identities into federal intake as unreviewed source records, or copy missing claimed federal identities to New York. It preserves existing records. Normalized identifiers, names, birth dates and relationship classes must reconcile; conflicting or missing people suppress dependent calculations. Relationship aliases such as son/daughter/child and mother/father/parent are compared as classes. It never deletes a state dependent to make a reconciliation pass.

Credit ordering follows the annual 8812 and energy-credit worksheets: home-improvement credits have priority; clean-energy credit reserves the available nonrefundable child/other-dependent portion. Worksheet B accounts for potential ACTC. An ODC-only return also reserves ODC before clean energy. Final 1040 nonrefundable credit, ACTC, clean-energy carryforward and settlement reconcile without spending the same tax liability twice.

## Remaining treatments

The supported dependency workflow covers ordinary qualifying children and relatives with complete source facts. Shared custody, tie-breakers, noncustodial releases/Form 8332, multiple-support agreements, adoption citizenship exceptions, exceptional birth/death/adoption-placement residence, special foreign/territory/community-property/clergy situations, Form 2555/4563, prior-disallowance/Form 8862, RRTA/unreported-tip payroll and additional priority credits remain explicit review boundaries. Supported credits are not inferred from missing evidence. Birth/death residency exceptions are preserved but are not yet calculated.

EIC is a separate requirement. Ordinary ACTC can be calculated while EIC remains unresolved, but an unresolved EIC suppresses a final refund or balance. This module does not provide an EIC award, child/dependent-care credit, education credit, adoption credit or Form 8862.

New York exemptions require reconciled federal eligibility, including consistent parent birth sources when the younger-child test matters. Conflicting filer claimability also leaves the affected New York deduction and household/school credits unresolved. The age-based pension exclusion requires consistent recipient birth sources; independent Social Security and government-pension subtractions remain available. New York child/family credit forms remain under their own state coverage review. Federal dependency intake does not make those state credits complete.

Unresolved federal EIC leaves CT-EITC and New York/NYC EIC amounts, aggregate payments, refunds and balances unknown. Known state income, independently determined tax and withholding remain visible. The entire return packet remains marked draft and not filed.

## Verification

Focused tests exercise annual amounts, phaseout rounding, January 1 age boundaries, student/disability and relative-income boundaries, timely and employment-valid TIN rules, the corrected 2025 joint rule, both joint filers' claimability, duplicate identities, unresolved spouse age, New York relationship reconciliation, earned-income/SE arithmetic, three-child payroll alternatives, optional combat pay, unknown credit limits and EIC, and energy-credit ordering.

Actual PDF tests load and flatten all four original Schedule 8812 editions, then inspect printed positions for monetary amounts, child counts and routing checkboxes. Full 2023–2025 packets verify dependent identities, actual Form 1040 fields, credit totals, six-person continuation statements, and draft status. A DOM integration test exercises encrypted editor save/reopen, source-review removal, state identity copying, hidden taxpayer-ID inputs, and clearing private source values on lock. No browser runtime or live taxpayer data is used.

Run the focused tests with:

```
node --test packages/tax-engine/test/child-credits.test.mjs packages/tax-engine/test/child-credit-integration.test.mjs packages/tax-engine/test/child-credits-pdf.test.mjs packages/secure-tax-client/test/dependents-editor.test.mjs
```
