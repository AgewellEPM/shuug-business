# New York Empire State child credit, 2023–2025

The resident pack calculates IT-213 from retained household, identifier and
federal-return sources. Its amount transfers to IT-201 line 63. Positive claims
use the pinned original for the same year, with original IT-213-ATT pages after
six children. This is a preparation calculation; it does not establish agency
acceptance, approval or filing certification.

`calculateNYEmpireChildCredit(input, state, federal, {federalAgiCents})` returns
the known amount or null, child records, annual form lines, source diagnostics
and worksheets. The optional `state.empireChildCredit` source links each child
to an existing person ID. Names, identifiers, birth dates and household facts
are reused from that encrypted record. Factories create unknown decisions and
unreviewed sources; they do not award a credit or assert no children.

## Annual calculations

For 2023 and 2024, the pack recalculates the old federal rules prescribed by
New York: a $1,000 child base, the $110,000/$75,000/$55,000 filing-status
thresholds, commenced-$1,000 phaseout steps, and a $3,000 earned-income
threshold. It compares 33% of the resulting child/additional credit with the
income-tested $100-per-child floor. Actual federal child, other-dependent or
additional credit determines the original form's claimed-credit question;
33% of the modern federal credit is not the New York calculation. A qualifying
timely ITIN child can enter the $1,000 base despite receiving only federal ODC.

Worksheet A uses actual federal tax and the specified allowed Schedule 3
credits. Its line-11 subworksheet imports federal Credit Limit B only when
that federal worksheet applies. An ITIN-only ODC return has no qualifying SSN
child for that worksheet, so its allowed clean-energy credit is not imported
as a nonexistent B15 amount. Applicable B11/B15 transfers remain separate
from the New York informational reserve; clean-energy allowance is not
recalculated with that reserve.

Worksheet B uses the actual federal earned-income worksheet, including sourced
nontaxable combat pay and the deductible half of ordinary SE tax. The
New York old-law three-child payroll alternative reconciles original W-2 Social Security and
Medicare withholding, actual Form 8959, Schedule SE and computed EIC. When the
modern federal calculation omits its displayed payroll branch, the original
sources can still reconstruct the amount needed under New York's different
earned-income threshold. Three qualifying timely ITIN children can also use
this old-law New York branch when modern federal Part II is inapplicable.
It is then a New York worksheet amount, not an actual modern Schedule 8812
line 25. An existing modern line 25 is reconciled whenever present. Missing
amounts and unknown EIC never become zero.

Applying that old-law payroll branch to timely ITIN children follows the
annual New York instruction's use of the New York qualifying-child count,
the original 2017 Schedule 8812 and Publication 972, and the preserved
pre-TCJA IRC section 24. The source manifest records this interpretation
explicitly; it is not presented as a published New York worked example.

The 2023 original separates timely and late child identifiers; late identifiers
can qualify only for the income-tested $100 branch. The 2024 form removes that
row, while Notice N-16-2 still describes late-identifier treatment. This annual
exception remains unresolved rather than inferring eligibility or exclusion
from the removed row.

For 2025, the state eligibility definition is independent of claiming the child
as a federal dependent. The pack considers retained unclaimed children and
applies the actual annual relationship, age, household, support, joint-return
and identifier criteria. Citizenship/nationality or a valid ITIN satisfies the
specified citizenship/identifier disjunction; a resident noncitizen with only
an SSN does not automatically satisfy it. Federal employment-validity and
due-date issuance rules are not imported into this independent state claim.
Children under four have a $1,000 base, and ages four through sixteen have a
$330 base. FAGI is rounded down to the nearest $1,000, then the 1.65% excess
reduction is rounded to whole dollars before subtraction.

## Source boundaries

Reviewed original sources must establish the annual child facts and an
uncontested claim. Retained federal and New York identity, claim, relationship
and birth-date records must agree before an early zero exclusion. Reciprocal
noncustodial household evidence must also agree. Unreviewed or contradictory
records cannot establish that no child qualifies. Independently established
ordinary no-child, adult or noncustodial exclusions remain usable without
requiring a new source section.

Implemented scope is matching federal/state filing status and reviewed full-year
New York residence. Mixed-status allocation, competing-claim/tiebreaker or
custodial-release treatment, special residency exceptions, adopted-child
citizenship exceptions, positive Build America Bond or specified foreign/MAGI
exclusions, and unsupported federal credits retain explicit unknowns. Excess
Social Security, RRTA and special earned-income treatments need their own
source calculations. Declared additional `childCredits` treatment remains
unresolved even when ordinary source review is present.

Dependent-care and NYC income-tax elimination credits remain separate coverage
requirements. A known IT-213 amount does not resolve them or the complete state
settlement. No 2026/2027 Empire calculation or older-year original is substituted.

## Evidence

`data/state-ny-child-sources.json` pins twelve instruction/supporting originals.
`data/state-ny-child-reference.json` distinguishes published rounding components
from independently derived synthetic full-return regressions. The latter
include the annual $30,000/$80,000 wage cases, the $686 three-child payroll
alternative, and the $330 ITIN/ODC clean-energy interaction. The runtime tests
also exercise annual phaseouts, age boundaries, unclaimed children, valid-ID
rules, unknown amounts and conflicting retained records. Original form maps,
continuations and actual preparation packet checks are documented in
[NY-CHILD-PDF.md](NY-CHILD-PDF.md).

Primary sources:

- [2023 IT-213 instructions](https://www.tax.ny.gov/forms/html-instructions/2023/it/it213i-2023.htm)
- [2024 IT-213 instructions](https://www.tax.ny.gov/pdf/2024/inc/it213i_2024.pdf)
- [2025 IT-213 instructions](https://www.tax.ny.gov/pdf/2025/inc/it213i_2025.pdf)
- [Notice N-16-2](https://www.tax.ny.gov/pdf/notices/n16_2.pdf)
- [2023 federal Schedule 8812 instructions](https://www.irs.gov/pub/irs-prior/i1040s8--2023.pdf)
- [2024 federal Schedule 8812 instructions](https://www.irs.gov/pub/irs-prior/i1040s8--2024.pdf)
- [Original 2017 Schedule 8812](https://www.irs.gov/pub/irs-prior/f1040s8--2017.pdf)
- [2017 Publication 972](https://www.irs.gov/pub/irs-prior/p972--2017.pdf)
- [Pre-TCJA IRC section 24](https://www.govinfo.gov/content/pkg/USCODE-2016-title26/pdf/USCODE-2016-title26-subtitleA-chap1-subchapA-partIV-subpartA-sec24.pdf)
