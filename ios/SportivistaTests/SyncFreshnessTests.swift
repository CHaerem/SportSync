//
//  SyncFreshnessTests.swift
//  SportivistaTests
//
//  WP-121 acceptance: the post-sync "delivery freshness" step that runs on
//  EVERY sync path (not just cold start). Three parts, each proven here:
//    1. A NON-launch sync that MOVES a must-watch event's time reschedules the
//       reminder to the NEW time — proven via SyncFreshness.run against a
//       RecordingNotificationScheduler (this is exactly what the background
//       BGAppRefreshTask + pull-to-refresh call).
//    2. The widget is reloaded on any events/entities change — proven via a
//       RecordingWidgetReloader injected through the same seam.
//    3. The foreground-sync gate is a pure function of (lastSync, now) — proven
//       with an injected clock, no scenePhase.
//  The pure `decide(from:)` matrix pins exactly which SyncResult triggers what.
//

import XCTest

final class SyncFreshnessTests: XCTestCase {

    // MARK: - Fixtures (mirror NotificationPlannerTests so the bell actually rings)

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    /// Tracks football "Lyn" (teams default to notify:true) with a 30-min lead —
    /// arms FeedCompiler.mustWatch for the Lyn event below.
    private var interestsTrackingLyn: Interests {
        Interests(
            alwaysTrack: Interests.AlwaysTrack(
                teams: [Interests.Entity(name: "Lyn", aliases: ["Lyn Oslo"], sport: "football")]
            ),
            notify: Interests.Notify(leadMinutes: 30)
        )
    }

    private func lynEvent(time: Date) -> Event {
        EventFixtureBuilder.make(
            id: "lyn-fram", sport: "football", title: "Lyn – Fram", time: time,
            homeTeam: "Lyn", awayTeam: "Fram"
        )
    }

    private func makeFreshness() -> (SyncFreshness, RecordingNotificationScheduler, RecordingWidgetReloader) {
        let scheduler = RecordingNotificationScheduler()
        let reloader = RecordingWidgetReloader()
        let freshness = SyncFreshness(
            notificationPlanner: NotificationPlanner(scheduler: scheduler),
            widgetReloader: reloader
        )
        return (freshness, scheduler, reloader)
    }

    // MARK: - Part 1+2: a non-launch sync that MOVES an event reschedules + reloads the widget

    func testNonLaunchSync_movedEvent_reschedulesToNewTime_andReloadsWidget() async {
        let now = iso("2026-07-13T12:00:00Z")
        let originalKickoff = iso("2026-07-14T18:00:00Z")
        let movedKickoff = iso("2026-07-14T19:00:00Z")
        let (freshness, scheduler, reloader) = makeFreshness()

        // This is precisely the shape the background BGAppRefreshTask + pull-to-
        // refresh feed SyncFreshness.run: a before snapshot, an after snapshot, and
        // the SyncResult saying events.json changed. NONE of it is the cold-start path.
        let ops = await freshness.run(
            result: .changedFiles(["events.json"]),
            previousEvents: [lynEvent(time: originalKickoff)],
            newEvents: [lynEvent(time: movedKickoff)],
            interests: interestsTrackingLyn,
            lastSync: now,
            now: now,
            leadTimeEnabled: true
        )

        // A reschedule (not a scheduleNew) — the client already had this id.
        guard case .reschedule(let request)? = ops.first, ops.count == 1 else {
            return XCTFail("expected exactly one .reschedule, got \(ops)")
        }
        // The reminder fires against the NEW kickoff, 30 min ahead — the whole
        // point: a moved event must never leave a push at the stale time.
        XCTAssertEqual(request.fireDate, movedKickoff.addingTimeInterval(-30 * 60))
        XCTAssertEqual(scheduler.scheduledRequests.count, 1)
        XCTAssertEqual(scheduler.scheduledRequests.first?.fireDate, movedKickoff.addingTimeInterval(-30 * 60))
        // Events changed → the widget was nudged exactly once.
        XCTAssertEqual(reloader.reloadCount, 1)
    }

    // MARK: - Part 2: entities-only change reloads the widget but reconciles nothing

    func testEntitiesOnlyChange_reloadsWidget_butDoesNotReconcile() async {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-14T18:00:00Z")
        let (freshness, scheduler, reloader) = makeFreshness()

        let ops = await freshness.run(
            result: .changedFiles(["entities.json"]),
            previousEvents: [lynEvent(time: kickoff)],
            newEvents: [lynEvent(time: kickoff)],
            interests: interestsTrackingLyn,
            lastSync: now, now: now, leadTimeEnabled: true
        )

        XCTAssertTrue(ops.isEmpty, "entities-only change must not reconcile reminders")
        XCTAssertTrue(scheduler.scheduledRequests.isEmpty)
        XCTAssertEqual(scheduler.authorizationRequestCount, 0, "no reconcile ⇒ no permission prompt")
        XCTAssertEqual(reloader.reloadCount, 1, "the widget still reloads on an entities change")
    }

