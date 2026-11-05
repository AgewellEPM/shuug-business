# Rideshare Tax Pros iPhone driver app

The native SwiftUI app is in `native/ios/RideshareTaxPros`. It uses the firm's
purple/pink identity and existing Shuug invited-client accounts. Minimum iOS:17.
This is the driver app; the existing macOS owner launcher remains separate.

## Recorded work

Start a drive to request location permission and record GPS mileage. The iOS
background-location mode keeps user-started recording active while the phone
locks. End the drive to stop GPS. There is no claim of automatic trip discovery
or continued tracking after a force quit. Poor fixes, old fixes, duplicate
timestamps and impossible jumps are rejected; signal gaps are flagged and never
filled with assumed straight-line miles. Trips can be classified and reviewed,
or entered and corrected manually.

Income and expense entries save immediately on the phone. Receipt capture uses
Apple's document scanner or the photo picker; single-page receipts become JPEGs,
and multi-page scans become PDFs. On-device Vision can suggest text and an
amount from the first page. Suggestions require the user's explicit review.
No bank feed, payment collection, filing or tax calculation is included.

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

Native requests use Bearer authentication and JSON. Cross-origin browser requests
are rejected. Receipt IDs are immutable, files are integrity checked and no
client/account ownership fields are accepted from an upload body.

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

After building Shuug in the current checkout, run:

```sh
bash scripts/verify-rideshare-driver.sh
```

This runs the focused Swift core checks, compiles the **actual app network
client** for a native loopback proof, and exercises a real compiled Shuug server
with disposable synthetic clients. It checks sign-in/branding, optional JSON
fields, retry/conflict handling, client/receipt isolation, receipt byte transport,
income/expenses, deletion, revocation, and the staff review/receipt surfaces.
The owned server and temporary data are cleaned up. The loopback proof uses
HTTP only inside that isolated fixture; the app's connection UI requires HTTPS.

Unit, compiled HTTP and Simulator checks do not establish real phone GPS,
camera capture, locked-screen behavior, battery use or Luke's visual acceptance.
Those checks remain required on his phone. Public live synchronization also
requires the pending persistent Oracle workspace and actual HTTPS client access.
