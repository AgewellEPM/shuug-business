#!/bin/zsh
set -euo pipefail
root="${0:A:h:h}"
: "${GIGTAX_ANDROID_SIGNING_CONFIG:?Set the private signing properties path outside source}"
: "${GIGTAX_ANDROID_BUILD_ROOT:?Choose an owned Android release output directory}"
: "${GIGTAX_ANDROID_UPLOAD_CERTIFICATE:?Set the public PEM upload certificate path}"
: "${GIGTAX_ANDROID_RECEIPT:?Choose a release verification JSON path}"
[[ -f "$GIGTAX_ANDROID_SIGNING_CONFIG" && -f "$GIGTAX_ANDROID_UPLOAD_CERTIFICATE" ]]
"$root/native/android/build-parity.sh" :app:bundleRelease :app:assembleRelease :app:testReleaseUnitTest
python3 "$root/scripts/verify-rideshare-android-release.py" \
  --build-root "$GIGTAX_ANDROID_BUILD_ROOT" \
  --certificate "$GIGTAX_ANDROID_UPLOAD_CERTIFICATE" \
  --receipt "$GIGTAX_ANDROID_RECEIPT"
