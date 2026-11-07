# Gig Tax Pros feature/data parity audit — November 7, 2026

Read-only inventory of `/Users/lukekist/Worktrees/GigTaxProsConnections-20261107`,
branch `feat/gig-tax-pros-connections`. This file contains source findings and a migration checklist,
not customer records or a claim of completed encryption/parity.

## Implemented since this baseline audit

The secure branch now merges committed native `9cfa62e`, retaining shopping
work, app launchers, Tax & Goals guidance and branded notifications. Protected
manual device snapshots encode all **30 committed Journal fields**, including
six coach fields and delivery/shopping preferences. Account now links explicit
encrypted snapshot upload/list/preview/import-review/delete. This does not turn
normal legacy synchronization into full automatic encrypted sync, restore a
remote Journal, include route/receipt file bytes, or include the original
worktree's uncommitted reputation feature.

The independent static browser client decrypts native snapshots into 24 readable
sections. Normal forms cover identity, documents, trip/income/expense records,
goals/reserves, preparation intake and gig preferences. Form edits are separate
encrypted objects; snapshot sections remain read-only. They do not automatically
merge into the phone's Journal or run coaching/provider/device actions.

An offline preparation tool verifies copied-backup hashes/SQLite integrity and
exports encrypted driver records, linked receipts and own submitted documents.
Coach profiles/messages/mutation caches, staff-only SDK rows, provider secrets,
identity records and histories are explicitly counted or left unresolved. It
does not upload, purge source data or establish completed migration. Client
recovery and actual authorized import must be verified separately.

No real off-host keys/public pins were generated, no account was enrolled or
migrated, and the browser artifact was not deployed. Missing independent pins
keep activation disabled. All remaining checklist items below still apply.

## The current synchronization boundary

`App/DriverModel.swift::sync()` uploads `journal.pendingReceipts` and
`journal.pending` only. The latter is `DriverMutation` over `DriverRecord`, whose
only accepted kinds are trip, expense and income. It downloads the same records,
bank/provider feeds separately, and refreshes the profile. It does **not** upload
the entire Journal. Changes made through `model.commit` alone do not create a
new backend feature record or otherwise synchronize the associated field.

The canonical phone models are in
`native/ios/RideshareTaxPros/DriverCore/Sources/DriverCore/`. Phone UI is in
`native/ios/RideshareTaxPros/App/`; extension capture storage is in `Shared/`.

## Actual feature inventory

