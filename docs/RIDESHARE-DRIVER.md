# Rideshare Tax Pros iPhone driver app

The native SwiftUI app is in `native/ios/RideshareTaxPros`. It uses the firm's
dark background, purple/pink actions, panels and logo from the published website,
and existing Shuug invited-client accounts. Minimum iOS:17.
This is the driver app; the existing macOS owner launcher remains separate.

## Recorded work

Start a drive to request location permission and record GPS mileage. The iOS
background-location mode supports continued user-started recording in the
background; physical locked-phone acceptance is still pending. End the drive to
stop GPS. Optional driving assistance can detect sustained movement and create
an unclassified drive for review; it cannot identify a paid ride or continue
reliably after a force quit. Poor fixes, old fixes, duplicate
timestamps and impossible jumps are rejected; signal gaps are flagged and never
filled with assumed straight-line miles. Trips can be classified and reviewed,
or entered and corrected manually.

Trips retain their original local journal date and time zone. The phone, CSV
export and staff journal use that saved date, including late-night drives whose
UTC date is already the next day. Editing a trip keeps its recorded time zone.
Older records without a recorded zone use UTC consistently.

Income and expense entries save immediately on the phone. Receipt capture uses
Apple's document scanner or the photo picker; single-page receipts become JPEGs,
and multi-page scans become PDFs. On-device Vision can suggest text and an
amount from the first page. Suggestions require the user's explicit review.
Optional bank linking and statement imports feed a review inbox. No payment
collection, filing or automatic tax calculation is included.

### Expense coverage and review

The category picker groups 23 driver costs:

| Group | Categories |
| --- | --- |
| Vehicle | Fuel, EV charging, repairs, maintenance/oil, tires, cleaning, insurance, registration/inspections, rental, lease, interest. |
| Trips & travel | Tolls, parking, meals/food, lodging, rider snacks/amenities. |
| Business | Supplies/equipment, phone/data, platform/payment fees, apps/subscriptions, training/licenses, tax/professional fees, other. |

Business & vehicle details records purpose, documented business-use percentage,
payment method and place. Meals have participants/travel context; vehicle costs
have a vehicle and odometer. Payment methods include amounts deducted from a
platform payout. These optional fields preserve earlier journals and flow through
native sync, the staff journal and CSV export.

