# Shuug small-office assessment — November 8, 2026

**Product-direction correction:** Luke subsequently clarified that Shuug is to be
the complete tax preparation, accounting and filing product, built/configured
through Shuug's MCP interface. The companion-filing-software recommendation below
was not his requirement. Current capability findings remain evidence of missing
work; they do not narrow that goal. See [the MCP builder](WORKSPACE-BUILDER-MCP.md).

Assessed source `785123478eeb89fbd7ed990e34eaf32339f4659e`, branch
`feat/shuug-free-tax-service-20261107`. This review covers the useful free tax-office
service and firm-owned Mac mini hosting. AWS account activation is excluded from
the priorities below. It is not a release or a claim of completed tax software.

**Decision:** a firm-owned Mac mini is a viable application server. The existing
architecture already runs locally with SQLite. The strongest next product step is
to make one complete, recoverable, encrypted office workflow easy to install and
use. More marketing pages or navigation entries will not close that gap.

The current earned result is a compiled synthetic office/recovery pilot. General
real-data release remains blocked by encrypted workflow/migration, authorization,
installation and operational acceptance. No readiness percentage is justified.

## What already works

- Separate client books, balanced cent-based journals, classified custom accounts,
  bank CSV mapping and preview, reviewed posting, reconciliation, ledger reports,
  invoice/bill settlements, period seals and year close.
- Client/accountant selectors, source-document requests, uploads, review and
  not-applicable decisions, preparation stages, exact-package approval, return-bound
  authorization, ZIP handoff and attributable rejection/correction history.
- Owner/staff/client MFA, one-use recovery codes, session revocation and linked
  client controls on the guarded tax routes.
- Original client/recovery v2 ciphertext, independently signed enrollment, read-only
  per-device staff grants/capsules, local encrypted key backup and replacement-device
  recovery. Legacy enrolled-client plaintext access intentionally fails closed.
- Verified stopped-writer backup/restore and an existing local service installer
  and upgrade/rollback utility. These need operational completion, not replacement.

Existing evidence records 38 compiled encrypted-staff checks and 141 compiled
MFA/accounting/office checks, plus clean restores. Those suites were not rerun for
this assessment. They do not establish real firm use, visual acceptance or an
independent security review. See [staff evidence](verification/encrypted-staff-20261107.json)
and [office evidence](verification/office-workflow-20261107.json).

The running port-3126 installation still uses build `-orrIlj9ul0XV8ixITvtV`,
whose route manifest lacks Client books, Tax work and secure staff status. Its
separately changing source checkout was observed at `a12bf54` with unrelated
pending work. The integrated preview therefore is not an installed upgrade.
Combine and verify newer installed features before replacing the firm's service.

## Work in priority order

