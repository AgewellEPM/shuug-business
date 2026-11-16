# Gig Tax Pros iOS release

Release source is isolated from the ongoing Android changes. Scheme:
`native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj`, `RideshareTaxPros`.
The app and its three extensions use version 1.0.0 and one shared build number.
Bundle ID: `com.ridesharetaxpros.driver`. Keep iPhone and iPad support.
Verified App Store Connect record: `6835595554`.

## Build and distribution

```sh
# Xcode's authenticated team must be authorized for the current agreement.
export GIGTAX_APPLE_TEAM=YOUR_VERIFIED_TEAM_ID
export GIGTAX_BUILD_NUMBER=2026111603
export GIGTAX_RELEASE_DIR="$HOME/Library/Developer/Xcode/GigTaxProsRelease-20261116-signed"
bash scripts/release-rideshare-ios.sh archive
bash scripts/release-rideshare-ios.sh export
bash scripts/release-rideshare-ios.sh upload
```

App Store Connect must contain the app record with the correct bundle ID before
upload. Apple resolves the record from the signed bundle ID and authenticated
account; do not supply a guessed numeric ID. Export also requests Apple's
App Store information file. If signing fails, keep the log and use a new output directory for the
next attempt. Do not delete a good archive to retry. API keys are optional when
using Xcode's account session; never store a private signing key in source.
Export/upload uses App Store Connect distribution, automatic signing and symbols.
An upload is not a processed/available build: verify it in App Store Connect.
Uploading for TestFlight does not submit for public review.

Use `unsigned` with a separate GIGTAX_RELEASE_DIR for device-code compilation
without signing. The verification receipt explicitly distinguishes that artifact
from a signed distributable. It never installs or starts a Simulator or device.

The broadcast extension's `RPBroadcastProcessModeSampleBuffer` value belongs at
`NSExtension.RPBroadcastProcessMode`, as in Xcode's Broadcast Upload Extension
template. Placing it inside `NSExtensionAttributes` compiles locally but fails
Apple's upload validation. The archive verifier checks the actual built plist.

## App Group provisioning

Register `group.com.ridesharetaxpros.driver` in the same Apple developer team,
then assign it to all three bundle IDs:

- `com.ridesharetaxpros.driver` (RideshareTaxPros)
- `com.ridesharetaxpros.driver.offershare` (GigOfferShare)
- `com.ridesharetaxpros.driver.offerbroadcast` (GigOfferBroadcast)

The XcodeGen spec preserves App Groups in each target's Signing & Capabilities
configuration. These source attributes do not create an account-side group
assignment. Use Xcode's App Groups list or the developer portal to register and
select the actual group, then let automatic signing refresh the profiles. The
notification-content extension does not need the shared group.

If a freshly downloaded provisioning profile has an empty
`com.apple.security.application-groups` array, signing cannot proceed. Preserve
incomplete profiles before refreshing only this app's profiles; do not delete
other projects' signing assets. Never remove the entitlement to bypass the error:
the screenshot/share/broadcast handoff depends on the real shared container.

