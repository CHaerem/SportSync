# Zenji — iOS app

SwiftUI app **Zenji** + WidgetKit extension **ZenjiWidget**, generated with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`. The app is a
pure consumer of the same static JSON the web dashboard reads (published to GitHub
Pages) — no separate backend, per the zero-infrastructure constraint in `CLAUDE.md`.
It syncs that data into an on-disk cache, compiles a personalised, day-grouped
Tekst-TV agenda + home-screen widget, sends calm local reminders, and hosts an
on-device (Foundation Models) assistant that edits *what you follow* and answers
questions over your own local data.

This README is a **subsystem map** — one section per directory in `Zenji/`, plus
targets/signing and testing. The per-work-package build narrative lives in git/PR
history, not here.

## Generate, open, build

```sh
brew install xcodegen        # once, if not already installed
cd ios
xcodegen generate            # writes Zenji.xcodeproj (gitignored — never check it in)
open Zenji.xcodeproj         # or build/test from the CLI:

xcodebuild -scheme Zenji -destination 'generic/platform=iOS Simulator' build
xcodebuild -scheme ZenjiWidgetExtension -destination 'generic/platform=iOS Simulator' build
xcodebuild test -project Zenji.xcodeproj -scheme Zenji \
  -destination 'platform=iOS Simulator,name=<a device from `xcrun simctl list devices available`>'
```

`Zenji.xcodeproj` (and `xcuserdata/`, `DerivedData/`) are gitignored via a
directory-scoped `ios/.gitignore` — **regenerate from `project.yml` after every
pull**. `xcodegen generate` also rewrites the three `Info.plist` files from the
`info.properties` blocks in `project.yml` (XcodeGen owns them — edit the
properties, never the generated plists).

## Targets, schemes & signing

`project.yml` (checked-in source of truth) declares four targets + three schemes:

| Target | Type | Scheme | Notes |
|---|---|---|---|
| `Zenji` | application | `Zenji` | The Simulator app; embeds `ZenjiWidgetExtension`. Sources: the whole `Zenji/` tree. |
| `ZenjiWidgetExtension` | app-extension | `ZenjiWidgetExtension` | The widget. Compiles a deliberate subset of `Zenji/` (see [Widget](#widget)). |
| `ZenjiTests` | unit-test bundle | (runs under `Zenji`) | Hostless logic bundle — see [Testing](#testing). |
| `ZenjiDeviceDev` | application | `ZenjiDeviceDev` | Device build under a **free** Apple team — see below. |

- **Bundle ids:** `app.zenji.ios` (app + `ZenjiDeviceDev`), `.widget`, `.tests`.
  **Deployment target:** iOS 26.0 everywhere; Swift 6.0.
- **Deep-link scheme:** `zenji://` (`CFBundleURLTypes`) — the custom scheme the
  profile-share QR / link opens, so no Associated-Domains entitlement (and no paid
  account) is needed.

### Signing

