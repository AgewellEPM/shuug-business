#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
scratch="${RIDESHARE_DRIVER_CORE_BUILD:-/private/tmp/rtp-driver-core-20261105}"
proof="/private/tmp/native-rideshare-driver-proof"
cd "$task_root"
swift test --package-path native/ios/RideshareTaxPros/DriverCore --scratch-path "$scratch"
core_build="$scratch/arm64-apple-macosx/debug"
xcrun swiftc -parse-as-library -I "$core_build/Modules" native/ios/RideshareTaxPros/App/WorkspaceClient.swift scripts/native-rideshare-driver-proof.swift "$core_build/DriverCore.build/"*.swift.o -o "$proof"
node --import tsx scripts/rideshare-driver-smoke.ts "$proof"
