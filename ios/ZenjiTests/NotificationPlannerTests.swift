//
//  NotificationPlannerTests.swift
//  ZenjiTests
//
//  WP-15 acceptance: the pure `NotificationPlanner.plan(...)` diff, plus the
//  impure `reconcile(...)` wrapper against a `RecordingNotificationScheduler`
//  (no real UNUserNotificationCenter call, no OS permission prompt). Mirrors
//  the WP-15 brief's own list of required cases one-to-one — see the MARKs.
//

import XCTest

final class NotificationPlannerTests: XCTestCase {

    // MARK: - Fixtures

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    /// Tracks the football team "Lyn" (teams default to notify:true, so this
    /// arms the bell — FeedCompiler.mustWatch — for anything naming it,
    /// scoped to football) with the default 30-minute lead.
    private var interestsTrackingLyn: Interests {
        Interests(
            alwaysTrack: Interests.AlwaysTrack(
                teams: [Interests.Entity(name: "Lyn", aliases: ["Lyn Oslo"], sport: "football")]
            ),
            notify: Interests.Notify(leadMinutes: 30)
        )
    }

    private func lynEvent(
        id: String = "lyn-fram",
        time: Date,
        streaming: [StreamingChannel] = [],
        confidence: String? = nil,
        verificationStatus: String? = nil
    ) -> Event {
        EventFixtureBuilder.make(
            id: id, sport: "football", title: "Lyn – Fram", time: time,
            homeTeam: "Lyn", awayTeam: "Fram",
            confidence: confidence, verificationStatus: verificationStatus,
            streaming: streaming
        )
    }

    // MARK: - New mustWatch event → schedule with fire date = time − lead