| Feature and authoritative source | Durable/current data | Existing backend and web views | Missing parity or migration work |
| --- | --- | --- | --- |
| Client identity/account — `SessionKeychain.swift`, `WorkspaceClient.swift`, `ConnectionView.swift` | Active workspace origin, account UUID/name/email, session token/expiry/brand in device-only Keychain; one active account; separate account journals plus guest journal | Client accounts/invitations/sessions; portal sign-in and profile edit; native GET/PATCH `driver/profile`; staff account setup | Encrypt private profile fields; retain only expressly permitted auth/routing metadata. Preserve identity/client bindings and account isolation. Browser and native key enrollment/unlock/recovery are absent. Name edit is currently plaintext to the server. |
| Trips — `Models.swift`, `TripAccumulator.swift`, `TripViews.swift` | Start/end/local date/time zone, miles, classification, purpose/notes, fare/tips/fees, ride type/platform/work area, gap/source/sample flags | Synced `driver_records`; customer portal year/paginated view; staff `/rideshare`; edits/conflicts/deletions/retries | Encrypt the whole record before transport/storage; preserve revisions/deletions/conflict resolution. Browser trip editing/classification and full route/history parity are absent. Active-trip/tracker state is phone-only. |
| Historical route maps — `DiskStore.swift`, `LocalEntry` coding keys | Per-trip `route-UUID.jsonl` lat/lon/time/accuracy/segment breaks; excluded from encoded journal rows | No route backend or web map; deliberately phone-only under current product copy | Full recorded-map parity requires encrypted route chunks and client web map, with correct gap handling. Do not save every rejected/transient live fix. Latest sync-all requirement must be reflected in privacy copy; never introduce plaintext location upload. |
| Expenses/receipts — `Expenses.swift`, `ExpenseEditor.swift`, `ReceiptCapture.swift` | 23 categories, amount/date/merchant, business/personal classification, notes, receipt ID; business purpose/use %, meals context, vehicle/odometer/payment/place; local JPEG/PDF bytes | Synced expenses and private receipt API; client portal download and staff `/rideshare` receipt review | Current receipt files are plaintext bytes protected by server file permissions. Encrypt file bytes and all expense fields at the client; decrypted client/staff views must retain details, attachment review and edits. Receipt OCR is on-device, transient unless the user accepts fields; do not retain full OCR transcript by default. |
| Income — `Models.swift`, `MoneyViews.swift` | Date/platform/description/amount/currency/notes; optional bank source reference | Synced income; portal and staff journal | Encrypt before upload, enable equivalent web editing. Keep entered income, trip fares, provider payments and bank deposits separate until an explicit reconciliation links them. |
| Earnings/expense review/reporting — `InsightsView.swift`, `EarningsCharts.swift`, `DriveInsights.swift`, `ExpenseReviewView.swift` | Derived daily/weekly history, net/cost/hourly/per-mile estimates, missing fare/classification/detail flags; settings below drive calculations | Basic portal year totals, recent journal and prompts; staff totals | Browser lacks trends, per-ride profitability, history comparisons, goal tracking and full review workflows. Derive views on authorized clients after decryption. Native business expense calculations apply business-use %, whereas current portal deliberately shows full business-classified recorded amounts and staff totals show all classifications. Preserve these labels or standardize explicitly; do not silently equate them. |
| Goals — `DriveInsights.swift::DriverGoals`, `InsightsView.swift` | `dailyNetCents`, `weeklyNetCents`, `targetHourlyCents`, estimated vehicle cost per mile, in `Journal.goals` | No backend/settings view; phone-only | Add encrypted versioned goal/preferences object and web view/editing; recalculate on both clients with the same rules. Vehicle cost is a user estimate, not a tax mileage rate. |
| Planning reserves — `ShiftMission.swift::ReserveSettings`, `ReserveAndHistoryView.swift` | Tax and vehicle planning percentages in `Journal.reserveSettings`; derived allocations | No backend or web equivalent | Encrypted settings plus web calculator/history view. These are user planning reserves, not calculated liabilities or actual transfers. |
| Go Home mission — `ShiftMission.swift`, `MissionView.swift` | Start/deadline/target/destination label in `Journal.mission`; up to 20 manual/confirmed offer comparisons; up to 500 pickup-wait samples | No backend or web mission/planner | Encrypt durable mission/comparison/wait data and add web equivalents. Existing selected address/MKMapItem/current position/route searches are ephemeral UI state; persist only user-saved planning inputs/results needed for parity. Destination labels can identify a home and are sensitive. |
| Positioning and route optimizer — `PositioningView.swift`, `WaitingAreaPlanner.swift`, `MissionRouteSection.swift`, `GigOfferRouteView.swift`, `DestinationPositioning.swift` | Historical evidence from saved trips/routes; route/destination searches and road estimates in memory; `DriverModel.offerRouteEvidence` memory only | No positioning/road comparison website or backend representation | Encrypted saved route/offer evidence where the user saves it; web planning inputs/map and equivalent algorithm/results. Do not retain continuous current location or all address searches. Apple Maps currently receives chosen endpoints independently of firm hosting; privacy copy must remain accurate. |
| Offers/inbox/profitability — `GigOfferSchema.swift`, `OfferWorkspace.swift`, `OfferInboxView.swift`, `GigOfferEditor.swift`, `OfferIngestion.swift` | `Journal.gigOffers` (up to 200), observation/source/provider IDs, times, payout/tip guarantees/unknowns, pickup/dropoff labels/coordinates, miles/time/costs, missing fields, confidence/uncertainty, confirmation/availability; ingestion logs | No backend or customer/staff web inbox for these native records | Add encrypted offer snapshots/events and web inbox/detail/ranking. Preserve uncertainty, provenance, expired state, user-confirmed versus observed fields and simulations. Never relabel driver reports as provider verification or turn proposed offers into income. |
| Offer decisions/accepted work — `DispatchPlanner.swift`, `GigWorkJournal.swift`, `GigWorkActions.swift` | `Journal.gigDecisions`, `gigCommitments`: consider/skip/accepted/declined/started/completed/canceled, IDs, platform, times, verification text | No backend/web work-state/history | Encrypted append-only/idempotent events and web work/history view. Device/current-account events must not replay into another account. Actual provider acceptance/cancellation remains a provider-app action unless officially authorized. |
| Legacy reviewed offer comparisons — `OfferReading.swift`, `ShiftMission.swift` | `observedOffers`, `missionOffers`, comparison-saved timestamp and entered wait/fees | Phone-only | Migrate without duplicating their newer universal-offer equivalents. Add encrypted compatibility conversion and web view; preserve all existing saved comparisons. |
| Capture/share/diagnostics — `Shared/OfferCaptureStore.swift`, `OfferCaptureDiagnosticsView.swift`, `BroadcastUpload/SampleHandler.swift`, `ShareOffer/ShareViewController.swift` | App Group session/status plus up to 50 normalized offer envelopes; session 4h; retained offers migrate to Journal; raw frames and full transcripts are not stored | No server capture session or browser diagnostics | Website should represent capture availability/session state and encrypted saved observations, not reproduce native ReplayKit permissions. Raw transient frames/full OCR text need not be retained. Scope/session IDs, capture labels and extracted drop-offs are private if retained. Browser equivalent can accept explicit screenshots/manual offers; do not promise unsupported cross-app capture. |
| Alerts/assistance — `DriverAlerts.swift`, `DrivingAssistant.swift`, `PlacePrompts.swift`, `DriverNotifications.swift` | `Journal.driverAlerts` (bounded), assistance toggles, place/merchant/address prompts/dismissal; current movement/GPS decisions in memory; resulting trip/expense edits sync | Only resulting trip/expense records sync; no web reminders/history/settings view | Encrypt durable preferences/prompt/action history and represent it on web. Device location/motion/notification authorization and active capture consent stay device-local, not transferable server permissions. Prevent web or restore from replaying an old device control action. |
| Bank statements and review inbox — `BankTransactions.swift`, `BankImportView.swift`, `BankReviewView.swift`, `BankClient.swift` | Phone CSV/OFX/QFX imports, classifications, ignored/reviewed links/update-review flags; provider inbox/cursor; source references on accepted journal entries | Provider transactions stored and downloaded by backend; accepted income/expense links sync; owner provider settings; no complete client web statement import/bank review inbox | Encrypt raw and reviewed bank facts/review decisions and source links. Add web import/review/reconcile. Phone-only statement inbox and ignore/review flags currently are not server-synced. Never combine deposits automatically with entered income or Uber payouts. |
| Direct bank connection — `BankConnectionView.swift`, `BankWire.swift`, `bank-store.ts` | Plaid link metadata/status in memory; provider item, access token, account labels, downloaded transactions on server | Native Link SDK flow; driver bank API; owner `/setup/driver-connections`; server transaction JSON remains plaintext | Tokens and facts need a key boundary separate from hosting. Current hosting-server token decryption can fetch raw bank data, so ciphertext-at-rest alone is insufficient for host blindness. Choose offhost trusted ingestion or a client/firm-mediated trusted connector; preserve disconnect/revocation/error/correction behavior. Provider approval/credentials still gate live access. |
| Uber/gig provider records — `GigConnectionsView.swift`, `src/lib/gig-connections/*` | Official authorization/profile and trips/payments; not live offer dispatch | Newly implemented gated APIs, client portal provider view and staff `/gig-connections/uber`; source facts distinct from journal | Profile/fact bodies use server-held encryption; driver/provider IDs, time and payment aggregates remain readable metadata. Move private payload/aggregates and provider credentials behind offhost key handling. Preserve review/reconciliation and official capability/approval limits; Lyft/DoorDash/Instacart/Spark official account feeds are not implemented by these routes. |
| Tax work/documents — `TaxWorkspaceView.swift`, `TaxWorkspaceWire.swift`, `customer-access/tax*.ts` | Shared engagements/requests/progress/quarterly records; submitted PDFs/images and review status; native previews in memory, explicit copy export | Native `driver/tax`, authenticated document upload/download, customer portal, staff `/tax-documents`, module record editors | Upload currently sends plaintext bytes and filenames to host, then host encrypts with its own key. Encrypt bytes, filenames, tax fields/messages and review payloads before network. Authorized client/staff browsers must decrypt locally; server can enforce opaque ACL/request ownership and ciphertext limits. Retain received/reviewed/filing distinctions. |
| Referrals/rewards — `ReferralView.swift`, `referrals.ts` | Native response state; referral code/claims/points/rewards/proof/method/fulfillment reference stored server-side | Native API/view; staff `/rideshare/referrals`; no full client web rewards view | Add encrypted private referral/payout/proof data and client web view while retaining fraud/qualification/idempotency controls; public referral code need not expose client identity. |
| Exports and demo — `JournalExport.swift`, `SampleShiftView.swift`, `GigSampleShift.swift` | User-selected CSV export; generated sample shift in isolated in-memory state | No full client website export/demo experience | Browser export should operate after unlock and explicit choice, with existing spreadsheet escaping. Reproduce sample demonstrations as visibly separate examples; do not sync them as real earnings, offers or jobs. |

