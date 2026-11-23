#!/bin/bash
set -euo pipefail
sdr_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
sdr_native="$sdr_root/native/macos/SDRWrapper"
sdr_bundle=""
sdr_mode=""
if [[ $# -gt 0 ]]; then sdr_bundle="$1"; fi
if [[ $# -gt 1 ]]; then sdr_mode="$2"; fi
if [[ "$sdr_bundle" != /*.app || ( -n "$sdr_mode" && "$sdr_mode" != --gig-tax ) || $# -gt 2 ]]; then
  printf 'Usage: %s /absolute/path/SDR.app [--gig-tax]\n' "$0" >&2
  exit 2
fi
if [[ -e "$sdr_bundle" || -L "$sdr_bundle" ]]; then
  printf 'Choose a new app bundle path.\n' >&2
  exit 2
fi
sdr_name="Universal SDR"
sdr_hosted='<false/>'
sdr_id="com.shuug.universal-sdr.wrapper"
if [[ "$sdr_mode" == --gig-tax ]]; then
  sdr_name="Gig Tax Pros SDR"
  sdr_hosted='<true/>'
  sdr_id="com.shuug.gig-tax-pros.sdr-wrapper"
fi
sdr_build_dir="$(mktemp -d)"
trap 'rm -rf -- "$sdr_build_dir"' EXIT
sdr_stage="$sdr_build_dir/$sdr_name.app"
mkdir -p "$sdr_stage/Contents/MacOS" "$sdr_stage/Contents/Resources"
xcrun swiftc -parse-as-library -swift-version 5 -O -target "$(uname -m)-apple-macosx14.0" \
  -module-cache-path "$sdr_build_dir/modules" \
  "$sdr_native/Capture.swift" "$sdr_native/SDRWrapper.swift" \
  -o "$sdr_stage/Contents/MacOS/SDRWrapper" -framework AppKit -framework WebKit
cat > "$sdr_stage/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$sdr_id</string>
<key>CFBundleName</key><string>$sdr_name</string>
<key>CFBundleDisplayName</key><string>$sdr_name</string>
<key>CFBundleExecutable</key><string>SDRWrapper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.1.0</string>
<key>CFBundleVersion</key><string>2</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>SDRGigTaxMode</key>$sdr_hosted
</dict></plist>
PLIST
cp "$sdr_root/LICENSE" "$sdr_stage/Contents/Resources/LICENSE"
codesign --force --sign - "$sdr_stage"
codesign --verify --strict "$sdr_stage"
mv "$sdr_stage" "$sdr_bundle"
codesign --verify --strict "$sdr_bundle"
printf 'Built %s\n' "$sdr_bundle"
