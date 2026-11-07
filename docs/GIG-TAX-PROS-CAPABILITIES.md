# Gig Tax Pros iPhone capabilities

This build is an iPhone copilot with local calculations. Android development is
deferred at the owner's request. Production readiness is not claimed.

| Input or action | Implemented capability | Verification boundary |
| --- | --- | --- |
| Saved trips and costs | Native charts, goals, unpaid-mile cost and platform comparisons | Actual local journal; incomplete records identified |
| Gig app row | Horizontal launcher with 19 original publisher icons plus universal work profiles | Ten publisher-associated app links and one documented URL scheme; other entries use the official App Store; device launch remains unverified |
| Universal delivery / in-store shopping | Custom work labels and public HTTPS links; manual completed jobs reuse actual times, earnings, fees and mileage | Shopping can record zero driving miles without GPS; work profiles stay in the account's local journal |
| Tax & Goals conversation | Saved-job loss/best comparisons, record-preparation guidance, confirmed tax context and milestones | Phone answers work offline; connected accounts share persistent browser/native history and client-visible tax requests |
| Ratings & reviews | Manual dated stars/percentage scores, feedback history, same-app/scale trends and tagged improvement steps | Account-scoped native/browser state, stable retries and deletion tombstones; no automatic provider ratings import |
| Sample shift | Thirty days of example records and five normalized offers ranked against a home deadline | Explicitly simulated and paused; never saved into the actual journal |
| Screenshot | Share Extension or Photos picker → Apple Vision → normalized offer | Synthetic raster OCR proof; real provider screenshots need validation |
| Shared text | Native Share Extension → normalizer → local inbox | Extension compiled; physical share-sheet delivery remains unverified |
| Shared screen | User-started ReplayKit → Vision, at most one frame per second | Physical capture, memory and battery verification outstanding |
| Other apps' notification inboxes | Unavailable on iPhone | No notification-listener claim |
| Live provider offers, destinations and status | Unavailable for every configured provider | All provider API capability flags are false |
| Provider acceptance | Driver accepts or declines in the original app | No UI clicking or automatic acceptance |
| Authorized dispatch | Guarded adapter interface only | No authenticated provider adapter or enabled automation |
| Accepted work | Driver-reported acceptance, start, completion and cancellation; competing offers are blocked until work closes | Core persistence and conflict checks pass; no provider confirmation or automatic income posting |
| Offer Capture Diagnostics | Separate DoorDash, Uber, Lyft, Instacart and Spark connection/capture/field/advice status | Manual and sample entries never establish capture; provider account access remains unavailable |
| Trip and expense actions | Native notifications with persisted account, trip and expiry guards | Simulator receipts identify verified actions; physical locked-phone behavior is separate |
| Route home | Apple Maps direct, pickup, delivery and onward legs plus entered wait and delay allowance | Requires explicit selections and fresh location; live route behavior needs device verification |
| Waiting areas | Local completed-trip history plus Apple Maps road estimates | Requires sufficient qualifying records; no real-time demand feed |

## Implementation and money

DriverCore provides `GigPlatformAdapter`, `OfferNormalizer`,
`OfferIngestionService`, `OfferProfitabilityEngine`, `DestinationOptimizer`,
`DispatchPlanner`, and `DriverDecisionService`. Existing journal, Vision, MapKit,
mileage, insights and notification services remain the integration points. No
separate Offer Bridge project was found in inspected local source or the
configured organization repository search.

Offers retain their source, times, missing fields, uncertainty and provider
capabilities. Repeated observations are deduplicated. Known expiration and a
60-second comparison window are enforced. Freshness does not prove availability.
Parsed fields, decisions and bounded diagnostic events use iOS Data Protection
storage; full images, transcripts and credentials do not enter those logs.

Money uses integer cents. Vehicle cost is charged once using the driver's own
per-mile estimate. Additional applicable costs remain separate. Available cash
subtracts a configurable reserve from positive operating profit. The reserve is
a planning allocation, not an income-tax determination. Unknown guarantees and
tips widen the pay range; missing distance, time or costs prevent a complete
recommendation.

Routing compares the full job followed by travel home with going directly. It
enforces hard deadlines, travel limits, preferred platforms, freshness,
pickup/delivery windows and conflicts with recorded accepted work. Unknown extra
stops require review. Driver-reported decisions are distinct from provider
confirmation. Actual gig acceptance remains in the provider app.
Accepted work remains reserved after an estimated end time passes. The driver
must report completion or cancellation; closing a job does not post a projected
payout as earned income. Archived offer cards do not prevent closing that work.

## Per-platform capture diagnostics

Open **Offers → Offer Capture Diagnostics** or **Home → More tools → Offer
Capture Diagnostics**. Choose one platform to see its provider connection,
selected reader session, recent screen-capture heartbeat, last saved offer,
capture source/time, extracted values and the reason advice needs more evidence.
Repeated captures retain their original IDs through deduplication and manual
review, so offer alerts and diagnostics still open the matching journal offer.

