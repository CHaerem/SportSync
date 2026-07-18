//
//  MutationGrounderTests.swift
//  SportivistaTests
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

    // MARK: - Lens grounding (WP-16.1)

    func test_lens_throughNorwegians_survivesGroundingOnAdd() {
        let proposal = ProposedMutation(
            kind: .add, entityId: "tour-de-france-2026", entityQuery: "Tour de France",
            reason: "følg", lens: .throughNorwegians
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())
        XCTAssertEqual(result.grounded.count, 1)
        XCTAssertEqual(result.grounded[0].lens, .throughNorwegians)
    }

    func test_lens_throughAthletes_isGroundedLikeAnEntityId() {
        // Valid + hallucinated athlete ids mixed: the bogus one is dropped, the
        // real one survives with the index's CANONICAL display name.
        let proposal = ProposedMutation(
            kind: .add, entityId: "tour-de-france-2026", entityQuery: "Tour de France", reason: "følg",
            lens: .throughAthletes([
                LensAthlete(entityId: "jonas-abrahamsen", name: "feil navn"),
                LensAthlete(entityId: "does-not-exist", name: "spøkelse")
            ])
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())
        XCTAssertEqual(result.grounded.count, 1)
        guard case let .throughAthletes(athletes) = result.grounded[0].lens else {
            return XCTFail("expected a throughAthletes lens")
        }
        XCTAssertEqual(athletes.map(\.entityId), ["jonas-abrahamsen"], "hallucinated id dropped")
        XCTAssertEqual(athletes.first?.name, "Jonas Abrahamsen", "display name normalised to the index")
    }

    func test_lens_throughAthletes_degradesToSportAsSuch_whenNoneResolve() {
        let proposal = ProposedMutation(
            kind: .add, entityId: "tour-de-france-2026", entityQuery: "Tour de France", reason: "følg",
            lens: .throughAthletes([LensAthlete(entityId: "nobody", name: "Nobody")])
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())
        XCTAssertEqual(result.grounded[0].lens, .sportAsSuch, "no surviving athlete → neutral default")
    }

    func test_lens_updateWithoutLens_inheritsPreviousLens() {
        let tdf = index.entity(id: "tour-de-france-2026")!
        let profile = InterestProfile().applying(GroundedMutation(
            kind: .add, entity: tdf, scope: nil, weight: 0.5, reason: "seed",
            previousRule: nil, lens: .throughNorwegians
        ))
        // An update that specifies no lens keeps the existing perspective, exactly
        // like scope/weight carry over.
        let proposal = ProposedMutation(kind: .update, entityId: "tour-de-france-2026", entityQuery: "TdF", reason: "endre")
        let result = MutationGrounder.ground([proposal], index: index, profile: profile)
        XCTAssertEqual(result.grounded[0].lens, .throughNorwegians)
    }

    func test_lens_removeNeverCarriesLens() {
        let proposal = ProposedMutation(
            kind: .remove, entityId: "tour-de-france-2026", entityQuery: "TdF",
            reason: "slutt", lens: .throughNorwegians
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: InterestProfile())
        XCTAssertEqual(result.grounded[0].lens, .sportAsSuch)
    }
}
