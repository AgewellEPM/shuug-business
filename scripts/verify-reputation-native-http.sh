#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
server_root="${1:-${GIG_TAX_REPUTATION_SERVER_ROOT:-$PWD}}"
scratch="${GIG_TAX_REPUTATION_CORE_BUILD:-/private/tmp/gig-tax-reputation-core-20261107}"
proof="/private/tmp/native-reputation-proof-20261107"
core_build="$scratch/arm64-apple-macosx/debug"
if [[ ! -f "$core_build/Modules/DriverCore.swiftmodule" ]]; then
  printf '%s\n' "Build or test DriverCore in the selected scratch directory first." >&2
  exit 1
fi
cd "$task_root"
xcrun swiftc -parse-as-library -I "$core_build/Modules" \
  native/ios/RideshareTaxPros/App/WorkspaceClient.swift \
  native/ios/RideshareTaxPros/App/BankWire.swift \
  native/ios/RideshareTaxPros/App/ReferralWire.swift \
  scripts/native-reputation-proof.swift "$core_build/DriverCore.build/"*.swift.o -o "$proof"
node --import tsx scripts/reputation-native-http-smoke.ts "$proof" "$server_root"