Screenshot platform names are the driver's selection, not authenticated app
identity. Shared-screen parsing additionally requires the selected name in the
visible text. Old captures remain visibly stale; configuring a reader or viewing
the sample shift cannot create a successful detection. Raw extracted values stay
separate from subsequent manual corrections. Missing values say **Not extracted**;
currency identifies its text/reader-setting origin.

Shuug reports enough evidence for advice only when the current offer has been
reviewed, pay estimates are complete, and a matching recent full road-route check
exists for the current costs and destination preferences. Changed fields or costs,
stale offers/routes and uncertain thresholds require review. Route evidence stays
in memory and expires through the same planner checks; it is not a firm upload.
Even a calculated recommendation remains an estimate for the driver to review.

The five original driver-app icons come from their publishers' Apple App Store
artwork. Logos use [DoorDash's site](https://about.doordash.com/en-us/company),
[Uber's site](https://www.uber.com/global/nl/sign-in/),
[Lyft's media kit](https://www.lyft.com/press/media-kit),
[Instacart's logo package](https://docs.instacart.com/developer_platform_api/guide/concepts/design/logos/)
and [Spark Driver's site](https://www.sparkdriverapp.com/en_us). Original files,
URLs and SHA256 fingerprints are recorded in
`deployments/gig-tax-pros-platform-assets-20261107.json`. Assets are bundled for
offline display and rendered in original colors; they identify platforms without
implying provider access or endorsement.

## Verification and device review

Home keeps its existing layout and bottom navigation. Its four top shortcuts open
Trips, a new expense, a new income entry, and Alerts & reminders, so they provide
different actions from the bottom tabs.
Inner pages use compact navigation titles and an eight-point top content margin.
Home keeps its own existing header and spacing.

Expanded notifications use the same shared logo and dark/purple/pink palette as
the app. A small presentation-only Notification Content Extension covers trip,
classification, earnings, expense, offer and status categories. Original system
actions continue to the existing account/trip/expiry-guarded app handler. Long
content supports scrolling and Dynamic Type. In-app alert cards use the same
brand styling. Foreground delivery uses a branded in-app card on the current
page. App-controlled confirmations also use the shared neon dialog, including
destructive actions, duplicate expenses and account sign-out. Outside the app,
the compact banner and system action controls remain managed by iOS; see
[Apple's notification appearance documentation](https://developer.apple.com/documentation/usernotificationsui/customizing-the-appearance-of-notifications).

## Shared Tax & Goals

The Home chat button opens **Tax & Goals**. Questions can identify recorded loss
jobs, highest-net jobs, platform/area/start-hour comparisons, expenses, operating
goals and missing preparation records. Answers cite the relevant saved jobs;
unknown fees, vehicle cost, GPS gaps and unrecorded waiting/idle time remain
visible limits. Payout income and trip fares are separate views, so neither
payouts nor vehicle costs are counted twice. Partial goal progress and unknown
hourly measurements are identified rather than converted to zero.

Phone-only questions and answers persist in the account-specific journal. A
stable-ID outbox retries them after records sync. The authenticated workspace
stores the same client account's browser/native conversation and explicitly
confirmed preparation facts; authorized staff can review it at `/rideshare/coach`.
Tax year, jurisdiction and business structure require a confirmation form. Chat
does not silently change intake, classify a deduction, file a return or pay tax.
Existing private document-request uploads remain the place for tax forms.

Guidance uses deterministic record rules. An optional, administrator-configured
private Peel worker can verify numeric job totals through the existing symbolic
runtime. Only a matching actual response adds a Peel-verified arithmetic label;
missing or failed verification leaves the ordinary record-rule answer. No
general-purpose model, proprietary runtime, secret or admission code is bundled
in the app or public repository. This does not establish tax-law computation.

Public website discovery still needs a verified persistent HTTPS workspace.
Until that host exists, local and disposable HTTP proofs do not establish public
`gigtax.pro` synchronization.

## Gig apps and other work

The Home row scrolls horizontally across Lyft Driver, Uber Driver, Dasher, Spark,
Instacart Shopper, Amazon Flex, Grubhub Driver, Roadie, Shipt, Gopuff, Tasker,
Rover, Wag, Favor, Curri, GoShare, Veho, Dispatch and Skipcart. Original artwork,
publisher App Store listings, associated domains, supported paths and asset
hashes are recorded in `deployments/gig-tax-pros-app-launcher-catalog-20261107.json`.
This launcher catalog is separate from the five configured offer-reader parsers.
Opening another gig app does not establish a connection or capture support.

Tapping a provider tries its verified URL scheme or publisher-associated universal
link, then its official App Store listing. Spark and Amazon Flex currently have
no verified general launch URI in the inspected publisher sources and use the
Store fallback. `scripts/verify-rideshare-gig-launcher.py` checks every bundled
icon hash, Store ID, source URL and declared query scheme. It does not prove that
an installed third-party app opened on a physical phone.

**Universal Delivery** and **In-store Shopper** open configurable work profiles.
Choose a label/link, use the existing shared cost and goal editor, and log a
completed job from actual start/end times and payout details. In-store jobs with
exactly zero recorded driving miles have zero vehicle cost; other expenses stay
separate and unknown fees remain unknown. Positive-mile work still requires the
driver's cost estimate. A manual shopper job never starts GPS or fabricates miles.
The native and website record schemas both retain its shopping work type.

## Personal ratings and reviews

**More tools → Ratings & reviews** records the scores and feedback the driver
chooses to enter. Five-star and percentage snapshots retain the app, date,
optional provider review count and notes. Comparisons require the same platform,
same scale and a strictly earlier snapshot. A custom app/client receives a stable
identity derived from its name, so unrelated work does not share one generic ID.

Review text has explicit positive/mixed/negative/unreviewed labels and optional
communication, timing, accuracy, handling, professionalism or other tags.
Improvement steps refer to tagged mixed/negative feedback, and strengths refer
to positive feedback. Unreviewed text cannot invent a criticism. These records
do not establish the provider's calculation, thresholds or a promised future score.
Rating questions in Tax & Goals use the same saved history. That intent does not
overwrite financial preferences or receive a Peel arithmetic qualification.

Records persist before networking. A bounded stable-ID outbox retries immutable
additions and explicit deletions; full server state includes deletion markers and
only an exact mutation acknowledgment removes a pending operation. Browser and
native access share the authenticated client account and current revocation/origin
checks. Guest copying has a separate personal-history opt-in. **Sync now**, app
foregrounding and reconnect retry the financial, chat and reputation channels;
their individual statuses make partial success visible.

The actual saved Swift client passed 29 compiled native/HTTP/browser checks with
synthetic accounts, including two-way sharing, deletion, isolation and preserved
financial totals. The installed local backend serves the tested reputation build
from a separate checkout, keeping further app-source builds away from its live
files. Public syncing remains dependent on the pending HTTPS cloud deployment.

The actual native Simulator flow also passed default Lyft/star snapshot entry,
review text/count/tag persistence, matching guidance and chat, relaunch and branded
deletion. Its saved-journal audit checks exact values and all four immutable retry
operations. Other platform/percentage picker UI, physical iPhone behavior and
Luke's visual acceptance remain outside that flow. Automatic provider ratings
imports remain unavailable.

Build using `scripts/build-rideshare-ios.sh` with the Simulator build-for-testing
options in `RIDESHARE-DRIVER.md`. Use one owned diagnostic device at a time:

- `scripts/verify-rideshare-ios-ui.py --dashboard-only --visible` checks dashboard
  navigation, ranked sample offers, sample details, actual journal isolation and
  a manually entered job's acceptance/relaunch/completion flow, then per-platform
  diagnostics and a synthetic chosen-image → Vision → diagnostic-fields flow.
- `--alerts-only --visible` checks real system notification actions.
- `--capture-only --visible` checks the per-platform diagnostics and synthetic
  screenshot path without repeating the sample-shift checks.
- `--coach-only --visible` checks actual saved-job questions, relaunch, confirmed
  intake, cancellation of a branded deletion dialog and a foreground alert.
- `--gig-apps-only --visible` checks horizontal access to work profiles,
  configuration persistence, explicit zero-mile shopper records and foreground
  notices. `--foreground-only --visible` isolates the notice surface.
- `--reputation-only --visible` exercises manual ratings/review entry, guidance,
  rating questions in chat, relaunch and explicit deletion.
- Swift core tests cover malformed OCR, duplicates, expiration, unknown
  destinations, negative margins, uncertain tips, hard deadlines, commitments,
  rapidly changing provider inputs and simulated ranking.

Successful receipts identify the installed app bundle hash, including the debug
dylib and resources rather than only Xcode's launcher executable. Failed runs retain
artifacts without writing a success receipt. The named user preview is preserved
and restored after diagnostic runs. Simulator checks are not physical-phone or
visual acceptance.

On a signed physical iPhone, enable notifications and required location access;
start and finish a drive from expanded alerts after backgrounding the app. Share
both screenshots and text, confirm extracted values, and compare known
pickup/drop-off/home addresses. Test expired, incomplete and deadline-conflicting
offers. Start ReplayKit explicitly, open a consented test offer, verify the
resulting observation and alert, then stop sharing and verify ingestion stops.
Check revocation, account changes, interruptions, locked-screen behavior, memory
and battery. App Store policy review and supported-provider testing remain
release requirements.

The dashboard uses saved records. Home → More tools → Explore a sample shift
opens example charts and calculated offers without creating real journal entries.
