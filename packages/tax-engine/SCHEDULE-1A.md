# Schedule 1-A deductions

The client collects source records in `individual.schedule1A`. The calculation
supports the four 2025 additional deductions and reviewed 2026 statutory amounts.
The actual, pinned 2025 IRS Schedule 1-A prints calculated amounts and vehicle
VINs. Additional vehicles have a line 22 continuation in the private workpaper.
The final 2026 Schedule 1-A is unavailable: calculations retain a blocking annual
form diagnostic, and no prior-year form is substituted. Selected 2023–2024
sources remain preserved with an unsupported-year diagnostic.

## Sources and calculation boundaries

`test/schedule-1a-reference.json` pins the original 2025 form, annual 1040
instructions, final 2026 Publication 505 and W-2 instructions, Notice 2025-69,
the final tipped-occupation list and regulations, QBI instructions and the
current official text of IRC 199A. It separates published IRS overtime/death
examples from synthetic phaseout and integration vectors. Cached source bytes
were reviewed on November 13, 2026; a future final form or regulation requires a
fresh review. These are engineering source checks, not agency approval.

- Tips: reviewed voluntary cash/charged tips from lawful services in one of the
  final 71 listed occupations. Employee amounts link to the existing W-2; 2025
  accepts box 7, Forms 4070 or a corroborating employer statement. 2026 requires
  separately reported code TP and occupation information. Business amounts must
  be included in the specified 1099-NEC/MISC/K reporting, reconcile to represented
  Schedule C receipts and be supported by tip records. Review includes the
  applicable separate-reporting rules for 2026. An SSTB determination or explicit
  annual Notice 2025-69 transition-relief review is required. There is one annual
  employee-tip total per W-2. Multiple employers print zero on lines 4a and 4b
  and their combined qualified amount on 4c, as the official form directs.
- Business tips are limited to represented net profit less allocable deductions,
  including half of SE tax. The supported path has one Schedule C per recipient;
  omitted health insurance, retirement-plan deductions or multiple-business
  allocations keep the tip deduction unresolved. Each spouse can have a separate
  supported business. Form 4137 unreported tips, income/payroll reconciliation,
  mixed occupations within one W-2 and pass-through tip income require further
  source integration; they are not silently treated as ordinary qualifying tips.
- Overtime: mandatory FLSA section 7 premium, already included in linked W-2
  income. For 2025, source methods include stated half-time premium, one-third of
  total time-and-a-half pay, one-quarter of total double-time pay, one-half of
  stated double-time premium, or documented eligible hours times regular rate
  times one-half. Source reviews must resolve bonuses and special work periods.
  State-only, contractual, holiday/weekend, deferred, Form 8919 and nonemployee
  amounts are outside this calculation. 2026 requires separately reported code
  TT. One reviewed annual overtime record per W-2 prevents overlapping summaries.
- Vehicle interest: source-backed original purchase first-lien loans after 2024
  for new, U.S.-assembled qualifying road vehicles below 14,000 pounds GVWR,
  with expected personal use exceeding 50%. Each VIN is retained. Eligible
  interest already deducted on the same owner's represented Schedule C is
  subtracted once. Refinancing, inherited/replacement obligations, joint-obligor
  allocations and deductions on other schedules require additional work.
  VIN format alone does not prove assembly or original use.
  For 2026, the final Schedule C separates vehicle-loan interest on line 16b
  from other interest on 16c. The current business expense intake does not yet
  populate the new vehicle-specific line; mixed business/personal loans with
  interest deducted there stay unresolved until that routing is implemented.
- Seniors: shared birth/death evidence determines age 65, including January 1
  birthdays and age attained at death. The applicable claimant also needs a
  timely employment-valid SSN. Conflicting federal/state birth evidence keeps
  possible senior eligibility unknown. A known age-eligible person cannot be
  omitted from Schedule 1-A and silently receive zero.

Tips have a $25,000 return-wide cap; overtime has a $12,500 cap ($25,000 joint).
Both lose $100 per **whole** $1,000 of MAGI above $150,000 ($300,000 joint).
Vehicle interest has a $10,000 cap and loses $200 per $1,000 **or fraction**
above $100,000 ($200,000 joint). Seniors receive up to $6,000 per eligible
person, each reduced by 6% of MAGI above $75,000 ($150,000 joint).

MFS cannot claim tips, overtime or senior deductions; eligible vehicle interest
can remain. Reviewed ITIN, late SSN or nonemployment SSN evidence gives that
recipient a zero deduction with an informational explanation. Missing identifier
evidence stays unknown. Source amounts and evidence are retained in either case.

## Federal integration

`schedule1A(value, context)` receives the year, filing status, known AGI,
unknown-income/other-treatment flags, original W-2 records, calculated Schedule C
forms, per-owner half-SE adjustments, shared eligibility and identifier evidence,
actual taxpayer/spouse IDs and a narrowly scoped `eligibilityConflict` flag.
Unknown foreign/Puerto Rico/Samoa income exclusions or unreconciled AGI block
MAGI; this module does not accept an arbitrary final deduction override.

The return contains per-part amounts, line calculations, source details,
diagnostics, official form items and per-business QBI reductions. A null part
blanks the total and dependent tax while other independently calculated parts
remain visible. An untouched legacy section returns zero unless a known age-65
claimant or birth-source conflict requires senior review.

AGI, Social Security taxable benefits, NIIT MAGI and payroll/SE taxes are unchanged
by these deductions. The additional deduction reduces taxable income **before**
the Form 8995 taxable-income limit. Allowed business-tip deductions also reduce
QBI under IRC 199A(c)(4)(D). A capped/phaseout total shared between employment and
businesses, or multiple businesses, needs an allocation; the Schedule 1-A total
can remain known while QBI and final tax remain unknown. No proportional
allocation is invented.

## Verification

`test/schedule-1a.test.mjs` covers the published overtime arithmetic, statutory
phaseout boundaries, death example, recipient identity decisions, source caps,
annual gates and actual `calculateReturn` QBI/AGI integration. The PDF test uses
the real form and bounded `test/pdf-text.mjs` extraction to check printed line
13/21/30/37/38 geometry, null fields and the VIN continuation. The browser test
exercises source entry, save/reopen, year changes and private field clearing on
lock through the actual return editor. No browser runtime is used. The product
remains a draft preparation system pending its wider filing, annual coverage and
qualification work.
