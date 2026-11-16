#!/bin/bash
# Release builds use a separate output directory and never install over the preview.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mode="${1:-help}"
output="${GIGTAX_RELEASE_DIR:-$HOME/Library/Developer/Xcode/GigTaxProsRelease}"
project="$root/native/ios/RideshareTaxPros"
archive="$output/GigTaxPros.xcarchive"
case "$mode" in
  archive|unsigned|export|upload) ;;
  *) echo 'Usage: release-rideshare-ios.sh archive|unsigned|export|upload'
     echo 'archive: signed Release archive using the existing Xcode account'
     echo 'unsigned: local Release compilation only; cannot be distributed'
     echo 'export: export a signed archive for App Store Connect'
     echo 'upload: upload a signed build to App Store Connect for TestFlight'
     exit 2 ;;
esac
mkdir -p "$output"
if [[ "$mode" == archive || "$mode" == unsigned ]]; then
  [[ ! -e "$archive" ]] || { echo "Archive already exists: $archive. Choose a fresh GIGTAX_RELEASE_DIR." >&2; exit 1; }
  xcodegen generate --spec "$project/project.yml" --project "$project"
  signing=(CODE_SIGNING_ALLOWED=NO)
  if [[ "$mode" == archive ]]; then
    : "${GIGTAX_APPLE_TEAM:?Set GIGTAX_APPLE_TEAM to the verified Apple developer team ID}"
    signing=("DEVELOPMENT_TEAM=$GIGTAX_APPLE_TEAM" -allowProvisioningUpdates)
  fi
  build=()
  if [[ -n "${GIGTAX_BUILD_NUMBER:-}" ]]; then
    [[ "$GIGTAX_BUILD_NUMBER" =~ ^[0-9]+$ ]] || { echo 'Build number must be numeric.' >&2; exit 1; }
    build=("CURRENT_PROJECT_VERSION=$GIGTAX_BUILD_NUMBER")
  fi
  xcodebuild -quiet -project "$project/RideshareTaxPros.xcodeproj" \
    -scheme RideshareTaxPros -configuration Release -destination 'generic/platform=iOS' \
    -derivedDataPath "$output/DerivedData" -archivePath "$archive" \
    "${signing[@]}" "${build[@]}" archive 2>&1 | tee "$output/archive.log"
  args=()
  [[ "$mode" != unsigned ]] || args=(--allow-unsigned)
  python3 "$root/scripts/verify-rideshare-ios-release.py" "$archive" "${args[@]}" \
    --output "$output/archive-verification.json"
  exit
fi
: "${GIGTAX_APPLE_TEAM:?Set GIGTAX_APPLE_TEAM to the verified Apple developer team ID}"
python3 "$root/scripts/verify-rideshare-ios-release.py" "$archive" \
  --output "$output/archive-verification.json"
destination=export
if [[ "$mode" == upload ]]; then
  # TestFlight is how physical testers obtain the app; it precedes public release.
  # Apple resolves the real app record from this signed bundle ID and account.
  destination=upload
fi
python3 - "$output/ExportOptions.plist" "$GIGTAX_APPLE_TEAM" "$destination" <<'PY'
import plistlib,sys
with open(sys.argv[1], 'wb') as file:
    plistlib.dump({'method':'app-store-connect','destination':sys.argv[3],
      'teamID':sys.argv[2],'signingStyle':'automatic','manageAppVersionAndBuildNumber':False,
      'generateAppStoreInformation':True,'uploadSymbols':True}, file)
PY
xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist "$output/ExportOptions.plist" \
  -exportPath "$output/Export" -allowProvisioningUpdates 2>&1 | tee "$output/$mode.log"
