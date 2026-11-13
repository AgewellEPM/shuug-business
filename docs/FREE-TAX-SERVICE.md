# Shuug small-firm service: current assessment

Assessed November 10, 2026 against source
ee7be6cf1b1fd9bdf1ec37b8b6b537164add24ce, branch
feat/shuug-free-tax-service-20261107, and the actual installed service.
This pass inspected source, existing release evidence, the LaunchAgent/compiled
route manifest and public HTTP responses. Test suites were not rerun for this
assessment. No app configuration, private data or deployment was changed.

The target remains complete tax preparation, accounting and filing within Shuug,
configured through its [MCP builder](WORKSPACE-BUILDER-MCP.md). Both
individual/self-employed and business-entity returns belong in the first usable
release. Both separate-computer and separate-cloud custody options remain
supported; they must preserve a firm's trust pins and are not interchangeable
new key initializations. Payments remain pending under the current instruction.

The full product is still a **prototype**. Individual foundations have compiled
synthetic pilot evidence; that does not make the installed tax product ready for
real office use. The largest gap is connecting those foundations into one
protected office journey. Choosing a cloud account alone will not finish it.

The requested coverage target, clarified November 12, is tax years **2023–2026**,
all four federal return families and **all 50 states**. November 13 steering also
adds **tax year 2027**, making the requested range **2023–2027**. The target is not current
support. No approved filing account/provider or separate custody environment is
available yet; live activation depends on those external prerequisites.

November 13 qualification continuation: the limited annual packs now cover
2023–2025, including ordinary Form 8959 tax/withholding, limited residential
energy credits (Form 5695 / Schedule 3), and ordinary Schedule H household payroll
with FUTA Sections A/B, late contributions and annual credit reductions. Schedule B payer disclosures and limited Form 8960 ordinary investment income are also implemented. Broader credits and other listed treatments remain unfinished. Annual source pins, printed PDF amounts and encrypted client/staff
flows have focused verification; they do not constitute agency approval.
Private account-code/password/authenticator enrollment, password and authenticator
recovery and expired-enrollment renewal are implemented through separate firm
approval. Names/email remain encrypted. These supersede the corresponding dated
source gaps below; migration, real custody activation and installed rollout remain
unfinished. The [qualification workflow](SHUUG_FILING_QUALIFICATION_20261113.md)
records selected official ATS gaps and the actual approval path. No IRS/state
approval, live transport or complete federal/state coverage is claimed.

November 13 implementation continuation adds source-based inventory/COGS and
Form 1125-A, ordinary retirement distributions and Social Security worksheets,
and New York resident IT-201/IT-2 alongside Connecticut. Imported signed business
books can now become canonical posted ledgers after firm review, preserving
reversals, period history and source discrepancies. These are source changes with
synthetic integration evidence; the dated installed assessment above is retained.
See the [engine scope](../packages/tax-engine/README.md) and
[conversion contract](../packages/secure-tax-client/LEGACY-BOOK-CONVERSION.md).
The full product remains a prototype with incomplete tax and migration coverage,
external filing/custody prerequisites and installed rollout still outstanding.

November 13 eligibility continuation adds reviewed standard-deduction age,
blindness, claimability and deceased-filer facts; supported Schedule 1-A
deductions; dependent intake and annual Schedule 8812 child/other-dependent
credits; and source-linked Connecticut retirement adjustments. These facts
save and reopen through the encrypted client/staff workflow and appear in the
original annual PDFs. A separate EIC source check runs on every individual
return: an unproved credit keeps settlement amounts unknown. The EIC and
Connecticut continuations below extend ordinary family coverage; broader
family/state treatments remain unfinished. The final 2026 Schedule
8812 is installed alongside C/SE; the complete 2026 annual pack remains missing.
See the [eligibility verification receipt](verification/federal-eligibility-expansion-20261113.json).
These changes supersede the corresponding source gaps in the dated assessment
below, without changing its unverified custody, filing and installed boundaries.

