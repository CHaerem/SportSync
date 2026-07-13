# Zenji — iOS app (WP-10 scaffold + WP-11 Codable models)

SwiftUI app **Zenji** + WidgetKit extension **ZenjiWidget**, generated with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`. WP-10
was the scaffold only (a Tekst-TV shell with no data, no networking, no feed
logic). WP-11 (see PLAN.md) adds the Codable models that mirror the data
contract — still no networking (WP-12) and no feed logic (WP-13).

## Generate, open, build

```sh
brew install xcodegen   # once, if not already installed
cd ios
xcodegen generate       # writes Zenji.xcodeproj (gitignored — never check it in)
open Zenji.xcodeproj    # or build from the CLI:
xcodebuild -scheme Zenji -destination 'generic/platform=iOS Simulator' build
xcodebuild -scheme ZenjiWidgetExtension -destination 'generic/platform=iOS Simulator' build

# WP-11: run the model decoding tests (pick any available simulator —
# `xcrun simctl list devices available`)
xcodebuild test -project Zenji.xcodeproj -scheme Zenji \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

`Zenji.xcodeproj` (and `xcuserdata/`, `DerivedData/`) are gitignored via
`ios/.gitignore` — regenerate from `project.yml` after every pull. This
`ios/.gitignore` is scoped to this directory; it does not touch the repo-root
`.gitignore`, which is owned by the `docs/data/` whitelist (see `CLAUDE.md`).

Re-run `xcodegen generate` whenever `project.yml` changes — it also rewrites
`Zenji/Info.plist` and `ZenjiWidget/Info.plist` from the `info.properties`
blocks in `project.yml` (XcodeGen owns those two files; edit the properties in
`project.yml`, not the plists directly, or your edits will be overwritten on
the next generate).

### Build verification performed for this PR

This worktree has Xcode **Command Line Tools** but not the full **Xcode.app**
(no iOS SDK, no Simulator runtime — `xcodebuild` refuses to run at all:
`"tool 'xcodebuild' requires Xcode, but active developer directory ... is a
command line tools instance"`). The required
`xcodebuild -scheme Zenji -destination 'generic/platform=iOS Simulator' build`
could therefore not be executed in this environment. What was verified
instead, as the closest available substitute:

- `xcodegen generate` succeeds and produces `Zenji.xcodeproj` with no errors.
- `plutil -lint Zenji.xcodeproj/project.pbxproj` → **OK** (well-formed project file).
- Both schemes exist as expected: `Zenji` (app, embeds the widget extension
  via an "Embed Foundation Extensions" build phase) and `ZenjiWidgetExtension`.
- Generated build settings inspected directly in the `.pbxproj`: correct
  bundle IDs (`app.zenji.ios` / `app.zenji.ios.widget`), `IPHONEOS_DEPLOYMENT_TARGET
  = 26.0` on every target, and `CODE_SIGNING_ALLOWED = NO` /
  `CODE_SIGNING_REQUIRED = NO` so a Simulator build needs no developer account.
- Every Swift file parses cleanly under `swiftc -parse` (syntax-only; this
  machine has no iOS SDK to type-check SwiftUI/WidgetKit APIs against, so this
  only rules out gross syntax errors, not full compilation).

**Action required on a machine with full Xcode installed:** run the two
`xcodebuild` commands above and confirm they exit 0. Nothing here should stop
that from working, but it has not been proven end-to-end.

### Deployment target: iOS 26.0

Chosen as "iOS 26 if the SDK on this machine supports it, else newest
available" (per the WP-10 brief). This machine has no Xcode.app installed, so
no iOS SDK version could be read directly with `xcodebuild -showsdks`.
`softwareupdate --list` does show **"Command Line Tools for Xcode 26.6"**
as the counterpart package for this OS (macOS SDKs present locally go up to
`MacOSX26.5.sdk`), and the task's current date (July 2026) places the iOS 26
generation as current — so iOS 26.0 was used as the deployment target. Revisit
this if/when full Xcode is installed and `xcodebuild -showsdks` can confirm
the actual bundled iOS SDK version.

### Signing

`CODE_SIGN_STYLE: Automatic` with `CODE_SIGNING_ALLOWED/REQUIRED: NO` and no
`DEVELOPMENT_TEAM` — the project builds and runs on the Simulator with no
Apple Developer account. Each target still carries a `CODE_SIGN_ENTITLEMENTS`
pointing at its App Group entitlements file (see below), so switching on real
signing for WP-17 is a matter of flipping those two build settings back on
and filling in a team ID — the entitlements are already wired.

### App Group

