# Zenji — iOS app (WP-10 scaffold + WP-11 models + WP-12 sync)

SwiftUI app **Zenji** + WidgetKit extension **ZenjiWidget**, generated with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`. WP-10
was the scaffold only (a Tekst-TV shell with no data, no networking, no feed
logic). WP-11 (see PLAN.md) added the Codable models that mirror the data
contract. WP-12 (below) adds the sync layer — the app now actually fetches
and caches real data — but still no feed logic (WP-13) and no real agenda
rendering (WP-14).

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

**Update (WP-12):** this later PR's worktree *did* have full Xcode 26.6 + the
iOS 26.5 Simulator runtime installed, so the above was finally proven
end-to-end rather than by substitute: `xcodebuild -scheme Zenji -destination
'generic/platform=iOS Simulator' build` and `xcodebuild -scheme
ZenjiWidgetExtension -destination 'generic/platform=iOS Simulator' build`
both exit 0, and `xcodebuild test -project Zenji.xcodeproj -scheme Zenji
-destination 'platform=iOS Simulator,name=iPhone 17 Pro' clean test`
**passes all 37 tests** (the 11 from WP-11 + 26 new WP-12 sync tests — see
"Sync layer (WP-12)" below).

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
`ZenjiWidget/ZenjiWidget.entitlements`. WP-12's `CacheStore` now uses this as
its preferred cache location (falling back to Application Support when the
container isn't available — see "Sync layer (WP-12)" below), so the widget
extension will be able to read the same synced cache once it needs to
(WP-14) with no further project-structure change.

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
│   ├── Sync/                      WP-12: manifest-diff sync + cache + BGAppRefreshTask
│   │   ├── SyncClient.swift       polls manifest.json, fetches only changed files
│   │   ├── SyncResult.swift       SyncResult / SyncError — the sync() outcome
│   │   ├── CacheStore.swift       App Group cache, auto-fallback to Application Support
│   │   ├── SyncState.swift        persisted etag + reconciled per-file manifest snapshot
│   │   ├── Checksum.swift         Data.sha256Hex (CryptoKit) — verifies downloads
│   │   ├── DataStore.swift        read-only facade: loadEvents()/loadEntities()/…
│   │   ├── BackgroundRefreshScheduling.swift   pure "when's the next refresh" function
│   │   └── BackgroundRefreshScheduler.swift    thin BGTaskScheduler wrapper (untested)
│   ├── Info.plist                 generated by xcodegen from project.yml properties
│   ├── Zenji.entitlements         App Group (group.app.zenji — now in active use, WP-12)
│   └── Assets.xcassets/
├── ZenjiWidget/                   WidgetKit extension target
│   ├── ZenjiWidgetBundle.swift    @main WidgetBundle entry point
│   ├── ZenjiWidget.swift          static placeholder timeline + view
│   ├── Info.plist                 generated (NSExtension → com.apple.widgetkit-extension)
│   ├── ZenjiWidget.entitlements   App Group placeholder
│   └── Assets.xcassets/
└── ZenjiTests/                    hostless logic-test bundle (Zenji/Models + Zenji/Sync
    │                              sources compiled directly in — no @testable import, no TEST_HOST)
    ├── Fixture.swift              loads the JSON fixtures below (WP-11)
    ├── EventDecodingTests.swift                     (WP-11)
    ├── SupportingModelDecodingTests.swift            (WP-11)
    ├── ForwardCompatibilityTests.swift               (WP-11)
    ├── MockURLProtocol.swift      URLProtocol stub injected via URLSessionConfiguration (WP-12)
    ├── SyncTestSupport.swift      shared sync-test helpers, reuses Fixtures/* (WP-12)
    ├── SyncClientTests.swift      304 / changed-manifest / offline / etag / corrupt-download (WP-12)
    ├── CacheStoreTests.swift      atomic read/write, sync-state, App Group fallback (WP-12)
    ├── DataStoreTests.swift       never-throws facade behaviour (WP-12)
    ├── BackgroundRefreshSchedulingTests.swift        pure scheduling function (WP-12)
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
JSON bytes into typed Swift values; `Zenji/Sync/` (WP-12, below) is what
actually fetches them, WP-13 (FeedCompiler) is what will turn them into a
feed.

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

## Sync layer (WP-12)

`Zenji/Sync/` is the app's only networking code — everything else in the app
reads exclusively from the on-disk cache this layer maintains. No feed logic
lives here (that's WP-13); this package only gets the right bytes onto disk
and lets the rest of the app read them back out as typed models.

### The manifest-diff flow

`SyncClient.sync() async -> SyncResult` does, in order:

1. **GET `manifest.json`** from `baseURL` (default `https://zenji.app/data/`,
   injectable via the initializer) with `If-None-Match` set to whatever ETag
   `CacheStore` has persisted from the previous run.