November 13 annual continuation connects **tax years 2026 and 2027** to encrypted
return creation, correction, save/reopen and matching case review for all four
families. Individual calculations use the respective published annual amounts;
entity returns accept validated source intake while their annual calculation
packs remain unavailable. The 2027 PDF contains workpapers only, without loading
or relabeling an earlier-year form. Final 2026 forms remain limited to C/SE/8812.
See the [2027 annual boundary](../packages/tax-engine/ANNUAL-2027.md) and
[annual verification receipt](verification/annual-2026-2027-20261113.json).
The requested 2023–2027 range is now represented in the client; complete annual
tax coverage, all-state support, qualification and installed rollout remain open.

November 13 EIC continuation adds ordinary **2023–2025 Earned Income Credit
awards**, using separate eligibility sources, the exact annual tables,
Worksheets A/B, explicit per-filer combat-pay elections and original Schedule EIC
PDFs. The amount flows into ACTC, payments and federal settlement. Source
conflicts remain unresolved, including contradictory birth dates, residence
days/months, child links and combat totals. Broader state EIC schedules, special federal
treatments and 2026–2027 annual award materials remain unfinished. See the
[EIC scope](../packages/tax-engine/EARNED-INCOME-CREDIT.md) and
[verification receipt](verification/eic-awards-20261113.json).
The [Connecticut zero-table safeguard](verification/ct-eic-zero-table-guard-20261113.json)
also leaves an unresolved 2025 child-supplement case unknown instead of assuming
that zero federal EIC necessarily means zero Connecticut credit.

November 13 Connecticut continuation connects ordinary **2023–2025 CT-EITC
and CT-Dependent** to the encrypted editor, state settlement and original annual
PDFs. The state credit uses the computed federal award and saved combat election,
linked original W-2/business identifiers, and the 2025 qualifying-child supplement.
Claimed dependent identities come from the federal records, including complete
continuation statements. Corrections recompute CT-1040 line20a and payments;
incomplete source reviews keep the affected totals unresolved. See the
[CT EITC scope](../packages/tax-engine/CT-EITC.md) and
[original schedule coverage](../packages/tax-engine/CT-FAMILY-PDF.md), with
[integration evidence](verification/ct-family-20261113.json).
Separate-status allocation, mixed withholding, non-SSN dependent disclosure and
specified child-supplement uncertainties remain open. Newer state years require
their own annual packs; validated 2026/2027 source intake is retained. These
changes do not establish filing approval or change the installed service.

November 13 New York continuation connects **2023–2025 IT-215 and IT-209**:
ordinary state/NYC EIC, the household-credit adjustment and city rate worksheet,
and a separately sourced noncustodial-parent alternative. Original child/support
records and independent combat-pay elections save and reopen in the encrypted
editor. The selected credit flows to IT-201 lines65/66, with NYC on line70; the
larger state claim is chosen without claiming both. Original annual schedules
and continuations are included in the draft packet. Missing noncustodial sources
can keep an older return unresolved even when its federal EIC is zero.
See [New York EIC scope](../packages/tax-engine/NEW-YORK-EIC.md) and
[original PDF coverage](../packages/tax-engine/NY-EIC-PDF.md), with
[integration evidence](verification/ny-eic-20261113.json).
Other family credits remain separate requirements: the 2025 Empire State child
rules can cover a retained child without a federal dependent claim, so that
potential credit now keeps line63 and settlement unresolved until reviewed and
calculated. Support-order calendar boundaries, special income, separate filing
status and newer annual packs remain explicit limits. No agency filing or
installed rollout has occurred.

## Already implemented

- Owner/staff/client MFA, encrypted device backups, signed enrollment, per-device
  read grants/capsules, revocation and replacement-staff-device recovery.
- Independent encrypted multi-file intake, durable encrypted retry, client/staff
  refresh and scoped summaries.
