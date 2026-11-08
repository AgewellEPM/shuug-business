#!/bin/zsh
set -euo pipefail
gigtax_android_dir="${0:A:h}"
gigtax_sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
gigtax_jbr="${GIGTAX_JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
gigtax_output="${GIGTAX_ANDROID_BUILD_ROOT:-/Volumes/PRO-G40/AndroidParityBuild-20261107}"
if [[ $# -eq 0 ]]; then set -- :app:assembleDebug :app:testDebugUnitTest; fi
exec env JAVA_HOME="$gigtax_jbr" ANDROID_HOME="$gigtax_sdk" "$gigtax_android_dir/gradlew" -p "$gigtax_android_dir" --no-daemon --max-workers=2 --project-cache-dir "$gigtax_output/project-cache" -PgigTaxBuildRoot="$gigtax_output" "$@"
