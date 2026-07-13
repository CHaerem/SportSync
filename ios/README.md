# Zenji — iOS app (WP-10 scaffold → WP-11 models → WP-12 sync → WP-13 feed → WP-14 agenda/widget → WP-15 notifications → WP-16 assistant)

SwiftUI app **Zenji** + WidgetKit extension **ZenjiWidget**, generated with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`. WP-10
was the scaffold only (a Tekst-TV shell with no data, no networking, no feed
logic). WP-11 (see PLAN.md) added the Codable models that mirror the data
contract. WP-12 added the sync layer — the app fetches and caches real data.
WP-13 added `FeedCompiler`, the Swift port of the personalisation semantics.
WP-14 is the payoff: a real, day-grouped Tekst-TV agenda + a home screen
widget, both reading the same synced cache — no more placeholder row. WP-15
(below) adds local push reminders on top of it all.

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

**Update (WP-15):** same Xcode 26.6 / iOS 26.5 Simulator worktree. Both
`xcodebuild -scheme Zenji -destination 'generic/platform=iOS Simulator' build`
and `xcodebuild -scheme ZenjiWidgetExtension -destination 'generic/platform=iOS
Simulator' build` exit 0, and `xcodebuild test -project Zenji.xcodeproj
-scheme Zenji -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
**passes all 69 tests** (the 49 WP-10/11/12/13 baseline + 20 new: 17
`NotificationPlannerTests` + 3 `DataStoreTests` covering `loadInterests()` —
see "Notifications (WP-15)" below). `npm test` (369 tests, 29 files) is
unaffected — this package touches only `ios/`.

**Update (WP-14):** this worktree (rebased onto WP-15, which landed in
parallel) also had full Xcode 26.6 + the iOS 26.5 Simulator runtime, so this
PR's own additions were proven fully end-to-end, never by substitute:

- `xcodebuild -scheme Zenji -destination 'generic/platform=iOS Simulator'
  build` and `xcodebuild -scheme ZenjiWidgetExtension -destination
  'generic/platform=iOS Simulator' build` both exit 0.
- `xcodebuild test -project Zenji.xcodeproj -scheme Zenji -destination
  'platform=iOS Simulator,name=iPhone 17 Pro'` **passes all 102 tests** — the
  49 WP-10/11/12/13 baseline, 20 from WP-15 (`NotificationPlannerTests` + 3
  `DataStoreTests`), plus 33 new from this package (`AgendaFormatTests`,
  `AgendaViewModelTests`, `WidgetTimelineBuilderTests`).
- Booted `iPhone 17 Pro` (`xcrun simctl boot`), installed and launched the
  real app (`xcrun simctl install` / `launch`), and screenshotted it
  (`xcrun simctl io … screenshot`) against the **real, live** `zenji.app`
  data — see `docs/agenda-screenshot.png` and "Visual proof (WP-14)" below.
