# Earned Income Credit awards for 2023–2025

`eic-award.mjs` applies the actual annual IRS Worksheets A and B to reviewed
ordinary W-2 wages and Schedule C income. `eic-eligibility.mjs` separately derives
eligibility and the qualifying-child sets. Dependency claim and own-support
decisions do not substitute for EIC eligibility.

The three annual data modules retain every published cell, including original
star markers. `eic-tables.mjs` uses exact half-open intervals and the 24 printed
partial terminal intervals. It never interpolates a rate or substitutes a nearby
year. Amount-child counts above three use the three-or-more column. Only joint
returns use the joint columns; qualifying surviving spouses use nonjoint EIC
columns despite their ordinary-tax filing-status treatment.

Worksheet A applies to wages-only cases. Worksheet B retains every business,
including a loss or income below the Schedule SE filing threshold. It reconciles
each owner's calculated Schedule C profit with Schedule SE line 3 and deductible
half-tax. Owners required to file SE enter Part 1; owners below the threshold
enter Part 2, never both. Optional SE methods, statutory employees, clergy,
church employees, notaries, exempt self-employment and other earned-income
treatments require separate source integration. The worksheet does not use
92.35% of business profit as EIC earned income.

The worksheet first looks up earned income. If that credit is zero, it stops.
Otherwise it uses the earned credit when AGI equals earned income or is below
the annual comparison threshold. Only the remaining branch looks up AGI and
takes the smaller credit. A lookup of the larger income, or an unconditional
minimum of both lookups, would incorrectly reduce some phase-in credits.

Investment-income completeness and actual derived federal totals must both be
known. The reviewed ordinary investment limits are $11,000, $11,600 and $11,950.
Additional investment-income categories require the applicable Publication 596
worksheet sources; missing amounts do not become zero.

Combat pay is all-or-none for each recipient, independently for joint spouses.
The eligibility module reconciles linked original W-2/code-Q amounts and retained
child-credit/state sources. The award module calculates every lawful combination
and retains each complete worksheet. A saved include/exclude choice is required
for each owner with positive combat pay. It does not automatically select or
persist the largest credit. `selectedCombatPayCents` is the elected amount for
Form 1040 line 1i; it does not increase taxable wages on line 1z.

`eicAward(input, context)` returns the amount, reason, eligibility and retained
child sets, selected worksheet, election candidates, selected election,
`selectedCombatPayCents`, `noCreditIndicator`, `ineligible` and diagnostics.
Worksheet monetary `lines` use integer cents; skipped lines are absent.
`earnedLookup` and `agiLookup` retain interval and terminal-footnote evidence.
The no-credit indicator is set only for the supported worksheet stop instructions,
not indiscriminately for every zero result.

The context supplies separately derived eligibility, AGI, ordinary wages,
Schedule C profit, half-SE adjustment, calculated businesses and SE owner
records, investment income and `investmentKnown`, plus `otherTreatments`.
Eligibility `filerFacts` must supply `earnedSourcesKnown`,
`investmentSourcesKnown`, `combatKnown`, and `combatByOwner`. Combat selections
are retained in `individual.earnedIncomeCredit.award.combatElections`.

2026 and 2027 award calculations remain unavailable without final annual award
tables and the reviewed supporting workflow. Existing independent zero proofs
remain a separate central path. Computed awards and draft PDFs do not establish
agency acceptance, filing readiness, paid-preparer due diligence or completion of
state EIC schedules.

Source pins, normalized table hashes, all terminal footnotes and actual published
Grey-family arithmetic examples are in `test/eic-award-reference.json`. The
examples' identity and eligibility scaffolding in tests is synthetic. Every table
edge is tested for all eight columns. `test/eic-source-reference.mjs` verifies
all six pinned source PDFs, every table cell and terminal footnote against both
annual publications. It uses the same parser across two official representations,
not an independent-provider review.

Primary sources are annual IRS
[2023](https://www.irs.gov/pub/irs-prior/p596--2023.pdf),
[2024](https://www.irs.gov/pub/irs-prior/p596--2024.pdf), and
[2025 Publication 596](https://www.irs.gov/pub/irs-prior/p596--2025.pdf), and the
matching [2023](https://www.irs.gov/pub/irs-prior/i1040gi--2023.pdf),
[2024](https://www.irs.gov/pub/irs-prior/i1040gi--2024.pdf), and
[2025 Form 1040 instructions](https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf),
EIC Worksheets A/B and tables. The source-verification receipt retains exact
byte pins, table comparisons and their stated limits separately from the runtime.
