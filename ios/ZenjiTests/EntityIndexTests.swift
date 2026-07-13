//
//  EntityIndexTests.swift
//  ZenjiTests
//
//  WP-16 — the grounding substrate's primitives: exact lookup, tool-facing
//  search (with Norwegian sport-word expansion), fuzzy nearest-match (the
//  "mente du …?" source), and the mock's utterance→entity detection. Proven
//  against the real entities.json fixture.
//

import XCTest

final class EntityIndexTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    func test_exactLookup() {
        XCTAssertEqual(index.entity(id: "casper-ruud")?.name, "Casper Ruud")
        XCTAssertNil(index.entity(id: "no-such-id"))
    }

    func test_search_byNameAndAlias() {
        XCTAssertTrue(index.search("Ruud").contains { $0.id == "casper-ruud" })
        XCTAssertTrue(index.search("Hovland").contains { $0.id == "viktor-hovland" })
        XCTAssertTrue(index.search("Lyn").contains { $0.id == "fk-lyn-oslo" })
    }

    func test_search_expandsSportKeyword() {
        let tennis = index.search("tennis").map(\.id)
        XCTAssertTrue(tennis.contains("casper-ruud"))
        let sykkel = index.search("sykkel").map(\.id)
        XCTAssertTrue(sykkel.contains("tour-de-france-2026"))
    }

    func test_nearestMatches_typo() {
        let near = index.nearestMatches(to: "Hovlan")
        XCTAssertEqual(near.first?.id, "viktor-hovland")
    }

    func test_nearestMatches_absentSport_isEmpty() {
        XCTAssertTrue(index.nearestMatches(to: "cricket").isEmpty)
    }

    func test_detectEntities_prefersHighestConfidenceTarget() {
        // "Lyn" (alias, whole-word) beats "OBOS-ligaen" (token overlap), which is
        // the scope, not the target.
        XCTAssertEqual(index.detectEntities(in: "Følg Lyn i OBOS-ligaen").map(\.id), ["fk-lyn-oslo"])
    }

    func test_detectEntities_yearSuffixedTournament() {
        XCTAssertEqual(index.detectEntities(in: "Følg Tour de France").map(\.id), ["tour-de-france-2026"])
    }

    func test_detectEntities_noFalsePositiveOnParentheticalName() {
        // The athlete matches; the "(Karsten Warholm)"-qualified tournament does not.
        XCTAssertEqual(index.detectEntities(in: "Følg Karsten Warholm").map(\.id), ["karsten-warholm"])
    }

    func test_representativeEntity_prefersTournament() {
        XCTAssertEqual(
            index.representativeEntity(forSport: "cycling", preferredIn: InterestProfile())?.id,
            "tour-de-france-2026"
        )
    }

    func test_representativeEntity_prefersProfileMember() {
        let profile = InterestProfile().applying(GroundedMutation(
            kind: .add, entity: index.entity(id: "uno-x-mobility")!, scope: nil, weight: 0.5, reason: "seed", previousRule: nil
        ))
        XCTAssertEqual(
            index.representativeEntity(forSport: "cycling", preferredIn: profile)?.id,
            "uno-x-mobility"
        )
    }

    func test_sportKeywordDetection() {
        XCTAssertEqual(EntityIndex.sportKeyword(in: "mer sykkel i juli"), "cycling")
        XCTAssertEqual(EntityIndex.sportKeyword(in: "slutt med tennis"), "tennis")
        XCTAssertNil(EntityIndex.sportKeyword(in: "følg cricket"))
    }
}