- A 2025 federal draft calculation/form pack for 1040/Schedule C, 1065, 1120-S
  and 1120. Coverage limits are explicit; PDFs are marked DRAFT / DO NOT FILE
  and every result remains filingReady:false.
- Firm-approved encrypted corrections to an existing return: exact source
  binding, offhost review and owner MFA publication of ciphertext plus a fresh
  read capsule. Staff still cannot directly write client ciphertext.
- Ordinary separate books, balanced cent-based journals, classified accounts,
  mapped/reviewed bank imports, reconciliation, invoice/credit/settlement history
  and a controlled document/review/package workflow.
- Stopped-writer backup/restore, complete source packaging, a standalone firm
  computer kit and a separately controlled AWS key-worker package.

The native snapshot reputation fields, bounded staff-grant pagination and source
archive omissions described in the [November 8 review](SHUUG-READINESS-20261108.md)
were fixed. They are historical findings, not outstanding defects.

November 10 implementation continuation: preparers can now originate an initial
return for either family through a private review kit, separate firm approval
and owner MFA publication of revision 1 plus its read capsule. It needs a current
signed enrollment/assignment but no pre-existing shared return. The origination
gap in the dated assessment below is closed; broader encrypted office integration
remains open. See the [workflow](SHUUG_RETURN_CORRECTIONS_20261109.md) and
`verification/return-origination-20261110.json`. This is source/synthetic
functionality, not real activation or an installed upgrade.

## Remaining work, in implementation order

November 10 case continuation: encrypted cases now connect preparer-originated
returns, document requests, exact-revision file reviews/replacement decisions and
matching draft links. Both client and staff verify a private firm signature and
show changed/missing sources as incomplete. Retained private history, separate
operator review and owner MFA publication are implemented. This closes the
document-review/link portion of row 1 below; encrypted books, balances and
exact-package client authorization remain open. See
[the case workflow](SHUUG_ENCRYPTED_CASES_20261110.md) and
[execution receipt](verification/encrypted-cases-20261110.json).

November 12 continuation: encrypted cases now support a bounded **case working
ledger** with classified accounts, balanced postings, retained reversals,
period locks, shared reports and exact book-version binding for draft review.
See [the workflow](SHUUG_ENCRYPTED_CASE_BOOKS_20261112.md). This advances row 1
without replacing the separate client-wide bookkeeping requirement. Legacy
books are not imported or combined across cases. Firm billing, exact-package
client authorization and the installed rollout remain open.

November 12 client-finance continuation: the independent client now connects
canonical per-enrolled-account shared ledgers and firm invoice/credit/payment/
refund history through private firm approval. Both readers agree after restore;
book changes invalidate linked cases while fee-only changes preserve book review.
See [the finance workflow](SHUUG_CLIENT_FINANCE_20261112.md). This closes the
source balance-projection gap in row 6 and advances row 1; legacy migration,
exact-package authorization, real delivery and rollout remain open.

November 12 authorization continuation: reviewed uploaded signature PDFs now
bind to the exact encrypted case package and actual file bytes. Changed sources,
returns or shared books invalidate current status; retained history rejects an
old signature reuploaded for a changed package. See [the evidence workflow](SHUUG_AUTHORIZATION_EVIDENCE_20261112.md).
This does not implement electronic signing, identity proofing, immutable signature
retention or live filing. Those gates and the installed journey remain open.

