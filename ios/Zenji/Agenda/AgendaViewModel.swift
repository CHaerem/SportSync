//
//  AgendaViewModel.swift
//  Zenji
//
//  WP-14 — the agenda's data pipeline: DataStore → FeedEvent-bridge →
//  FeedCompiler.compile() → day sections, exactly the chain the WP-14 brief
//  specifies. Split, like the rest of this codebase (FeedCompiler's
//  predicates, BackgroundRefreshScheduling vs. …Scheduler), into a PURE core
//  (`buildSections`, a static function of three plain values — no disk, no
//  clock read) and a thin instance wrapper (`reloadFromCache`/`refresh`) that
//  touches DataStore/SyncClient. AgendaViewModelTests drives `buildSections`
//  directly with hand-built `[Event]`/`Interests` fixtures; nothing here
//  needs a running app to test.
//
//  `@MainActor`: this is a UI-facing view model whose `sections`/`lastSync`
//  drive SwiftUI directly, constructed and read from ContentView/AgendaView
//  (both implicitly main-actor). Under Swift 6 strict concurrency, an
//  `async` instance method on a plain, non-Sendable class can't be safely
//  called from a main-actor context (calling it would require "sending" a
//  non-Sendable `self` across an isolation boundary) — pinning the whole
//  type to `@MainActor` removes the crossing entirely, which is also simply
//  correct: this type has no business running off the main actor.
//

import Foundation
import Observation

@MainActor
@Observable
final class AgendaViewModel {
    private(set) var sections: [AgendaSection] = []
    /// Ongoing events, for the quiet "live now" line under the header
    /// (DESIGN.md §4). Empty when nothing is live — the view hides the line.
    private(set) var liveNow: [AgendaLiveRow] = []
    private(set) var lastSync: Date?
    /// WP-31 — whether the local follow-profile is empty (e.g. onboarding was
    /// skipped). Drives the agenda's empty state: an empty board with an empty
    /// profile points back at the command line ("fortell Zenji hva du følger")
    /// rather than reading as "nothing on".
    private(set) var profileIsEmpty: Bool = true

    private let dataStore: DataStore
    private let syncClient: SyncClient
    /// WP-16.4 — the SAME local profile the assistant edits. Folded into the
    /// synced interests on every recompile, so a just-confirmed "Følg X" shows
    /// up on the board immediately ("umiddelbar konsekvens"). Shared instance
    /// with AssistantViewModel via ContentView.
    private let profileStore: ProfileStore

    init(dataStore: DataStore = DataStore(), syncClient: SyncClient = SyncClient(), profileStore: ProfileStore = ProfileStore()) {
        self.dataStore = dataStore
        self.syncClient = syncClient
        self.profileStore = profileStore
    }

    /// Shows whatever is already cached immediately, then syncs and
    /// recompiles — the same "never blank while the network round-trip is in
    /// flight" shape ContentView used pre-WP-14 (WP-12), now driving the real
    /// agenda instead of a placeholder row + event count.
    func refresh(now: Date = Date()) async {
        reloadFromCache(now: now)
        _ = await syncClient.sync()
        reloadFromCache(now: now)
    }

    /// Recompiles from whatever DataStore currently has cached, with no
    /// network access — this is what pull-to-refresh's completion and the
    /// initial "show cache first" step both call. `loadInterests()` (WP-15)
    /// returns `nil` when interests.json has never synced or is corrupt;
    /// `?? Interests()` falls back to FeedCompiler's own default
    /// `followBroadly` list (see FeedCompiler.defaultFollowBroadly) rather
    /// than tracking nothing at all, so the agenda is never blank just
    /// because interests.json hasn't synced yet.
    func reloadFromCache(now: Date = Date()) {
        let events = dataStore.loadEvents()
        let baseInterests = dataStore.loadInterests() ?? Interests()
        let profile = profileStore.load()
        let index = EntityIndex(dataStore.loadEntities())
        // WP-16.4: fold the local profile in, so the board reflects what the
        // assistant just changed — this is the visible half of "Bekreft →
        // agendaen re-kompileres synlig med det samme".
        let interests = EffectiveInterests.merge(profile: profile, into: baseInterests, index: index)
        let followedIds = Set(profile.rules.map(\.entityId))
        // WP-30: the spoiler shield from personal memory (same shared profile
        // file). A pure PRESENTATION layer — it masks result/score at display
        // time and never touches the five predicates / golden vectors.
        let shield = SpoilerShield(memory: MemoryStore(profileStore: profileStore).load())
        // WP-18: the raw profile is passed ALONGSIDE the merged interests because
        // EffectiveInterests.merge folds a rule's entity into the tracked buckets
        // but drops its `lens` — and the lens is exactly what the lens-rendering
        // layer needs. So the merged `interests` drive the five predicates
        // (unchanged), and `profile` carries the per-rule lens on top.
        sections = Self.buildSections(events: events, interests: interests, now: now, index: index, followedIds: followedIds, profile: profile, shield: shield)
        liveNow = Self.liveRows(events: events, interests: interests, now: now)
        lastSync = dataStore.lastSync
        profileIsEmpty = profile.isEmpty
    }

