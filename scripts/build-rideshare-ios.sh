#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
project_dir="$task_root/native/ios/RideshareTaxPros"
build_dir="${RIDESHARE_IOS_BUILD_DIR:-/private/tmp/rideshare-ios-build}"
sdk="${RIDESHARE_IOS_SDK:-iphoneos}"
destination='generic/platform=iOS'
signing=(CODE_SIGNING_ALLOWED=NO)
if [[ "$sdk" == 'iphonesimulator' ]]; then
  destination='generic/platform=iOS Simulator'
  signing=(CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-)
fi
action="${RIDESHARE_IOS_ACTION:-build}"
xcodegen generate --spec "$project_dir/project.yml" --project "$project_dir"
xcodebuild -quiet -project "$project_dir/RideshareTaxPros.xcodeproj" -scheme RideshareTaxPros -configuration Debug -sdk "$sdk" -destination "$destination" -derivedDataPath "$build_dir" -packageCachePath "$build_dir/PackageCache" "${signing[@]}" "$action"
printf 'Built iPhone app: %s/Build/Products/Debug-%s/RideshareTaxPros.app\n' "$build_dir" "$sdk"
