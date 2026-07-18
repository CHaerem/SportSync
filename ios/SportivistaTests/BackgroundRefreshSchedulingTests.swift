//
//  BackgroundRefreshSchedulingTests.swift
//  Sportivista
//
//  WP-12: the one pure, unit-testable piece of the BGAppRefreshTask layer —
//  see BackgroundRefreshScheduling.swift's doc for why the BGTaskScheduler-
//  facing wrapper itself (BackgroundRefreshScheduler.swift) is deliberately
//  NOT unit-tested.
//

import XCTest

final class BackgroundRefreshSchedulingTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_752_000_000)
    private let fourHours: TimeInterval = 4 * 60 * 60

    func testNeverSynced_requestsAsSoonAsPossible() {
        let earliest = BackgroundRefreshScheduling.earliestBeginDate(lastSync: nil, now: now, minimumInterval: fourHours)
        XCTAssertEqual(earliest, now)
    }

    func testRecentSync_pushesEarliestDateOutByTheRemainingInterval() {
        let oneHourAgo = now.addingTimeInterval(-60 * 60)
        let earliest = BackgroundRefreshScheduling.earliestBeginDate(lastSync: oneHourAgo, now: now, minimumInterval: fourHours)
        XCTAssertEqual(earliest, now.addingTimeInterval(3 * 60 * 60), "3h remaining of the 4h minimum interval")
    }

    func testStaleSync_pastTheMinimumInterval_requestsNowNotInThePast() {
        let sixHoursAgo = now.addingTimeInterval(-6 * 60 * 60)
        let earliest = BackgroundRefreshScheduling.earliestBeginDate(lastSync: sixHoursAgo, now: now, minimumInterval: fourHours)
        XCTAssertEqual(earliest, now, "must never ask the OS to run a refresh in the past")
    }

    func testExactlyAtTheMinimumInterval_requestsNow() {
        let exactly = now.addingTimeInterval(-fourHours)
        let earliest = BackgroundRefreshScheduling.earliestBeginDate(lastSync: exactly, now: now, minimumInterval: fourHours)
        XCTAssertEqual(earliest, now)
    }

    func testDefaultMinimumInterval_matchesFourHours() {
        XCTAssertEqual(BackgroundRefreshScheduling.minimumInterval, fourHours)
    }
}