## Encryption findings that block the newly requested end state

1. `src/lib/connections/vault.ts` keeps `vault.key` in the same data directory
   as encrypted data. Workspace backup includes it. A hosting-server or backup
   compromise can decrypt the existing `sealSecret` envelopes. An environment
   variable or KMS key usable by that same server does not satisfy offhost keys.
2. `driver_records.body` and `driver_mutations.result` are clear JSON; the latter
   retains prior idempotent results. Receipts are raw files. Bank transaction
   bodies, customer name/email, SDK tax-record values/messages/references,
   document filename/type/status/relations and provider aggregate columns also
   disclose private data. Include old revisions, caches, WAL, exports and backups
   in migration, not merely the newest document blob.
3. There is no dedicated SSN/ITIN field in the current tax module model; labels
   discourage taxpayer IDs in notes. That does not prevent SSNs in a PDF/image,
   filename, free text, scan or provider record. Encrypt the entire sensitive
   payload class; pattern masking alone cannot meet the requirement.
4. Both customer portal and staff pages render decrypted financial/tax content
   on the server today. Host-blind storage requires authorized browser/native
   decryption and rendering. Server-side full-text search, sums, filters and
   file-type sniffing cannot silently keep plaintext copies for convenience.
5. Key recovery, multi-device enrollment, role/view-specific key grants, rotation,
   revocation and key-loss recovery are not implemented. Session recovery by
   resetting a password is distinct from recovering encrypted data.

