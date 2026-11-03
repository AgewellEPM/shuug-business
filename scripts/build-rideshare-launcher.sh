#!/bin/bash
set -euo pipefail
SHUUG_ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SHUUG_BUILD_DIR="$SHUUG_ROOT_DIR/build/rideshare-launcher"
SHUUG_APP_NAME="Rideshare Tax Pros Workspace.app"
SHUUG_APP_DIR="$SHUUG_BUILD_DIR/$SHUUG_APP_NAME"
SHUUG_NATIVE_DIR="$SHUUG_ROOT_DIR/native/macos/WorkspaceLauncher"
SHUUG_ARCH="$(uname -m)"
mkdir -p "$SHUUG_BUILD_DIR"
if ! mkdir "$SHUUG_BUILD_DIR/.build-lock" 2>/dev/null; then
  printf 'Another launcher build is active.\n' >&2
  exit 1
fi
SHUUG_STAGE_DIR=""
cleanup() {
  if [[ -n "$SHUUG_STAGE_DIR" && -d "$SHUUG_STAGE_DIR" ]]; then rmdir "$SHUUG_STAGE_DIR" 2>/dev/null || true; fi
  rmdir "$SHUUG_BUILD_DIR/.build-lock"
}
trap cleanup EXIT
mkdir -p "$SHUUG_APP_DIR/Contents/MacOS" "$SHUUG_APP_DIR/Contents/Resources" "$SHUUG_BUILD_DIR/module-cache"
SHUUG_FLAGS=(-parse-as-library -swift-version 5 -target "$SHUUG_ARCH-apple-macosx13.0" -module-cache-path "$SHUUG_BUILD_DIR/module-cache")
xcrun swiftc "${SHUUG_FLAGS[@]}" -O "$SHUUG_NATIVE_DIR/WorkspaceConfiguration.swift" "$SHUUG_NATIVE_DIR/CredentialClipboard.swift" "$SHUUG_NATIVE_DIR/WorkspaceLauncher.swift" -o "$SHUUG_APP_DIR/Contents/MacOS/ShuugWorkspace" -framework SwiftUI -framework AppKit -framework Security
xcrun swiftc "${SHUUG_FLAGS[@]}" "$SHUUG_NATIVE_DIR/WorkspaceConfiguration.swift" "$SHUUG_NATIVE_DIR/CredentialClipboard.swift" "$SHUUG_NATIVE_DIR/Checks.swift" -o "$SHUUG_BUILD_DIR/launcher-checks" -framework AppKit -framework Security
"$SHUUG_BUILD_DIR/launcher-checks"
cat > "$SHUUG_APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.shuug.rideshare-tax-pros.launcher</string>
<key>CFBundleName</key><string>Shuug Workspace</string>
<key>CFBundleDisplayName</key><string>Rideshare Tax Pros Workspace</string>
<key>CFBundleExecutable</key><string>ShuugWorkspace</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
cp "$SHUUG_ROOT_DIR/LICENSE" "$SHUUG_APP_DIR/Contents/Resources/LICENSE"
codesign --force --sign - "$SHUUG_APP_DIR"
codesign --verify --strict "$SHUUG_APP_DIR"
if [[ "${1:-}" == "--install" ]]; then
  SHUUG_INSTALL_DIR="$HOME/Applications/$SHUUG_APP_NAME"
  mkdir -p "$HOME/Applications"
  if [[ -e "$SHUUG_INSTALL_DIR" ]]; then
    SHUUG_EXISTING_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SHUUG_INSTALL_DIR/Contents/Info.plist")"
    [[ "$SHUUG_EXISTING_ID" == "com.shuug.rideshare-tax-pros.launcher" ]] || { printf 'Existing app has a different identity; installation stopped.\n' >&2; exit 1; }
    if pgrep -f "$SHUUG_INSTALL_DIR/Contents/MacOS/ShuugWorkspace" >/dev/null; then
      printf 'Close the existing workspace launcher before updating it.\n' >&2
      exit 1
    fi
  fi
  SHUUG_STAGE_DIR="$(mktemp -d "$HOME/Applications/.shuug-workspace-install.XXXXXX")"
  ditto "$SHUUG_APP_DIR" "$SHUUG_STAGE_DIR/$SHUUG_APP_NAME"
  codesign --verify --strict "$SHUUG_STAGE_DIR/$SHUUG_APP_NAME"
  if [[ -e "$SHUUG_INSTALL_DIR" ]]; then
    SHUUG_BACKUP_DIR="$SHUUG_BUILD_DIR/previous-$(date +%Y%m%d-%H%M%S).app"
    mv "$SHUUG_INSTALL_DIR" "$SHUUG_BACKUP_DIR"
  fi
  if ! mv "$SHUUG_STAGE_DIR/$SHUUG_APP_NAME" "$SHUUG_INSTALL_DIR"; then
    if [[ -n "${SHUUG_BACKUP_DIR:-}" && ! -e "$SHUUG_INSTALL_DIR" ]]; then mv "$SHUUG_BACKUP_DIR" "$SHUUG_INSTALL_DIR"; fi
    exit 1
  fi
  codesign --verify --strict "$SHUUG_INSTALL_DIR"
  "$SHUUG_INSTALL_DIR/Contents/MacOS/ShuugWorkspace" --status-json
  printf 'Installed: %s\n' "$SHUUG_INSTALL_DIR"
else
  printf 'Built: %s\n' "$SHUUG_APP_DIR"
fi