2. **304 → `.upToDate`.** No further requests are made at all — this is the
   common case on every sync after the first, since the pipeline runs hourly
   but this client doesn't need to be that eager.
3. **200 → decode** the body with WP-11's `Manifest` model, then diff its
   per-file `sha256` against `SyncState.appliedFiles` — **not** a straight
   copy of the last server manifest, but a *reconciled* snapshot of what
   this cache has actually applied (see below for why that distinction
   matters). Only files that (a) actually changed and (b) are in
   `filesOfInterest` (default `events.json` / `entities.json` /
   `tracked.json` — the ~25 other manifest entries are agent logs,
   calibration data, per-sport source files, … irrelevant to this client)
   are fetched.
4. Each fetched file's bytes are **verified against the manifest's declared
   sha256** (via `Data.sha256Hex`, `Checksum.swift`, CryptoKit) before being
   trusted. A mismatch (truncated/corrupt download) or a network hiccup
   discards that one file silently — the old cached copy (if any) is left
   completely alone, and because its **old** manifest entry is carried
   forward into the new `SyncState` rather than the server's new one, it's
   picked up again on the next sync instead of being wrongly considered
   "already applied". A single flaky file therefore never fails the whole
   sync, and never gets silently skipped forever either.
5. Files that pass verification are written to the cache **atomically**
   (`Data.write(options: .atomic)` — a crash mid-write can never hand
   `DataStore` a half-written file), and the new ETag + reconciled manifest
   snapshot + `lastSync` timestamp are persisted to `sync-state.json`.
6. Returns `SyncResult`: `.upToDate`, `.changedFiles([String])` (exactly the
   filenames actually written this run — may be fewer than the manifest
   reported changed, per point 4), or `.failure(SyncError)` (the manifest
   fetch itself failed — network error, bad status, undecodable body — and
   the existing cache/state are left completely untouched).

### Cache location

`CacheStore` prefers the `group.app.zenji` App Group container so the widget
extension (WP-14) can read the same synced cache later, falling back
automatically to this process's own Application Support directory when the
App Group container genuinely isn't available (e.g. a real device build
before WP-17 wires up a real provisioning profile). Data files are stored
as-is, byte-for-byte what the server sent, alongside one small
`sync-state.json` (`etag`, the reconciled `appliedFiles` manifest snapshot,
`lastSync`).

One environment note from writing this: the iOS **Simulator** resolves the
`group.app.zenji` container readily even for a completely unsigned,
entitlement-less build (its sandboxd is lenient about app-group containers
for unsigned Debug builds) — so "runs in the Simulator" does *not* reliably
exercise the fallback branch. `CacheStoreTests` proves the fallback
deterministically instead, via a `FileManager` subclass that always returns
`nil` from `containerURL(forSecurityApplicationGroupIdentifier:)`.

### DataStore — the read-only facade

`DataStore.loadEvents() -> [Event]` / `.loadEntities() -> [Entity]` /
`.loadTracked() -> TrackedConfig?` decode straight from the cache through
`ZenjiJSON.decoder` (WP-11) and **never throw** — a missing or corrupt cache
file is not a crash, it's an empty list (or `nil`). `DataStore.lastSync`
(from `sync-state.json`) is the "have we ever synced" flag: `nil` means
never, which the UI needs to tell apart from "synced fine, zero events right
now" (a legitimate state, e.g. an off-season day).

### BGAppRefreshTask

A deliberately thin, separate layer, split in two:

- **`BackgroundRefreshScheduling.swift`** — a *pure* function,
  `earliestBeginDate(lastSync:now:minimumInterval:) -> Date`, answering "when
  should the next refresh run" (never sooner than the research agent's own
  4-hourly cadence, never in the past). This is the one part of the BGTask
  layer with real logic, so it's the one part with unit tests
  (`BackgroundRefreshSchedulingTests`).
