# Zenji — iOS app (WP-10 scaffold + WP-11 models + WP-12 sync + WP-13 feed + WP-15 notifications)

SwiftUI app **Zenji** + WidgetKit extension **ZenjiWidget**, generated with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`. WP-10
was the scaffold only (a Tekst-TV shell with no data, no networking, no feed
logic). WP-11 (see PLAN.md) added the Codable models that mirror the data
contract. WP-12 adds the sync layer — the app now actually fetches and
caches real data. WP-13 adds the FeedCompiler (the personalisation
predicates). WP-15 (below) adds local push reminders on top of it. Real
day-grouped agenda rendering (WP-14) is still not implemented here.

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
│   │   ├── DataStore.swift        read-only facade: loadEvents()/loadEntities()/loadInterests()/…
│   │   ├── BackgroundRefreshScheduling.swift   pure "when's the next refresh" function
│   │   └── BackgroundRefreshScheduler.swift    thin BGTaskScheduler wrapper (untested)
│   ├── Feed/                      WP-13: the FeedCompiler personalisation predicates
│   │   ├── FeedEvent.swift        small pure-data input the predicates read
│   │   ├── Interests.swift        Swift mirror of interests.json's predicate-relevant fields
│   │   ├── TextMatch.swift        normalize/containsName — the server text-matchers, ported
│   │   └── FeedCompiler.swift     isRelevant/mustWatch/isMustSee/isEventInWindow/collapseSeries
│   ├── Notifications/             WP-15: local push reminders for must-watch events
│   │   ├── NotificationOperation.swift   NotificationRequest + the scheduleNew/reschedule/cancel plan
│   │   ├── NotificationScheduling.swift  thin UNUserNotificationCenter wrapper behind a protocol
│   │   └── NotificationPlanner.swift     the pure plan(...) diff + the impure reconcile(...)
│   ├── Info.plist                 generated by xcodegen from project.yml properties
│   ├── Zenji.entitlements         App Group (group.app.zenji — now in active use, WP-12)
│   └── Assets.xcassets/
├── ZenjiWidget/                   WidgetKit extension target
│   ├── ZenjiWidgetBundle.swift    @main WidgetBundle entry point
│   ├── ZenjiWidget.swift          static placeholder timeline + view
│   ├── Info.plist                 generated (NSExtension → com.apple.widgetkit-extension)
│   ├── ZenjiWidget.entitlements   App Group placeholder
│   └── Assets.xcassets/
└── ZenjiTests/                    hostless logic-test bundle (Zenji/Models + Zenji/Sync +
    │                              Zenji/Feed + Zenji/Notifications sources compiled directly
    │                              in — no @testable import, no TEST_HOST)
    ├── Fixture.swift              loads the JSON fixtures below (WP-11)
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
    ├── EventFixtureBuilder.swift   builds a minimal Event via JSON round-trip, for tests (WP-15)
    ├── RecordingNotificationScheduler.swift   recording NotificationScheduling double (WP-15)
    ├── NotificationPlannerTests.swift          plan()/reconcile() acceptance tests (WP-15)
    ├── Info.plist                 generated by xcodegen
    └── Fixtures/                  FRESH snapshots, see "Model fixtures" below
        ├── events.json
        ├── entities.json
        ├── interests.json
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
   `tracked.json` / `interests.json` — the last added by WP-15 so
   `NotificationPlanner` has the real notify-config to plan against; the
   ~24 other manifest entries are agent logs, calibration data, per-sport
   source files, … irrelevant to this client) are fetched.
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
`.loadTracked() -> TrackedConfig?` / `.loadInterests() -> Interests?` (WP-15)
decode straight from the cache through `ZenjiJSON.decoder` (WP-11) and
**never throw** — a missing or corrupt cache file is not a crash, it's an
empty list (or `nil`). `DataStore.lastSync` (from `sync-state.json`) is the
"have we ever synced" flag: `nil` means never, which the UI needs to tell
apart from "synced fine, zero events right now" (a legitimate state, e.g. an
off-season day) — WP-15's `NotificationPlanner` also reads it directly, as
the "how stale is what I'm about to plan from" signal (see "Notifications"
below).

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
  WP-14.
- `Interests.swift` — the personalisation config the vectors embed (a Swift
  mirror of the fields of `scripts/config/interests.json` the predicates read).
- `FeedCompiler.swift` — the five predicates + the `compile(events:interests:
  now:)` facade (relevance filter → bell/accent annotation → series collapse →
  Europe/Oslo day grouping). The day grouping is **not** vector-covered (kept
  simple, unit-tested separately in `FeedCompilerUnitTests`).

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
# 69 tests: 49 WP-10/11/12/13 baseline + 20 WP-15
#   (17 NotificationPlannerTests + 3 DataStoreTests loadInterests() cases)
```

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
`syncClient.sync()` at app start) is the **one** WP-15 touch in that file: it
snapshots `dataStore.loadEvents()` *before* calling `sync()`, then — after the
sync completes and the cache reflects the new data — calls
`notificationPlanner.reconcile(previousEvents:newEvents:interests:lastSync:)`
with the before/after snapshots, `dataStore.loadInterests()` (WP-15 added
`interests.json` to `SyncClient.defaultFilesOfInterest` for exactly this), and
`dataStore.lastSync` (which `SyncClient` only refreshes to "now" on an actual
data change — a `.upToDate` 304 leaves it at whatever the last real fetch was,
which is precisely the "how stale is this" signal gate (b) above needs). No
other file in the agenda/UI surface is touched — WP-14 owns the rest of
`ContentView` and all of `ZenjiWidget`.

## Architecture (what plugs in next)

WP-10 was the shell, WP-11 added the Codable models, WP-12 added sync + cache +
background refresh, WP-13 added the FeedCompiler, WP-15 (above) added the
NotificationPlanner. The pieces below are still separate work packages — **not
implemented here**:

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
- **Interests:** `docs/data/interests.json` — the user-owned source of truth
  (`scripts/config/interests.json` on the server; `CLAUDE.md`: "the human
  edits this, AI never writes here"). Mirrored by `Interests.swift` (WP-13),
  synced by `SyncClient` and read via `DataStore.loadInterests()` (both WP-15
  additions) — this is what `FeedCompiler.mustWatch` and
  `NotificationPlanner` key off.

`Zenji/Sync/` (WP-12, above) is what actually fetches these now; before this
package the app read nothing at all.