| Order | Confirmed gap | Observable completion criterion |
| --- | --- | --- |
| 1 | **One complete encrypted office workflow.** Ordinary Tax work and Client books still reject enrolled clients at tax-office/access.ts:13 and accounting/client-books.ts:19,31. Preparer origination, encrypted case/document review and bounded case working ledgers now work in the independent client. Normal uploads still need fresh trusted sharing capsules. Shared client books and authoritative fee balances now work in the independent client; exact-package client approval and the complete installed journey remain missing. | An assigned preparer starts an individual and an entity return, reviews/replaces uploaded records, adjusts books, prepares/reviews the return and obtains exact-package client authorization. Client-visible state, approval invalidation, sharing, revocation, restart and recovery work without readable taxpayer data on the app host. |
| 2 | **Trusted enrollment, migration and recovery.** Independent trust config defaults to disabled; private account activation and factor recovery are implemented but real custody is unavailable. Reviewed imports now reconcile selected encrypted driver/file exports through the customer client. Lost-client-key recovery has a firm-approved replacement path while password/authenticator access remains. Complete migration and firm-key rotation remain unfinished. Old readable copies/provider tokens and remaining generic link/export/automation access paths need review. | Independently deliver the trusted client/public pins; initialize custody in the selected separate environment; enroll real devices; reconcile/import a verified migration; recover a lost client device; verify history and deliberate legacy retention/removal. Review provider ingestion/access boundaries. Preserve the plaintext prohibition. |
| 3 | **Install the complete build safely.** Port3126 still runs Telemetry build -orrIlj9ul0XV8ixITvtV, lacking accounting, tax-office and secure staff routes. The branches have 24/19 exclusive commits plus unrelated dirty Telemetry work. Hosted Compose enables passwords but does not itself require general MFA; secure staff routes enforce their own factor. The live stored general MFA setting was not inspected. | Reconcile both feature sets, install with rollback, explicitly enable/verify the intended MFA policy and exercise actual desktop/native/web/WordPress paths over the intended TLS setup. Test startup/update/recovery. Connect the public workspace after that path works. |
| 4 | **Complete tax coverage and final forms.** Current calculations are 2025/federal/ordinary-income drafts. Individual dependents/credits, age rules, Schedule 1-A, capital/qualified dividends, retirement, rentals, assets and other treatments remain incomplete. Entities need full K/K-1 separately stated items, capital/basis, disclosures and book-to-tax workpapers. Other years, states, amendments and fiscal/short-year cases are missing. | Publish the supported-case matrix, finish both families' intended cases and required forms/disclosures. Independently check calculations and actual form lines against authoritative reference cases. Establish reviewed annual rule/form updates. |
| 5 | **Real authorization and filing.** Authorization is reviewed uploaded evidence; existing submission/acknowledgment records describe staff-reviewed external evidence. The MCP catalog correctly reports MeF/state transmission unimplemented. | Implement the declared preparer/client signature and authorization process, approved filing transport, authentic acknowledgments, rejects/corrections/amendments and return-version history. Complete external testing/provider approvals. A sample PDF or typed acceptance reference is insufficient. |
| 6 | **Authoritative client billing and balances.** The independent client now projects certified invoices and settlement balances separately from uploaded invoice documents. Legacy billing still needs reconciled migration into that client-bound history. Email delivery is implemented but actual provider delivery is unverified. | Publish the correct client's invoice/history/balance from the accounting source; reconcile partial payments, credits, corrections and refunds across staff/client views after restore. Verify email delivery when authorized. Keep payment activation deferred. |
| 7 | **Accountant conversion and reporting.** Reports explicitly say basis:ledger; dates do not implement cash/accrual timing. Export is trial-balance CSV. Guided opening conversion, adjusted workpapers and tax-line exchange remain missing. | Reconcile opening balances to source evidence; independently verify settlements crossing periods under each claimed basis; produce adjusted workpapers and mapped tax exports, with supported business fiscal years. |
| 8 | **Everyday office usability.** Ordinary queue/selectors exist, but requests are individual, deadlines are staff targets and secure sharing exposes IDs/files. A tax organizer, reusable conditional request bundles, reviewed prior-year rollover and durable tax reminders are missing. | A new preparer sets up a firm and handles the first client without terminal commands or UUIDs. Show missing documents, review/sharing progress, deadlines and actual reminder delivery/failure. Obtain office-user and Luke's screenshot acceptance. |
| 9 | **Operate and fund the service.** Backups require stopping every writer; scheduled independent encrypted copies, retention, failure alerts and measured restore targets remain unverified. Quotas exist, but usage visibility and measured costs/load are missing; support/incident ownership and firm security-program readiness remain unverified. | Restore a representative release/data on another machine, including key/revocation safeguards; measure recovery time/data loss, low-disk behavior, concurrent load, backup growth and support cost. Define visible limits, optional provider charges and operating/security ownership. Obtain independent security review. |

