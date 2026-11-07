# Gig Tax Pros iPhone capabilities

This build is an iPhone copilot with local calculations. Android development is
deferred at the owner's request. Production readiness is not claimed.

| Input or action | Implemented capability | Verification boundary |
| --- | --- | --- |
| Saved trips and costs | Native charts, goals, unpaid-mile cost and platform comparisons | Actual local journal; incomplete records identified |
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

Build using `scripts/build-rideshare-ios.sh` with the Simulator build-for-testing
options in `RIDESHARE-DRIVER.md`. Use one owned diagnostic device at a time:

- `scripts/verify-rideshare-ios-ui.py --dashboard-only --visible` checks dashboard
  navigation, ranked sample offers, sample details, actual journal isolation and
  a manually entered job's acceptance/relaunch/completion flow, then per-platform
  diagnostics and a synthetic chosen-image → Vision → diagnostic-fields flow.
- `--alerts-only --visible` checks real system notification actions.
- Swift core tests cover malformed OCR, duplicates, expiration, unknown
  destinations, negative margins, uncertain tips, hard deadlines, commitments,
  rapidly changing provider inputs and simulated ranking.

Successful receipts identify the installed executable hash. Failed runs retain
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
