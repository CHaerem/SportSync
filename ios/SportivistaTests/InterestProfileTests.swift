//
//  InterestProfileTests.swift
//  SportivistaTests
//
//  WP-16 acceptance — diff application on the profile. Add/update are upserts
//  keyed on entityId (never a duplicate rule per entity); remove drops or
//  no-ops; addedAt is preserved across an update but stamped on a first add;
//  the reason is always retained. Pure — no store, no model.
//

import XCTest

final class InterestProfileTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func entity(_ id: String) -> Entity { index.entity(id: id)! }

    private func add(_ id: String, scope: String? = nil, weight: Double = 0.5, reason: String = "r", now: Date) -> GroundedMutation {
        GroundedMutation(kind: .add, entity: entity(id), scope: scope, weight: weight, reason: reason, previousRule: nil)
    }

    func test_add_createsRuleWithAllFields() {
        let now = Date(timeIntervalSince1970: 1_000)
        let profile = InterestProfile().applying(
            add("casper-ruud", scope: "bare i Grand Slams", weight: 0.6, reason: "fordi Ruud", now: now),
            now: now
        )
        XCTAssertEqual(profile.rules.count, 1)
        let rule = profile.rules[0]
        XCTAssertEqual(rule.entityId, "casper-ruud")
        XCTAssertEqual(rule.entityName, "Casper Ruud")
        XCTAssertEqual(rule.sport, "tennis")
        XCTAssertEqual(rule.scope, "bare i Grand Slams")
        XCTAssertEqual(rule.weight, 0.6)
        XCTAssertEqual(rule.reason, "fordi Ruud")
        XCTAssertEqual(rule.addedAt, now)
    }

    func test_addSameEntityTwice_upsertsAndKeepsAddedAt() {
        let t1 = Date(timeIntervalSince1970: 1_000)
        let t2 = Date(timeIntervalSince1970: 2_000)
        var profile = InterestProfile().applying(add("casper-ruud", scope: "gammel", weight: 0.4, now: t1), now: t1)
        profile = profile.applying(
            GroundedMutation(kind: .update, entity: entity("casper-ruud"), scope: "ny", weight: 0.9, reason: "endret", previousRule: profile.rules[0]),
            now: t2
        )
        XCTAssertEqual(profile.rules.count, 1, "upsert, not duplicate")
        XCTAssertEqual(profile.rules[0].scope, "ny")
        XCTAssertEqual(profile.rules[0].weight, 0.9)
        XCTAssertEqual(profile.rules[0].addedAt, t1, "original addedAt preserved across update")
    }

    func test_remove_dropsRule() {
        let now = Date(timeIntervalSince1970: 1_000)
        var profile = InterestProfile()
            .applying(add("casper-ruud", now: now), now: now)
            .applying(add("magnus-carlsen", now: now), now: now)
        XCTAssertEqual(profile.rules.count, 2)

        profile = profile.applying(
            GroundedMutation(kind: .remove, entity: entity("casper-ruud"), scope: nil, weight: 0.5, reason: "slutt", previousRule: nil),
            now: now
        )
        XCTAssertEqual(profile.rules.map(\.entityId), ["magnus-carlsen"])
    }

    func test_removeMissing_isNoOp() {
        let now = Date(timeIntervalSince1970: 1_000)
        let profile = InterestProfile().applying(add("casper-ruud", now: now), now: now)
        let after = profile.applying(
            GroundedMutation(kind: .remove, entity: entity("magnus-carlsen"), scope: nil, weight: 0.5, reason: "x", previousRule: nil),
            now: now
        )
        XCTAssertEqual(after, profile)
    }

    func test_rulesSortedBySportThenName() {
        let now = Date(timeIntervalSince1970: 1_000)
        let profile = InterestProfile()
            .applying(add("magnus-carlsen", now: now), now: now)   // chess
            .applying(add("casper-ruud", now: now), now: now)      // tennis
            .applying(add("viktor-hovland", now: now), now: now)   // golf
        // chess < golf < tennis alphabetically by sport tag
        XCTAssertEqual(profile.rules.map(\.sport), ["chess", "golf", "tennis"])
    }

    func test_batchApply() {
        let now = Date(timeIntervalSince1970: 1_000)
        let profile = InterestProfile().applying([
            add("casper-ruud", now: now),
            add("magnus-carlsen", now: now)
        ], now: now)
        XCTAssertEqual(Set(profile.rules.map(\.entityId)), ["casper-ruud", "magnus-carlsen"])
    }
}
