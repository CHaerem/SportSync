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

    private let dataStore: DataStore
    private let syncClient: SyncClient

    init(dataStore: DataStore = DataStore(), syncClient: SyncClient = SyncClient()) {
        self.dataStore = dataStore
        self.syncClient = syncClient
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
        let interests = dataStore.loadInterests() ?? Interests()
        sections = Self.buildSections(events: events, interests: interests, now: now)
        liveNow = Self.liveRows(events: events, interests: interests, now: now)
        lastSync = dataStore.lastSync
    }

    // MARK: - Pure core

    /// DataStore → FeedEvent-bridge → FeedCompiler.compile() → Europe/Oslo
    /// day sections. A pure function of its three inputs, per the file
    /// header above. `nonisolated` deliberately opts this (and `makeItem`
    /// below) OUT of the class's `@MainActor` isolation — it touches no
    /// instance/main-actor state at all, and AgendaViewModelTests calls it
    /// directly, synchronously, with no actor hop.
    nonisolated static func buildSections(events: [Event], interests: Interests, now: Date) -> [AgendaSection] {
        let (feedEvents, lookup) = EventBridge.bridge(events)
        let feed = FeedCompiler.compile(events: feedEvents, interests: interests, now: now)
        let todayKey = FeedCompiler.osloDayKey(now)
        let tomorrowKey = FeedCompiler.osloDayKey(now.addingTimeInterval(24 * 60 * 60))

        // DESIGN.md "Agendaens semantikk" §1: I DAG first, then forward — and
        // NEVER a passed day. FeedCompiler already re-homes a still-running
        // multi-day event onto `todayKey` (its line "belongs under today, not
        // its past start day"), so anything still keyed to a day BEFORE today
        // is genuinely over and must not appear. `feed.days` is already sorted
        // ascending, so dropping the past days leaves I DAG (today) first.
        // (This is the agenda-specific rule; FeedCompiler stays the faithful
        // WP-13 port with its own 14-day retention window that the web's
        // results view still needs.)
        return feed.days
            .filter { $0.key >= todayKey }
            .map { day in
                AgendaSection(
                    id: day.key,
                    label: AgendaFormat.dayLabel(key: day.key, todayKey: todayKey, tomorrowKey: tomorrowKey),
                    items: day.items.compactMap { makeItem($0, lookup: lookup, interests: interests, now: now) }
                )
            }
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
        now: Date
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
                event: event
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
