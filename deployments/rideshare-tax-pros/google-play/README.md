# Gig Tax Pros Google Play setup

Android source is unchanged from the committed parity implementation05585f4;
this release checkout inherits the independently saved iOS release branch.
The Android Gradle applicationId and namespace are com.ridesharetaxpros.driver.
Do not change the package name or create another app record to bypass an issue.

## Observed form state

The free English-U.S. Google Play app record has been created successfully.
Package availability was checked and all creation declarations were completed
following the owner's instruction to finish setup. The actual app dashboard
shows the new-account production gate: at least12closed testers for14days,
then an application for production access. Internal testing is available now.
An owner-only email list was created and selected; recipient details remain
private outside source. The first internal release is being prepared.

Native Safari accessibility can read/set fields and press controls without
Apple Events JavaScript access. AX indices move after validation; re-read the
semantic labels and verify URL/label/value before every mutation. Resolve paths
through actual child lists rather than lazy nested UI-element references.
Private before/after form evidence and the owner-bound local helper remain
outside Git under the existing app's GooglePlayRelease support folder.

## Android-specific listing

The draft describes the Android NotificationListener and explicit MediaProjection
flows, instead of copying iOS ReplayKit or claims that notification reading is
impossible. The manifest uses location and mediaProjection foreground services;
no ACCESS_BACKGROUND_LOCATION declaration is present. Store text, runtime
permissions, Data safety and foreground-service declarations must match the
actual release artifact. A source description is not physical-device proof.

The public app privacy/support pages currently emphasize the iOS release.
Before Android submission, explicitly cover Android's optional notification
access and native SDK handling. Audit ML Kit, Plaid and Maps data practices,
account sharing and encrypted snapshots for the Android Data safety form;
do not blindly copy Apple's questionnaire. Existing Maps key is optional and
unconfigured features must remain unavailable. No credential or key belongs here.

## Remaining work

- Finish the owner's declaration decision and create/read back one app record.
- Save the verified listing, contact/privacy information and current Android
  screenshots/icon/feature graphic; do not reuse iPhone pixels as Android proof.
- Prepare an actual release AAB, private recoverable upload key and signed
  artifact verification. Only a historic debug APK exists; no release AAB upload
  or Play App Signing key selection has been performed by this setup step.
- Complete Google's content, app-access, Data safety, financial feature and
  foreground-service forms from actual Android source and enabled services.
- Resolve organization-account requirements for the actual financial/business
  features before a public launch. The current developer account is Personal;
  identity verification must use the actual account owner.
- Observe the account's testing/production-access requirements and obtain actual
  consenting testers as needed. No invitations or external messages authorized.

Hosted workspace startup remains unverified/health404 and discovery disconnected.
Connected features cannot be described as operational or given fake credentials.
The Apple app remains WAITING_FOR_REVIEW; this Android setup does not change it.

References: [Google app setup](https://support.google.com/googleplay/android-developer/answer/9859152),
[developer account types](https://support.google.com/googleplay/android-developer/answer/13634885).

## Signed release artifacts

Version1.0.0/code1 is now built with an owner-private RSA4096 PKCS12 upload key.
The encrypted key has a verified second local copy on the external drive, and
its password is stored/read-back in macOS Keychain. All credentials and private
configuration remain outside the repository. Google Play manages its app signing
key separately; do not advertise the local upload-key APK as an update-compatible
replacement for a Google Play signed install.

The Gradle release variant requires GIGTAX_ANDROID_SIGNING_CONFIG, a private
properties file with storeFile, storePassword, keyAlias and keyPassword. Debug
builds do not require signing credentials. Release bundle/package tasks refuse
missing credentials instead of silently producing unsigned distributables.
Default app version is1.0.0/code1. Optional gigTaxVersionName/gigTaxVersionCode
Gradle properties support later increments; the verifier must use matching flags.

scripts/release-rideshare-android.sh builds AAB/APK, runs existing release JVM tests
and verifies real artifacts. Supply GIGTAX_ANDROID_BUILD_ROOT,
GIGTAX_ANDROID_UPLOAD_CERTIFICATE and GIGTAX_ANDROID_RECEIPT as well as the signing
config. No password is passed as a command-line argument. The artifact verifier
checks actual package/version/SDK/non-debuggable APK, APK and AAB signatures against
the expected public certificate, ZIP alignment, all64bitELF16KB alignment, CRCs,
actual SDK-disclosure strings in both DEX bundles, and recorded test results.
The signed-release receipt records99passing checks/1existing interoperability
skip (the independent Swift helper was not supplied). No physical-device claim.

The in-app privacy text now discloses Google's ML Kit metrics and configured Maps
metadata in addition to local image processing. The public app privacy policy was
updated separately with Android notification access, foreground-service control,
disabled Android backup, Google SDK metrics and the configured routing services.
