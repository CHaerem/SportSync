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
        sections = Self.buildSections(
            events: dataStore.loadEvents(),
            interests: dataStore.loadInterests() ?? Interests(),
            now: now
        )
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

        return feed.days.map { day in
            AgendaSection(
                id: day.key,
                label: AgendaFormat.dayLabel(key: day.key, todayKey: todayKey, tomorrowKey: tomorrowKey),
                items: day.items.compactMap { makeItem($0, lookup: lookup, interests: interests, now: now) }
            )
        }
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
            return .event(AgendaEventRow(
                id: id,
                timeLabel: AgendaFormat.timeLabel(time: feedEvent.time, endTime: feedEvent.endTime),
                title: AgendaFormat.title(homeTeam: feedEvent.homeTeam, awayTeam: feedEvent.awayTeam, fallback: feedEvent.title),
                channelLabel: AgendaFormat.channelLabel(event.streaming),
                isMustSee: mustSee,
                mustWatch: mustWatch,
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
                tournament: tournamentName,
                stages: stages,
                nextStage: nextStage
            ))
        }
    }
}