    // MARK: - Part 2: a 304/no-op sync touches neither

    func testUpToDateSync_reloadsNothing_reconcilesNothing() async {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-14T18:00:00Z")
        let (freshness, scheduler, reloader) = makeFreshness()

        let ops = await freshness.run(
            result: .upToDate,
            previousEvents: [lynEvent(time: kickoff)],
            newEvents: [lynEvent(time: kickoff)],
            interests: interestsTrackingLyn,
            lastSync: now, now: now, leadTimeEnabled: true
        )

        XCTAssertTrue(ops.isEmpty)
        XCTAssertTrue(scheduler.scheduledRequests.isEmpty)
        XCTAssertEqual(reloader.reloadCount, 0, "a 304 changed nothing — no widget reload")
    }

    // MARK: - Part 1: an UNCHANGED reminder is never re-touched, even when events.json is flagged changed

    func testEventsChanged_butReminderUnchanged_reloadsWidgetButSchedulesNothing() async {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-14T18:00:00Z")
        let (freshness, scheduler, reloader) = makeFreshness()

        // events.json changed (some OTHER event moved), but our Lyn reminder is
        // byte-identical before/after — reconcile must produce no operation.
        let ops = await freshness.run(
            result: .changedFiles(["events.json"]),
            previousEvents: [lynEvent(time: kickoff)],
            newEvents: [lynEvent(time: kickoff)],
            interests: interestsTrackingLyn,
            lastSync: now, now: now, leadTimeEnabled: true
        )

        XCTAssertTrue(ops.isEmpty, "an unchanged reminder is never rescheduled")
        XCTAssertTrue(scheduler.scheduledRequests.isEmpty)
        XCTAssertEqual(reloader.reloadCount, 1, "events.json changed ⇒ widget still reloads")
    }

    // MARK: - The pure decision matrix

    func testDecideMatrix() {
        func decide(_ r: SyncResult) -> SyncFreshness.Decision { SyncFreshness.decide(from: r) }

        XCTAssertEqual(decide(.upToDate), .init(reloadWidget: false, reconcileNotifications: false))
        XCTAssertEqual(decide(.failure(.invalidManifest)), .init(reloadWidget: false, reconcileNotifications: false))
        XCTAssertEqual(decide(.changedFiles([])), .init(reloadWidget: false, reconcileNotifications: false))
        XCTAssertEqual(decide(.changedFiles(["events.json"])), .init(reloadWidget: true, reconcileNotifications: true))
        XCTAssertEqual(decide(.changedFiles(["entities.json"])), .init(reloadWidget: true, reconcileNotifications: false))
        XCTAssertEqual(decide(.changedFiles(["tracked.json"])), .init(reloadWidget: false, reconcileNotifications: false))
        XCTAssertEqual(decide(.changedFiles(["interests.json"])), .init(reloadWidget: false, reconcileNotifications: false))
        // A mixed change reloads (events present) and reconciles (events present).
        XCTAssertEqual(decide(.changedFiles(["events.json", "tracked.json"])), .init(reloadWidget: true, reconcileNotifications: true))
    }

    // MARK: - Part 3: the foreground-sync gate (pure, clock-injected)

    func testForegroundSyncGate() {
        let now = iso("2026-07-13T12:00:00Z")

        // Never synced ⇒ the cold-start .task owns the first sync, so the gate is quiet.
        XCTAssertFalse(ForegroundSyncGate.shouldRefresh(lastSync: nil, now: now))
        // A quick return (< 15 min) ⇒ no re-sync.
        XCTAssertFalse(ForegroundSyncGate.shouldRefresh(lastSync: now.addingTimeInterval(-10 * 60), now: now))
        // Exactly at the threshold ⇒ refresh.
        XCTAssertTrue(ForegroundSyncGate.shouldRefresh(lastSync: now.addingTimeInterval(-15 * 60), now: now))
        // Well past ⇒ refresh.
        XCTAssertTrue(ForegroundSyncGate.shouldRefresh(lastSync: now.addingTimeInterval(-3 * 60 * 60), now: now))
    }

    func testForegroundStalenessConstant_isFifteenMinutes() {
        XCTAssertEqual(ForegroundSyncGate.staleness, 15 * 60)
    }
}
