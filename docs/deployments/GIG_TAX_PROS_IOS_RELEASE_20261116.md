# Gig Tax Pros iOS release candidate — November 16, 2026

Version 1.0.0, build 2026111602 compiles as a Release device archive. The app,
share, broadcast and notification-content extensions contain arm64 device code
and matching version/build values. This artifact is UNSIGNED and cannot be
distributed. It has not been uploaded to TestFlight or submitted for review.

The release branch retains the current app/tour/office screens and integrates
the existing authenticator challenge/completion implementation from 5e0bbe0.
Account-version display now reads the built bundle version. The app links the
actual https://gigtax.pro/app-support and /app-privacy pages and supplied
support@gigtax.pro address. App-specific privacy copy includes local offer
recognition, explicit screen sharing, retained observations and account content.

Privacy manifests now cover required file metadata in the app and shared
extensions and the broadcast frame timer. The Plaid SDK's manifest remains
bundled. More complete collected-data declarations cover account name/ID and
shared notes/feedback alongside email, finances and chosen receipts. Final App
Privacy answers still require checking every enabled provider's data handling.

93 existing Swift core tests passed. The actual Release archive verifier checked
all four executables, permissions, extension versions and bundled privacy files.
Its strict distribution mode correctly refused that same unsigned archive. No
physical device, Simulator install or human visual acceptance is claimed.

The saved Xcode account session was refreshed successfully, then Apple's signed
archive request returned PLA Update available. The account holder must review
and accept the latest Developer Program License Agreement in the developer
account before provisioning/signing can continue. No signing override, legal
agreement acceptance, app catalog record or upload is claimed.

Store listing draft, privacy worksheet, reviewer notes and executable release
instructions are in deployments/rideshare-tax-pros/app-store. Screenshot
packaging preserves the original hashes and labels historic captures honestly;
current iPhone and iPad release screenshots remain needed.

Next gates: owner's agreement, verified App Store Connect record, signed archive/
export and processed TestFlight upload; then physical testing, working support
mailbox, reviewer access, complete account-creation/deletion assessment and
protected hosted sync/recovery. Do not submit unfinished signed-in services or
claim that a cloud image build establishes a connected public workspace.

## Agreement cleared; App Group assignment remains pending

The account holder accepted the updated agreement. A fresh signing attempt
successfully obtained an Apple Development identity and new app/extension
profiles; the agreement error is resolved. The profiles contain an empty
com.apple.security.application-groups array for the main app, share extension
and broadcast extension. Fresh downloads after account-side confirmation still
returned those empty arrays and archive failed at the same entitlement boundary.

The XcodeGen spec now explicitly retains App Groups capability attributes for
those three targets; generated project attributes were verified. No entitlement
was removed or group identifier changed. Three incomplete app-specific profiles
were backed up before refreshing; unrelated signing assets were preserved. The
release project is open for the remaining account-side group selection. No
signed archive, export, App Store record or TestFlight upload is claimed.

## Signed archive and App Store IPA verified

The saved project now selects the verified Apple developer team in both Debug
and Release, and includes the main entitlements file in the project navigator.
Fresh Apple profiles include the correct shared group for all three targets.
Version1.0.0/build2026111602 signed archive succeeded; its four executables,
App Groups and provisioning were verified. App Store export also succeeded.

The exported27,306,519-byte IPA passed strict signature checks for the app and
all extensions. All four use App Store distribution profiles with debugging
disabled, and the app/share/broadcast signatures and profiles include the same
shared App Group. The exported IPA SHA256 is
cb7f4b9378f03b0c09e246cd8be8b14c0a601a9031eb44b48d5873232738e973.

The actual upload reached Apple's authenticated App Store Connect lookup,
which returned HTTP200 and zero apps for com.ridesharetaxpros.driver. The
fetch-app-record step stopped before upload. A later account-side recheck had
the same result. This is a missing catalog record, not a signing failure.
Create the iOS app record named Gig Tax Pros, primary language English(U.S.),
with that exact bundle ID and SKU gig-tax-pros-ios. The upload command lets
Apple resolve the real record instead of requiring an unused numeric-ID flag.

No successful transfer, processed TestFlight build, tester invitation or public
review submission is claimed. Previous unsigned/signing-blocker sections above
are historical; use this checkpoint and the current JSON receipt.
