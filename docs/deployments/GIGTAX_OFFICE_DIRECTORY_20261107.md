# Dynamic app office directory

The native app requests `GET https://gigtax.pro/api/offices`. The directory
projects approved public listings from the existing office recruitment backend;
it does not expose prospect records, owner emails, outreach notes or receipts.

In `/sales`, the workspace owner can prepare each office's **App map listing**:
public name/address, confirmed entrance coordinates, phone, hours, appointment
link and exterior photo URL. The owner confirms the details before enabling it.
An enabled listing becomes public only after independent ownership and an active
enrollment with a verified live-mode payment are recorded. Pending or sandbox
enrollments never create map pins. Disabling a listing retains its details for
later editing while removing it from the next directory response.

**Sales team → App help & appointments** manages the central support number,
hours and appointment link. The 24/7 label requires a phone number and an explicit
staffing confirmation. No contact details or locations are invented.

The app refreshes on opening, returning to the foreground, pull-to-refresh and
the refresh button. It sorts distances locally, opens Apple Maps for driving
directions, displays the approved exterior photo and offers nearby Look Around
street view when Apple has coverage. Booking opens the configured appointment
provider; the app does not claim an appointment has been confirmed.

Validation: 24 service/payment/directory tests passed; the DOM workflow signs in,
prepares a public listing and saves confirmed 24/7 support through the real handler
against synthetic storage. A local HTTP check read the real configured D1 backend:
zero published offices and no public contact configured. It performed no writes.
See `gigtax-office-directory-backend-20261107.json`.

The prepared homepage remains SHA-256
`857b2b50dcb082748b826b817e12d3573fd1a4961e5ea7051f5bc8e2c38d7c73`, matching the
observed public homepage. Public deployment is pending approval. This source is
based on the approved integrated site; the native/Argyle worktree must not be
deployed as the public marketing site. Stripe activation remains separate work.

No call, appointment or real office enrollment was made during verification.
