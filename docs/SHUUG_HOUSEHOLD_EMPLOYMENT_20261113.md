# Household employment preparation

The encrypted 1040 editor now accepts separate taxpayer/spouse household employers,
each with EIN, workers, cash wages by quarter, federal withholding, reviewed
FICA/FUTA classifications and payroll source references. Source records remain in
the existing encrypted return and signed staff-approval workflow. Clearing or
locking the editor clears readable private fields.

For 2023–2025, Schedule H computes each worker's annual Social Security/Medicare
threshold, Social Security cap, Additional Medicare withholding and FUTA wage cap.
The FUTA trigger combines eligible current-year quarterly wages with the prior
year. Missing prior-year quarters stay unknown unless reviewed current-year
wages already establish the trigger. The two spouses' employer schedules retain
separate identities and wage limits. Duplicate employer EINs/worker IDs are refused.
References: [2025 instructions](https://www.irs.gov/instructions/i1040sh),
[2024 instructions](https://www.irs.gov/pub/irs-prior/i1040sh--2024.pdf),
[2023 instructions](https://www.irs.gov/pub/irs-prior/i1040sh--2023.pdf).

FUTA Section A requires one state, timely contributions, all FUTA wages covered
by state unemployment and no annual credit reduction. An entered zero requires
a reviewed assigned 0% experience rate. California/New York/Virgin Islands in
2023–2024 and California/Virgin Islands in 2025 require Section B; so do late
payments, multiple states and wages not covered by state unemployment. These
cases preserve sources and withhold complete tax/balance totals. This is not a
state tax engine. Third-party disability/sick pay, qualified leave credits,
part-year exemption changes and wages reported on another employment return
also remain outside the supported scope.

Payroll liabilities carry to Schedule 2 line 9 and Form 1040 tax. Employee
withholding never becomes an employer Form 1040 payment. Energy credits do not
offset these payroll taxes. Original annual Schedule H blanks are pinned and
mapped separately; the 2023 credit rows and reversed 2025 line-9 checkbox order
are handled explicitly. Employer W-2/W-3 issuance and state payroll filings are
not performed. The output retains its draft marking and filingReady remains false.

The [verification receipt](verification/household-employment-20261113.json)
records calculation, editor, encrypted HTTP and packaged-client execution.
Annual Publication 926 examples check the published payroll figures after
whole-dollar Schedule H rounding. Synthetic boundary cases cover wage caps,
unknown records, employer separation, credit restrictions and credit ordering.
PDF checks inspect the actual printed amounts and annual checkbox geometry.
No full ATS scenario, real filing, agency approval, physical key custody or
installed office rollout is claimed.

```sh
node --test packages/tax-engine/test/household.test.mjs packages/secure-tax-client/test/household-editor.test.mjs
node scripts/tax/qualification-report.mjs --out /new/path/qualification.json
```
