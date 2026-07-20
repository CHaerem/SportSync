//
//  AffinityTests.swift
//  SportivistaTests
//
//  WP-134 — the pure affinity function: monotone in engagement, bounded/saturating
//  so a heavy day can't dominate, dismiss-dominant (negative), unseen == 0, and
//  entity+sport combine. No store, no UI.
//

import XCTest

final class AffinityTests: XCTestCase {

    private func stat(_ kind: BehaviorKind, _ token: String, sport: Bool, total: Int) -> BehaviorStat {
        BehaviorStat(key: "behavior|\(kind.rawValue)|\(sport ? "s:" : "e:")\(token)",
                     kind: kind, token: token, isSport: sport, total: total)
    }

    func test_unseenSubjectIsZero() {
        let a = Affinity(behavior: [])
        XCTAssertEqual(a.score(entityId: "carlsen"), 0)
        XCTAssertEqual(a.score(sport: "golf"), 0)
        XCTAssertTrue(a.isEmpty)
    }

    func test_moreOpensIsHigher_monotone() {
        let few = Affinity(behavior: [stat(.open, "hovland", sport: false, total: 2)])
        let many = Affinity(behavior: [stat(.open, "hovland", sport: false, total: 10)])
        XCTAssertGreaterThan(many.score(entityId: "hovland"), few.score(entityId: "hovland"))
        XCTAssertGreaterThan(few.score(entityId: "hovland"), 0)
    }

    func test_expandOutweighsOpen() {
        let opened = Affinity(behavior: [stat(.open, "x", sport: false, total: 4)])
        let expanded = Affinity(behavior: [stat(.expand, "x", sport: false, total: 4)])
        XCTAssertGreaterThan(expanded.score(entityId: "x"), opened.score(entityId: "x"))
    }

    func test_dismissDominates_goesNegative() {
        let a = Affinity(behavior: [
            stat(.open, "x", sport: false, total: 2),
            stat(.dismiss, "x", sport: false, total: 3), // -2*3 = -6 vs +2 → net negative
        ])
        XCTAssertLessThan(a.score(entityId: "x"), 0)
    }

    func test_scoreIsBounded_saturates() {
        let huge = Affinity(behavior: [stat(.open, "x", sport: false, total: 100_000)])
        let s = huge.score(entityId: "x")
        XCTAssertLessThan(s, 1.0, "squash is bounded below 1")
        XCTAssertGreaterThan(s, 0.99, "but a very heavy signal approaches 1")
    }

    func test_squashIsOddAndZeroAtZero() {
        XCTAssertEqual(Affinity.squash(0), 0)
        XCTAssertEqual(Affinity.squash(-5), -Affinity.squash(5), accuracy: 1e-12)
    }

    func test_entityAndSportCombine() {
        let a = Affinity(behavior: [
            stat(.open, "hovland", sport: false, total: 3),
            stat(.open, "golf", sport: true, total: 5),
        ])
        // Combining the event's entity AND sport sums the raw scores → higher than either alone.
        let both = a.score(entityId: "hovland", sport: "golf")
        XCTAssertGreaterThan(both, a.score(entityId: "hovland"))
        XCTAssertGreaterThan(both, a.score(sport: "golf"))
    }

    func test_topSubjects_ranksMostEngagedFirst_excludesNonPositive() {
        let a = Affinity(behavior: [
            stat(.open, "golf", sport: true, total: 10),
            stat(.open, "chess", sport: true, total: 2),
            stat(.dismiss, "esports", sport: true, total: 5), // negative → excluded
        ])
        let top = a.topSubjects(limit: 3)
        XCTAssertEqual(top.map(\.token), ["golf", "chess"], "most-engaged first, negative dropped")
        XCTAssertTrue(top.allSatisfy { $0.isSport })
    }
}
