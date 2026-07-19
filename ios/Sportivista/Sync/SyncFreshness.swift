//
//  SyncFreshness.swift
//  Sportivista
//
//  WP-121 — the post-sync "delivery freshness" step shared by EVERY sync path
//  (cold-start ContentView.refresh, the background BGAppRefreshTask, and
//  pull-to-refresh): after a sync, keep the home-screen widget and the
//  scheduled push reminders as fresh as the cache the sync just wrote.
//
//  Two 🔴 findings from the WP-118 kjernefunksjonalitet-audit motivated it:
//    1. `NotificationPlanner.reconcile` had ONE call site (cold start only), so
//       a background/pull sync that MOVED an event left its push at the old time
//       — "feil tid i et push-varsel er det dyreste tillitsbruddet appen kan begå".
//    2. `WidgetCenter.reloadAllTimelines()` had ZERO call sites, so the widget
//       could sit up to ~24h behind (its own reload policy only fires at the
//       Oslo day boundary).
//
//  Pure/impure split, like the rest of the codebase: `decide(from:)` is a pure
//  function of the SyncResult (unit-tested directly), and `run(...)` performs the
//  decided actions against injected seams (a `WidgetReloading` + a
//  `NotificationPlanner`), so tests verify BOTH with a recording widget reloader
//  and a RecordingNotificationScheduler — no running app, no real WidgetKit host,
//  no OS permission prompt. The notification planning/diff semantics themselves
//  are untouched (WP-121 non-goal): `run` just calls the existing, proven
//  `reconcile` with the same quality gates the cold-start path uses.
//

import Foundation

struct SyncFreshness: Sendable {
    /// The files whose change means the widget must rebuild: its timeline reads
    /// events (and, through the feed, entities). tracked/interests never reach
    /// the widget's timeline, so a change to only those is not a widget reload.
    static let widgetInputs: Set<String> = ["events.json", "entities.json"]
    /// The file whose change means reminders must be reconciled: reminders are
    /// keyed off events (their time/streaming/mustWatch), nothing else.
    static let notificationInputs: Set<String> = ["events.json"]

    var notificationPlanner: NotificationPlanner
    var widgetReloader: WidgetReloading

    init(
        notificationPlanner: NotificationPlanner = NotificationPlanner(),
        widgetReloader: WidgetReloading = WidgetCenterReloader()
    ) {
        self.notificationPlanner = notificationPlanner
        self.widgetReloader = widgetReloader
    }

    // MARK: - Pure decision (unit-testable, no seams needed)

    struct Decision: Equatable {
        var reloadWidget: Bool
        var reconcileNotifications: Bool
    }

    /// What a completed sync should trigger, from the files it actually wrote.
    /// A 304 (`upToDate`) or a manifest `failure` wrote nothing → no work. This
    /// is the SAME signal ContentView.refresh already keys off (`SyncResult`),
    /// so the three sync paths agree on when freshness work is needed.
    static func decide(from result: SyncResult) -> Decision {
        let changed: Set<String>
        switch result {
        case .changedFiles(let files): changed = Set(files)
        case .upToDate, .failure: changed = []
        }
        return Decision(
            reloadWidget: !changed.isDisjoint(with: widgetInputs),
            reconcileNotifications: !changed.isDisjoint(with: notificationInputs)
        )
    }

    // MARK: - Execution (impure — the only part that touches the seams)

    /// Perform the freshness actions a completed sync calls for: reload the
    /// widget when its inputs changed, then reconcile reminders when events
    /// changed (using the before/after snapshots the caller took around the
    /// sync). Returns the notification operations for tests. `plain` values
    /// (not autoclosures) keep this unambiguously `Sendable` across the
    /// main-actor → nonisolated hop the pull/background callers make.
    @discardableResult
    func run(
        result: SyncResult,
        previousEvents: [Event],
        newEvents: [Event],
        interests: Interests,
        lastSync: Date?,
        now: Date = Date(),
        leadTimeEnabled: Bool
    ) async -> [NotificationOperation] {
        let decision = Self.decide(from: result)
        if decision.reloadWidget {
            widgetReloader.reloadAllTimelines()
        }
        guard decision.reconcileNotifications else { return [] }
        return await notificationPlanner.reconcile(
            previousEvents: previousEvents,
            newEvents: newEvents,
            interests: interests,
            now: now,
            lastSync: lastSync,
            leadTimeEnabled: leadTimeEnabled
        )
    }
}

/// WP-121 — the pure gate for foreground data-refresh. When the app becomes
/// active (`scenePhase == .active`) the audit's third finding wants a full
/// refresh if the cache has gone stale — but only then, so a quick app-switch
/// doesn't hammer the network (the cold-start `.task` and the BGAppRefreshTask
/// cover the rest). Split out as a pure function so it is testable with an
/// injected clock (no scenePhase, no real time).
enum ForegroundSyncGate {
    /// How stale the cache may get before becoming active re-syncs it. Chosen
    /// well under the research agent's 4h cadence so the board is never more
    /// than a few minutes behind when the user actually opens the app, without
    /// re-fetching on every glance.
    static let staleness: TimeInterval = 15 * 60

    /// Whether becoming active should trigger a full refresh: only when we have
    /// synced before AND it was at least `staleness` ago. A never-synced cache
    /// (`nil`) is left to the cold-start `.task` refresh — returning `false`
    /// here avoids double-syncing at launch, where scenePhase also flips to
    /// `.active` right as `.task` is already fetching.
    static func shouldRefresh(lastSync: Date?, now: Date, staleness: TimeInterval = staleness) -> Bool {
        guard let lastSync else { return false }
        return now.timeIntervalSince(lastSync) >= staleness
    }
}