Spending & review shows month/year/all-date totals by category and a queue for
missing record details. Business/personal classification, supporting receipts,
purpose and meal context remain visible for review. A same-date, same-merchant,
same-amount warning requires confirmation before another payment is saved.
These are recorded costs and evidence, not automatic deductions; the app links
to [IRS Publication 463](https://www.irs.gov/publications/p463) for recordkeeping.

The phone journal persists active trips, GPS accumulation and queued edits.
Route previews use separate append-only files instead of rewriting old routes
on every location update. Journal and receipt files use iOS data protection that
permits a user-started trip to save after the first unlock. Route coordinates are
not sent to the firm. CSV export is a user action and protects spreadsheet fields
from formula execution. Corrupt journals fail visibly and are not overwritten.

## Shuug connection

Account → Find my firm's workspace reads the actual public site's config. Until
public persistent hosting is connected, that config has no workspace URL and
the app continues with phone-only storage. No fake public account endpoint is
embedded. Production UI accepts a public HTTPS origin or client sign-in link;
ordinary certificate checks and same-origin redirects protect the connection.

Activate a normal client invitation before native sign-in. The phone receives a
separate client session, stores it in device-only Keychain, and does not retain
the password. Existing sign-out, account disablement and password/invitation
revocation invalidate these sessions. Service-client linking, enabled customer
service access, Tax Firm setup and visible rideshare records are checked on each
driver request. Owner/staff credentials do not grant native driver access.

Each signed-in account has its own phone journal. Moving previously unconnected
records to a client account is an explicit toggle during connection. Receipts
upload before their expense references. Stable mutation IDs make retries
idempotent; expected revisions prevent an old device from overwriting a newer
record. Conflicts show both versions for a user choice. Cursor-based downloads
include deletion markers. Network errors retain the queue and report pending
sync; records are not described as delivered merely because a request was sent.

Staff open **Rideshare tax records → Open synced driver trips, expenses &
receipts**, or `/rideshare`. The page enforces Money view access, filters the real
linked service client and serves receipts through authenticated private routes.
Submissions are records for review, separate from posted accounting entries and
from the staff-shared Tax Firm status trackers. Receipt files are under the
private workspace data directory and are included by the existing recursive
workspace backup/recovery path.

Driver endpoints under `/api/website/customer/driver`:

| Route | Behavior |
| --- | --- |
| `POST /session` | Invited client JSON sign-in, actual branding and session expiry. |
| `DELETE /session` | Revoke that client session. |
| `GET /records?after=0` | Only that account's incremental journal, with cursor and pagination. |
| `POST /records` | Validated mutation ID, expected revision and trip/expense/income record. |
| `PUT /receipts/{id}` | Private JPEG/PNG/PDF upload; 5MB each, 512MB per account. |
| `GET /receipts/{id}` | Account-scoped receipt download with private response headers. |
| `GET/POST /banks` | Connection status, secure link, exchange, incremental transactions and disconnect. |
| `GET/POST /referrals` | Personal code, points, claim submission and owned reward redemption requests. |

Native requests use Bearer authentication and JSON. Cross-origin browser requests
are rejected. Receipt IDs are immutable, files are integrity checked and no
client/account ownership fields are accepted from an upload body.

## Assistance, bank review and profitability

Account → Driving assistance offers opt-in drive detection and purchase reminders.
The iPhone uses motion/location and Apple Maps nearby searches after a stop. Gas,
charging, food, auto-parts, repair and dealership matches can prompt an expense
draft. Cooldowns limit notifications; neither a place nor a bank match proves a
business purchase. Physical background/battery and real-place acceptance remain
unverified. GPS routes remain phone-only; Apple Maps requests share location
with Apple as explained in the app.

CSV column mapping and OFX/QFX parsing work without a bank-provider account.
Amounts use integer cents; imports have file/row limits, stable source IDs,
currency checks and a review inbox. Repeated files deduplicate; overlapping files
without source IDs need manual review. An explicit match can attach a bank source
to an existing journal entry and retain its receipt. Pending and sandbox entries
cannot be posted; bank corrections flag an already-reviewed entry instead of
silently changing it. Non-USD entries are retained for review, not converted.

Plaid uses the official native SDK (iOS 7.3.1) and server-only access tokens sealed
with the workspace vault. Configuration: `PLAID_ENV`, `PLAID_CLIENT_ID`,
`PLAID_SECRET`, and `PLAID_IOS_REDIRECT_URI`. Production additionally requires
`PLAID_LIVE_ENABLED=true`. No provider account or live activation is configured.
For iOS OAuth, configure the real signing team, matching associated-domain AASA,
`RTP_BANK_LINK_DOMAIN`, and the registered HTTPS redirect. Do not invent a team ID.
Android Link uses the server-validated `platform: "android"` option and requires
`PLAID_ANDROID_PACKAGE_NAME=com.ridesharetaxpros.driver` registered with Plaid.
Credentials never belong in the apps, source, or chat. Bank coverage and update
timing vary; no direct connection is promised for every bank.

Insights separates recorded cashflow from ride estimates. Per-ride net is fare
plus tips minus explicit platform fees and a user-entered vehicle cost per mile.
Unknown inputs stay unknown. Daily/calendar-week goals, gas charts, unpaid miles,
platform/area/start-hour comparisons and missing-data prompts use those records.
Current Apple Maps route alternatives are estimates, not historical evidence of
a better route. No Uber account, paid-fare feed or live dispatch integration exists.

## Driver Rewards

After staff verifies that the referrer uses the firm's tax-prep service and the
new client's first paid tax preparation is complete, the referrer earns one $20
reward (choose cash **or** tax-prep credit) and 100 points. Every 500 lifetime
points adds an extra $20 tax-prep credit. Points do not expire or have cash value.
The five-referral milestone therefore produces five base rewards plus one credit.

Clients share a stable code, submit a referring code, view anonymous claim status
and request a reward in the app. The shared workspace ledger prevents self and
duplicate client referrals, repeated awards and cross-account redemption.
Staff use `/rideshare/referrals` with Money edit access to verify eligibility and
record an invoice/payout reference. This tracks fulfillment; it does not send
cash or apply invoice credits automatically. Referrers never see friends' tax
documents or identities. Qualified rewards cannot be casually deleted or reversed;
an audited adjustment workflow is not included in this version.

## Build and verification

With Xcode and XcodeGen installed, run:

```sh
bash scripts/build-rideshare-ios.sh
```

The default build is unsigned for an actual iPhone architecture. Set
`RIDESHARE_IOS_SDK=iphonesimulator` for a Simulator build. The generated Xcode
project is also supplied; open it, select the correct signing team and connected
iPhone, then build/run for a real phone installation. Signing credentials and
provisioning profiles are never part of source. No App Store/TestFlight upload
is performed by these scripts.

For the native Simulator flows, build the test runner and run one disposable
device using the installed Apple runtime:

```sh
RIDESHARE_IOS_SDK=iphonesimulator RIDESHARE_IOS_ACTION=build-for-testing \
  RIDESHARE_IOS_BUILD_DIR=/private/tmp/rideshare-ios-simulator-build \
  bash scripts/build-rideshare-ios.sh
python3 scripts/verify-rideshare-ios-ui.py
```

Simulator builds use Xcode's local ad hoc signing so Keychain works normally;
they require no paid signing identity. The helper refuses to start beside an
active guest, injects synthetic GPS and a receipt fixture, checks actual saved
app data, then shuts down and deletes its own device. XCTest may reinstall the
app, so the helper resolves the current data container while the test runs.
`--driving-only`, `--receipts-only`, `--expenses-only` and `--insights-only` isolate individual flows;
the default runs all three. `--visible` shows the owned Simulator on the normal
desktop. The checks exercise background mileage, saving/relaunch, system photo
import, reviewed Vision recognition, meal/repair metadata and duplicate warnings.
No Simulator mode establishes physical camera capture or visual acceptance.

After diagnostics have finished, `python3 scripts/open-rideshare-ios-preview.py`
opens a separate named review device on the normal desktop and leaves the app
open for the user. It reuses that device and preserves its records on later runs,
refuses other active guests, and verifies the installed executable matches the
built app. This is the user preview; close it before another diagnostic run.

After building Shuug in the current checkout, run:

```sh
bash scripts/verify-rideshare-driver.sh
```

This runs the focused Swift core checks, compiles the **actual app network
client** for a native loopback proof, and exercises a real compiled Shuug server
with disposable synthetic clients. It checks sign-in/branding, optional JSON
fields, retry/conflict handling, client/receipt isolation, receipt byte transport,
all 23 expense categories and their meal/vehicle fields, income, deletion,
revocation, and the staff review/receipt surfaces.
It also exercises fares/fees, bank availability and source deduplication, native
referral claims and the authenticated staff rewards page. Provider network
behavior is covered by synthetic bank mocks, not by a real linked bank.
The owned server and temporary data are cleaned up. The loopback proof uses
HTTP only inside that isolated fixture; the app's connection UI requires HTTPS.

Unit, compiled HTTP and Simulator checks do not establish real phone GPS,
camera capture, locked-screen behavior, battery use or Luke's visual acceptance.
Those checks remain required on his phone. Public live synchronization also
requires the pending persistent Oracle workspace and actual HTTPS client access.
