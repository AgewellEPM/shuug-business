# 2027 federal annual foundation

The requested tax-year scope includes 2023–2027. This module supplies the
released 2027 annual amounts and limited statutory calculations. It does not
establish a complete 2027 return, filing capability or state coverage.

IRS Revenue Procedure 2026-35 was released November 5, 2026. The IRS newsroom
announcement links the exact source PDF; the GuideWire release schedules its
publication in Internal Revenue Bulletin 2026-48 for November 23. The PDF still
contains literal `[Release Date, 2026]` placeholders in section 1. That source
anomaly is retained in the pinned original and manifest, alongside the actual
release evidence. No placeholder was silently repaired or used to invent a date.

`annual-2027.mjs` exports `federal2027Rules`, `federal2027CapitalThresholds`,
`taxRateSchedules2027`, `ordinaryTax2027`, `qualifiedBusinessDeduction2027`
and `federal2027Availability`, matching the annual 2026 interfaces.

Basic standard deductions are $16,600 single/separate, $33,200 joint/surviving
spouse and $24,925 head of household. Section 3.15 separately provides a $1,400
dependent floor, $500 earned-income addition, and age/blindness additions of
$1,700 or $2,100 for unmarried taxpayers who are not surviving spouses. These
amounts require the existing source-reviewed eligibility and dependent worksheet;
knowing the annual amount does not establish a taxpayer's eligibility.

The Social Security contribution base is $192,300, established by SSA's final
Federal Register notice. The same notice sets the domestic-employee annual cash
wage coverage threshold at $3,100. Current statutes retain the ordinary 12.4%
Social Security and 2.9% Medicare self-employment rates; annual limits, actual
earnings and the applicable deductions remain separate inputs.

The statutory income-tax rows retain each published filing-status breakpoint and
base amount. Head-of-household thresholds and married-separate limits are not
derived from another status. `ordinaryTax2027` uses these schedules at or above
$100,000 of rounded taxable income, labels the result a statutory calculation and
keeps `formReady: false`. Below that boundary, including zero taxable income, it
returns an unknown amount and a missing-final-Tax-Table diagnostic. No bracket
approximation or earlier-year lookup table replaces the missing annual table.

QBI simplified thresholds are $416,600 joint, $208,325 separate, and $208,300 for
other returns. The published phase-in upper endpoints are $566,600, $283,325 and
$283,300; this module does not implement those complex phase-in calculations.
The indexed minimum deduction is $415 when aggregate qualified income from
materially participating businesses reaches $1,030. The caller supplies that
active amount after source-derived business and deductible SE-tax adjustments.
The active-income comparison uses exact cents; unknown active allocations, prior
loss allocation and above-threshold limitations remain unresolved where relevant.

Other verified 2027 parameters include CTC $2,300, refundable ACTC ceiling $1,800,
qualifying-relative gross-income limit $5,500, EIC childless phaseout endpoints
$20,164/$27,684 (other/joint) and maximum-family endpoints $65,002/$72,512.
These annual amounts do not replace credit eligibility, annual worksheets or EIC
award tables. The preferential capital-gain thresholds are exported as annual
parameters; complete preferential-tax worksheets require separate integration.

No final 2027 annual form is installed. Eighteen checked official 2027 endpoints
for the 1040, Schedule C/SE/8812/EIC, 8995, 1065, 1120-S and 1120 families and
their instructions returned 404 on November 13, 2026. This records the checked
endpoints, not a claim that every possible IRS URL has been searched. Earlier-year
blanks are never labeled as 2027 forms.

Processing year 2027 is distinct from tax year 2027. The IRS MeF ATS index lists
the annual individual/partnership/corporate families for tax period 2026 in that
processing season. Some quarterly payroll/excise entries genuinely use tax period
2027; they do not establish a 2027 annual income-tax return pack. Schemas, agency
test completion, transmitter access, acknowledgments and all state packs remain
separate requirements. A federal statutory calculation does not imply any state
annual rules or release approval.

Exact bytes, SHA-256 pins, release evidence, source limitations and checked form
availability are in `data/2027-sources.json`. Direct raw SSA web downloads returned
403; the pinned final SSA Federal Register PDF supplies the annual wage-base
evidence. The source-verification record retains the extracted originals separately from
the public runtime package.

Primary sources:

- [IRS Rev. Proc. 2026-35](https://www.irs.gov/pub/irs-drop/rp-26-35.pdf), sections
  3.01, 3.03, 3.05, 3.06, 3.15, 3.25 and 3.28.
- [IRS November 5 release](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2027-taxpayers-continue-to-benefit-from-the-working-families-tax-cuts)
  and [official GuideWire publication notice](https://content.govdelivery.com/accounts/USIRS/bulletins/431cc8f).
- [SSA final 2027 determination](https://www.govinfo.gov/content/pkg/FR-2026-10-26/pdf/2026-21796.pdf).
- [26 U.S.C. 199A](https://uscode.house.gov/us/usc/119-134/t26/s199A/),
  [1401](https://uscode.house.gov/us/usc/119-134/t26/s1401/) and
  [3](https://uscode.house.gov/us/usc/119-134/t26/s3/).
- [IRS MeF ATS index](https://www.irs.gov/e-file-providers/modernized-e-file-mef-assurance-testing-system-ats).

Focused tests cover independently derived arithmetic vectors, published bracket
base continuity, annual status distinctions, the unavailable Tax Table boundary,
exact active-QBI endpoints and retained provenance. The vectors are not
IRS-published taxpayer examples or agency qualification tests.