## Migration and acceptance checklist

- Freeze additions of plaintext feature syncing. Preserve originals and make a
  recoverable migration checkpoint outside the hosting key boundary first.
- Establish per-client vault identity and versioned authenticated encrypted
  envelopes. Keep client unlock keys and the separately confirmed firm recovery
  private key off the hosting server and out of its environment/backups/logs.
  Never silently generate the only firm master recovery copy on the host.
- Define an explicit public/auth/routing metadata allowlist. Content dates,
  merchant/provider facts, monetary aggregates, locations, profile details,
  filenames, notes and taxpayer identifiers belong inside ciphertext. Opaque
  IDs, recipient grants, envelope version, revision/sequence/deletion marker and
  bounded ciphertext byte lengths are possible routing necessities, not a blanket
  permission to expose corresponding business labels. Address email-login lookup
  separately rather than calling email non-sensitive.
- Enroll client native device and browser; enroll authorized firm view keys and
  offhost master recovery. Verify active account/client binding before grants.
  Keep normal client/staff permissions and recovery authority distinct. A hosting
  admin must not receive decryption access merely by being able to read SQLite.
- Migrate **all durable Journal fields**, related receipt/route chunks and
  extension-derived saved offers into encrypted versioned collections. Give new
  settings/planning objects revisions, deletes, retry IDs and cross-device merge
  rules; do not upload a replace-all snapshot that loses concurrent web edits.
- Migrate existing driver/tax/bank/provider/referral data and historical mutation
  receipts from a trusted decrypting environment. Verify exact content/references
  before retiring old plaintext host copies and accessible keys/backups. Failed
  or interrupted migration must preserve a recoverable original and fail closed.
- Convert website **client, staff, owner and recovery** views to unlock locally
  and render only granted collections. Implement the missing web experiences
  identified above, with the same durable data and calculations used by iOS.
  Keep public marketing pages separate and non-sensitive.
- Represent platform/device-specific features honestly on web: browser-supported
  capture/import, availability/status and saved results; never imply background
  iOS GPS, ReplayKit or notification permission transfers to a web session.
- Change provider ingestion so hosting cannot use retained tokens to bypass the
  encrypted payload boundary. Do not enable live bank/Uber syncing until the
  approved connector/key design and provider access are actually configured.
- Update phone/privacy/portal copy that currently promises phone-only route,
  destination, goal and statement storage before enabling encrypted sync of
  those durable objects. Raw rejected fixes, transient frames, full OCR text,
  loading/error state and simulated data need not be retained to achieve parity.
- Verify with one synthetic client across iOS, client browser and authorized
  staff browser: create/edit/delete/settings changes/offers/work/mission/documents,
  offline reconnect, conflict, revoke/re-enroll, new-device recovery and offhost
  firm recovery. Verify a second client cannot decrypt or obtain another's grant.
- Inspect a copied hosting database, files, logs, WAL and backup from a separate
  process **without offhost keys**: no plaintext SSN, names/filenames, tax figures,
  locations, document bytes or recoverable decryption key. Prove authorized
  client/firm views can still recover actual records after restart and restore.
  Tests alone do not establish the live, multi-view product outcome.

No source files were modified by this audit. No data was newly synchronized.