    // MARK: - Pure core

    /// DataStore → FeedEvent-bridge → FeedCompiler.compile() → Europe/Oslo
    /// day sections. A pure function of its three inputs, per the file
    /// header above. `nonisolated` deliberately opts this (and `makeItem`
    /// below) OUT of the class's `@MainActor` isolation — it touches no
    /// instance/main-actor state at all, and AgendaViewModelTests calls it
    /// directly, synchronously, with no actor hop.
    /// WP-16.4: `index` + `followedIds` are optional (default empty) so the
    /// WP-14 unit tests that call this with just events/interests/now still
    /// compile — they simply produce empty `whyShown`/`followable`, which the
    /// agenda row itself doesn't display (those feed the detail sheet's context
    /// actions). The real app always passes them (see `reloadFromCache`).
    /// WP-18: `profile` (default empty) carries the per-rule LENS. Lens
    /// rendering is a pure post-processing layer over FeedCompiler's output —
    /// it runs AFTER relevance/must-see/must-watch/collapse (those five
    /// predicates are never touched; the golden vectors stay bit-identical) and
    /// can re-home a row to the athlete's own effective (tee) time. An empty
    /// profile, or a profile with only default (`.sportAsSuch`) lenses, leaves
    /// the output byte-for-byte identical to WP-16.4 — graceful degradation.
    nonisolated static func buildSections(events: [Event], interests: Interests, now: Date, index: EntityIndex = EntityIndex([]), followedIds: Set<String> = [], profile: InterestProfile = InterestProfile(), shield: SpoilerShield = SpoilerShield()) -> [AgendaSection] {
        let (feedEvents, lookup) = EventBridge.bridge(events)
        let feed = FeedCompiler.compile(events: feedEvents, interests: interests, now: now)
        let todayKey = FeedCompiler.osloDayKey(now)
        let tomorrowKey = FeedCompiler.osloDayKey(now.addingTimeInterval(24 * 60 * 60))

        // A placed row: one agenda item pinned to a day key + a sort time. The
        // lens layer can emit MULTIPLE rows for one event, each re-homed to the
        // athlete's OWN effective day/time (P320: the tee time overrides sort,
        // day-grouping AND display) — hence a flat placed-list plus a re-group,
        // rather than mapping FeedCompiler's day buckets in place.
        struct Placed { let dayKey: String; let sortTime: Date?; let item: AgendaItem }
        var placed: [Placed] = []

        for day in feed.days {
            for compiled in day.items {
                guard case .event(let feedEvent, let mustWatch, let mustSee) = compiled else {
                    // Series rows never lens (they are already the collapsed,
                    // athlete-agnostic view) — pass through on their own day.
                    if let item = makeItem(compiled, lookup: lookup, interests: interests, now: now, index: index, followedIds: followedIds, shield: shield) {
                        placed.append(Placed(dayKey: day.key, sortTime: compiled.time, item: item))
                    }
                    continue
                }
                guard let id = feedEvent.id, let event = lookup[id] else { continue }
                let mode = applicableLensMode(for: feedEvent, event: event, profile: profile, index: index)
                if let lensRows = LensRenderer.render(event: event, mode: mode, followedIds: followedIds) {
                    // Lens rows inherit the event's bell/accent (item 2 of the
                    // brief) and re-home to the athlete's effective day/time.
                    for lensRow in lensRows {
                        let (dayKey, sortTime) = place(lensRow, event: feedEvent, compiledDay: day.key, todayKey: todayKey)
                        let row = makeLensRow(lensRow, event: event, feedEvent: feedEvent, mustWatch: mustWatch, mustSee: mustSee, interests: interests, now: now, index: index, followedIds: followedIds, shield: shield)
                        placed.append(Placed(dayKey: dayKey, sortTime: sortTime, item: .event(row)))
                    }
                } else if let item = makeItem(compiled, lookup: lookup, interests: interests, now: now, index: index, followedIds: followedIds, shield: shield) {
                    // No lens applies → the ordinary WP-16.4 row, untouched.
                    placed.append(Placed(dayKey: day.key, sortTime: feedEvent.time, item: item))
                }
            }
        }

        // Re-group by day, drop passed days (DESIGN.md "Agendaens semantikk" §1:
        // I DAG first, never a passed day — FeedCompiler already re-homed a
        // still-running multi-day event onto today), order days ascending, and
        // sort within a day by the (effective) time. With an empty/default-lens
        // profile every placed row keeps its FeedCompiler day + event time, so
        // this reproduces the old per-day map exactly.
        var order: [String] = []
        var byDay: [String: [Placed]] = [:]
        for p in placed where p.dayKey >= todayKey {
            if byDay[p.dayKey] == nil { order.append(p.dayKey) }
            byDay[p.dayKey, default: []].append(p)
        }
        return order.sorted().map { key in
            AgendaSection(
                id: key,
                label: AgendaFormat.dayLabel(key: key, todayKey: todayKey, tomorrowKey: tomorrowKey),
                items: (byDay[key] ?? [])
                    .sorted { ($0.sortTime ?? .distantPast) < ($1.sortTime ?? .distantPast) }
                    .map(\.item)
            )
        }
    }

