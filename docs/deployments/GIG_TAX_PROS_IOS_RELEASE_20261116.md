# Current release status — November 16, 2026, 21:51 UTC

Gig Tax Pros 1.0 (binary1.0.0/build2026111603) is **WAITING_FOR_REVIEW**.
Apple submission time:2026-11-16T21:51:28.256Z. App Privacy is published; Content
Rights, free USD pricing, age rating and USA-only availability are configured.
Release is **AFTER_APPROVAL**. The revised listing and notes were read back;
12 current screenshots remain COMPLETE. Approval/public availability are pending.
See GIG_TAX_PROS_STORE_TEXT_AUDIT_20261116.md and the submission JSON receipt.
The historical upload/account events below remain evidence, not current blockers.

# Gig Tax Pros iOS upload — November 16, 2026

Apple accepted version **1.0.0, build 2026111603** at **20:25:35 UTC**. The
authenticated upload reported “Uploaded package is processing,” then “Upload
succeeded,” and xcodebuild exited successfully. App Store Connect record
**6835595554** matches `com.ridesharetaxpros.driver`.

Apple's authenticated API subsequently confirmed **VALID** processing state for
build2026111603. That build is selected on the iOS1.0 draft (equivalent to the
binary's1.0.0 version). The listing text and all **12 current screenshots** are
saved and verified. At that earlier checkpoint the version was PREPARE_FOR_SUBMISSION with MANUAL
release. The current submitted state and release choice are recorded above.

Physical-device behavior and hosted reviewer access remain unverified. Processing
completion does not establish a completed device test or tester invitation.

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

Listing source, privacy worksheet, reviewer notes and release commands remain
under `deployments/rideshare-tax-pros/app-store`. The Desktop release package
contains the corrected IPA and receipts. Its `App Store Screenshots` folder has
six original iPhone17ProMax screenshots (1320×2868) and six iPadPro13-inch M4
screenshots (2064×2752), captured from Release Simulator build2026111603. Both
native capture runs passed. Runtime source matches the uploaded release; only
capture tooling and documentation changed. The separate historic November7
`Screenshot Candidates` folder is preserved and was not uploaded.

The initial unsigned Simulator run could not use Keychain. A normal signed
Simulator build resolved that capture-environment issue without changing app
runtime code. The iPad capture selector was adapted to iPadOS26 floating tabs.
Temporary devices were run serially, then shut down/deleted; the owned Simulator
app was closed. No real customer records or provider connections were created.

Apple processed every uploaded screenshot to COMPLETE. Per-file checksums and
display order match the original images. Final independent API readback also
confirmed description, keywords, promotional text, subtitle, support/marketing/
privacy URLs, categories, manual release and the selected processed build.
See `gig-tax-pros-store-listing-verification-20261116.json` for the sanitized
receipt. The API key and account receipts remain private and outside Git.

## Functional qualification still outstanding

1. Perform the documented physical-device checks, particularly background GPS,
   denied permissions, real screenshot imports and explicit ReplayKit sharing.
2. App Privacy and required submission forms are now completed. Confirm the
   support mailbox and complete any later reviewer requests. The account holder
   supplied the actual reviewer contact phone; contact name/email/phone and the
   guest, permission and provider-flow notes were saved and read back through
   Apple's API. Private contact data remains outside the source repository.
3. Complete hosted account sync/recovery and reviewer access for signed-in
   features. Verify the complete invitation/account-creation/deletion flow.
   Unavailable providers must remain honestly described and unavailable.

The separately provisioned cloud backend has not passed startup/health or sync
acceptance. The website's public workspace discovery remains disconnected.
Do not describe that backend as live. Submitted reviewer notes explicitly
disclose the unavailable connected features.

The account-side message that app creation succeeded but user access could not
be saved concerns existing App Store Connect team access. The app record was
subsequently found by Apple's upload service; that message did not block upload.
