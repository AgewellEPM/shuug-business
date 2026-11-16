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
