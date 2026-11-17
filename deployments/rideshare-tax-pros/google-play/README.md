# Gig Tax Pros Google Play release

The signed1.0.0/code1 release is ACTIVE on Google Play internal testing. The
owner enrolled, and the live Play page offered an enabled Install button and an
available Motorola device. Google requested account re-verification for remote
installation; the owner chose to use the test link directly on the phone.
Physical installation and release-device execution remain unverified.

The app is free, en-US, package com.ridesharetaxpros.driver. Initial public
availability is intended for the United States. Do not create another app record
or change the package to bypass a problem. Use the existing private console record.

## Saved store setup

Nine of twelve dashboard tasks are complete. Privacy policy, no-ads, government,
health, financial features and inherited trader declarations are saved. Financial
features include rewards/points and other mileage/income/expense recordkeeping.
The app category is Finance; contact details are support@gigtax.pro and
https://gigtax.pro/app-support. The listing text, icon, feature graphic and four
unmodified Android captures are saved and read back as ready to send for review.
The listing and declarations have not been sent for public review.

The saved IARC questionnaire reports user interactions and firm-managed cash
referral rewards. North America currently receives Mature17+ / Cash Rewards.
There is no wagering, NFT issuance or digital-goods purchase flow in this release.
The audience is planned for adults; that form depends on app-access completion.

Data safety has18type handling entries saved as a draft, including SDK telemetry.
The source worksheet and data-safety-draft.json preserve their scope and remaining
provider/deletion checks. Do not present draft answers as published declarations.
The public privacy page now covers Android as well as iOS and is live.

assets.json records exact uploaded asset hashes and the historical Android capture
provenance. Android runtime source differs from screenshot baseline05585f4 only
in release signing/version settings and one privacy-disclosure paragraph. The
screens are actual Android captures, not fresh physical-device release proof.

## Public-release blockers

- App access: local journal needs no login, but optional firm features are
  restricted. No working review account is available. Do not certify full access
  or manufacture credentials to satisfy Google's mandatory reviewer-access check.
- Account/data deletion: the public privacy page describes email requests, but
  delivery, identity verification, permanent account/data handling and retention
  must be verified before publishing the Data safety declaration. Invitation
  activation sets credentials and is included in the account-creation draft.
- Complete adult target audience after app access. Resolve Google's organization
  account requirements for these actual business/financial features. The account
  is currently Personal; the app inherits the owner's declared trader status.
- Finish setup, publish a real closed test and obtain at least12consenting testers
  for14continuous days, then apply for production access and review. The live
  dashboard currently reports0closed testers. Internal testing does not satisfy
  that closed-test period. No outside invitations or messages were sent.
- Hosted workspace currently has health404 and public discovery remains null.
  Maps/bank/provider services need real authorized configuration. Do not publish
  claims that these connections are working. Support-mail delivery is unverified.

Native Safari accessibility completed the console work without JavaScript,
Chrome or a new VM. Private account snapshots and helpers remain outside Git.
The Apple app remains WAITING_FOR_REVIEW; Android setup does not change it.

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