    // MARK: - Lens rendering (WP-18 — P320: event × deltakelse × linse)

    /// The day + sort time a lens row lands on. The athlete's effective (tee)
    /// time OVERRIDES the event's — but a STALE, past tee time must never
    /// silently drop the whole event, so it only re-homes when the tee day is
    /// today-or-later; otherwise the row keeps the event's own (already
    /// multi-day-re-homed) day and sorts on the event start. An untimed lens row
    /// (no tee time — the honest degradation) always keeps the event's day/time.
    nonisolated private static func place(_ lensRow: LensRenderer.LensRow, event feedEvent: FeedEvent, compiledDay: String, todayKey: String) -> (dayKey: String, sortTime: Date?) {
        if let eff = lensRow.effectiveTime {
            let effDay = FeedCompiler.osloDayKey(eff)
            if effDay >= todayKey { return (effDay, eff) }
        }
        return (compiledDay, feedEvent.time)
    }

    /// The LENS to render an event through: the first followed rule carrying a
    /// non-default lens whose entity actually participates in the event
    /// (`.sportAsSuch` — no lens — when there is none, the common case). Maps
    /// the Assistant `Lens` → the Feed-local `LensMode` the renderer consumes,
    /// so the renderer stays free of the Assistant module (widget-buildable).
    nonisolated static func applicableLensMode(for feedEvent: FeedEvent, event: Event, profile: InterestProfile, index: EntityIndex) -> LensMode {
        let lensed = profile.rules.filter { !$0.lens.isDefault }
        guard !lensed.isEmpty else { return .sportAsSuch }
        let hay = FeedCompiler.serverHaystack(feedEvent)
        for rule in lensed where ruleMatches(rule, event: event, hay: hay, index: index) {
            switch rule.lens {
            case .sportAsSuch:
                continue
            case .throughNorwegians:
                return .throughNorwegians
            case let .throughAthletes(athletes):
                return .throughAthletes(ids: Set(athletes.map(\.entityId)), names: athletes.map(\.name))
            }
        }
        return .sportAsSuch
    }

    /// Whether `rule`'s followed entity participates in `event`: an authoritative
    /// entity-id match on the event's players/teams, else the SAME sport-scoped
    /// name/alias word-boundary test `whyShown`/`mustWatch` use (so a golf
    /// tournament rule matches that tournament's events, a football club rule
    /// its club's matches). Falls back to the rule's cached name/sport when the
    /// entity isn't in the (maybe unsynced) index.
    nonisolated private static func ruleMatches(_ rule: InterestRule, event: Event, hay: String, index: EntityIndex) -> Bool {
        if event.norwegianPlayers.contains(where: { $0.entityId == rule.entityId }) { return true }
        if event.homeTeamEntityId == rule.entityId || event.awayTeamEntityId == rule.entityId { return true }
        let entity = index.entity(id: rule.entityId)
        let sport = entity?.sport ?? rule.sport
        if !sport.isEmpty, TextMatch.normalize(sport) != TextMatch.normalize(event.sport) { return false }
        let terms = entity.map { [$0.name] + $0.aliases } ?? [rule.entityName]
        return terms.contains { !$0.isEmpty && TextMatch.containsName(hay, $0) }
    }

