#!/usr/bin/env bash
# Only run on the disposable API 35 CI emulator, never a personal Android device.
set -euo pipefail
test "${CI:-}" = true
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1
test "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" = 35
test_class=com.littledays.app.AndroidReleaseUpgradeTest
runner=com.littledays.app.test/androidx.test.runner.AndroidJUnitRunner
mkdir -p artifacts/android-device
trap 'adb logcat -d > artifacts/android-device/logcat.txt 2>&1 || true' EXIT
adb shell getprop > artifacts/android-device/device-properties.txt
adb install artifacts/android-device-input/code1.apk
adb install -t artifacts/android-device-input/androidTest.apk
adb shell dumpsys package com.littledays.app > artifacts/android-device/package-code1.txt
grep -q 'versionCode=1 ' artifacts/android-device/package-code1.txt
run_phase() {
  local phase="$1"
  adb shell am instrument -w -r -e class "$test_class" -e phase "$phase" "$runner" | tee "artifacts/android-device/$phase.txt"
  grep -q 'OK (1 test)' "artifacts/android-device/$phase.txt"
  ! grep -Eq 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' "artifacts/android-device/$phase.txt"
}
run_phase create
adb shell am force-stop com.littledays.app
# Upgrade in place: never uninstall or clear data between phases.
adb install -r artifacts/android-device-input/code2.apk
adb shell dumpsys package com.littledays.app > artifacts/android-device/package-code2.txt
grep -q 'versionCode=2 ' artifacts/android-device/package-code2.txt
run_phase verify
git rev-parse HEAD > artifacts/android-device/source-sha.txt
printf '%s\n' 'PASS: API35 signed code1 -> code2; launch/origin; synthetic todos, anniversaries, period IndexedDB retained' > artifacts/android-device/result.txt