| Order | Gap and evidence | Completion criterion |
| --- | --- | --- |
| 1 | **One complete encrypted office workflow.** The trusted staff view reads/downloads; it cannot edit books, review uploads, request replacements, approve packages or record acknowledgments. Those ordinary-office actions exist, but `src/lib/tax-office/access.ts:13` blocks their legacy plaintext path after enrollment. `packages/secure-tax-client/browser/staff-view.mjs:11`. | An enrolled client and assigned preparer complete intake, record/document edits, review, authorization and handoff through trusted decryption, then restart and recover. Preserve source revisions, permission checks and package invalidation. |
| 2 | **Fix current recovery and distribution regressions.** Native snapshot decoding rejects newly committed reputation fields. The staff grant list is unpaginated but the reader caps a response at 64 KiB. `release:source` omits `packages` and `native`. Details below. | Current Journal fields survive capture/open/review; large grant/revocation histories refresh safely; a clean release archive builds all documented app/client/recovery components. |
| 3 | **Finish enrollment and controlled migration.** Customer/native UI stages signed setup and deliberately leaves activation disabled. The legacy exporter prepares ciphertext, without import/reconciliation/purge. Migrated nested `legacy-*` file payloads do not use the browser's normal `private-file` view. `browser/client.mjs:123`, `browser/index.html:24`, `migrate-legacy.mjs:154,164,183`. | A newly invited client completes enrollment without API commands. Migrate a verified copy, reconcile records/files/history, open usable attachments, recover on another device, then follow a reviewed legacy-retention/removal policy. Keep recoverable originals until acceptance. |
| 4 | **Align every access path with tax-client policy.** Generic base client-profile exports use section permission rather than tax assignment. Legacy portal links lack the enrollment/active-client checks used by billing shares. Workspace/backend automation tokens retain broad shared authority. These are boundary inconsistencies to resolve; guarded tax documents/books were not shown bypassed. `workspace/access.ts:15`, `workspace/catalog.ts:59`, `workspace/portal.ts:24`, `app/modules/portal-actions.ts:7`, `auth/identity.ts:26`, `backend/auth.ts:4`. | Negative tests cover assigned A/unassigned B, archived/enrolled clients, links, exports, restored sessions and credential revocation. Tax deployments disable or explicitly scope automation credentials by purpose/action/client with attributable events. |
| 5 | **Make the Mac mini an office appliance.** Current installer starts a GUI LaunchAgent on loopback HTTP; hosted setup rejects private/LAN names. Installer verification expects a password-only response and does not complete an MFA challenge. `scripts/install-rideshare-workspace.ts:18,35,51,60`, `scripts/setup-rideshare-server.ts:19`. | A firm installs without development tools, enrolls MFA, connects authorized staff over valid TLS, updates and recovers. Test boot/login/power-loss behavior, certificate renewal and secure local/remote modes on the intended Mac. |
| 6 | **Operate recovery and storage.** Backup/restore already verifies data but requires stopped writers. Scheduling, retention, independent backup copies, failure alerts, restore ownership and measured recovery targets remain unfinished. Existing updater provides stopped-data backup/service rollback; a representative release drill is unverified. `workspace/backup.ts:33`, `scripts/update-gig-tax-workspace.ts:88`. | Restore a release and full firm data to a second Mac; reconcile revocations and invalidate stale restored sessions; measure recovery time and acceptable data loss. Test low disk, missing volume, failed jobs and missed backup alarms. |
| 7 | **Accountant conversion and reports.** Reports explicitly return `basis: "ledger"`; date filters do not implement cash/accrual treatment. Manually posted opening balances work, but guided conversion, adjusted workpapers and tax-line exports are missing. Existing export is trial-balance CSV. `accounting/reports.ts:10,28,49`, `accounting/reports.test.ts:19`. | Review a sanitized opening conversion and reconciled statements; independently check invoice/bill payments crossing periods under each claimed basis; produce a usable accountant exchange package. |
| 8 | **Reduce daily effort.** Current tax intake adds requests individually. A tax organizer, reusable conditional request bundles, prior-year rollover and durable tax reminders are missing. Dates are staff targets, not a maintained statutory deadline/extension engine. Generic setup templates/workflows already exist. Staff secure selectors expose opaque IDs and sharing uses file publication. `TaxOfficeWorkspace.tsx:17,33`, `modules/tax-firm.ts:24,37,56`, `automation/model.ts:11`, `browser/staff-app.mjs:28,46`. | A preparer unfamiliar with the code sets up a firm and completes the first client without terminal commands/UUIDs. Show missing work, sharing progress, reminder delivery/failure and explicit incomplete views. Measure help/time. |
| 9 | **Define and measure the free offer.** Low-level quotas already exist; capacity visibility, predictable support, measured resource costs and pilot funding are missing. No cloud bill does not remove hardware, electricity, backup, maintenance or support costs. | State supported clients/storage/usage and optional provider charges. Measure disk and backup growth, peak concurrency, support minutes and restore costs per firm. Set transparent limits from evidence. |

## Reproduced and source-confirmed defects

**Native snapshot compatibility — reproduced against the actual current Swift sources.**
`native/ios/RideshareTaxPros/DriverCore/Sources/DriverCore/Journal.swift:35`
contains optional `reputationState` and `reputationOutbox`. Synthesized Codable
encodes them when non-nil. `App/SecureTaxJournalSnapshot.swift:21` retains the older
field allowlist; its decoder rejects other keys at line 67.

| Fresh encode/decode case | Encoded bytes | Observed result |
| --- | --- | --- |
| Both reputation fields nil | 286 | Decode succeeds |
| Non-nil empty reputation state | 347 | Decoder rejects unsupported format |
| Non-nil empty reputation outbox | 308 | Decoder rejects unsupported format |
| Both fields non-nil | 369 | Decoder rejects unsupported format |

`SecureTaxSnapshotCheckpoint.swift:59` captures/seals without decode preflight;
`SecureTaxJournalSnapshotService.swift:79` later opens/decodes for native preview.
This can prevent preview/import review of an uploaded archive. Original bytes
and the local Journal remain preserved; no data loss was demonstrated. The proof
used disposable compilation, no private keys/Keychain/network/app/VM, and its
temporary files were removed. Older documentation claiming these committed
reputation fields are absent is stale.

**Staff grant-list size — controller failure reproduced.** `src/lib/secure-tax/staff-store.ts:112`
returns all own active grants and signed revocation notices. The client's
`refreshGrants()` uses the default 65,536-byte response limit in
`packages/secure-tax-client/browser/staff-client.mjs:14,40,97`. A sufficiently large
practice/history cannot refresh. An injected-response proof through actual
`StaffVaultClient.refreshGrants()` streamed 81,089 bytes with 128 unsigned dummy
entries, no Content-Length header, no real keys and no network. It failed at the
stream-byte guard before JSON parsing or grant verification, cleared unlocked
state and opened no records. That entry count is specific to this dummy payload,
not a universal signed-grant threshold. Fix with bounded consistent pagination while
retaining revocation-first processing and epoch checkpoints; arbitrary unbounded
response growth is not an adequate solution.

