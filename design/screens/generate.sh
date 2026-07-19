#!/usr/bin/env bash
#
# design/screens/generate.sh — WP-98 screen catalog for Claude Design.
#
# iOS screens cannot be produced from web captures (SwiftUI is not the DOM),
# so this is the input material Claude Design needs to reason about the real
# shipped app: it builds the Sportivista scheme, boots a simulator, installs
# it fresh, and loops every `SPORTIVISTA_DEMO` deterministic-screenshot mode
# (see `ios/Sportivista/Demo/` + `ios/Sportivista/ContentView.swift`) across
# both system appearances, capturing one PNG per (mode, theme) pair.
#
# PNGs are NEVER checked in (see README.md next to this script) — this script
# is the checked-in, re-runnable generator; its output is throwaway working
# material for a design review, not a repo artifact.
#
# Usage:
#   design/screens/generate.sh [output-dir]
#     output-dir  defaults to /tmp/sportivista-screens/
#
# Env overrides:
#   SPORTIVISTA_SCREENS_SIMULATOR   simulator name (default: "iPhone 17")
#
set -euo pipefail

SIMULATOR_NAME="${SPORTIVISTA_SCREENS_SIMULATOR:-iPhone 17}"
OUTPUT_DIR="${1:-/tmp/sportivista-screens}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/../../ios" && pwd)"
# Explicit derived-data path — NEVER glob ~/Library/DerivedData for the built
# .app. Each `xcodegen generate` can change the project's hash and produce a
# NEW DerivedData directory; a glob (`ls DerivedData/Sportivista-*`) can
# silently pick up a stale product from a previous project generation. See
# the ios-dev skill's "Flere DerivedData-kataloger" pitfall.
DERIVED_DATA="$IOS_DIR/build/DerivedData-screens"
BUNDLE_ID="app.sportivista.ios"
SCHEME="Sportivista"
APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/Sportivista.app"

# The complete set of deterministic `SPORTIVISTA_DEMO` modes, discovered by
# reading ios/Sportivista/ContentView.swift's `.task` demo-seeding switch +
# `onboardingInitialStep` + `ios/Sportivista/Demo/*.swift`. Two onboarding
# modes look similar but differ in a load-bearing way: "onboarding-landing"
# raises the onboarding overlay AT the landing step; "onboarding-landed"
# suppresses the overlay entirely and shows the real, filled agenda behind it
# (the state right after a user finishes onboarding) — both are real, distinct
# screens and both are captured.
MODES=(
	uitest
	lens
	filter
	share
	deg
	memory
	spoiler
	onboarding-welcome
	onboarding-converse
	onboarding-quickpicks
	onboarding-landing
	onboarding-landed
	reset-entry
	reset-confirm
	reset-onboarding
	diff
	answer
	assistant-sheet
)
THEMES=(dark light)

mkdir -p "$OUTPUT_DIR"

echo "==> xcodegen generate"
(cd "$IOS_DIR" && xcodegen generate)

echo "==> Resolving simulator UDID for \"$SIMULATOR_NAME\""
SIM_LINE=$(xcrun simctl list devices available | grep -E "^\s+${SIMULATOR_NAME} \(" | head -1 || true)
if [ -z "$SIM_LINE" ]; then
	echo "error: no available simulator named \"$SIMULATOR_NAME\". Available devices:" >&2
	xcrun simctl list devices available >&2
	exit 1
fi
SIM_UDID=$(echo "$SIM_LINE" | grep -oE '[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}')
echo "    $SIMULATOR_NAME -> $SIM_UDID"

echo "==> Booting simulator (blocks until fully booted; no-op if already booted)"
xcrun simctl bootstatus "$SIM_UDID" -b
# The QuickPath ("slide to type") one-time education card otherwise pops over
# the keyboard on the first keyboard-focused capture (bit the assistant-sheet
# light shot 19.07) — mark it as already shown.
xcrun simctl spawn "$SIM_UDID" defaults write com.apple.Preferences DidShowContinuousPathIntroduction -bool true || true
open -a Simulator --args -CurrentDeviceUDID "$SIM_UDID" >/dev/null 2>&1 || true
sleep 3

echo "==> Building $SCHEME (Debug — the SPORTIVISTA_DEMO harness is #if DEBUG-only)"
xcodebuild build \
	-project "$IOS_DIR/Sportivista.xcodeproj" \
	-scheme "$SCHEME" \
	-configuration Debug \
	-destination "platform=iOS Simulator,id=$SIM_UDID" \
	-derivedDataPath "$DERIVED_DATA" \
	CODE_SIGNING_ALLOWED=NO \
	ONLY_ACTIVE_ARCH=YES

if [ ! -d "$APP_PATH" ]; then
	echo "error: expected build product not found at $APP_PATH" >&2
	exit 1
fi

echo "==> Uninstalling any existing $BUNDLE_ID (fresh icon/state)"
xcrun simctl uninstall "$SIM_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

echo "==> Installing $APP_PATH"
xcrun simctl install "$SIM_UDID" "$APP_PATH"

TOTAL=0
for theme in "${THEMES[@]}"; do
	echo "==> Theme: $theme"
	xcrun simctl ui "$SIM_UDID" appearance "$theme"
	sleep 1

	for mode in "${MODES[@]}"; do
		echo "    -> $mode ($theme)"
		xcrun simctl terminate "$SIM_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
		# SIMCTL_CHILD_ prefix is simctl's documented way to forward an
		# environment variable into the launched process.
		SIMCTL_CHILD_SPORTIVISTA_DEMO="$mode" xcrun simctl launch "$SIM_UDID" "$BUNDLE_ID" >/dev/null
		# Settle: async cache/entity loads, sheet-presentation animation,
		# and (for onboarding/diff/answer) the mock assistant's staged
		# reveal all need a beat before the frame is final.
		sleep 6
		OUT="$OUTPUT_DIR/${mode}-${theme}.png"
		xcrun simctl io "$SIM_UDID" screenshot "$OUT" >/dev/null
		TOTAL=$((TOTAL + 1))
	done
done

xcrun simctl terminate "$SIM_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

echo "==> Done: $TOTAL screenshots (${#MODES[@]} modes × ${#THEMES[@]} themes) in $OUTPUT_DIR"
