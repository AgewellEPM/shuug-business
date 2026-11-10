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

## Remaining work, in implementation order

| Order | Confirmed gap | Observable completion criterion |
| --- | --- | --- |
| 1 | **One complete encrypted office workflow.** Ordinary Tax work and Client books still reject enrolled clients at tax-office/access.ts:13 and accounting/client-books.ts:19,31. Staff corrections require an existing shared return; preparers cannot originate one. Normal client uploads still need fresh trusted sharing capsules. Broader encrypted document review, ledger edits and package approval are missing. | An assigned preparer starts an individual and an entity return, reviews/replaces uploaded records, adjusts books, prepares/reviews the return and obtains exact-package client authorization. Client-visible state, approval invalidation, sharing, revocation, restart and recovery work without readable taxpayer data on the app host. |
| 2 | **Trusted enrollment, migration and recovery.** Independent trust config defaults to disabled; actual client activation is unavailable. Migration exports selected copied data but explicitly reports migration/recovery incomplete. Staff-device replacement is not lost-client-key recovery or firm-key rotation. Old readable copies/provider tokens and remaining generic link/export/automation access paths need review. | Independently deliver the trusted client/public pins; initialize custody in the selected separate environment; enroll real devices; reconcile/import a verified migration; recover a lost client device; verify history and deliberate legacy retention/removal. Review provider ingestion/access boundaries. Preserve the plaintext prohibition. |
| 3 | **Install the complete build safely.** Port3126 still runs Telemetry build -orrIlj9ul0XV8ixITvtV, lacking accounting, tax-office and secure staff routes. The branches have 24/19 exclusive commits plus unrelated dirty Telemetry work. Hosted Compose enables passwords but does not itself require general MFA; secure staff routes enforce their own factor. The live stored general MFA setting was not inspected. | Reconcile both feature sets, install with rollback, explicitly enable/verify the intended MFA policy and exercise actual desktop/native/web/WordPress paths over the intended TLS setup. Test startup/update/recovery. Connect the public workspace after that path works. |
| 4 | **Complete tax coverage and final forms.** Current calculations are 2025/federal/ordinary-income drafts. Individual dependents/credits, age rules, Schedule 1-A, capital/qualified dividends, retirement, rentals, assets and other treatments remain incomplete. Entities need full K/K-1 separately stated items, capital/basis, disclosures and book-to-tax workpapers. Other years, states, amendments and fiscal/short-year cases are missing. | Publish the supported-case matrix, finish both families' intended cases and required forms/disclosures. Independently check calculations and actual form lines against authoritative reference cases. Establish reviewed annual rule/form updates. |
| 5 | **Real authorization and filing.** Authorization is reviewed uploaded evidence; existing submission/acknowledgment records describe staff-reviewed external evidence. The MCP catalog correctly reports MeF/state transmission unimplemented. | Implement the declared preparer/client signature and authorization process, approved filing transport, authentic acknowledgments, rejects/corrections/amendments and return-version history. Complete external testing/provider approvals. A sample PDF or typed acceptance reference is insufficient. |
| 6 | **Authoritative client billing and balances.** The encrypted dashboard counts invoice documents rather than posted receivables and computes no balance. Ordinary billing has settlements/refunds/credits but needs an unambiguous client link and protected projection. Email delivery is implemented but actual provider delivery is unverified. | Publish the correct client's invoice/history/balance from the accounting source; reconcile partial payments, credits, corrections and refunds across staff/client views after restore. Verify email delivery when authorized. Keep payment activation deferred. |
| 7 | **Accountant conversion and reporting.** Reports explicitly say basis:ledger; dates do not implement cash/accrual timing. Export is trial-balance CSV. Guided opening conversion, adjusted workpapers and tax-line exchange remain missing. | Reconcile opening balances to source evidence; independently verify settlements crossing periods under each claimed basis; produce adjusted workpapers and mapped tax exports, with supported business fiscal years. |
| 8 | **Everyday office usability.** Ordinary queue/selectors exist, but requests are individual, deadlines are staff targets and secure sharing exposes IDs/files. A tax organizer, reusable conditional request bundles, reviewed prior-year rollover and durable tax reminders are missing. | A new preparer sets up a firm and handles the first client without terminal commands or UUIDs. Show missing documents, review/sharing progress, deadlines and actual reminder delivery/failure. Obtain office-user and Luke's screenshot acceptance. |
| 9 | **Operate and fund the service.** Backups require stopping every writer; scheduled independent encrypted copies, retention, failure alerts and measured restore targets remain unverified. Quotas exist, but usage visibility and measured costs/load are missing; support/incident ownership and firm security-program readiness remain unverified. | Restore a representative release/data on another machine, including key/revocation safeguards; measure recovery time/data loss, low-disk behavior, concurrent load, backup growth and support cost. Define visible limits, optional provider charges and operating/security ownership. Obtain independent security review. |

Evidence anchors in the source tree:

- Protected office boundaries: src/lib/tax-office/access.ts:13,
  src/lib/accounting/client-books.ts:19; preparer correction precondition:
  packages/secure-tax-client/browser/staff-client.mjs:162.
- Disabled trust/activation: browser/trusted-config.mjs:3 and browser/client.mjs:134
  under packages/secure-tax-client. Incomplete migration: migrate-legacy.mjs:183.
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

The next software milestone is the protected office case model connecting
documents, preparer-created returns, books, billing and approval history, while
custody activation and the reconciled installation are prepared. Completion
requires the actual installed end-to-end office journey and declared filing
capability, not a readiness percentage or more passing tests alone.