See [Apple's group configuration](https://developer.apple.com/documentation/xcode/configuring-app-groups).

## Store materials

`en-US.json` contains the listing draft, app support/privacy URLs and the
existing Gig Tax Pros copyright label. `REVIEW-NOTES.md` documents guest, sign-in, location and ReplayKit flows.
`PRIVACY-DISCLOSURES.md` maps actual data handling to the privacy declarations.
Verify the support mailbox and published app-specific policy before public
submission. Do not use the website-only privacy notice as the app policy.

The November 16 release capture has six original screenshots for each of iPhone
17 Pro Max (1320×2868) and 13-inch iPad Pro M4 (2064×2752). The Desktop package's
`App Store Screenshots` folder contains both sets and a hash/provenance manifest.
These are actual Release Simulator screens; the sample earnings screen retains
its visible sample-data label. No screenshot was resized into another device.
The separate `Screenshot Candidates` folder remains a historic November 7 set.

`AppStoreScreenshotFlows` in the native UI test target captures the six screens.
Use a signed Simulator build (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`),
Release configuration and the intended build number. An unsigned Simulator build
cannot exercise the app's normal Keychain path. Run one temporary Simulator at a
time, copy the test runner's `Documents/ScreenCatalog` output, then shut down and
remove only that owned device. The capture flow supports iPadOS's floating tabs.
`scripts/package-rideshare-current-screens.py CAPTURE_ROOT NEW_OUTPUT` checks the
successful run receipts, current runtime source, bundle version, original sizes
and absence of alpha before copying the images. It preserves the original pixels.

## Save the draft listing and screenshot assets

`scripts/rideshare-app-store-connect.mjs` supports `inspect`, `listing`,
`screenshots` and `review` commands. It verifies this exact app record, preserves existing
unrecognized screenshots, saves private before/after receipts, verifies text
readback, waits for screenshot processing and checks Apple's checksum/order.
It can attach the matching processed build to the draft. It never submits,
publishes, sends invitations or edits account users or agreements.

```sh
node scripts/rideshare-app-store-connect.mjs inspect \
  --key "$HOME/.appstoreconnect/private_keys/AuthKey_KEYID.p8" \
  --issuer YOUR_ISSUER_ID --receipt /private/tmp/gigtax-inspect-UNIQUE.json
# Use listing with a fresh receipt path to save the prepared en-US fields.
# Use screenshots --manifest PATH/manifest.json with another fresh receipt.
```

Store downloaded API keys outside the repository with owner-only permissions.
The helper never prints private keys, JWTs or asset-upload URLs. Keep account
receipts outside Git. A team key needs its Issuer ID; individual keys use the
original `ApiKey_...p8` filename without an issuer. API screenshot processing is
separate from physical-device testing and public review.

The `review` command takes `--contact PRIVATE_JSON` with contactFirstName,
contactLastName, contactEmail and contactPhone; never put that private file in
source. It enters the prepared `reviewer-notes.txt` and actual contact details,
then checks readback. It does not invent credentials or mark hosted access tested.

References: [Apple API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api),
[asset upload](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect).

## Physical-device and hosted acceptance

Invite a willing tester through TestFlight after the signed
build is processed. No tester invitation or external message is authorized by
this release package itself.

Record the device model, OS, build number, steps, actual outcome and evidence:

1. Launch as guest; add a manual trip, income, expense and chosen receipt; restart
   and export the journal. Verify the saved numbers and receipt contents.
2. Start a real drive, lock the phone, finish safely and inspect GPS gaps,
   classification, route and distance. Exercise denied/revoked permissions.
3. Import real Uber/Lyft offer screenshots while parked. Check extracted values
   against the source; don't assume missing values. Save and reopen the review.
4. Explicitly start ReplayKit, switch to the selected provider, observe an offer,
   stop sharing and verify the app's reader feedback. Verify account-switch/off
   and expiry behavior. Simulator results cannot establish this path.
5. With a synthetic invited client on the actual hosted workspace, save records
   offline, reconnect, check app/portal agreement, receipts and account isolation.
   Verify sign-out, reconnection and record deletion without restoring old rows.
6. Restart the hosted service and perform a private complete backup/restore.
   Preserve database, vault key and files; never reinitialize existing data.
7. Verify the actual invitation/account-creation path and provide in-app account
   deletion if the full flow supports creation. Sign-out is not deletion.
8. Review iPad layout and screenshots, policy/support links, background-permission
   copy, reviewer account and enabled provider disclosure. Keep unconfigured
   services unavailable and honestly described.

For public review, run `scripts/verify-rideshare-ios-submission.py --archive PATH
--evidence PRIVATE_JSON`. Its documented evidence inputs link the actual
execution reports; it checks the signed artifact and live public URLs/discovery.
The report existence checks do not replace reviewing the evidence. Apple's
approval and the owner's visual acceptance are separate from these checks.

## Hosting

Use the existing persistent-backend deployment under
`deployments/rideshare-tax-pros/free-host/`. Confirm hosting access and cost
authorization before provisioning. Preserve the existing data and private worker
boundaries; do not expose a local development server as production. Verify
hosted account sync, authorization, restart and full backup/restore before
enabling discovery through `scripts/connect-gig-tax-workspace.mjs`.

Publish support/privacy pages from the current website source using a guarded
release that preserves the deployed homepage, APIs, media, routes and headers.
Do not deploy this older native checkout's entire website over newer site work.

References: [Apple build upload](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/),
[screenshots](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications).
