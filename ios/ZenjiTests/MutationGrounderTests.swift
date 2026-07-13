//
//  MutationGrounderTests.swift
//  ZenjiTests
//
//  WP-16 acceptance — the HARD grounding rule. A proposal is applied ONLY if its
//  entityId resolves in the index; anything else is rejected with a Norwegian
//  explanation and nearest-match suggestions. These prove both branches with no
//  model in the loop, so grounding is guaranteed regardless of whether the raw
//  proposal came from FoundationModels or the mock.
//

import XCTest

final class MutationGrounderTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    // MARK: - Accept path

    func test_groundsValidEntityId() {
        let proposal = ProposedMutation(
            kind: .add, entityId: "casper-ruud", entityQuery: "Ruud",
            scope: "bare i Grand Slams", weight: nil, reason: "fordi"
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())

        XCTAssertTrue(result.rejected.isEmpty)
        XCTAssertEqual(result.grounded.count, 1)
        let g = result.grounded[0]
        XCTAssertEqual(g.entity.id, "casper-ruud")
        XCTAssertEqual(g.entity.name, "Casper Ruud")
        XCTAssertEqual(g.scope, "bare i Grand Slams")
        XCTAssertEqual(g.weight, InterestProfile.defaultWeight)  // nil → default
        XCTAssertNil(g.previousRule)
    }

    func test_update_inheritsExistingScopeAndWeight() {
        let ruud = index.entity(id: "casper-ruud")!
        let profile = InterestProfile().applying(GroundedMutation(
            kind: .add, entity: ruud, scope: "bare i Grand Slams", weight: 0.7,
            reason: "seed", previousRule: nil
        ))
        // An update that specifies neither scope nor weight keeps the old ones.
        let proposal = ProposedMutation(kind: .update, entityId: "casper-ruud", entityQuery: "Ruud", reason: "endre")
        let result = MutationGrounder.ground([proposal], index: index, profile: profile)

        XCTAssertEqual(result.grounded.count, 1)
        XCTAssertEqual(result.grounded[0].scope, "bare i Grand Slams")
        XCTAssertEqual(result.grounded[0].weight, 0.7)
        XCTAssertEqual(result.grounded[0].previousRule?.entityId, "casper-ruud")
    }

    func test_remove_carriesPreviousRule() {
        let hovland = index.entity(id: "viktor-hovland")!
        let profile = InterestProfile().applying(GroundedMutation(
            kind: .add, entity: hovland, scope: nil, weight: 0.5, reason: "seed", previousRule: nil
        ))
        let proposal = ProposedMutation(kind: .remove, entityId: "viktor-hovland", entityQuery: "Hovland", reason: "slutt")
        let result = MutationGrounder.ground([proposal], index: index, profile: profile)

        XCTAssertEqual(result.grounded.count, 1)
        XCTAssertEqual(result.grounded[0].kind, .remove)
        XCTAssertEqual(result.grounded[0].previousRule?.entityId, "viktor-hovland")
    }

    // MARK: - Reject path (the hard rule)

    func test_rejectsHallucinatedEntityId_withNearestMatch() {
        // A typo'd/hallucinated reference: bogus id, but the phrase is a near
        // miss for a real alias ("Hovland").
        let proposal = ProposedMutation(
            kind: .add, entityId: "hovlan", entityQuery: "Hovlan", reason: "følg"
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())

        XCTAssertTrue(result.grounded.isEmpty)
        XCTAssertEqual(result.rejected.count, 1)
        let r = result.rejected[0]
        XCTAssertTrue(r.explanation.contains("Fant ikke"))
        XCTAssertTrue(r.explanation.contains("mente du"))
        XCTAssertEqual(r.suggestions.first?.id, "viktor-hovland")
    }

    func test_rejectsFreeTextEntity_notInIndex() {
        let proposal = ProposedMutation(
            kind: .add, entityId: "", entityQuery: "cricket", reason: "følg"
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())

        XCTAssertTrue(result.grounded.isEmpty)
        XCTAssertEqual(result.rejected.count, 1)
        XCTAssertTrue(result.rejected[0].explanation.contains("cricket"))
        XCTAssertTrue(result.rejected[0].explanation.contains("Fant ikke"))
    }

    func test_mixedBatch_partitionsGroundedAndRejected() {
        let proposals = [
            ProposedMutation(kind: .add, entityId: "magnus-carlsen", entityQuery: "Carlsen", reason: "ok"),
            ProposedMutation(kind: .add, entityId: "does-not-exist", entityQuery: "quidditch", reason: "nope")
        ]
        let result = MutationGrounder.ground(proposals, index: index, profile: InterestProfile())
        XCTAssertEqual(result.grounded.map(\.entity.id), ["magnus-carlsen"])
        XCTAssertEqual(result.rejected.map(\.query), ["quidditch"])
    }
}
