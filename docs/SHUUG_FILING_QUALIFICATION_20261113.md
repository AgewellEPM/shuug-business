# Filing qualification work

Shuug has **no IRS or state software approval**. The current release remains a
prototype with limited federal preparation for 2023–2025. The requested scope
is 2023–2026, four federal families and all 50 states. The new calculation and
evidence below advance that scope without changing the draft or filing boundary.

## Implemented: ordinary Form 8959

For 2023–2025, ordinary W-2 Medicare wages and eligible Schedule SE income now
produce Additional Medicare Tax, Schedule 2 line 11 and Form 1040 line 25c
withholding reconciliation. The editor accepts W-2 box 6. A blank remains unknown;
an entered zero survives editor redraw/save. Missing required withholding leaves
payment, refund and balance totals unavailable. Separate taxpayers' self-employment
losses do not offset the other's positive income for this tax.

Each year includes its original pinned IRS Form 8959, mapped fields and exported
name/ID. IRS instruction examples exercise the actual calculation; PDF checks
inspect printed amounts at the source rows. Encrypted staff creation, client
reopening and independent-client exports include the new fields/forms.
RRTA, unreported wages/tips, uncollected box-12 taxes and other special treatments
remain outside this implementation and must be selected in the coverage review.
High-income interest/dividend cases requiring Form 8960 suppress final tax totals.
This is not full high-income-return coverage or independent certification.
Sources: [8959 instructions](https://www.irs.gov/instructions/i8959),
[8960 instructions](https://www.irs.gov/instructions/i8960).

## Reproduce the evidence

```sh
node --test packages/tax-engine/test/*.test.mjs packages/secure-tax-client/test/returns.test.mjs
node scripts/tax/qualification-report.mjs --out /new/path/qualification.json
```

The report checks every installed blank against its reviewed pin, runs six
published 8959 examples, three published energy-credit examples for each of three
years, the annual Publication 926 payroll example for each year, and inventories
the engine source. It distinguishes
partial form support from missing forms, with agency approval and release
readiness recorded separately. An existing output is never overwritten. Zero
exit status means the local checks ran successfully; it does not mean approval.

For source verification, download the four public PDFs identified in
`packages/tax-engine/qualification/ats-scenarios.json`, saving each as its
`sourceFile`, plus the pinned `i8959--2025.pdf` referenced by
`packages/tax-engine/test/irs-8959-examples.json`, and `irs-energy-examples.html`
from the source pinned in `packages/tax-engine/test/irs-energy-examples.json`, into
a separate directory. Also include the six annual publication/instruction PDFs
pinned in `packages/tax-engine/test/irs-household-examples.json` using their URL
filenames. Pass `--sources /that/directory`. Any changed source fails the run instead of silently
updating its expected hash. The default run does not claim those external source
bytes were checked. No credentials, customer data or network transmission are used.

Selected ATS cover pages establish these concrete gaps, not a complete test plan
or executed scenarios:

| Family / selected 2025 scenario | Examples of remaining requirements |
| --- | --- |
| 1040 / 1 | Complete W-2 XML, disclosures, full scenario import/expected-output validation; Schedule H / Form 5695 / Schedule 3 now have partial preparation support |
| 1065 / 1 | B-2/C/M-3, complete K-1s, depreciation, asset sales, rental real estate, credits and signature attachment |
| 1120-S / 5 | Full K-1s, inventory/officer compensation, depreciation, asset sales, rental real estate and signature attachment |
| 1120 / 1 | B/D/G/M-3/O, inventory/officer compensation, credits, depreciation, asset sales and signature attachment |

Every selected scenario is currently blocked. Public original URLs, SHA-256s,
byte counts and cover-page requirements are retained in the catalog. Having a
blank form or supporting its ordinary-income rows does not complete that form.

The [energy-credit continuation](SHUUG_ENERGY_CREDITS_20261113.md) adds original
annual Form 5695 and Schedule 3 PDFs and encrypted entry. Its separate receipt
preserves the earlier qualification snapshot; the runnable report reflects the
current source. Published FAQ examples are arithmetic references, not executed
ATS cases or verified manufacturer eligibility.

The [household-employment continuation](SHUUG_HOUSEHOLD_EMPLOYMENT_20261113.md)
adds ordinary Schedule H, annual employer/worker limits and FUTA Section A.
Its reference checks compare the published payroll example after declared
whole-dollar rounding. They do not execute the selected 1040 ATS scenario.

## Actual agency qualification

The [IRS approval process](https://www.irs.gov/e-file-providers/how-tax-preparation-software-is-approved-for-electronic-filing)
allows a declared subset of forms. It requires actual test-return XML transmission
and agency review before software can be marketed as approved. The required test
plan must be confirmed with IRS; this selected inventory cannot decide it.

1. The firm's responsible official must establish the appropriate
   [software-developer/provider account](https://www.irs.gov/tax-professionals/e-file-provider-services)
   and arrange an approved transmitter or its own qualified transport.
2. Obtain current authorized SOR schemas/business rules, identifiers and transport
   materials for each chosen year/family. Complete serialization, schema and
   business-rule validation, signatures and authentic acknowledgment handling
   against those actual packages.
3. Confirm required ATS cases and known issues, implement missing treatments,
   submit through ATS, resolve rejections and retain actual approval.
   [TY2026/PY2027 ATS is already open](https://www.irs.gov/e-file-providers/modernized-e-file-mef-assurance-testing-system-ats);
   lack of final 2026 paper forms does not mean testing is closed.
4. Complete state-specific enrollment, forms, tests and approvals. The
   [FTA developer directory](https://taxadmin.org/electronic-filing-information/)
   is a starting point. For example,
   [Connecticut](https://portal.ct.gov/drs/practitioners/practitioner-pages/software-developers-efile)
   requires an annual letter of intent before access to its SES schemas/tests;
   [Massachusetts](https://www.mass.gov/info-details/modernized-e-file-mef-program)
   requires yearly vendor approval testing. No state's support or approval is
   inferred from federal approval or absence of a broad individual income tax.

These account/application steps are unperformed. No application, agency contact,
paid service or submission was made. Separate custody activation, reconciled
legacy migration, independent tax/security review and the installed office/user
journey also remain release gates. Local evidence is recorded in
[the verification receipt](verification/filing-qualification-20261113.json).