`group.app.zenji`, declared in both `Zenji/Zenji.entitlements` and
`ZenjiWidget/ZenjiWidget.entitlements`. Not used yet (no shared cache exists
until WP-12); present now so SyncClient doesn't need a project-structure
change later.

## Directory layout

```
ios/
├── project.yml                    XcodeGen spec — source of truth, checked in
├── .gitignore                     scoped to ios/: *.xcodeproj, xcuserdata, DerivedData
├── Zenji/                         app target
│   ├── ZenjiApp.swift             @main entry point
│   ├── ContentView.swift          Tekst-TV header + empty day-grouped agenda shell
│   ├── DesignTokens.swift         shared design tokens (also used by ZenjiWidget)
│   ├── Models/                    WP-11: Codable models mirroring the data contract
│   │   ├── ZenjiJSON.swift        shared JSONDecoder factory (dual ISO 8601 dates)
│   │   ├── Event.swift            events.schema.json, field-for-field
│   │   ├── StreamingChannel.swift
│   │   ├── Participant.swift
│   │   ├── NorwegianPlayer.swift
│   │   ├── FeaturedGroup.swift
│   │   ├── Entity.swift           docs/data/entities.json (WP-05)
│   │   ├── Manifest.swift         docs/data/manifest.json (WP-03)
│   │   └── TrackedConfig.swift    scripts/config/tracked.json
│   ├── Info.plist                 generated by xcodegen from project.yml properties
│   ├── Zenji.entitlements         App Group placeholder
│   └── Assets.xcassets/
├── ZenjiWidget/                   WidgetKit extension target
│   ├── ZenjiWidgetBundle.swift    @main WidgetBundle entry point
│   ├── ZenjiWidget.swift          static placeholder timeline + view
│   ├── Info.plist                 generated (NSExtension → com.apple.widgetkit-extension)
│   ├── ZenjiWidget.entitlements   App Group placeholder
│   └── Assets.xcassets/
└── ZenjiTests/                    WP-11: hostless logic-test bundle (Zenji/Models sources
    │                              compiled directly in — no @testable import, no TEST_HOST)
    ├── Fixture.swift              loads the JSON fixtures below
    ├── EventDecodingTests.swift
    ├── SupportingModelDecodingTests.swift
    ├── ForwardCompatibilityTests.swift
    ├── Info.plist                 generated by xcodegen
    └── Fixtures/                  FRESH snapshots, see "Model fixtures" below
        ├── events.json
        ├── entities.json
        ├── manifest.json
        └── tracked.json
```

## Design tokens

`Zenji/DesignTokens.swift` — Tekst-TV (teletext) identity, mood carried over
from `docs/css/base.css` (mono, amber-led, near-black dark page with a
warm-paper light sibling):

| Token | Dark (default) | Light ("warm paper") |
|---|---|---|
| Background | `#0A0A0C` | `#F5F1E6` |
| Foreground | `#E8E6E0` | `#1A1804` |
| Accent (amber) | `#FFB000` | `#8F6400` |
| Type | SF Mono / system monospaced, throughout | same |

`ZenjiTokens.background` / `.foreground` / `.accent` are dynamic `Color`
values that follow the system colour scheme (the SwiftUI analogue of
`prefers-color-scheme` in the web CSS). `Font.zenjiMono(size:weight:)` gives
the one monospaced typeface used everywhere.

These are the literal WP-10 spec values, not a byte-for-byte copy of the web
tokens (which use `#ffb454` for amber) — cross-platform token unification is
future work, out of scope for this package.

## Models (WP-11)

`Zenji/Models/` is the Swift mirror of the data contract described in
`scripts/config/events.schema.json` (events), `docs/data/entities.json`
(WP-05), `docs/data/manifest.json` (WP-03), and `scripts/config/tracked.json`.
No networking or feed logic lives here — this package only turns the raw
JSON bytes into typed Swift values; WP-12 (SyncClient) is what will actually
fetch them, WP-13 (FeedCompiler) is what will turn them into a feed.

- **`ZenjiJSON.decoder`** — the one shared `JSONDecoder` every model decodes
  through. Its only job beyond the default is dates: the pipeline emits ISO
  8601 timestamps both with fractional seconds
  (`"2026-07-16T04:00:00.000Z"`, from JS `Date#toISOString()`) and without
  (`"2026-08-02T15:00:00Z"`, hand-written in agent output) — both appear
  side-by-side in real `events.json`, so the decoder tries the fractional
  formatter first and falls back to the whole-second one.