    /// Build the view-ready `AgendaEventRow` for one lens row. The time column
    /// shows the athlete's effective time when present (else the event's own
    /// label — a window for a multi-day tournament); the meta line is the lens's
    /// (status verbatim / names), falling back to the event's tournament only
    /// when the lens carries none. Everything else — channel, bell, accent, AI
    /// provenance, the FULL event for the detail sheet — comes straight from the
    /// event, so the detail sheet still shows the whole event unchanged.
    nonisolated private static func makeLensRow(
        _ lensRow: LensRenderer.LensRow,
        event: Event,
        feedEvent: FeedEvent,
        mustWatch: Bool,
        mustSee: Bool,
        interests: Interests,
        now: Date,
        index: EntityIndex,
        followedIds: Set<String>,
        shield: SpoilerShield
    ) -> AgendaEventRow {
        let timeLabel = lensRow.effectiveTime.map { AgendaFormat.timeLabel(time: $0, endTime: nil) }
            ?? AgendaFormat.timeLabel(time: feedEvent.time, endTime: feedEvent.endTime)
        let spoilerSafe = shield.spoilerSafe(event: event)
        // WP-30: the lens meta detail is the athlete's status VERBATIM (score /
        // placement) — a spoiler for someone avoiding results. When not safe,
        // fall back to the neutral tournament meta so no outcome leaks into the
        // agenda row (the detail sheet handles the fuller masking + reveal).
        let neutralMeta = AgendaFormat.metaLabel(tournament: event.tournament, title: lensRow.title)
        let meta = spoilerSafe ? (lensRow.metaDetail ?? neutralMeta) : neutralMeta
        return AgendaEventRow(
            id: EventBridge.stableId(for: event) + "|" + lensRow.idSuffix,
            timeLabel: timeLabel,
            title: lensRow.title,
            metaLabel: meta,
            channelLabel: AgendaFormat.channelLabel(event.streaming),
            isMustSee: mustSee,
            mustWatch: mustWatch,
            isAIResearch: event.source == "ai-research",
            event: event,
            whyShown: FeedCompiler.whyShown(feedEvent, interests: interests),
            followable: followableEntities(for: event, index: index, followedIds: followedIds),
            spoilerSafe: spoilerSafe
        )
    }

    // MARK: - Followable entities (WP-16.4 — the detail sheet's «Følg X»)

    /// The entities this event is ABOUT that the user doesn't already follow —
    /// what a "Følg X" context action can offer. Sources, in order: the event's
    /// own stable entity ids (home/away team, Norwegian players — authoritative
    /// when present), then the home/away team & tournament NAMES resolved
    /// confidently through the index (so "Lyn" offers FK Lyn Oslo even without
    /// an id). De-duplicated, already-followed dropped, capped at three so the
    /// sheet stays calm. Empty when the index hasn't synced. Pure — testable
    /// with a hand-built index.
    nonisolated static func followableEntities(for event: Event, index: EntityIndex, followedIds: Set<String>) -> [Entity] {
        guard !index.isEmpty else { return [] }
        var ids: [String] = []
        func add(_ id: String?) { if let id, !id.isEmpty { ids.append(id) } }
        add(event.homeTeamEntityId)
        add(event.awayTeamEntityId)
        for player in event.norwegianPlayers { add(player.entityId) }
        for name in [event.homeTeam, event.awayTeam, event.tournament].compactMap({ $0 }) {
            if let served = index.resolve(name).served { ids.append(served.id) }
        }
        var seen = Set<String>()
        var out: [Entity] = []
        for id in ids where !followedIds.contains(id) && seen.insert(id).inserted {
            if let entity = index.entity(id: id) { out.append(entity) }
        }
        return Array(out.prefix(3))
    }

    // MARK: - Live now (DESIGN.md §4)