- The widget target builds and its `WidgetTimelineBuilder` is unit-tested,
  but actually adding the widget to a Simulator home screen has no scriptable
  `simctl` path (it needs interactive long-press-to-add UI, or a dedicated
  XCUITest target this project doesn't have) — **not captured as a
  screenshot**; noted rather than faked, per the WP-14 brief's own
  "ellers noter" ("otherwise, note it") allowance.

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
`ZenjiWidget/ZenjiWidget.entitlements`. WP-12's `CacheStore` uses this as its
preferred cache location (falling back to Application Support when the
container isn't available — see "Sync layer (WP-12)" below); WP-14's widget
extension reads the same synced cache through it, no further
project-structure change needed.

## Directory layout

```
ios/
├── project.yml                    XcodeGen spec — source of truth, checked in
├── .gitignore                     scoped to ios/: *.xcodeproj, xcuserdata, DerivedData
├── Zenji/                         app target
│   ├── ZenjiApp.swift             @main entry point (untouched since WP-12 — see WP-14/15 notes)
│   ├── ContentView.swift          Tekst-TV header (WP-14: ZENJI · dato · ticking clock) + AgendaView
│   ├── DesignTokens.swift         shared design tokens (also used by ZenjiWidget/ZenjiTests)
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
│   │   ├── DataStore.swift        read-only facade: loadEvents()/…/loadInterests() (WP-15)
│   │   ├── BackgroundRefreshScheduling.swift   pure "when's the next refresh" function
│   │   └── BackgroundRefreshScheduler.swift    thin BGTaskScheduler wrapper (untested)
│   ├── Feed/                      WP-13: FeedCompiler + WP-14's shared formatting helpers
│   │   ├── FeedEvent.swift        the small input the five predicates read
│   │   ├── Interests.swift        Swift mirror of scripts/config/interests.json
│   │   ├── TextMatch.swift        server normalize/containsName port
│   │   ├── FeedCompiler.swift     the five predicates + compile() facade
│   │   ├── AgendaFormat.swift     WP-14: när/hva/hvor + day-label + series-summary formatting
│   │   └── EventBridge.swift      WP-14: [Event] → [FeedEvent] bridge + id lookup
│   ├── Agenda/                    WP-14: the real agenda (app-only, not in the widget target)
│   │   ├── AgendaModels.swift     AgendaSection/AgendaItem/AgendaEventRow/AgendaSeriesRow
│   │   ├── AgendaViewModel.swift  @MainActor view model; buildSections() is the pure core
│   │   ├── AgendaView.swift       day-sectioned List + EventRowView/SeriesRowView
│   │   ├── EventDetailSheet.swift venue/summary/streaming links/AI provenance
│   │   └── SeriesDetailSheet.swift expanded stage-race detail
│   ├── Widget/                    WP-14: the widget's own pure timeline logic
│   │   └── WidgetTimelineBuilder.swift   no `import WidgetKit` — see its own header
│   ├── Notifications/             WP-15: local push reminders for must-watch events
│   │   ├── NotificationOperation.swift   NotificationRequest + the scheduleNew/reschedule/cancel plan
│   │   ├── NotificationScheduling.swift  thin UNUserNotificationCenter wrapper behind a protocol
│   │   └── NotificationPlanner.swift     the pure plan(...) diff + the impure reconcile(...)
│   ├── Info.plist                 generated by xcodegen from project.yml properties
│   ├── Zenji.entitlements         App Group (group.app.zenji — in active use since WP-12)
│   └── Assets.xcassets/
├── ZenjiWidget/                   WidgetKit extension target
│   ├── ZenjiWidgetBundle.swift    @main WidgetBundle entry point
│   ├── ZenjiWidget.swift          WP-14: real TimelineProvider (WidgetTimelineBuilder + DataStore)
│   ├── Info.plist                 generated (NSExtension → com.apple.widgetkit-extension)
│   ├── ZenjiWidget.entitlements   App Group (shares the app's synced cache)
│   └── Assets.xcassets/
└── ZenjiTests/                    hostless logic-test bundle (Zenji/Models + Zenji/Sync +
    │                              Zenji/Feed + Zenji/Agenda + Zenji/Widget + Zenji/Notifications
    │                              sources compiled directly in — no @testable import, no TEST_HOST)
    ├── Fixture.swift              loads the JSON fixtures below (WP-11)
    ├── EventBuilder.swift         WP-14: builds `Event` values (via JSON) for focused agenda/widget tests
    ├── EventFixtureBuilder.swift  WP-15: builds `Event` values (via JSON) for NotificationPlanner tests
    ├── EventDecodingTests.swift                     (WP-11)
    ├── SupportingModelDecodingTests.swift            (WP-11)
    ├── ForwardCompatibilityTests.swift               (WP-11)
    ├── MockURLProtocol.swift      URLProtocol stub injected via URLSessionConfiguration (WP-12)
    ├── SyncTestSupport.swift      shared sync-test helpers, reuses Fixtures/* (WP-12)
    ├── SyncClientTests.swift      304 / changed-manifest / offline / etag / corrupt-download (WP-12)
    ├── CacheStoreTests.swift      atomic read/write, sync-state, App Group fallback (WP-12)
    ├── DataStoreTests.swift       never-throws facade behaviour, incl. loadInterests() (WP-12/15)
    ├── BackgroundRefreshSchedulingTests.swift        pure scheduling function (WP-12)
    ├── FeedCompilerUnitTests.swift + FeedVectorTests.swift    predicates + golden vectors (WP-13)
    ├── AgendaFormatTests.swift     när/hva/hvor + day-label + series-summary rules (WP-14)
    ├── AgendaViewModelTests.swift  buildSections(): hand-built + real-fixture cases (WP-14)
    ├── WidgetTimelineBuilderTests.swift   ticks/nextHighlight/buildEntries (WP-14)
    ├── RecordingNotificationScheduler.swift   recording NotificationScheduling double (WP-15)
    ├── NotificationPlannerTests.swift          plan()/reconcile() acceptance tests (WP-15)
    ├── Info.plist                 generated by xcodegen
    └── Fixtures/                  FRESH snapshots, see "Model fixtures" below
        ├── events.json
        ├── entities.json
        ├── interests.json         WP-14/15
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
actually fetches them, `Zenji/Feed/` (WP-13) is what turns them into a feed.

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
`docs/data/manifest.json`, `scripts/config/tracked.json`, and
`docs/data/interests.json` (the last verified byte-identical to the live
site's copy via sha256 at the time it was added), taken fresh when this
package was written. They are the Swift side's fasit for the contract —
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
   `tracked.json` / `interests.json` — the last added by WP-15 so
   `NotificationPlanner` has the real notify-config to plan against, and
   equally needed by WP-14's `FeedCompiler.compile()`; the ~24 other
   manifest entries are agent logs, calibration data, per-sport source
   files, … irrelevant to this client) are fetched.
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
extension (WP-14) can read the same synced cache, falling back automatically
to this process's own Application Support directory when the App Group
container genuinely isn't available (e.g. a real device build before WP-17
wires up a real provisioning profile). Data files are stored as-is,
byte-for-byte what the server sent, alongside one small `sync-state.json`
(`etag`, the reconciled `appliedFiles` manifest snapshot, `lastSync`).

One environment note from writing this: the iOS **Simulator** resolves the
`group.app.zenji` container readily even for a completely unsigned,
entitlement-less build (its sandboxd is lenient about app-group containers
for unsigned Debug builds) — so "runs in the Simulator" does *not* reliably
exercise the fallback branch. `CacheStoreTests` proves the fallback
deterministically instead, via a `FileManager` subclass that always returns
`nil` from `containerURL(forSecurityApplicationGroupIdentifier:)`.

### DataStore — the read-only facade

`DataStore.loadEvents() -> [Event]` / `.loadEntities() -> [Entity]` /
`.loadTracked() -> TrackedConfig?` / `.loadInterests() -> Interests?` (WP-15)
decode straight from the cache through `ZenjiJSON.decoder` (WP-11) and
**never throw** — a missing or corrupt cache file is not a crash, it's an
empty list (or `nil`). `DataStore.lastSync` (from `sync-state.json`) is the
"have we ever synced" flag: `nil` means never, which the UI needs to tell
apart from "synced fine, zero events right now" (a legitimate state, e.g. an
off-season day) — WP-15's `NotificationPlanner` also reads it directly, as
the "how stale is what I'm about to plan from" signal (see "Notifications"
below). Every `loadInterests()` call site (WP-14's `AgendaViewModel`, the
widget, WP-15's `ContentView` hook) falls back to an empty `Interests()`
when it's `nil` — `FeedCompiler.compile` already has its own default
`followBroadly` list for exactly that case, so nothing goes blank just
because `interests.json` hasn't synced yet.

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

## Feed compiler (WP-13)

`Zenji/Feed/` is the Swift port of the personalisation semantics — **which**
events reach the feed, which get the reminder bell, which get the visual
accent, how the agenda time window behaves, and how stage races collapse. Its
one hard acceptance criterion: it reproduces **every** golden feed-vector
(`tests/fixtures/feed-vectors/`, WP-06) **bit-for-bit**, including the four
pinned server/client divergences (`DIVERGENCES.md`) — those are *reproduced*,
never "fixed".

### There is no single "special?" predicate — there are five

Each answers a different product question and is ported faithful to the side
that owns it (the web duplicates this logic across server and client, and the
two are *intended* to differ):

| Predicate | Question | Ported from | Semantics the port preserves |
|---|---|---|---|
| `isRelevant` | In the feed at all? | **server** `build-events.js` `isRelevant` + 14-day cutoff | `sport ∈ followBroadly` OR norwegian/isFavorite/importance≥4/ai-research OR a tracked entity matches — the entity match is **NOT sport-scoped**. Cutoff keys off `endTime ?? time` (multi-day events survive on their end); boundary inclusive. |
| `mustWatch` | Reminder bell 🔔? | **server** `helpers.js` `mustWatchEntity` | Keyed **only** off `interests.json` notify-entities (teams+athletes by default, tournaments only when `notify:true`); **sport-scoped**; word-boundary + diacritic-folding matching. |
| `isMustSee` | Quiet visual accent? | **client** `dashboard.js` `isMustSee` | isFavorite/importance≥4/(norwegian+players), national-team regex, then **naive lowercase-substring** team/athlete matching — the pinned substring behaviour (`"Brooklyn".contains("lyn")` fires) is kept deliberately. Reads title + player names, **not** participants/tournament. |
| `isEventInWindow` | Overlaps the agenda window? | **server & client, byte-identical** | `s = time`, `e = endTime ?? time`; overlaps `[start,end)` iff `s < end && e >= start`; no time → false. |
| `collapseSeries` | How do stage races fold? | **client** `dashboard.js` `collapseSeries` | Groups titles matching `/\betappe\b|\bstage\s*\d/i` by `sport||tournament`; **4 or more** fold into one synthetic row; next stage = first with `endTime ?? time >= now`, else the last. |

The four pinned divergences the port reproduces: relevance is unscoped while the
bell is sport-scoped (a football "Barcelona" pulls a tennis "Barcelona Open"
onto the board but rings no bell); the accent's naive substring vs the bell's
word boundary (`"Brooklyn FC"` gets the accent, not the bell); bell ≠ accent in
general (favorite/national-team/golf-lens accent without a bell; F1/TdF bell
without an accent); and `confidence` does **not** gate feed inclusion.

### The dangerous part: text matching

`TextMatch.swift` ports the server matchers as pure functions:
`normalize` (NFD-decompose → strip Unicode Marks `\p{M}` → lowercase, so
"Barça" ≡ "Barca", "Vålerenga" → "valerenga") and `containsName`
(word-boundary, accent-insensitive containment via
`(?:^|[^\p{L}\p{N}])name(?:[^\p{L}\p{N}]|$)`). These are the exact JS
semantics from `scripts/lib/helpers.js`; `FeedCompilerUnitTests` guards them
with named minimal cases. The client accent's **naive** `lowercased()` +
substring `contains` deliberately does **not** route through this file — it
lives inline in `FeedCompiler.isMustSee` because its lack of folding/boundaries
is pinned behaviour.

### Types

- `FeedEvent.swift` — the small pure-data input the predicates read (only the
  fields they use). Separate from WP-11's `Event` for one concrete reason:
  `Event.time` is a **non-optional** `Date`, but the vectors include a pinned
  `"time": null` case; `FeedEvent.time` is `Date?` so that decodes and the
  predicates return the same `false` the JS does. `init(from event: Event)`
  bridges the real cached `[Event]` (from `DataStore`) into the compiler for
  WP-14 (see `EventBridge` below).
- `Interests.swift` — the personalisation config the vectors embed (a Swift
  mirror of the fields of `scripts/config/interests.json` the predicates read).
- `FeedCompiler.swift` — the five predicates + the `compile(events:interests:
  now:)` facade (relevance filter → bell/accent annotation → series collapse →
  Europe/Oslo day grouping). The day grouping is **not** vector-covered (kept
  simple, unit-tested separately in `FeedCompilerUnitTests`).
- `AgendaFormat.swift` / `EventBridge.swift` (WP-14) — see "Agenda UI +
  widget (WP-14)" below for why these two live in `Feed/` rather than
  `Agenda/`.

### Running the vectors

`FeedVectorTests` decodes the **same** files the JS reference
(`tests/feed-vectors.test.js`) replays — the repo-root
`tests/fixtures/feed-vectors` folder is referenced directly from
`project.yml` as a bundled folder reference (`buildPhase: resources`,
`type: folder`, an out-of-`ios/` path XcodeGen resolves relative to
`project.yml`), never copied, so the two runners can never drift. At runtime
the tests enumerate the bundled `feed-vectors/*.json`, decode each into the
`FeedEvent`/`Interests` models, and assert each declared expectation as an
unordered id set. **The fixtures are frozen** — a failing vector is left red
and escalated, never "fixed" by editing the fixture.

```
cd ios && xcodegen generate
xcodebuild test -project Zenji.xcodeproj -scheme Zenji \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
# 102 tests: 49 WP-10/11/12/13 baseline + 20 WP-15 + 33 WP-14
```

## Agenda UI + widget (WP-14)

The payoff package: a real, day-grouped Tekst-TV agenda (`ContentView` now
hosts `AgendaView` instead of a placeholder row) and a home screen widget
showing "neste must-see" — both pure consumers of WP-12's synced cache and
WP-13's `FeedCompiler`, with no feed logic of their own.

### The interests source (`interests.json` decoding)

`SyncClient.defaultFilesOfInterest` (`Sync/SyncClient.swift`) includes
`"interests.json"` alongside events/entities/tracked (added independently by
both this package and WP-15 — `NotificationPlanner` needs the exact same
file), and `DataStore.loadInterests() -> Interests?` (`Sync/DataStore.swift`,
WP-15) is the "little decoder" for it: the published `docs/data/interests
.json` (checked in at `ZenjiTests/Fixtures/interests.json`, byte-identical to
the live site at the time of writing — verified by sha256) already carries
`followBroadly` / `alwaysTrack` / `notify` field-for-field matching WP-13's
`Interests` `CodingKeys`, so ordinary Codable name-based decoding **is** the
mapping — no translation layer needed. The extra human-facing fields the
real file also carries (`$schema`, `language`, `timezone`, the free-text
`interests`/`neverTrack` lists, `notes`) are ignored automatically, the same
forward-compatibility story `Event.swift` already relies on. Every call site
in this package (`AgendaViewModel`, the widget) falls back to an empty
`Interests()` when the result is `nil` — `FeedCompiler.compile` already has
its own default `followBroadly` list for exactly this case, so the agenda
never goes blank just because `interests.json` hasn't synced yet.

### AgendaViewModel — the pure pipeline

`Zenji/Agenda/AgendaViewModel.swift` is `@MainActor @Observable` (it drives
SwiftUI state directly), but its actual logic is a `nonisolated static`
function, per this codebase's usual pure-core/thin-wrapper split
(`FeedCompiler`'s predicates, `BackgroundRefreshScheduling`):

```
AgendaViewModel.buildSections(events: [Event], interests: Interests, now: Date) -> [AgendaSection]
```

The chain is exactly DataStore → FeedEvent-bridge → `FeedCompiler.compile()`
→ day sections, per the WP-14 brief:

1. **`EventBridge.bridge(_:)`** (`Zenji/Feed/EventBridge.swift` — lives in
   `Feed/`, not `Agenda/`, so the widget target picks it up for free
   alongside `FeedCompiler`) turns `[Event]` into WP-13's `[FeedEvent]` AND
   returns a `[String: Event]` lookup back to the source `Event` — needed
   because `FeedCompiler.compile()`'s output no longer has positional
   correspondence to the input, but the row/detail sheet still need fields
   `FeedEvent` deliberately omits (`streaming`, `venue`, `summary`,
   `evidence`, …). The lookup key is `Event.id` (WP-02) when present, else a
   deterministic `sport|title|time` fallback — the same idea as
   dashboard.js's own client-side id fallback.
2. **`FeedCompiler.compile(events:interests:now:)`** (WP-13, untouched)
   does the actual relevance filter → bell/accent annotation → series
   collapse → Europe/Oslo day grouping.
3. **`AgendaFormat`** (`Zenji/Feed/AgendaFormat.swift` — same "lives in
   Feed/ so the widget gets it for free" reasoning as `EventBridge`) turns
   the compiled, annotated data into the actual row text: `timeLabel`
   ("HH:mm", or a compact "16.–19. juli" WINDOW for a multi-day event —
   never a misleading bare start time), `title` ("Home – Away" for a team
   match, else the event's own title), `channelLabel` (first streaming
   platform, or an honest "–"), `dayLabel` ("I DAG" / "I MORGEN" / else
   "TIRSDAG 14. JULI" — the same `"EEEE d. MMMM".uppercased()` convention
   `ContentView`'s header already used, just Europe/Oslo-scoped), and
   `seriesSummary` ("Tour de France — 21 etapper", plus a quiet "denne uka"
   qualifier when the last stage falls in the current Oslo ISO week).
4. `AgendaViewModel.buildSections` assembles `AgendaSection`/`AgendaItem`/
   `AgendaEventRow`/`AgendaSeriesRow` (`Zenji/Agenda/AgendaModels.swift`) —
   plain, `Equatable` view-ready data, computed once, not per render.

`AgendaViewModelTests` drives `buildSections` directly (no DataStore, no
disk) with both hand-built `EventBuilder`-constructed fixtures (one rule per
test: day grouping, channel selection + "–" fallback, must-see/must-watch
passthrough, series collapse + summary text) AND the real, checked-in
`events.json`/`interests.json` fixtures end-to-end (proves the real Tour de
France fixture — 21 stages — collapses into exactly one series row, and that
"Lyn – Sogndal" comes out must-watch with channel "TV 2 Play").

### AgendaView — the SwiftUI layer

`Zenji/Agenda/AgendaView.swift` is a `List` of day `Section`s (label = the
Norwegian day header), each row either an `EventRowView` or a
`SeriesRowView` — must-see gets the gentlest possible emphasis (a 6pt amber
dot, CLAUDE.md's own phrase), must-watch gets a small 🔔, the channel column
is quiet, an honest "–" when unknown. Pull-to-refresh (`.refreshable`) calls
`AgendaViewModel.refresh()`, which re-syncs then recompiles (this path does
NOT run WP-15's notification reconcile — see "ContentView" below). Tapping a
row opens a `.sheet`:

- **`EventDetailSheet`** — venue, summary, every streaming option as a real
  `Link` (never a fake link when there's no URL), and — only when
  `event.source == "ai-research"` — the provenance block: confidence
  (høy/middels/lav/ukjent) + every evidence URL as its own link. "Åpenhet er
  en funksjon" (CLAUDE.md): this ⓘ is how the app earns trust for events a
  human didn't curate.
- **`SeriesDetailSheet`** — the "kan ekspanderes" half of a collapsed stage
  race: every Norwegian rider across all stages (de-duplicated), the next
  stage's own summary, and every stage as its own date/title/channel line
  (mirrors dashboard.js `seriesDetail`).

### ContentView — the header + the one shared sync hook

`ContentView.swift` keeps its exact pre-WP-14 public signature
(`init(syncClient:dataStore:notificationPlanner:)`, the third parameter added
by WP-15 with a default so `ZenjiApp.swift` needs zero edits) — it now just
constructs an `AgendaViewModel` and hosts `AgendaView` below a header that's
genuinely "ZENJI · dato · en stille tikkende klokke" (a
`Timer.publish(every: 1, …)` ticks a `HH:mm:ss` clock, Europe/Oslo, no other
chrome) instead of the WP-12 scaffold's "Sist synket: …" debug line.
`ContentView.refresh()` (called once from `.task` at app start) orchestrates
BOTH packages' hooks in the one place they need to interleave: it reloads
`AgendaViewModel` from cache, snapshots `dataStore.loadEvents()`, syncs,
reloads `AgendaViewModel` from cache again, then calls WP-15's
`notificationPlanner.reconcile(previousEvents:newEvents:interests:lastSync:)`
with the before/after snapshots — see "Notifications (WP-15)" below for what
that call does. **Deliberately zero changes to `ZenjiApp.swift`** — both
WP-14 and WP-15 landed in parallel and the brief for each asked to keep that
file untouched to avoid a merge conflict; `ZenjiApp.swift` still constructs
`ContentView(syncClient:dataStore:)` with two arguments.

### The widget — pre-computed timeline, no network

`Zenji/Widget/WidgetTimelineBuilder.swift` is a **pure function** (no
`import WidgetKit` at all — that's deliberate, see the file's own header):
given `[Event]` + `Interests` + "now", it returns one `Entry` per "clock
strike" (every full hour remaining in the Europe/Oslo day, plus "now"
itself) — each entry is "the next must-see event as of that moment, else
the nearest merely-relevant upcoming one, else an honest 'Ingenting i dag'".
`ZenjiWidget.swift` (the actual `TimelineProvider`) is the thin WidgetKit
wrapper around it: reads `DataStore` (cache only — **no network call
anywhere in the widget target**, by construction: its project.yml sources
include `Sync/CacheStore.swift`/`SyncState.swift`/`DataStore.swift` but
deliberately NOT `SyncClient.swift`/`Checksum.swift`, so there is no
network-capable code to accidentally call), builds the day's entries once,
and hands WidgetKit a `Timeline` that reloads itself shortly after the last
pre-computed entry — the OS swaps entries on its own schedule with zero
further app/widget activity. `systemSmall` + `systemMedium`, same Tekst-TV
tokens (`DesignTokens.swift`) as the app.

`WidgetTimelineBuilderTests` covers `ticks(from:)` (always starts at `now`,
strictly increasing, correctly empty-but-`now` in the last minutes of the
day) and `nextHighlight`/`buildEntries` (prefers a must-see match over an
earlier plain event, falls back to nearest-upcoming, excludes finished
events, reflects the paired `Event`'s own `streaming` for the channel).

### project.yml — what each target actually compiles

- **`Zenji`** (app): unchanged — it already lists the whole `Zenji/` tree, so
  the new `Agenda/` and `Widget/` folders are picked up automatically.
- **`ZenjiWidgetExtension`**: gained `Zenji/Models`, `Zenji/Feed` (which is
  where `AgendaFormat`/`EventBridge` live — see above), and just the
  **read** half of `Sync` (`CacheStore.swift`/`SyncState.swift`/
  `DataStore.swift`, NOT `SyncClient.swift`/`Checksum.swift`) plus
  `Zenji/Widget/WidgetTimelineBuilder.swift` — the exact "Models/Sync-read/
  Feed" set the WP-14 brief asked for, same pattern as the pre-existing
  `DesignTokens.swift` entry.
- **`ZenjiTests`**: gained `Zenji/DesignTokens.swift` (Agenda's SwiftUI views
  reference `ZenjiTokens`/`.zenjiMono` directly), `Zenji/Agenda`, and
  `Zenji/Widget` — same "no `@testable import`, compile the real sources
  directly into the hostless bundle" pattern as Models/Sync/Feed already use.

### Visual proof (WP-14)

`docs/agenda-screenshot.png` — `iPhone 17 Pro` Simulator (iOS 26.5),
installed and launched via `xcrun simctl install`/`launch`, screenshotted via
`xcrun simctl io … screenshot`, running against **real, live** `zenji.app`
data (the Simulator's cache was seeded with the checked-in
`ZenjiTests/Fixtures/{events,entities,tracked,interests}.json` — verified
byte-identical to what `zenji.app` currently serves via `sha256`, sidestepping
an unrelated, pre-existing production issue where the live site's
`manifest.json` and its actually-served `events.json` are momentarily out of
sync/stale relative to each other — a CDN/deploy-cache-coherency issue on the
live site, NOT a bug in this PR's `SyncClient`, which correctly detected the
sha256 mismatch and safely discarded the corrupt download per its own
WP-12 contract). Shows: the header (wordmark · Oslo date · ticking clock),
several real day sections ("FREDAG 3. JULI" … "I DAG" … "I MORGEN"),
must-see dots, 🔔 must-watch marks, real channels, an honest "–" where a
channel isn't known, and a multi-day window ("13.–20. juli") rendering on one
line. The widget gallery screenshot was **not practically possible** in this
headless environment (no scriptable `simctl` path to add a widget to a
Simulator home screen — see "Build verification performed for this PR" above)
— noted rather than faked, per the WP-14 brief's own allowance.

## Notifications (WP-15)

`Zenji/Notifications/` schedules local push reminders for must-watch events.
The product rule this package exists to serve: **a wrong time in a push
notification is the most expensive trust violation the app can commit** — so
reminders must be few, correct, and calm.

### `NotificationPlanner.plan(...)` — the pure core

```swift
static func plan(
    previousEvents: [Event], newEvents: [Event], interests: Interests,
    now: Date, lastSync: Date?
) -> [NotificationOperation]
```

Two event snapshots in, a diff of operations out — no `UNUserNotificationCenter`,
no async, no I/O, fully unit-testable. It is keyed **exclusively** on the WP-02
stable event id (the diff contract from the WP-15 brief): the same id
reappearing with a different computed reminder is a `.reschedule`, an id that
no longer resolves to a plannable reminder (removed from the feed, or
disqualified by a gate) is a `.cancel`, and a never-before-seen plannable id is
a `.scheduleNew`. An event whose plannable content (fire date, title, body) is
**unchanged** between the two snapshots produces **no operation at all** —
reconciling never re-touches a correctly scheduled reminder on every sync.

**Who gets notified:** only events `FeedCompiler.mustWatch` rings the bell for
(WP-13) — sport-scoped, keyed off `interests.json`'s notify-entities, never an
event's own `isFavorite`/`importance`. The fire date is `event.time` minus the
lead time from `interests.notify.leadMinutes` (default 30 — the **same** lead
`scripts/build-ics.js`'s VALARM uses, so the calendar and push channels never
disagree), clamped to "now" if that instant has already passed (a normal case:
the event is close but hasn't started) rather than silently dropped.

**Quality gates**, each a hard `nil` in `plannedRequest(for:)`:

- **(a) Confidence** — `confidence == "low"` **and** `verificationStatus !=
  "confirmed"` is never planned. Any other confidence (medium/high/absent —
  non-ai-research events carry none) passes untouched.
- **(b) Verification window** — if `lastSync` is more than 6 hours old at
  planning time (or `nil` — never synced is the least verified state of all),
  the body text hedges ("Etter planen: kl. HH:mm · kanal") instead of stating
  the time as settled fact ("Kl. HH:mm · kanal").
- **(c) Already underway/passed** — `event.time <= now` is never planned; if a
  previously-plannable event's corrected time moves into the past, any
  existing plan is cancelled, not left dangling.

**Notification text** (Norwegian, calm): title = the event title; body = `"Kl.
HH:mm · kanal"` in Europe/Oslo time, with an honest `"Kanal ukjent"` when
`streaming` is empty — never invented. No emoji (the web's 🔔 marks the bell
*inline*, not inside a push body).

### `NotificationScheduling` — the thin OS shell

A protocol wrapping `UNUserNotificationCenter`
(`requestAuthorizationIfNeeded()` / `schedule(_:)` / `cancel(id:)`), so tests
substitute `RecordingNotificationScheduler` (`ZenjiTests/`, logs every call)
instead of touching the real, global center — `ZenjiTests` is a hostless logic
bundle; a real center call would need a running app and prompt the actual OS
permission dialog. `UNUserNotificationScheduler` is the production
implementation. Permission is requested **lazily**, inside
`NotificationPlanner.reconcile(...)`, and only when the computed plan actually
wants to schedule or reschedule something — never at app start, and never for
a sync that only cancels or changes nothing.

### The sync hook

`ContentView.refresh()` (the same function WP-12 wired to call
`syncClient.sync()` at app start, and WP-14 rebuilt to also drive
`AgendaViewModel` — see "Agenda UI + widget (WP-14)" above) is where WP-15
plugs in: it snapshots `dataStore.loadEvents()` *before* calling `sync()`,
then — after the sync completes and the cache reflects the new data — calls
`notificationPlanner.reconcile(previousEvents:newEvents:interests:lastSync:)`
with the before/after snapshots, `dataStore.loadInterests() ?? Interests()`
(WP-15 added `interests.json` to `SyncClient.defaultFilesOfInterest` for
exactly this), and `dataStore.lastSync` (which `SyncClient` only refreshes to
"now" on an actual data change — a `.upToDate` 304 leaves it at whatever the
last real fetch was, which is precisely the "how stale is this" signal gate
(b) above needs). Note this reconcile call happens only on the app-start
`.task`, not on `AgendaView`'s pull-to-refresh (WP-14) — a manual refresh
re-syncs and recompiles the agenda but doesn't re-run the notification diff.

## Assistent — FM-lekegrind (WP-16)

`Zenji/Assistant/` is a conversational way to edit *what the app follows*:
type a Norwegian utterance ("Følg Ruud bare i Grand Slams", "slutt med
tennis", "mer sykkel i juli"), and the on-device model turns it into
structured rule mutations you review as a DIFF and confirm or reject. Reached
from a discreet speech-bubble glyph in the Tekst-TV header (`ContentView`).

### The model is behind a protocol (vendor surface = one file)

`InterestAssistant` (`Assistant/InterestAssistant.swift`) is the whole model
API the UI and pipeline see — everything else is FoundationModels-free:

- **`FoundationModelsInterestAssistant`** — the real one, Apple Intelligence
  via **FoundationModels** (iOS 26+). The **only** file that
  `import FoundationModels`. It defines the `@Generable` output schema
  (`GeneratedMutation` — `action`/`entityId`/`entityQuery`/`scope`/`weight`/
  `reason`) and a `searchEntities` **`Tool`** over the entity index, checks
  `SystemLanguageModel.default.availability`, and runs one
  `LanguageModelSession.respond(to:generating:)`. On the Simulator/CI the
  model reports `.unavailable`, mapped to a calm Norwegian message — so it
  compiles and links everywhere but only *runs* on the device.
- **`MockInterestAssistant`** — a deterministic Norwegian keyword parser used
  by every test (Apple Intelligence can't run in CI) and by SwiftUI previews.
  It is **not** a silent fallback: when Apple Intelligence is off the shipping
  app shows the honest "unavailable" banner rather than degrading to keywords.

### Entity grounding is the hard rule

A proposal is applied **only** if its `entityId` resolves in the WP-05 entity
index (`docs/data/entities.json`, via `DataStore.loadEntities()`).
`MutationGrounder.ground(_:index:profile:)` re-checks every id the model
returns — a hallucinated or free-text entity ("cricket") is **rejected**, never
applied, with a Norwegian explanation and up to three nearest-match suggestions
("Fant ikke «X» i indeksen — mente du …?"). This holds identically whether the
raw proposal came from FoundationModels or the mock.

### Pieces (all pure + unit-tested except the two UI/FM shells)

| File | What |
|---|---|
| `AssistantModels.swift` | `MutationKind`, `ProposedMutation` (raw), `GroundedMutation`/`RejectedMutation`, `AssistantAvailability`/`AssistantError` |
| `InterestProfile.swift` | `InterestRule` + `InterestProfile.applying(_:)` — the pure add/update (upsert) / remove diff; every rule keeps a Norwegian `reason` |
| `EntityIndex.swift` | exact lookup (grounding gate), tool search (Norwegian sport-word expansion), fuzzy nearest-match, the mock's utterance→entity detection |
| `MutationGrounder.swift` | the hard grounding rule, as one pure function |
| `ProfileStore.swift` | JSON persistence in Application Support (no App Group needed — works on the free-account device build); `load()` never throws |
| `MockInterestAssistant.swift` | the deterministic parser (`MockInterestParser`) |
| `FoundationModelsInterestAssistant.swift` | the real on-device model (only `import FoundationModels`) |
| `AssistantViewModel.swift` | `@MainActor @Observable` coordinator: submit → ground → confirm/reject → persist |
| `AssistantView.swift` | the one calm Tekst-TV screen (DIFF in green/amber/red tokens, "Hva jeg følger" list) |

`ProfileStore` writes `interest-profile.json` to Application Support (a
throwaway temp dir in tests). The profile is device-local — CloudKit sync is
later work (PLAN.md WP-22).

### Tests

`ZenjiTests/{MockInterestAssistant,MutationGrounder,InterestProfile,ProfileStore,EntityIndex,AssistantViewModel}Tests.swift`
(+ `AssistantTestSupport.swift`) drive the mock, never FoundationModels. They
cover the ten canonical utterances → correct mutations, entity lookup +
free-text rejection with nearest match, the diff application, persistence
round-trip, and the end-to-end view-model flow. `xcodebuild test` on the
Simulator passes **152 tests** (the 102 WP-10…15 baseline + 50 new).

### Device build (free personal account)

WP-16 needs a **physical device** with Apple Intelligence to exercise the real
model. Two free-account limits are handled by a dedicated **`ZenjiDeviceDev`**
target/scheme (added to `project.yml`) — the Simulator `Zenji` target, its
schemes and all tests are unchanged:

- **No App Groups** (unavailable on a free team): `ZenjiDeviceDev` uses an empty
  entitlements file (`ZenjiDeviceDev/ZenjiDeviceDev.entitlements`); `CacheStore`
  falls back to Application Support (its built-in fallback), `ProfileStore` uses
  it unconditionally.
- **No embedded widget** (a prior attempt failed with *"Embedded binary is not
  signed with the same certificate as the parent app"*): `ZenjiDeviceDev` has
  **no** `ZenjiWidgetExtension` dependency. The widget stays Simulator-only
  until a paid account (WP-17).
- It reuses bundle id `app.zenji.ios` (the free team already has a matching
  provisioning profile covering the device) and a distinct `PRODUCT_NAME`
  (`ZenjiDeviceDev.app`) so its product never collides with `Zenji.app`. The
  home-screen name stays "Zenji" via `CFBundleDisplayName`.

```sh
cd ios && xcodegen generate

# Build for the connected iPhone (free personal team, automatic signing):
xcodebuild -project Zenji.xcodeproj -scheme ZenjiDeviceDev \
  -destination 'platform=iOS,id=<device-id from `xcrun devicectl list devices`>' \
  -allowProvisioningUpdates CODE_SIGNING_ALLOWED=YES CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=<team> build

# Install + launch on the device (hardware UDID):
APP=~/Library/Developer/Xcode/DerivedData/Zenji-*/Build/Products/Debug-iphoneos/ZenjiDeviceDev.app
xcrun devicectl device install app --device <hardware-udid> "$APP"
xcrun devicectl device process launch --device <hardware-udid> app.zenji.ios
```

**One-time on-device trust step:** the first launch of a free-team development
build is blocked by iOS until the developer certificate is trusted manually —
*Innstillinger → Generelt → VPN og enhetsadministrering → Utviklerapp → Stol
på "Apple Development: …"*. This cannot be scripted (`devicectl launch` returns
a `Security`/"profile has not been explicitly trusted" error until it's done).
After trusting once, the app launches normally and the FM conversations can be
verified by hand (see the WP-16 PR's manual checklist).

## Architecture (what plugs in next)

WP-10 was the shell, WP-11 added the Codable models, WP-12 added sync + cache
+ background refresh, WP-13 added the FeedCompiler, WP-14 added the real
agenda UI + widget, WP-15 added the NotificationPlanner, WP-16 added the FM
assistant. Still separate, later work packages — **not implemented here**:

- **TestFlight (WP-17)** — a paid Apple Developer account, real signing, and
  re-enabling the App Group + embedded widget on device.

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
- **Interests:** `docs/data/interests.json` — the user-owned source of truth
  (`scripts/config/interests.json` on the server; `CLAUDE.md`: "the human
  edits this, AI never writes here"). Mirrored by `Interests.swift` (WP-13),
  synced by `SyncClient` and read via `DataStore.loadInterests()` (both
  WP-15 additions) — this is what `FeedCompiler.compile`/`mustWatch`
  (WP-13/14, the agenda + widget) and `NotificationPlanner` (WP-15) key off.

`Zenji/Sync/` (WP-12, above) is what actually fetches these now; before this
package the app read nothing at all.
