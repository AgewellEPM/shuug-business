# Gig Tax Pros Android private sync candidate

The existing Android release branch now supports the separately pinned private
workspace API and portal.gigtax.pro. Opaque account-code/password sign-in requires
MFA through the native session endpoint. The endpoint rejects browser cookies,
Origin and Fetch Metadata requests; browser login keeps its own origin boundary.

The client imports the browser account’s encrypted P-256 key backup locally,
checks its derived public key and signed enrollment against bundled public pins,
then wraps it in Android Keystore with unlocked-device access. Existing keys
are preserved. A secure screen lock and Android9+ are required. Android12–14
Keystore behavior still requires physical qualification; retain the portable
backup and its separately held passphrase.

Private accounts automatically upload receipts as authenticated encrypted file
objects, then the full current journal as an account-bound encrypted snapshot.
The exact ciphertext/mutation is saved before each network write. Unknown
acknowledgments retry those same bytes; later journal edits are sent afterward.
One coalescing scheduler retries failures while the app runs. Reopening retries
saved changes. Routes stay local. Sign-out stops the scheduler and keeps the
account’s local source and pending uploads. No plaintext fallback is enabled.
Legacy profile, coach and reputation uploads are bypassed for private accounts;
their saved content is included in the encrypted journal. This does not add a
live provider or bank connection or restore/merge another phone’s journal.

Verification: debug Kotlin compilation passed. Focused tests cover browser
WebCrypto backup import (including a Unicode passphrase and tampering), native
receipt ciphertext opening in the real browser crypto implementation for both
client and firm recovery, account-bound receipt acknowledgments, allowed native
authentication payloads, scheduler coalescing/retry and cancellation/account
changes. These are local proofs. No attached physical Android device was found.

This is an unreleased candidate. Owner MFA, hosted synthetic client enrollment,
real app-to-browser transfer, backup/restore, deletion/retention and store privacy
updates remain required before real client onboarding. Do not point public
site-config.json at this API for the old store binaries. iOS integration remains
separate; do not cancel the existing Apple review without a qualified replacement.