    /// The events ongoing at `now`, for the quiet "live now" line under the
    /// header — capped at two, must-see first (the amber-dot events lead, same
    /// spirit as the widget's highlight), then earliest-started. An event is
    /// "live" when its own source status says so, or — the honest fallback for
    /// the cache, which carries no live ESPN poll — when `now` sits inside its
    /// `[time, endTime]` window (so an in-progress golf major or stage still
    /// reads as live, while a single kickoff with no end time doesn't
    /// masquerade as live for hours). Only followed (relevant) events qualify.
    nonisolated static func liveRows(events: [Event], interests: Interests, now: Date) -> [AgendaLiveRow] {
        let (feedEvents, lookup) = EventBridge.bridge(events)
        let live = feedEvents.filter { fe in
            guard FeedCompiler.isRelevant(fe, interests: interests, now: now) else { return false }
            return isLiveNow(fe, event: fe.id.flatMap { lookup[$0] }, now: now)
        }
        .sorted { lhs, rhs in
            let lSee = FeedCompiler.isMustSee(lhs, interests: interests)
            let rSee = FeedCompiler.isMustSee(rhs, interests: interests)
            if lSee != rSee { return lSee }               // must-see first
            return (lhs.time ?? .distantFuture) < (rhs.time ?? .distantFuture)
        }
        return live.prefix(2).compactMap { fe -> AgendaLiveRow? in
            guard let id = fe.id, let event = lookup[id] else { return nil }
            return AgendaLiveRow(
                id: id,
                title: AgendaFormat.title(homeTeam: fe.homeTeam, awayTeam: fe.awayTeam, fallback: fe.title),
                channelLabel: AgendaFormat.channelLabel(event.streaming)
            )
        }
    }

    /// True when the event is in progress at `now` (see `liveRows`). A source
    /// `status` that names an in-progress state wins outright; otherwise the
    /// `[time, endTime]` window decides.
    nonisolated static func isLiveNow(_ fe: FeedEvent, event: Event?, now: Date) -> Bool {
        if let status = event?.status?.lowercased() {
            if status.contains("in_progress") || status.contains("in-progress")
                || status == "in" || status.contains("live") || status.contains("halftime") {
                return true
            }
        }
        guard let time = fe.time else { return false }
        let end = fe.endTime ?? time
        return time <= now && end >= now
    }

    nonisolated private static func makeItem(
        _ item: FeedCompiler.CompiledFeed.Item,
        lookup: [String: Event],
        interests: Interests,
        now: Date,
        index: EntityIndex,
        followedIds: Set<String>,
        shield: SpoilerShield
    ) -> AgendaItem? {
        switch item {
        case .event(let feedEvent, let mustWatch, let mustSee):
            // EventBridge stamps every FeedEvent.id with a non-optional
            // stableId, so this lookup should always hit; a miss (can only
            // happen if a caller hand-built a FeedEvent bypassing
            // EventBridge) safely drops the row rather than crashing.
            guard let id = feedEvent.id, let event = lookup[id] else { return nil }
            let title = AgendaFormat.title(homeTeam: feedEvent.homeTeam, awayTeam: feedEvent.awayTeam, fallback: feedEvent.title)
            return .event(AgendaEventRow(
                id: id,
                timeLabel: AgendaFormat.timeLabel(time: feedEvent.time, endTime: feedEvent.endTime),
                title: title,
                metaLabel: AgendaFormat.metaLabel(tournament: event.tournament, title: title),
                channelLabel: AgendaFormat.channelLabel(event.streaming),
                isMustSee: mustSee,
                mustWatch: mustWatch,
                isAIResearch: event.source == "ai-research",
                event: event,
                whyShown: FeedCompiler.whyShown(feedEvent, interests: interests),
                followable: followableEntities(for: event, index: index, followedIds: followedIds),
                spoilerSafe: shield.spoilerSafe(event: event)
            ))

        case .series(let series):
            let stages = series.stages
                .compactMap { $0.id.flatMap { lookup[$0] } }
                .sorted { $0.time < $1.time }
            guard let nextStageId = series.nextStage.id, let nextStage = lookup[nextStageId], !stages.isEmpty else {
                return nil
            }
            let tournamentName = series.tournament ?? series.title
            return .series(AgendaSeriesRow(
                id: series.id,
                timeLabel: AgendaFormat.timeLabel(time: series.time, endTime: nil),
                summaryLabel: AgendaFormat.seriesSummary(
                    tournament: tournamentName,
                    stageCount: stages.count,
                    lastStageEnd: stages.last?.endTime ?? stages.last?.time,
                    now: now
                ),
                channelLabel: AgendaFormat.channelLabel(nextStage.streaming),
                mustWatch: series.stages.contains { FeedCompiler.mustWatch($0, interests: interests) },
                isAIResearch: nextStage.source == "ai-research",
                tournament: tournamentName,
                stages: stages,
                nextStage: nextStage
            ))
        }
    }
}
