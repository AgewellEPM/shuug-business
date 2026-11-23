#!/bin/bash
set -euo pipefail

sdr_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
sdr_project="$sdr_root/native/ios/UniversalSDR"
sdr_build="${SDR_IPAD_BUILD_DIR:-/private/tmp/universal-sdr-ipad}"
sdr_sdk="${1:-iphonesimulator}"
case "$sdr_sdk" in
  iphonesimulator) sdr_destination='generic/platform=iOS Simulator' ;;
  iphoneos) sdr_destination='generic/platform=iOS' ;;
  *) printf 'Usage: %s [iphonesimulator|iphoneos]\n' "$0" >&2; exit 2 ;;
esac

mkdir -p "$sdr_build"
sdr_build="$(cd "$sdr_build" && pwd -P)"
xcodegen generate --spec "$sdr_project/project.yml" --project "$sdr_project"
xcodebuild -quiet -project "$sdr_project/UniversalSDR.xcodeproj" -scheme UniversalSDR \
  -configuration Debug -sdk "$sdr_sdk" -destination "$sdr_destination" \
  -derivedDataPath "$sdr_build/DerivedData" CODE_SIGNING_ALLOWED=NO build
printf 'Built %s/DerivedData/Build/Products/Debug-%s/Universal SDR.app\n' "$sdr_build" "$sdr_sdk"
