# Gig Tax Pros iOS release

Release source is isolated from the ongoing Android changes. Scheme:
`native/ios/RideshareTaxPros/RideshareTaxPros.xcodeproj`, `RideshareTaxPros`.
The app and its three extensions use version 1.0.0 and one shared build number.
Bundle ID: `com.ridesharetaxpros.driver`. Keep iPhone and iPad support.

## Build and distribution

```sh
# Xcode's authenticated team must be authorized for the current agreement.
export GIGTAX_APPLE_TEAM=YOUR_VERIFIED_TEAM_ID
export GIGTAX_BUILD_NUMBER=2026111602
export GIGTAX_RELEASE_DIR="$HOME/Library/Developer/Xcode/GigTaxProsRelease-20261116-signed"
bash scripts/release-rideshare-ios.sh archive
bash scripts/release-rideshare-ios.sh export
# Set this to the verified numeric ID of the app record, never a guessed ID.
export GIGTAX_APP_STORE_APP_ID=ACTUAL_NUMERIC_APP_ID
bash scripts/release-rideshare-ios.sh upload
```

App Store Connect must contain the app record with the correct bundle ID before
upload. If signing fails, keep the log and use a new output directory for the
next attempt. Do not delete a good archive to retry. API keys are optional when
using Xcode's account session; never store a private signing key in source.
Export/upload uses App Store Connect distribution, automatic signing and symbols.
An upload is not a processed/available build: verify it in App Store Connect.
Uploading for TestFlight does not submit for public review.

Use `unsigned` with a separate GIGTAX_RELEASE_DIR for device-code compilation
without signing. The verification receipt explicitly distinguishes that artifact
from a signed distributable. It never installs or starts a Simulator or device.

## Store materials

`en-US.json` contains the listing draft, app support/privacy URLs and the
existing Gig Tax Pros copyright label. `REVIEW-NOTES.md` documents guest, sign-in, location and ReplayKit flows.
`PRIVACY-DISCLOSURES.md` maps actual data handling to the privacy declarations.
Verify the support mailbox and published app-specific policy before public
submission. Do not use the website-only privacy notice as the app policy.

Historic full-resolution screenshots are available in the private Desktop
screen collection. Use `scripts/package-rideshare-store-screens.py SOURCE OUTPUT`
to copy selected byte-verified candidates and record capture provenance. Those
are November 7 captures, not evidence of the current build's display. Refresh
them from the installed candidate and include 13-inch iPad screenshots before
submission; don't resize an iPhone capture and claim it came from an iPad.

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
