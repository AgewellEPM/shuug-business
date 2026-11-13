# Federal standard-deduction eligibility

The encrypted return now retains `individual.eligibility`: separate taxpayer and
spouse birth dates, blindness, claimability, death status/date and reviewed source
references; return residency/period, standard-versus-itemized choice, spouse
itemization and filing-status review. Missing decisions are `unknown`. The source
factory does not infer that a person is under 65, not blind or not claimable.

`standardDeduction(value, context)` calculates 2023–2026 standard deductions from
the annual filing-status amount, applicable age/blindness additions and the
dependent worksheet. `eligibilityAge(person, year)` supplies shared birth/death
facts to other deduction and credit modules without duplicating identity inputs.
The date when age 65 is attained is the day before the birthday; January 1 of the
following year therefore qualifies. A decedent must attain that age by death.

Claimability is whether someone **can** claim the person, regardless of whether
they actually do. The dependent worksheet uses represented wages plus net
Schedule C income or loss, less the deductible SE tax. The caller must positively
mark these source calculations known, and the preparer must review that no other
earned-income sources are missing. There is no manual earned-income override.
The worksheet takes the larger of the annual floor or earned income plus the
annual addition, limits that result to the ordinary filing-status deduction,
then adds the applicable age/blindness amounts. Joint spouses use one worksheet.

MFS spouse age/blindness additions require the spouse to have no gross income,
file no separate return and be unclaimable, together with complete spouse source
facts. Qualifying surviving spouse status uses the taxpayer's boxes only; the
filing-status review covers the prior death year, qualifying child, household
cost and other status conditions. Status eligibility is a reviewed source
assertion, not inferred from the words “surviving spouse.”

Separate spouse itemization, nonresident/dual-status treatment, special resident
elections, short accounting periods and Schedule A choices stay unresolved in
this module. It does not replace those treatments with zero deductions. The
ordinary calendar year and a decedent's final period are supported. Blindness is
reviewed against the IRS criteria and retained certification where required.

New York taxpayer claimability and applicable birth dates must agree with the
federal source facts. Conflicting or incomplete federal facts do not silently
inherit a state answer. Existing encrypted records retain their original fields;
missing eligibility requires a deliberate edit and review. The test-only
`eligibilityFixture()` supplies synthetic facts and is never a production default.

The main return carries the calculated flags and worksheet for the PDF helpers.
The 2023/2024 age/claimability fields are on page 1; 2025 moves them to lines
12a–12d on page 2 and introduces actual death-date fields in the header. The
older forms receive the required deceased-name/date annotation at the top.
The source facts and full worksheet remain in the private draft workpaper.

Sources: annual [2023](https://www.irs.gov/pub/irs-prior/i1040gi--2023.pdf),
[2024](https://www.irs.gov/pub/irs-prior/i1040gi--2024.pdf) and
[2025 Form 1040 instructions](https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf),
annual Publication 501 standard-deduction tables/examples, and final
[2026 Publication 505](https://www.irs.gov/pub/irs-pdf/p505.pdf), Worksheet 2-4.
Exact source bytes/digests and published example vectors are recorded in
`test/standard-deduction-reference.json`. Source PDFs were verified under
`/Users/lukekist/BuildCache/ShuugEligibility-20261113` and the existing retirement
source cache. Published examples are distinguished from synthetic endpoint tests.
2026 guidance supplies statutory amounts, **not** a final Form 1040 or Tax Table.
The separate enhanced-senior deduction belongs to Schedule 1-A and requires its
own SSN, filing-status and MAGI review. No filing/certification status changes.