The base config uses `CODE_SIGN_STYLE: Automatic` with
`CODE_SIGNING_ALLOWED/REQUIRED: NO` and no `DEVELOPMENT_TEAM` — the app builds and
runs on the **Simulator with no Apple Developer account**. Each target still points
`CODE_SIGN_ENTITLEMENTS` at its App Group entitlements file (`group.app.zenji`, in
`Zenji.entitlements` + `ZenjiWidget.entitlements` — the shared cache container the
app writes and the widget reads, fallback under [Sync](#sync)), so enabling real
signing for TestFlight (WP-17) is just flipping those two settings back on and
filling in a team ID.

### `ZenjiDeviceDev` — running on a physical iPhone with a free account

A device-flavoured build of the same app sources (so it includes the on-device
Foundation Models code, which only *runs* on real hardware), handling two
free-team constraints without touching the Simulator setup: **no App Groups**
(empty entitlements file → `CacheStore`/`ProfileStore` use Application Support) and
**no embedded widget** (a prior attempt failed *"Embedded binary is not signed with
the same certificate as the parent app"* — so no `ZenjiWidgetExtension` dependency;
the widget stays Simulator-only until WP-17). It reuses bundle id `app.zenji.ios`
(the free team's existing provisioning profile) with a distinct `PRODUCT_NAME` so
its product never collides with `Zenji.app` (home-screen name stays "Zenji").

```sh
cd ios && xcodegen generate
xcodebuild -project Zenji.xcodeproj -scheme ZenjiDeviceDev \
  -destination 'platform=iOS,id=<device-id from `xcrun devicectl list devices`>' \
  -allowProvisioningUpdates CODE_SIGNING_ALLOWED=YES CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=<team> build
APP=~/Library/Developer/Xcode/DerivedData/Zenji-*/Build/Products/Debug-iphoneos/ZenjiDeviceDev.app
xcrun devicectl device install app --device <hardware-udid> "$APP"
xcrun devicectl device process launch --device <hardware-udid> app.zenji.ios
```

**One-time on-device trust step:** iOS blocks the first launch of a free-team build
until the developer certificate is trusted manually (*Innstillinger → Generelt →
VPN og enhetsadministrering → Utviklerapp → Stol på …* — can't be scripted). After
that the app launches normally and the Foundation Models flows can be verified by
hand.

## Directory layout

```
ios/
├── project.yml                    XcodeGen spec — source of truth, checked in
├── .gitignore                     scoped to ios/: *.xcodeproj, xcuserdata, DerivedData
├── Zenji/                         app target
│   ├── ZenjiApp.swift             @main entry point
│   ├── ContentView.swift          Tekst-TV header + live line + AgendaView host + sync/notify hook
│   ├── DesignTokens.swift         shared Tekst-TV tokens (also used by widget + tests)
│   ├── ThemeOverride.swift        manual system/dark/light override enum (pure)
│   ├── Interaction.swift          shared ≥44pt tap-target helpers
│   ├── Models/                    Codable models mirroring the data contract
│   ├── Sync/                      manifest-diff sync + cache + background refresh
│   ├── Feed/                      FeedCompiler + agenda formatting + lens renderer
│   ├── Agenda/                    the day-grouped agenda UI + detail sheets
│   ├── Widget/                    the widget's pure timeline logic
│   ├── Notifications/             local push reminders for must-watch events
│   ├── Assistant/                 on-device (Foundation Models) assistant
│   ├── Profile/                   local interest profile: sync, share, reset, effective-merge
│   ├── Memory/                    personal memory (facts/episodic/behaviour) + spoiler shield
│   ├── Onboarding/                first-run gate + starter packs + flow
│   ├── Demo/                      DEBUG-only screenshot-harness seeds (app-only)
│   ├── Info.plist                 generated by xcodegen
│   ├── Zenji.entitlements         App Group (group.app.zenji)
│   └── Assets.xcassets/
├── ZenjiWidget/                   WidgetKit extension: ZenjiWidgetBundle + ZenjiWidget
│   │                              (TimelineProvider), Info.plist, entitlements (App Group)
├── ZenjiDeviceDev/                free-account device build: Info.plist + empty entitlements
└── ZenjiTests/                    hostless logic-test bundle (*Tests.swift + doubles +
                                   Fixtures/ frozen snapshots) — see Testing
```

## Design tokens

`Zenji/DesignTokens.swift` — the Tekst-TV (teletext) identity carried over from
`docs/css/base.css` (mono, amber-led, near-black dark with a warm-paper light
sibling), kept 1:1 with the `DESIGN.md` token table.

| Token | Dark (default) | Light ("warm paper") |
|---|---|---|
| Background | `#0A0A0C` | `#F5F1E6` |
| Foreground | `#E8E6E0` | `#1D1B15` |
| Accent (amber) | `#FFB000` | `#8F6400` |

Plus `surface` / `muted` / `hairline` / `live`. `ZenjiTokens.background` /
`.foreground` / `.accent` are dynamic `Color`s following the system colour scheme;
`Font.zenjiMono(size:weight:)` is the one monospaced typeface used everywhere.

**`ThemeOverride.swift`** — a `String`-backed enum (`system`/`dark`/`light`) with a
tap-cycle, a `colorScheme: ColorScheme?` fed to `.preferredColorScheme`, a
quantized header glyph (`◐`/`●`/`○`) and an `@AppStorage` key. Applied once at the
`ContentView` window root, so it cascades to every `.sheet` and survives a fresh
launch. The widget does **not** compile it (a WidgetKit extension follows the OS's
own per-surface appearance). **`Interaction.swift`** gives every interactive glyph
a HIG ≥44×44pt hit area (`.zenjiTapTarget()` / `ZenjiActionButtonStyle`; owner
finding: "veldig små knapper").
Screenshots: `docs/design-v2/theme-toggle-*.png`, `docs/design-v2/tap-targets-*.png`.

## Models

`Zenji/Models/` is the Swift mirror of the data contract — it turns raw JSON into
typed values, nothing more (no networking, no feed logic).

- `ZenjiJSON.swift` — the one shared `JSONDecoder`; its only job beyond the
  default is dates: real `events.json` carries ISO 8601 both with fractional
  seconds (JS `toISOString()`) and without (hand-written agent output), so the
  decoder tries the fractional formatter first and falls back to whole-second.
- `Event.swift` — mirrors `events.schema.json` field-for-field (with
  `StreamingChannel`/`Participant`/`NorwegianPlayer`/`FeaturedGroup`);
  `Entity.swift` (`entities.json`), `Manifest.swift` (`manifest.json`),
  `TrackedConfig.swift` (`tracked.json`).

**Forward compatibility:** unknown JSON keys are ignored automatically. Where the
pipeline always writes a field the schema doesn't strictly require,
`Event`/`Entity`/`TrackedConfig.Entry` use hand-written `init(from:)` with
`decodeIfPresent(...) ?? default`. Enum-like string fields (`confidence`, `status`,
`source`, entity `type`, …) stay plain `String`, not closed Swift enums, so a new
server value decodes gracefully on an older client rather than crashing the event.

### Model fixtures

`ZenjiTests/Fixtures/` holds **checked-in, deliberately-frozen snapshots** of the
real `events` / `entities` / `manifest` / `tracked` / `interests` JSON (each
verified byte-identical to the live site via sha256 when added). They are the
Swift side's fasit for the contract — update them by deliberately re-copying the
live files and committing the diff, **never** by an automated job.

## Sync

`Zenji/Sync/` is the app's **only** networking code — everything else reads from the
on-disk cache it maintains. **The manifest-diff flow** (`SyncClient.sync() async ->
SyncResult`):

1. **GET `manifest.json`** from `baseURL` (default `https://zenji.app/data/`,
   injectable) with `If-None-Match` set to the persisted ETag.
2. **304 → `.upToDate`**, no further requests — the common case after the first sync.
3. **200 → decode** with `Manifest`, diff its per-file `sha256` against
   `SyncState.appliedFiles` (a **reconciled** snapshot of what the cache has actually
   applied, *not* a copy of the last server manifest), and fetch only files that
   changed **and** are in `filesOfInterest` (`events`/`entities`/`tracked`/
   `interests`.json — the ~24 other manifest entries are irrelevant here).
4. Each fetched file is **verified against the manifest's declared sha256**
   (`Checksum.swift`, CryptoKit) before it is trusted, then written **atomically**.
   A mismatch or network hiccup silently discards that one file, leaves the old copy
   alone, and carries its **old** manifest entry forward — so a flaky file is retried
   next sync, never wrongly "already applied" nor failing the whole sync.
5. Persists the new ETag + reconciled snapshot + `lastSync`, and returns
   `.upToDate`, `.changedFiles([String])` (exactly the files written this run), or
   `.failure(SyncError)` (the manifest fetch failed — cache + state untouched).

**`CacheStore`** prefers the `group.app.zenji` App Group container, falling back to
Application Support when it's unavailable (a free-account device build). Since the
Simulator resolves the container even for an unsigned build, `CacheStoreTests`
proves the fallback via a `FileManager` subclass returning `nil`. **`DataStore`** is
the read-only facade: `loadEvents()`/`loadEntities()`/`loadTracked()`/
`loadInterests()` decode from the cache and **never throw** (a missing/corrupt file
is an empty list or `nil`); `DataStore.lastSync` is the "have we ever synced" flag
(`nil` = never) the UI and `NotificationPlanner` read for staleness.

**Background refresh** is split pure/impure:
`BackgroundRefreshScheduling.earliestBeginDate(...)` is a *pure*, unit-tested
function ("when should the next refresh run" — never sooner than the research
agent's 4-hourly cadence); `BackgroundRefreshScheduler` is the thin
`BGTaskScheduler` wrapper (`register(...)` from `ZenjiApp.init()`,
`scheduleNextRefresh(...)`). Requires `app.zenji.refresh` in
`BGTaskSchedulerPermittedIdentifiers` and `UIBackgroundModes: [fetch]`
(`project.yml`).

## Feed

`Zenji/Feed/` is the Swift port of the personalisation semantics — which events
reach the feed, which get the bell/accent, how the window behaves, how stage races
collapse. Its one hard acceptance criterion: it reproduces **every** golden
feed-vector (`tests/fixtures/feed-vectors/`, referenced directly from `project.yml`,
never copied) **bit-for-bit**, including the four pinned server/client divergences
(`DIVERGENCES.md`) — reproduced, never "fixed".

**There is no single "special?" predicate — there are five,** each ported faithful
to the side that owns it (server and client intentionally differ):

| Predicate | Question | Ported from |
|---|---|---|
| `isRelevant` | In the feed at all? | server `build-events.js` (+ 14-day cutoff on `endTime ?? time`; entity match is **not** sport-scoped) |
| `mustWatch` | Reminder bell 🔔? | server `helpers.js` `mustWatchEntity` (**sport-scoped**, keyed only off `interests.json` notify-entities, word-boundary + diacritic-folded) |
| `isMustSee` | Quiet visual accent? | client `dashboard.js` `isMustSee` (naive lowercase-substring match — the pinned `"Brooklyn".contains("lyn")` behaviour is kept) |
| `isEventInWindow` | Overlaps the agenda window? | server & client, byte-identical (`s < end && e >= start`) |
| `collapseSeries` | How do stage races fold? | client `dashboard.js` (titles matching `/\betappe\b|\bstage\s*\d/i`; **4+** fold into one row) |

- `TextMatch.swift` — the server matchers as pure functions: `normalize` (NFD →
  strip `\p{M}` → lowercase, so "Barça" ≡ "Barca") and `containsName` (word-boundary,
  accent-insensitive). The accent's *naive* substring match deliberately does **not**
  route through it (its lack of folding is pinned).
- `FeedEvent.swift` / `Interests.swift` — the small pure input the predicates read
  (`time` is `Date?` so the vectors' pinned `"time": null` decodes; `init(from:)`
  bridges the real cached `[Event]`) + the mirror of the `interests.json` fields.
- `FeedCompiler.swift` — the five predicates + `compile(events:interests:now:)`
  (relevance filter → bell/accent → series collapse → Europe/Oslo day grouping) +
  `whyShown`. `AgendaFormat.swift` / `EventBridge.swift` (formatting + the
  `[Event] → [FeedEvent]` bridge) live in `Feed/` too, so the widget picks them up.
- `LensRenderer.swift` — "rad = event × deltakelse × linse": with a
  `.throughNorwegians` / `.throughAthletes` lens active a golf tournament renders
  as "Reitan teer av 14:32" rather than "The Open" — a pure rendering layer, the
  predicates and golden vectors untouched.
  Screenshots: `docs/design-v2/lens-*.png`.

## Agenda

`Zenji/Agenda/` is the real, day-grouped Tekst-TV agenda — a pure consumer of Sync's
cache and Feed's `FeedCompiler`. **`AgendaViewModel`** is `@MainActor @Observable`,
but its logic is a `nonisolated static` pure function
`buildSections(events:interests:now:) -> [AgendaSection]` (the codebase's usual
pure-core/thin-wrapper split). The chain is `DataStore → EventBridge →
FeedCompiler.compile() → AgendaFormat → day sections`. `AgendaFormat` produces the
row text — `timeLabel` ("HH:mm", or a compact "16.–19. juli" WINDOW for a multi-day
event, never a misleading bare start time), `title`, `channelLabel` (first platform
or an honest "–"), `dayLabel` ("I DAG"/"I MORGEN"/"TIRSDAG 14. JULI") and
`seriesSummary`. `buildSections` drops every day before today (I DAG always first,
no passed day; `FeedCompiler` re-homes a still-running multi-day event onto today);
`liveRows` computes the events ongoing at `now` for the live line.

**`AgendaView`** is a `List` of day `Section`s. Must-see gets the gentlest
emphasis — a 6pt amber dot, never a card; must-watch shows no inline glyph (the
varsel state is in the detail sheet); a quiet mono `ⓘ` trails only on
`ai-research` rows. Pull-to-refresh re-syncs + recompiles but does **not** run the
notification reconcile (see [Notifications](#notifications)). Tapping a row opens
`EventDetailSheet` (venue, summary, streaming as real `Link`s, the AI-provenance
block only on `ai-research` rows, a quiet varsel read-out, the spoiler-masked
`RESULTAT`, and the assistant [context actions](#assistant)) or `SeriesDetailSheet`
(the expanded stage race: every Norwegian rider de-duplicated, the next stage's
summary, every stage as its own line).

`ContentView` hosts `AgendaView` under a header ("ZENJI · dato · en stille tikkende
klokke": a `P100` page index, the amber tabular clock, the `»_` assistant glyph, the
theme glyph) + a quiet `▌ LIVE …` line (invisible when nothing is on).
Screenshots: `docs/design-v2/after-{dark,light}.png`.

## Widget

`Zenji/Widget/WidgetTimelineBuilder.swift` is a **pure function** (no
`import WidgetKit` — deliberate): given `[Event]` + `Interests` + "now" it returns
one `Entry` per full remaining Europe/Oslo hour, each "the next must-see event as of
that moment, else the nearest relevant upcoming one, else an honest
'Ingenting i dag'". `ZenjiWidget.swift` (the `TimelineProvider`) is the thin wrapper
reading `DataStore` (`systemSmall` + `systemMedium`, same tokens as the app). By
construction there is **no network code in the widget target**: `project.yml` gives
it `Models`/`Feed`/`DesignTokens`/`WidgetTimelineBuilder` and only the **read** half
of `Sync` — never `SyncClient`/`Checksum` nor the app-only subsystems.

## Notifications

`Zenji/Notifications/` schedules local push reminders for must-watch events —
**a wrong time in a push is the most expensive trust violation the app can commit**,
so reminders are few, correct, and calm. **`NotificationPlanner.plan(...)`** is the
pure core: two event snapshots in, a diff of `[NotificationOperation]` out (no
`UNUserNotificationCenter`, no async, no I/O). Keyed **exclusively** on the WP-02
stable event id: same id + a different
computed reminder = `.reschedule`; an id that no longer resolves to a plannable
reminder = `.cancel`; a never-seen plannable id = `.scheduleNew`; **unchanged**
content = **no operation** (reconciling never re-touches a correct reminder).

- **Who:** only events `FeedCompiler.mustWatch` rings the bell for. Fire date =
  `event.time` minus `interests.notify.leadMinutes` (default 30 — the **same** lead
  `scripts/build-ics.js`'s VALARM uses, so calendar + push never disagree), clamped
  to "now" if already passed.
- **Quality gates** (each a hard `nil`): (a) `confidence == "low"` **and**
  `verificationStatus != "confirmed"` is never planned; (b) if `lastSync` is >6h old
  (or `nil`), the body hedges ("Etter planen: …") instead of stating the time as
  settled fact; (c) `event.time <= now` is never planned.
- **Text** (Norwegian, calm): body `"Kl. HH:mm · kanal"` (Europe/Oslo), honest
  `"Kanal ukjent"` when streaming is empty — never invented, no emoji.

**`NotificationScheduling`** wraps `UNUserNotificationCenter` behind a protocol
(tests substitute `RecordingNotificationScheduler`); permission is requested
**lazily** in `reconcile(...)`, only when the plan wants to schedule — never at app
start. The sync hook `ContentView.refresh()` snapshots `loadEvents()` *before*
`sync()`, then calls `reconcile(...)` with the before/after snapshots — **only** on
the app-start `.task`, not on pull-to-refresh.

## Assistant

`Zenji/Assistant/` is a conversational way to edit *what the app follows* and ask
questions over your own local data. The principle is **"assistenten ER
grensesnittet"** — a fixed, quiet command line pinned to the bottom of the agenda
(`CommandLineView`: `»_` sigil · text field · blinking cursor), not a room behind a
button; results fade in as a flat **ark** (`AssistantPanel`).

**The model is behind the `InterestAssistant` protocol** — the vendor surface is one file:

- **`FoundationModelsInterestAssistant`** — the real one (Apple Intelligence via
  **FoundationModels**, iOS 26+), the **only** file that `import FoundationModels`:
  it defines the `@Generable` schema + tools (`searchEntities`/`searchEvents`/
  `getProfile`/`saveMemory`) and runs one `LanguageModelSession` (`.unavailable` on
  Simulator/CI).
- **`MockInterestAssistant`** / **`MockAnswerer`** — deterministic Norwegian keyword
  parsers used by every test + previews. **Not** a silent fallback: with Apple
  Intelligence off the app shows an honest "unavailable" banner, never degrading to
  keywords.

**Intent routing:** `interpret(...)` returns an `AssistantTurn` =
`.mutations([ProposedMutation])` (the edit-what-you-follow diff flow) OR
`.answer(AssistantAnswer)`. Questions are answered over **LOCAL data only** — no
cloud: `FeedQuery` reduces the relevance-filtered agenda to a queryable value.

**Entity grounding is the hard rule.** A proposal is applied **only** if its
`entityId` resolves in the WP-05 entity index; `MutationGrounder.ground(...)`
re-checks every id and **rejects** a hallucinated / free-text entity with up to
three "mente du …?" suggestions. `EntityIndex.resolve` (a ranked fuzzy resolver —
diacritic/case-folded, year-suffix-agnostic, alias/initials-aware, edit-distance ≤ 2)
backs it: a confident hit is served straight through, a partial match stays a
**tappable** suggestion that re-grounds the original proposal (intent survives —
never a dead button).

`Lens` (on the mutations + persisted `InterestRule`) gives *how* a follow is seen
a home — `.sportAsSuch` / `.throughNorwegians` / `.throughAthletes([LensAthlete])`.
**Always-explain:** when an utterance produces no confirmable change,
`AssistantExplanation.make(…)` builds an honest `understood` + `reason` note (no
bare "fant ingen endringer"). Every utterance not turned into a mutation becomes
durable, local, private raw material in **`MisunderstoodLog`** — ONE capped JSON
file in Application Support, **no network code**, surfaced as a discreet "DET JEG
IKKE FORSTO (N)" disclosure with a "Del rapport" `ShareLink` over an **anonymised**
export. **Context actions** (`EventDetailSheet`): "Følg <entitet>" (a pre-filled
add through the same grounded flow) and "Hvorfor vises denne?"
(`FeedCompiler.whyShown`).

Screenshots: `docs/design-v2/assistant-{idle,thinking,diff,answer}-{dark,light}.png`,
driven by a DEBUG-only `ZENJI_DEMO=…` launch harness (never compiled into release).

## Profile

`Zenji/Profile/` is the on-device, human-owned interest profile the assistant edits,
plus its sync/share/reset/effective-merge machinery. **Our server never sees this**
— it is device-local, syncing only through the user's own iCloud or a QR bridge (P360).

- **`InterestProfile.swift` / `ProfileStore.swift`** — a flat list of
  `InterestRule`s (each with an always-filled Norwegian `reason`, the transparency
  contract `tracked.json` uses server-side; `applying(_:)` is the pure
  upsert/remove diff), persisted as JSON in Application Support (**no** App Group →
  works on the free-account device build). Assistant + `AgendaViewModel` share ONE.
- **`ProfileSyncModel.swift` / `ProfileMerge.swift`** — the mergeable transport
  shape + **the heart of sync**: a pure, deterministic, order-independent CRDT-like
  `merge(local, remote) → (state, push set)`, testable with **no iCloud account**
  (rules/facts/notes/counters merge LWW + tombstone).
- **`CloudKitProfileSync.swift` / `ProfileSyncCoordinator.swift`** — the real
  backend syncs to the **user's own private CloudKit database**, never our server;
  the coordinator does one offline-first round (pull → merge → push only what the
  remote is behind on). `ProfileSyncBackend.swift` is the protocol tests substitute.
- **`ProfileShareCodec.swift` / `ProfileQRCode.swift` / `ProfileSharePanel.swift`**
  — the valuable-NOW half needing **nothing but two phones**: a profile is a
  compressed base64url payload in a QR code + a `zenji://` link, imported via the
  same merge. Screenshots: `docs/design-v2/profile-share-{dark,light}.png`.
- **`EffectiveInterests.swift`** — makes "Bekreft → agendaen re-kompileres med det
  samme" real: `merge` folds the local `InterestProfile` into the SYNCED,
  server-owned `Interests` the agenda compiles from, so a confirmed mutation is live
  at once. **`ResetService.swift`** — "nullstill profil + re-onboard" (reset without
  reinstalling): one pure function clears local state through the same stores.
  Screenshots: `docs/design-v2/reset-{entry,confirm,onboarding}-{dark,light}.png`.

## Memory

`Zenji/Memory/` makes the assistant an editor who **remembers you** between
sessions (Foundation Models is stateless, so "memory" = persisted data + smart
insertion into the session). **Personal context** (how you relate to what you
follow) is kept device-local, apart from server-produced world context — the server
never gathers it. All three layers ride WP-19's `ProfileSyncState`, so memory syncs
through the user's own iCloud / QR bridge for free:

- **Structured** (`MemoryFact`, `MemoryStore`) — per entity/sport `knowledgeLevel`,
  `spoilerPolicy`, `notifyWindow`, `preference`, `note`; editable/deletable ⇒ LWW +
  tombstone.
- **Episodic** (`MemoryDistiller`) — after a conversation an FM distils ONE compact
  `@Generable` note (never a raw transcript), append-only; `MockMemoryDistiller` is
  the CI stand-in. **Behaviour** (`Counter`) — opens/expansions/dismissals per
  entity/sport; pure, no AI, grow-only.

**Retrieval is pure Swift** (no AI): `MemoryDigest.build(...)` selects the
facts/notes relevant to what's in front of the user, ages out expired notes, floats
spoiler policies to the front, caps at ~500 tokens, and is injected into the
`LanguageModelSession` instructions + the `saveMemory` tool. **Spoiler protection**
(`SpoilerShield`, a presentation layer impossible server-side) derives
spoiler-scoped sports/entities from `spoilerPolicy` facts and exposes a per-row
`spoilerSafe` flag — the detail sheet's `RESULTAT` is masked behind a calm "Skjult —
spoilervern på". **"Hva jeg vet om deg"** (`WhatIKnowView`) is the trust surface +
plain-language GDPR answer: everything remembered listed, facts editable, all
deletable, plus **"Glem alt"** (wipes memory, keeps the follow-profile).
Screenshots: `docs/design-v2/memory-{page,spoiler}-{dark,light}.png`.

## Onboarding

`Zenji/Onboarding/` is the calm first-run experience (dossier P310: "onboarding er
en samtale, ikke et skjema") — four quiet steps in the Tekst-TV language, no hero
art, no carousel, no emoji. `OnboardingGate.swift` is the pure, FM-free, I/O-free
decision layer ("should we show it / where does it start"); `StarterPacks.swift` is
the quick-picks fallback — Norwegian "startpakker" a first-timer taps to build a
profile **without** Apple Intelligence (each carrying its own entity data, the path
that must give full value on a cold start); `OnboardingView.swift` is the flow.
Screenshots:
`docs/design-v2/onboarding-{welcome,converse,quickpicks,landed}-{dark,light}.png`.

## Testing

`ZenjiTests/` is a **hostless** unit-test bundle — no `TEST_HOST`, no
`@testable import`; it compiles the real sources it exercises directly into the
bundle (every `Zenji/` subsystem, plus `DesignTokens`/`ThemeOverride`/`Interaction`),
the same trick `ZenjiWidgetExtension` uses. All tests are **network-free**:
`MockURLProtocol` (via `URLSessionConfiguration.protocolClasses`) intercepts every
request, the Foundation Models tests drive `MockInterestAssistant`/`MockAnswerer`
only, and they reuse the frozen `ZenjiTests/Fixtures/*` snapshots as decode input
and mock-server responses.

There are **42 `*Tests.swift` files (376 tests)**, at least one per subsystem —
e.g. `SyncClientTests` (304 / changed-manifest / offline / corrupt-download),
`CacheStoreTests` (App Group fallback), the `FeedCompilerUnit`/`FeedVector` pair,
`AgendaViewModelTests`, `NotificationPlannerTests`, and the Assistant / Profile /
Memory / Onboarding suites (see the `ZenjiTests/` listing for all). Run them with:

```sh
cd ios && xcodegen generate
xcodebuild test -project Zenji.xcodeproj -scheme Zenji \
  -destination 'platform=iOS Simulator,name=<a device from `xcrun simctl list devices available`>'
```

`npm test` (the repo-root JS suite) is unaffected by anything under `ios/`.

## Data contract

The iOS client is a pure consumer of the static JSON published to GitHub Pages for
the web dashboard — no separate backend. Each file has a Swift mirror in `Models/`
and is read via `DataStore`:

- **`manifest.json`** (per-file `bytes`/`sha256`, what `SyncClient` polls) →
  `Manifest.swift`; **`events.json`** (schema `events.schema.json`, draft-07) →
  `Event.swift` + supporting models, field-for-field, forward-compatible.
- **`entities.json`** (the stable-id index `Event.entityId` points into) →
  `Entity.swift`; **`tracked.json`** → `TrackedConfig.swift`.
- **`interests.json`** — the user-owned source of truth (CLAUDE.md: "the human edits
  this, AI never writes here") → `Interests.swift`; what `FeedCompiler` and
  `NotificationPlanner` key off.

## What plugs in next

- **TestFlight (WP-17)** — a paid Apple Developer account, real signing, and
  re-enabling the App Group + embedded widget on device.