- **`BackgroundRefreshScheduler.swift`** — the actual `BGTaskScheduler`
  wrapper: `register(syncClient:dataStore:)` (called from `ZenjiApp.init()`,
  before the app finishes launching — Apple's own requirement, and why it
  can't live behind a view's `.task`) and `scheduleNextRefresh(dataStore:)`
  (submits/resubmits a `BGAppRefreshTaskRequest`, called on every app
  foreground and at the end of every background run). **Not unit-tested** —
  `BGTaskScheduler` needs a running app + the real OS scheduler, which a test
  target can't provide; per the WP-12 brief, only the pure scheduling
  decision above is meant to be tested. Needs `app.zenji.refresh` in
  `BGTaskSchedulerPermittedIdentifiers` and `UIBackgroundModes: [fetch]` —
  both set in `project.yml`'s `Zenji` target `info.properties` (regenerate
  with `xcodegen generate` after any change there; editing the generated
  `Info.plist` directly gets overwritten).

### Minimal UI coupling

`ContentView` calls `syncClient.sync()` from a `.task` on first appearance
(WP-12's "sync at app start"), then reloads from `DataStore` before and after
— so the header shows "Sist synket: aldri" (never) or a time + event count
immediately from whatever's cached, without waiting on the network. The
agenda itself is still the WP-10 placeholder row; real day-grouped rendering
is WP-13 (FeedCompiler) + WP-14 (Agenda UI), not touched here.

### Tests

All 26 new WP-12 tests are network-free (no `.shared` session is ever used in
tests — `MockURLProtocol`, injected via `URLSessionConfiguration
.protocolClasses`, intercepts every request) and reuse the **real, checked-in
WP-11 fixtures** (`ZenjiTests/Fixtures/{events,entities,tracked,manifest}
.json`) as the mock server's responses, exactly as the WP-11 decode tests do
— rather than inventing separate test data. Where a scenario needs a variant
the frozen fixture doesn't represent (a changed file, a corrupt download),
`SyncTestSupport.manifestFixture(replacing:with:)` starts from the real
manifest and mutates exactly one entry, computing its sha256 with the same
`Data.sha256Hex` `SyncClient` itself uses.

## Architecture (what plugs in next)

WP-10 was the shell, WP-11 added the Codable models, WP-12 (above) added
sync + cache + background refresh. The pieces below are still separate work
packages — **not implemented here**:

- **FeedCompiler (WP-13)** — the Swift port of the server's personalization
  logic (interest match → weighting → buckets → day grouping), proven against
  the golden feed vectors from WP-06, consuming `DataStore.loadEvents()` /
  `.loadEntities()`.
- **NotificationPlanner (WP-15)** — diffs event IDs (WP-02) after each sync and
  (re)schedules local notifications from the must-see rules.
- **Agenda UI + widget (WP-14)** — replaces `ContentView`'s placeholder row
  and `ZenjiWidget`'s static timeline with real day-grouped data, reading
  from the same `group.app.zenji` cache `CacheStore` already writes to.
- **FM playground (WP-16)** — conversational interest-rule editing via Apple
  Intelligence `@Generable`, gated on a physical device.

## Data contract

The iOS client is a pure consumer of the same static JSON published to
GitHub Pages for the web dashboard — no separate backend, per the zero-
infrastructure constraint in `CLAUDE.md`.

- **Manifest:** `docs/data/manifest.json` (WP-03) — per-file `bytes` /
  `sha256` / optional `sourceLastUpdated` for every published data file;
  this is what `SyncClient` (WP-12) polls to decide what changed. Mirrored
  by `Manifest.swift`.
- **Events schema:** `scripts/config/events.schema.json` (repo root) — the
  formal draft-07 schema for `events.json` (WP-01). `Event.swift` (+
  `StreamingChannel`/`Participant`/`NorwegianPlayer`/`FeaturedGroup`) mirrors
  this schema field-for-field; forward-compatible (unknown fields ignored).
- **Events data:** `docs/data/events.json` on the published site — the same
  file the web dashboard reads. Synced by `SyncClient`, read via
  `DataStore.loadEvents()`.
- **Entities:** `docs/data/entities.json` (WP-05) — the stable-id index
  `Event`'s `entityId` fields point into. Mirrored by `Entity.swift`, synced
  by `SyncClient`, read via `DataStore.loadEntities()`.
- **Tracked config:** `scripts/config/tracked.json` — mirrored by
  `TrackedConfig.swift`, synced by `SyncClient`, read via
  `DataStore.loadTracked()`.

`Zenji/Sync/` (WP-12, above) is what actually fetches these now; before this
package the app read nothing at all.
