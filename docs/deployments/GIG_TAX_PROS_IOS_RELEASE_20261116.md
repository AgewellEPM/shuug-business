# Gig Tax Pros iOS upload — November 16, 2026

Apple accepted version **1.0.0, build 2026111603** at **20:25:35 UTC**. The
authenticated upload reported “Uploaded package is processing,” then “Upload
succeeded,” and xcodebuild exited successfully. App Store Connect record
**6835595554** matches `com.ridesharetaxpros.driver`.

This verifies delivery to Apple. TestFlight availability after processing,
physical-device behavior, reviewer access and public submission remain
unverified. No testers were invited and no public review was submitted.

## Verified artifact and packaging repair

The signed Release device archive contains matching version/build values and
arm64 code for the app, share, broadcast and notification-content extensions.
Strict signatures and App Store distribution profiles passed on the exported
IPA; debugging is disabled. The main/share/broadcast signatures and profiles
contain `group.com.ridesharetaxpros.driver`. The Apple agreement, saved account
session, App Group provisioning and missing app-record blockers are resolved.

Apple rejected build 2026111602 because `RPBroadcastProcessMode` was nested in
`NSExtensionAttributes`. Build 2026111603 puts it directly under `NSExtension`,
matching Xcode's Broadcast Upload Extension template. The archive verifier
rejects the previous artifact and accepts the corrected one. Apple's validation
accepted the correction and the full upload succeeded.

The exported IPA is 27,306,485 bytes. SHA256:
`8d483148e5eb7e1d98ef547409f33f9c2bd98fbcdc05c129594a0ce2f829dea3`.
Packaging source commit: `65711035458174daf485842d261b40e633e41233`.
The current machine-readable receipt is
`gig-tax-pros-ios-release-verification-20261116.json` beside this document.
Raw account/service logs are kept privately, outside Git.

Apple reported a nonblocking missing-dSYM warning for vendor `LinkKit.framework`
(UUID `0393C285-3096-3563-B8A6-B6F515FFED5C`). The pinned LinkKit 7.3.1 artifact
contains no dSYM bundle. Upload succeeded; symbolication within that SDK remains
limited. No substitute symbols were generated.

## Preserved application and store materials

The release branch retains the current app/tour/office screens and integrates
the existing authenticator challenge/completion implementation from 5e0bbe0.
Account-version display reads the built bundle version. App-specific policies
and support are live at `https://gigtax.pro/app-privacy` and
`https://gigtax.pro/app-support`, using `support@gigtax.pro`.

Privacy manifests cover required file metadata and the broadcast timer, retain
the Plaid manifest and declare the account/financial/chosen-content data paths.
93 existing Swift core checks passed earlier in this release effort. This
packaging-only repair was verified against the rejected and corrected archives,
the exported IPA and Apple's actual upload service. No physical device or
current Simulator acceptance is claimed.

Listing draft, privacy worksheet, reviewer notes and release commands remain
under `deployments/rideshare-tax-pros/app-store`. The Desktop release package
contains the corrected IPA and receipts. Its screenshot candidates are labeled
historic November 7 Simulator captures; they are not current-build or iPad proof.

## Remaining release gates

1. Confirm processing completes in App Store Connect → Gig Tax Pros → TestFlight.
   Upload acceptance alone does not establish tester availability.
2. Perform the documented physical-device checks, particularly background GPS,
   denied permissions, real screenshot imports and explicit ReplayKit sharing.
3. Refresh actual iPhone/iPad screenshots, finish App Privacy/listing fields,
   confirm the support mailbox and supply real reviewer/beta contact details.
4. Complete hosted account sync/recovery and reviewer access for signed-in
   features. Verify the complete invitation/account-creation/deletion flow.
   Unavailable providers must remain honestly described and unavailable.

The separately provisioned cloud backend has not passed startup/health or sync
acceptance. The website's public workspace discovery remains disconnected.
Do not describe that backend as live or submit unfinished connected features.

The account-side message that app creation succeeded but user access could not
be saved concerns existing App Store Connect team access. The app record was
subsequently found by Apple's upload service; that message did not block upload.
