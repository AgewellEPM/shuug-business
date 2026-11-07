#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
scratch="${GIG_TAX_COACH_CORE_BUILD:-/private/tmp/gig-tax-coach-swift-20261107}"
proof="/private/tmp/native-tax-coach-proof"
cd "$task_root"
core_build="$scratch/arm64-apple-macosx/debug"
if [[ ! -f "$core_build/Modules/DriverCore.swiftmodule" ]]; then
  printf '%s\n' "Build or test DriverCore in the selected scratch directory first." >&2
  exit 1
fi
xcrun swiftc -parse-as-library -I "$core_build/Modules" \
  native/ios/RideshareTaxPros/App/WorkspaceClient.swift \
  native/ios/RideshareTaxPros/App/BankWire.swift \
  native/ios/RideshareTaxPros/App/ReferralWire.swift \
  scripts/native-tax-coach-proof.swift "$core_build/DriverCore.build/"*.swift.o -o "$proof"
node --import tsx scripts/tax-coach-native-http-smoke.ts "$proof"