**Incomplete source release — source-confirmed.** `scripts/release-source.ts:7,18`
does not collect `packages` or `native`. A generated archive therefore omits the
independent frontend/crypto/recovery tools referred to by included instructions.
The GitHub repository does contain them; this defect concerns that archive path.

## Mac mini hosting

One private deployment/data volume per independent firm fits the current
architecture. `src/lib/workspace/database.ts:6` uses local SQLite. PostgreSQL and
external application hosting are not mandatory for the core office. Separate
firms should not share a directory merely because they share branding or support.

| Use | Feasibility and remaining work |
| --- | --- |
| Owner uses the app on the same Mac | The existing local installer supports this ordinary-office model. The Mac becoming compromised also compromises keys/plaintext used on that same Mac. |
| Staff use an office Mac mini server | Feasible with separate staff devices, private network configuration, TLS and independent trusted-client distribution. Current loopback-only installation is not a LAN appliance yet. |
| Clients connect from home | The mini must be securely reachable and available. Establish a deliberate remote-access/domain/TLS or private-network design; outside application hosting is optional. Do not expose the current local HTTP port directly to the internet. |
| No cloud recovery service | Existing offline firm tools can run on a separately trusted firm computer, with encrypted recovery material retained separately. A cloud provider is optional; a second trust/backup boundary is still required. |

For the established host-compromise protection, staff private keys belong on staff
devices; firm recovery/signing keys and their administrative authority stay off
the server mini. The trusted frontend must be independently delivered. Two HTTPS
names served by the same compromised host/admin do not establish that separation.
Current browser config requires distinct exact HTTPS UI/API origins
(`packages/secure-tax-client/browser/config.mjs:7`). A packaged trusted client or
independently administered frontend is part of finishing this installation mode.

Choose and verify the Mac's sleep, power recovery and disk-unlock procedure on the
actual hardware/OS. Apple documents the available settings in
[Energy settings](https://support.apple.com/en-gb/guide/mac-help/mchlp1168/mac).
No power/security settings were changed by this assessment. A disk/backup away
from the primary machine remains necessary for fire, theft and hardware failure;
it can be an encrypted removable copy rather than rented hosting.

## Filing and professional operation

Shuug currently organizes work and exports a reviewed package. It does not
calculate/forms-produce/transmit returns. Continue using the firm's filing software
for the first service. Acceptance/rejection here is attributed staff-reviewed
external evidence, not an independently verified government/provider response.
A native return engine would be a separate large scope, not an AWS prerequisite.

Self-hosting does not replace the firm's security program, recovery responsibilities
or staff procedures. Tax preparers are covered in the
[FTC Safeguards guidance](https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know);
the IRS provides a [written security-plan starting point](https://www.irs.gov/newsroom/tax-professional-tips-for-creating-a-data-security-plan).
Support MFA, staff offboarding, retention and incident response with actual
operator ownership and independent review. Software tests do not certify the firm.

## Workstation shown for this review

`scripts/preview-tax-workstation.ts` runs the existing compiled application with
three fictional clients, separate books, reviewed sample PDFs and document,
preparation/review stages. The firm's existing installed service/data are untouched.
The loopback-only gateway keeps its disposable owner session out of browser
cookies/URLs and strips response cookies, preserving other local-app sessions.
This preview is deliberately not a production authentication or installation mode.

Run `node --import tsx scripts/preview-tax-workstation.ts` after a successful app
build. It prints the Tax work, Client books and sample ledger URLs. Ctrl-C stops
its owned processes and removes only its generated fictional data. Runtime
credentials/providers are excluded. Ordinary office HTML, three clients/books and
16 local stylesheet/script assets were checked; Safari was opened on the normal
desktop. The requested preview is left available for Luke. Screenshot/office-user
acceptance is pending; no browser automation/runtime was used.

The preview demonstrates the ordinary office workflow. It does not demonstrate
completed encrypted office edits, customer enrollment, live filing or cloud custody.

## Next release gate

First close encrypted workflow/activation and the concrete regressions, align
remaining access paths, and package a recoverable Mac mini installation. Then run
two isolated firms through invitation, document replacement, books/reconciliation,
review/handoff, rejection/correction, revocation, update and second-machine restore.
Record actual accountant effort and Luke's visual acceptance. Add broader accountant
features in pilot-demand order after that dependable core is earned.
