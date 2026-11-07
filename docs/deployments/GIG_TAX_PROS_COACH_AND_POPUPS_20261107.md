# Gig Tax Pros shared guidance and in-app notifications

The iPhone app now has a Tax & Goals conversation backed by saved trip, income
and expense records. It identifies loss-making and highest-net jobs, groups
recorded work by platform/area/start hour, and explains incomplete economics.
Tax-preparation milestones and explicitly confirmed year/jurisdiction/business
structure share the existing authenticated client account with the browser.
Staff review requires both Money-view and Services-view permission.

Phone answers work offline. Stable-ID questions and confirmed intake persist in
the protected account journal and retry after record sync. Account changes are
rechecked after network waits. Question/reply ordering preserves server order
when timestamps match. Confirmed intake replaces the complete snapshot, including
explicit clearing. Connecting from guest offers separate opt-ins for records
and conversation; default connection cannot silently transfer either.

All app-owned confirmations and informational messages use dark branded panels,
neon borders and clear actions. Foreground notifications use a branded card on
the current page rather than the standard iOS banner. Destructive confirmations,
cancel/backdrop/escape behavior and account/trip guards are retained. Home's
existing top shortcuts and bottom tabs keep their layout. Native operating-system
permission, provider sign-in and background compact notifications remain system UI.

Guidance uses deterministic record rules. The private installed loopback Peel
worker verifies numerical totals through the existing symbolic-floor admission,
mapping, promotion and verifier path. No model is called. The public app contains
only the bounded authenticated numeric adapter. Unknown amounts remain unknown;
Peel verification does not establish tax-law eligibility or source-record accuracy.
No tax return or payment is submitted by chatting.

Verification on the final source:

- All 73 Swift core checks passed, including 13 coach, eight guest-transfer and
  three universal-work-profile checks.
  The iPhone app and embedded extensions compiled for Simulator.
- Thirty-three focused backend/driver/coach checks and the Next production build passed.
- Actual saved Swift WorkspaceClient against the compiled HTTP server passed
  23 checks, including cookie/native shared history/intake, retries, isolation and
  a zero-mile shopping record with earnings/fees and no GPS.
- The compiled authenticated coach endpoint through the installed actual Peel
  worker passed eight checks: positive/negative jobs, missing-input coverage,
  matched totals, persisted verification, retries and foreign-account isolation.
- The existing local workspace was backed up and updated with its owner access
  and data preserved. Readiness and the installer's owner/staff checks passed.

Receipts: `gig-tax-pros-coach-native-http-verification-20261107.json`,
`gig-tax-pros-coach-peel-http-verification-20261107.json`, and
`gig-tax-pros-coach-installed-verification-20261107.json`.

Latest shopping-source receipts: `gig-tax-pros-shopping-native-http-verification-20261107.json`,
`gig-tax-pros-shopping-peel-http-verification-20261107.json`, and
`gig-tax-pros-shopping-installed-verification-20261107.json`.

Installed local workspace: `http://127.0.0.1:3126`, build
`Hu8paYxeBx3V7F1u5pTiW`, source `ShuugDriverIOS-20261104`. Do not rebuild `.next`
in this checkout while that service uses it; use the verified updater and its
preserved prior source/build before replacing running build files.

Native saved-chat/intake/relaunch and branded deletion cancellation passed
test12. Horizontal access to the delivery/shopper profiles, saved custom profile,
relaunch and explicit zero-mile shopping job passed test14. Their scoped receipts
retain the separate foreground failures from those combined suites. After fixing
first-permission presentation and duplicate underlying-page hosts, a fresh test13
passed the actual single foreground card, dismissal and return to Home. Its
receipt verifies the full installed bundle, debug dylib and resources:
`gig-tax-pros-ios-foreground-verification-20261107.json`.

The Home row now launches 19 publisher apps through verified links or the official
Store, with separately configurable Universal Delivery and In-store Shopper
profiles. Ten publisher-associated app links and original icon hashes are
recorded in `gig-tax-pros-app-launcher-catalog-20261107.json`. Spark/Flex and
other entries without verified general links use Store fallback. Actual provider
launches and Luke's screenshot acceptance still require device review.

The earlier expanded system-alert
test reached the branded extension in one run but has not passed the full cold
Start/End action flow; its latest failure was notification-card expansion before
dispatch. Do not turn the successful core checks into a live-action claim.

Public `gigtax.pro` discovery still has no persistent HTTPS workspace URL. Oracle
is at an empty Tenancy sign-in field, with no saved authenticated OCI profile or
verified tenancy recovered. Local integration does not establish public sync.
Physical iPhone, live provider capture, banking and filing remain unverified.