    func testNewMustWatchEvent_schedulesWithFireDateMinusLead() {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-13T14:00:00Z") // Oslo 16:00 (CEST, +2)
        let event = lynEvent(time: kickoff)

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [
            .scheduleNew(NotificationRequest(
                id: "lyn-fram",
                title: "Lyn – Fram",
                body: "Kl. 16:00 · Kanal ukjent",
                fireDate: iso("2026-07-13T13:30:00Z") // 30 min before kickoff
            )),
        ])
    }

    func testNewMustWatchEvent_withStreaming_namesTheChannel() {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-13T14:00:00Z")
        let event = lynEvent(time: kickoff, streaming: [StreamingChannel(platform: "TV 2 Sport", url: nil, tentative: nil)])

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        guard case .scheduleNew(let request) = plan.first else {
            return XCTFail("expected a single .scheduleNew operation")
        }
        XCTAssertEqual(request.body, "Kl. 16:00 · TV 2 Sport")
    }

    // MARK: - Moved event (same id) → reschedule

    func testMovedEvent_sameID_reschedules() {
        let now = iso("2026-07-13T12:00:00Z")
        let originalKickoff = iso("2026-07-14T18:00:00Z")
        let movedKickoff = iso("2026-07-14T19:00:00Z")

        let previous = [lynEvent(time: originalKickoff)]
        let updated = [lynEvent(time: movedKickoff)]

        let plan = NotificationPlanner.plan(
            previousEvents: previous, newEvents: updated, interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [
            .reschedule(NotificationRequest(
                id: "lyn-fram",
                title: "Lyn – Fram",
                body: "Kl. 21:00 · Kanal ukjent", // 19:00Z = Oslo 21:00 (CEST)
                fireDate: movedKickoff.addingTimeInterval(-30 * 60)
            )),
        ])
    }

    // MARK: - Removed event → cancel

    func testRemovedEvent_cancels() {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-14T18:00:00Z")
        let previous = [lynEvent(time: kickoff)]

        let plan = NotificationPlanner.plan(
            previousEvents: previous, newEvents: [], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [.cancel(id: "lyn-fram")])
    }

    /// An event that stops qualifying — here, a data correction that
    /// replaces the tracked team entirely, same id — behaves exactly like a
    /// removal — the bell owns the decision, not mere presence in the feed.
    func testEventNoLongerMustWatch_cancelsExistingPlan() {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-14T18:00:00Z")
        let previous = [lynEvent(time: kickoff)] // homeTeam "Lyn" vs. awayTeam "Fram"
        let corrected = [
            EventFixtureBuilder.make(
                id: "lyn-fram", sport: "football", title: "Vålerenga – Fram", time: kickoff,
                homeTeam: "Vålerenga", awayTeam: "Fram"
            ),
        ]

        let plan = NotificationPlanner.plan(
            previousEvents: previous, newEvents: corrected, interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [.cancel(id: "lyn-fram")])
    }

    // MARK: - Non-mustWatch event → never planned

    func testNonMustWatchEvent_neverPlanned() {
        let now = iso("2026-07-13T12:00:00Z")
        let event = EventFixtureBuilder.make(
            id: "random-tennis", sport: "tennis", title: "Uinteressant kamp",
            time: iso("2026-07-13T14:00:00Z")
        )

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [], "no tracked entity matches — the bell never rings, so nothing is planned")
    }

    // MARK: - Low-confidence gate

    func testLowConfidenceUnconfirmed_neverPlanned() {
        let now = iso("2026-07-13T12:00:00Z")
        let event = lynEvent(time: iso("2026-07-13T14:00:00Z"), confidence: "low", verificationStatus: nil)

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [], "confidence:low without an explicit confirmed re-check must never be planned")
    }

    func testLowConfidenceButConfirmed_isPlanned() {
        let now = iso("2026-07-13T12:00:00Z")
        let event = lynEvent(time: iso("2026-07-13T14:00:00Z"), confidence: "low", verificationStatus: "confirmed")

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan.count, 1, "a low-confidence event the verify agent has explicitly confirmed passes the gate")
    }

    // MARK: - Verification window: hedge stale data instead of asserting precision

    func testStaleLastSync_hedgesBodyText() {
        let now = iso("2026-07-13T12:00:00Z")
        let sevenHoursAgo = now.addingTimeInterval(-7 * 60 * 60)
        let event = lynEvent(time: iso("2026-07-13T14:00:00Z"))

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: sevenHoursAgo
        )

        guard case .scheduleNew(let request) = plan.first else {
            return XCTFail("expected a single .scheduleNew operation")
        }
        XCTAssertEqual(request.body, "Etter planen: kl. 16:00 · Kanal ukjent")
    }

    func testNeverSynced_lastSyncNil_alsoHedges() {
        let now = iso("2026-07-13T12:00:00Z")
        let event = lynEvent(time: iso("2026-07-13T14:00:00Z"))

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: nil
        )

        guard case .scheduleNew(let request) = plan.first else {
            return XCTFail("expected a single .scheduleNew operation")
        }
        XCTAssertTrue(request.body.hasPrefix("Etter planen:"), "never having synced is the least verified state of all")
    }

    func testFreshLastSync_statesTimeAsFact() {
        let now = iso("2026-07-13T12:00:00Z")
        let oneHourAgo = now.addingTimeInterval(-60 * 60)
        let event = lynEvent(time: iso("2026-07-13T14:00:00Z"))

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: oneHourAgo
        )

        guard case .scheduleNew(let request) = plan.first else {
            return XCTFail("expected a single .scheduleNew operation")
        }
        XCTAssertEqual(request.body, "Kl. 16:00 · Kanal ukjent")
    }

    // MARK: - Passed/in-progress events are skipped

    func testPassedEvent_isNeverPlanned() {
        let now = iso("2026-07-13T12:00:00Z")
        let alreadyStarted = iso("2026-07-13T11:00:00Z") // an hour before "now"
        let event = lynEvent(time: alreadyStarted)

        let plan = NotificationPlanner.plan(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [], "an event already underway/passed must never trigger a notification")
    }

    func testEventBecomesPassed_cancelsAnyExistingPlan() {
        let now = iso("2026-07-13T12:00:00Z")
        let previous = [lynEvent(time: now.addingTimeInterval(2 * 60 * 60))] // was future when previously planned
        let corrected = [lynEvent(time: now.addingTimeInterval(-60 * 60))] // now understood to already have passed

        let plan = NotificationPlanner.plan(
            previousEvents: previous, newEvents: corrected, interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [.cancel(id: "lyn-fram")])
    }

    // MARK: - Idempotency: an unchanged event produces no operation

    func testUnchangedMustWatchEvent_producesNoOperation() {
        let now = iso("2026-07-13T12:00:00Z")
        let kickoff = iso("2026-07-14T18:00:00Z")
        let previous = [lynEvent(time: kickoff)]
        let unchanged = [lynEvent(time: kickoff)]

        let plan = NotificationPlanner.plan(
            previousEvents: previous, newEvents: unchanged, interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(plan, [], "re-touching a correctly scheduled reminder on every sync is exactly the noise the brief forbids")
    }

    // MARK: - reconcile(): executes the plan, requests permission only when needed

    func testReconcile_scheduleNew_requestsAuthorizationAndSchedules() async {
        let now = iso("2026-07-13T12:00:00Z")
        let event = lynEvent(time: iso("2026-07-13T14:00:00Z"))
        let scheduler = RecordingNotificationScheduler()
        let planner = NotificationPlanner(scheduler: scheduler)

        let operations = await planner.reconcile(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(operations.count, 1)
        XCTAssertEqual(scheduler.authorizationRequestCount, 1)
        XCTAssertEqual(scheduler.scheduledRequests.map(\.id), ["lyn-fram"])
        XCTAssertTrue(scheduler.cancelledIDs.isEmpty)
    }

    func testReconcile_cancelOnly_neverRequestsAuthorization() async {
        let now = iso("2026-07-13T12:00:00Z")
        let previous = [lynEvent(time: iso("2026-07-14T18:00:00Z"))]
        let scheduler = RecordingNotificationScheduler()
        let planner = NotificationPlanner(scheduler: scheduler)

        let operations = await planner.reconcile(
            previousEvents: previous, newEvents: [], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(operations, [.cancel(id: "lyn-fram")])
        XCTAssertEqual(scheduler.authorizationRequestCount, 0, "a cancel-only reconcile must never prompt for permission")
        XCTAssertEqual(scheduler.cancelledIDs, ["lyn-fram"])
        XCTAssertTrue(scheduler.scheduledRequests.isEmpty)
    }

    func testReconcile_nothingToDo_touchesSchedulerNotAtAll() async {
        let now = iso("2026-07-13T12:00:00Z")
        let event = EventFixtureBuilder.make(id: "untracked", sport: "tennis", title: "Uinteressant", time: iso("2026-07-13T14:00:00Z"))
        let scheduler = RecordingNotificationScheduler()
        let planner = NotificationPlanner(scheduler: scheduler)

        let operations = await planner.reconcile(
            previousEvents: [], newEvents: [event], interests: interestsTrackingLyn, now: now, lastSync: now
        )

        XCTAssertEqual(operations, [])
        XCTAssertEqual(scheduler.authorizationRequestCount, 0)
    }
}