- **Forward compatibility** — unknown/new JSON keys are ignored automatically
  by Swift's Codable synthesis (a decoder only looks up the keys its
  `CodingKeys` enum lists); no extra code needed. What Swift does NOT do for
  free is apply a *default* when a key the pipeline always writes (but the
  schema doesn't strictly require) is missing — `Event`, `Entity` and
  `TrackedConfig.Entry` each have a hand-written `init(from:)` using
  `decodeIfPresent(...) ?? default` for those fields (arrays default to
  `[]`, booleans to `false`); `encode(to:)` is left to the compiler in all
  three cases.
- **Enum-like string fields** (`confidence`, `status`, `verificationStatus`,
  `source`, entity `type`, tracked-entry `priority`) are kept as plain
  `String`, not closed Swift enums, even though the JSON Schema declares some
  of them as enums — a new value from the server should decode gracefully on
  an older client, not crash the whole event.
- **`teeTime` vs. `teeTimeUTC`** (on `NorwegianPlayer` and
  `FeaturedGroup.Groupmate`) look similar but aren't: `teeTime` is a locale-
  formatted *display* string (`"14:30"`, built with
  `Date#toLocaleTimeString("no-NO", …)` in `scripts/fetch/golf.js`), so it
  stays `String`; `teeTimeUTC` is always a real ISO 8601 string, so it
  decodes as `Date` through the same shared strategy as every other date.

### Model fixtures

`ZenjiTests/Fixtures/` holds **checked-in, deliberately-frozen snapshots** of
the real `docs/data/events.json`, `docs/data/entities.json`,
`docs/data/manifest.json` and `scripts/config/tracked.json`, taken fresh when
this package was written. They are the Swift side's fasit for the contract —
update them by deliberately re-copying the live files and committing the
diff (e.g. when the schema changes in a later WP), never by an automated
job. `ZenjiTests/` itself is a hostless unit-test bundle (no `TEST_HOST`,
no `@testable import` — it compiles `Zenji/Models` directly, the same trick
`ZenjiWidgetExtension` already uses for `DesignTokens.swift`), so it runs
with:

```sh
xcodebuild test -project Zenji.xcodeproj -scheme Zenji \
  -destination 'platform=iOS Simulator,name=<a device from `xcrun simctl list devices available`>'
```

## Architecture (what plugs in next)

WP-10 was the shell; WP-11 (above) added the Codable models. The pieces
below are still separate work packages — **not implemented here**:

- **SyncClient (WP-12)** — polls `manifest.json` (WP-03) with ETag /
  `If-None-Match`, fetches only changed data files, writes them into the
  `group.app.zenji` App Group container, registers a `BGAppRefreshTask`.
- **FeedCompiler (WP-13)** — the Swift port of the server's personalization
  logic (interest match → weighting → buckets → day grouping), proven against
  the golden feed vectors from WP-06.
- **NotificationPlanner (WP-15)** — diffs event IDs (WP-02) after each sync and
  (re)schedules local notifications from the must-see rules.
- **Agenda UI + widget (WP-14)** — replaces `ContentView`'s placeholder row
  and `ZenjiWidget`'s static timeline with real day-grouped data once
  SyncClient + FeedCompiler exist.
- **FM playground (WP-16)** — conversational interest-rule editing via Apple
  Intelligence `@Generable`, gated on a physical device.

## Data contract

The iOS client is a pure consumer of the same static JSON published to
GitHub Pages for the web dashboard — no separate backend, per the zero-
infrastructure constraint in `CLAUDE.md`.

- **Manifest:** `docs/data/manifest.json` (WP-03) — per-file `bytes` /
  `sha256` / optional `sourceLastUpdated` for every published data file;
  this is what SyncClient (WP-12) will poll to decide what changed. Mirrored
  by `Manifest.swift`.
- **Events schema:** `scripts/config/events.schema.json` (repo root) — the
  formal draft-07 schema for `events.json` (WP-01). `Event.swift` (+
  `StreamingChannel`/`Participant`/`NorwegianPlayer`/`FeaturedGroup`) mirrors
  this schema field-for-field; forward-compatible (unknown fields ignored).
- **Events data:** `docs/data/events.json` on the published site — the same
  file the web dashboard reads.
- **Entities:** `docs/data/entities.json` (WP-05) — the stable-id index
  `Event`'s `entityId` fields point into. Mirrored by `Entity.swift`.
- **Tracked config:** `scripts/config/tracked.json` — mirrored by
  `TrackedConfig.swift`.

No network code exists in this package (SyncClient is WP-12, out of scope
here) — the app currently reads nothing; the placeholder row says so.
