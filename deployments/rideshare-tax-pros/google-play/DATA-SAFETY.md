# Android Data safety source worksheet

This worksheet supports the actual Google Play form. It is not a claim that the
form has been submitted, or that optional hosted accounts/providers are running.
Current release is1.0.0/code1, target36, min26. Optional direct bank linking and
in-app Maps need authorized configuration; local journals work without sign-in.

## App data

- Optional account access: name, email, account ID for authentication/functionality.
- Journal sharing: income/expenses/bank references, purchase records and selected
  receipts; financial information, purchase history and photos/files.
- Client/firm chat, notes, ratings/feedback and selected documents: messages and
  other user content. Guest chat/ratings have separate copy choices at connection.
- Entered workArea/neighborhood and optional encrypted Journal tracker/planning
  state: approximate and precise location. Historical route files are excluded
  from ordinary financial-record sync. A configured approved encrypted archive
  can include location-bearing state; encryption does not make it anonymous.
- Selected gig-app notification/screen-image OCR: on-device recognition, no retained
  full notification transcript, video or broadcast image upload. Parsed fields
  remain in the Journal and can be part of an optional encrypted archive.
- Location foreground service starts with a user-started drive and shows a notice;
  no background-location manifest permission is declared.

Optional account data is tied to the connected account. Purposes are the requested
app/firm functionality. No advertising SDK, IDFA/advertising ID request or ad purpose
is implemented. All workspace endpoints requireHTTPS and reject redirect hops;
protection/authorization flows must still be verified with a real configured host.

## Included SDK data

The bundled com.google.mlkit:text-recognition16.0.1 performs recognition locally.
Google's disclosure includes device/model/OS, package/appversion, per-installation
identifiers, latency/performance, input/output dimensions, configuration, event
and error codes, for diagnostics and usage analytics. Include device/other IDs,
app interactions, diagnostics and performance data as applicable, including the
required collection when the recognition SDK operates. Never claim no collection
simply because receipt pixels and recognized text stay on-device.

Configured Maps SDK20.1.0 collects request/device metadata, crash stack traces,
IP address and a pseudonymous Maps identifier; camera APIs may produce map
interaction events. Requested road comparisons also disclose selected endpoints
to the authorized firm's routing service and Google. Office maps use OSM tiles;
the tile provider receives technical request metadata such asIP. Distinguish
OS-provided Geocoder processing from direct SDK collection.

PlaidSDK6.4.0 launches only after a firm-provided link token is available. The
backend requests transactions for the authenticated client ID, US, English;
no Identity, credit, payment-initiation or investment product is enabled by this
release setup. Re-audit the exact provider environments before activating them.
Provider consent/identity fields and security data can exceed what the firm
receives. Bank passwords are not passed to this app's workspace server.

## Form caveats

Google's collected/shared definitions and exceptions differ from Apple's label.
Do not copy Apple's answers or label all GoogleSDK telemetry linked to a firm
account. Review service-provider/user-initiated sharing exceptions against the
actual recipient, purpose and disclosure. Optional account sharing does not
justify saying all SDK collection is optional. No publicDataSafety answers have
yet been submitted by this worksheet.

Native app links to My Portal / activate invitation. Review that complete web
flow before answering the account-creation/deletion section. Signing out and
entry deletion are not account deletion. Use an actual functioning deletion page
or supported owner procedure; do not invent a deletionendpoint. Current hosted
workspace is unavailable and reviewer notes must say so.

Sources (reviewed November16,2026):
- https://developers.google.com/ml-kit/android-data-disclosure
- https://developers.google.com/ml-kit/terms
- https://developers.google.com/maps/documentation/android-sdk/play-data-disclosure
- https://plaid.com/docs/link/android/
- native/android/app/src/main/java/com/ridesharetaxpros/driver/ui/AccountScreen.kt
- native/android/app/src/main/java/com/ridesharetaxpros/driver/ui/AccountHubScreen.kt
- native/android/app/src/main/java/com/ridesharetaxpros/driver/offers/GigNotificationListener.kt
- native/android/app/src/main/java/com/ridesharetaxpros/driver/offers/OfferScreenService.kt

## Saved Play Console draft

All18selected data types have handling answers saved as a draft; no Data safety
submission was sent. data-safety-draft.json records the actual prepared matrix.
Included personal fields are name, email, user ID and other entered tax/work
intake information; optional bank workflow includes payment/account references,
purchase history and other financial information. Rewards status, points,
redemption requests and staff fulfillment are optional account functionality.

Location and SDK metrics are conservatively marked shared in the draft where
third-party services use request or diagnostic data. User-initiated firm exports
and account sync are treated separately. Reconfirm applicable service-provider
and user-initiated transfer exceptions for the actual configured production
recipient before publishing. No ephemeral, advertising, marketing or independent
security-review claim was made. Five SDK/usage categories are required in this
draft;13app/account categories are optional.

The public portal currently cannot create or activate an account because its
workspace is disconnected. Source invitation activation chooses a password and
signs the user in; it is included as username/password creation in this draft.
The current deletion URL draft points at the existing public privacy procedure.
A working permanent-deletion/support procedure and prominent account-request
surface still need live verification; do not replace that with sign-out or a
journal-entry deletion. App access also remains incomplete for real review.