Evidence anchors in the source tree:

- Protected office boundaries: src/lib/tax-office/access.ts:13,
  src/lib/accounting/client-books.ts:19; preparer correction precondition:
  packages/secure-tax-client/browser/staff-client.mjs:162.
- Disabled trust/activation: browser/trusted-config.mjs:3 and browser/client.mjs:134
  under packages/secure-tax-client. Supported migration: migrate-legacy.mjs and browser/legacy-import.mjs; remaining coverage is recorded in docs/SHUUG_REVIEWED_LEGACY_IMPORT.md.
  Unshared revision denial: src/lib/secure-tax/staff-store.ts:214.
- Deployment MFA policy: deployments/rideshare-tax-pros/free-host/compose.yaml:8;
  general enrollment policy: src/lib/auth/mfa/store.ts:20,30.
- Tax year/draft boundary: packages/tax-engine/index.mjs:10.
  Filing capability: src/lib/industry/mcp-builder.ts:39.
- Encrypted financial view: packages/secure-tax-client/browser/client-portal-view.mjs:11.
  Accountant report basis/CSV: src/lib/accounting/reports.ts:28,49.
  Stopped-writer backup: src/lib/workspace/backup.ts:33.

IRS software approval involves actual Modernized e-File assurance testing for
the supported forms; local tests do not supply it. See the
[IRS approval process](https://www.irs.gov/e-file-providers/how-tax-preparation-software-is-approved-for-electronic-filing)
and [current MeF notices](https://www.irs.gov/e-file-providers/modernized-e-file-mef-status).
The firm's written security program and operating procedures are distinct from
encryption implementation; tax preparation firms are included in
[FTC Safeguards guidance](https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know).

## Current runtime and evidence limits

The installed LaunchAgent points to the separate GigTaxProsTelemetry-20261107
checkout at 05585f4, with its existing uncommitted telemetry/docs work preserved.
Its compiled route manifest lacks /accounting/page, /tax-office/page, secure staff
session and return-edit routes. Unauthenticated page requests return307; those
redirects do not prove the protected office route exists. No service was restarted.

GigTax's /about-the-app responds200. Live site-config.json still has no workspace
URL, contact phone/email or app download destinations. The navigation repair is
present; it has not activated a client workspace. Mailbox, physical-phone and
real-office acceptance remain unverified. Payments are intentionally deferred.

The latest [return/correction receipt](verification/return-corrections-20261109.json)
records 112 client/custody/tax checks, a final five-check editor recheck, 25 secure
API checks, 9 builder/packaging checks and 91 compiled synthetic HTTP checks on build
M2SxP5T62LyjjjjiGaU-E. Actual Swift/CryptoKit opens a Node-approved replacement.
The shipped client executes in a Node V8/DOM model; Safari, visual acceptance,
real TLS/custody and an installed real office journey remain unverified.
The [ordinary-office receipt](verification/office-workflow-20261107.json) is a
separate synthetic legacy-workflow proof, not proof of encrypted integration.
These suites were not rerun during this assessment. No new exploitable bypass
or new calculation defect was established by this read-only pass.

The next software milestone builds on the encrypted case ledgers to connect
client-wide books, billing and exact-package client authorization, while custody activation
and the reconciled installation are prepared. Completion
requires the actual installed end-to-end office journey and declared filing
capability, not a readiness percentage or more passing tests alone.
