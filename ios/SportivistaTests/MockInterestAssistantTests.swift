//
//  MockInterestAssistantTests.swift
//  SportivistaTests
//
//  WP-16 acceptance — the parsing pipeline. The ten canonical Norwegian
//  utterances (PLAN.md's spirit) must each produce the RIGHT structured
//  mutation(s), grounded in real entity ids from the checked-in index. Apple
//  Intelligence can't run in CI, so this drives the deterministic
//  `MockInterestParser`/`MockInterestAssistant` — the same code path the app
//  runs through the FM model, minus the model itself.
//

import XCTest

final class MockInterestAssistantTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func parse(_ utterance: String, profile: InterestProfile = InterestProfile()) -> [ProposedMutation] {
        MockInterestParser.parse(utterance: utterance, profile: profile, index: index)
    }

    /// Convenience: a profile that already follows Casper Ruud (tennis), used by
    /// the "slutt med tennis" case.
    private func profileFollowingRuud() -> InterestProfile {
        let ruud = index.entity(id: "casper-ruud")!
        return InterestProfile().applying(GroundedMutation(
            kind: .add, entity: ruud, scope: "bare i Grand Slams", weight: 0.5,
            reason: "seed", previousRule: nil
        ))
    }

    // MARK: - 1. Entity + scope

    func test01_følgRuudBareGrandSlams() {
        let p = parse("Følg Casper Ruud bare i Grand Slams")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertEqual(p[0].entityId, "casper-ruud")
        XCTAssertEqual(p[0].scope, "bare i Grand Slams")
        XCTAssertFalse(p[0].reason.isEmpty)
    }

    // MARK: - 2. Plain entity add

    func test02_følgMagnusCarlsen() {
        let p = parse("Følg Magnus Carlsen")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertEqual(p[0].entityId, "magnus-carlsen")
        XCTAssertNil(p[0].scope)
    }

    // MARK: - 3. Entity + tournament scope

    func test03_følgLynIObosligaen() {
        let p = parse("Følg Lyn i OBOS-ligaen")
        XCTAssertEqual(p.map(\.entityId), ["fk-lyn-oslo"])
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertEqual(p[0].scope, "i OBOS-ligaen")
    }

    // MARK: - 4. Whole-sport increase + month scope

    func test04_merSykkelIJuli() {
        let p = parse("Mer sykkel i juli")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .update)              // "mer" = increase
        // WP-65 — a bare sport word grounds to the SPORT-LEVEL entity (the whole
        // sport), not an arbitrary flagship tournament.
        XCTAssertEqual(p[0].entityId, "sport-cycling")
        XCTAssertEqual(p[0].scope, "i juli")
        XCTAssertEqual(p[0].weight, 0.8)
    }

    // MARK: - 5. Whole-sport removal (needs the profile)

    func test05_sluttMedTennis() {
        let p = parse("Slutt med tennis", profile: profileFollowingRuud())
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .remove)
        XCTAssertEqual(p[0].entityId, "casper-ruud")
    }

    func test05b_sluttMedTennis_emptyProfile_nothingToRemove() {
        // No tennis rules to remove → no proposals (rather than a spurious one).
        XCTAssertTrue(parse("Slutt med tennis").isEmpty)
    }

    // MARK: - 6. Remove a specific entity by alias

    func test06_fjernHovland() {
        let p = parse("Fjern Hovland")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .remove)
        XCTAssertEqual(p[0].entityId, "viktor-hovland")  // matched via alias "Hovland"
    }

    // MARK: - 7. Full-name athlete add

    func test07_følgKarstenWarholm() {
        let p = parse("Følg Karsten Warholm")
        XCTAssertEqual(p.map(\.entityId), ["karsten-warholm"])
        XCTAssertEqual(p[0].kind, .add)
    }

    // MARK: - 8. Year-suffixed tournament name matched by tokens

    func test08_følgTourDeFrance() {
        let p = parse("Følg Tour de France")
        XCTAssertEqual(p.map(\.entityId), ["tour-de-france-2026"])
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertNil(p[0].scope)
    }

    // MARK: - 9. Weight increase for a team

    func test09_prioriter100ThievesHøyere() {
        let p = parse("Prioriter 100 Thieves høyere")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .update)
        XCTAssertEqual(p[0].entityId, "100-thieves")
        XCTAssertEqual(p[0].weight, 0.8)
    }

    // MARK: - 10. Free-text entity NOT in the index → unresolved (rejected later)

    func test10_følgCricket_isUnresolved() {
        let p = parse("Følg cricket")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].entityId, "")            // nothing grounded
        XCTAssertEqual(p[0].entityQuery, "cricket")  // carried for the "mente du …?" suggestion
    }

    // MARK: - 11. Lens — the original bug ("med fokus på norske utøvere")

    func test11_følgTourDeFranceMedFokusPåNorske() {
        // The exact first-user-test utterance that WP-16 produced no mutation for.
        let p = parse("Følg Tour de France med fokus på norske utøvere")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertEqual(p[0].entityId, "tour-de-france-2026")
        XCTAssertEqual(p[0].lens, .throughNorwegians, "«med fokus på norske» must become the Norwegian lens")
        XCTAssertNil(p[0].scope)
        XCTAssertTrue(p[0].reason.contains("norske"), "the reason names the perspective")
    }

    func test11b_plainAdd_hasDefaultLens() {
        // No focus phrase → the neutral default, so existing behaviour is unchanged.
        let p = parse("Følg Magnus Carlsen")
        XCTAssertEqual(p[0].lens, .sportAsSuch)
        XCTAssertTrue(p[0].lens.isDefault)
    }

    func test11c_wholeSportWithNorwegianFocus_carriesLens() {
        // "Mer sykkel" is a whole-sport command; "de norske" is its lens.
        let p = parse("Mer sykkel, bare de norske")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .update)
        XCTAssertEqual(p[0].lens, .throughNorwegians)
    }

    func test11d_removeNeverCarriesLens() {
        // A lens makes no sense on a remove, even if the phrase is present.
        let p = parse("Slutt med tennis, de norske", profile: profileFollowingRuud())
        XCTAssertEqual(p.map(\.kind), [.remove])
        XCTAssertEqual(p[0].lens, .sportAsSuch)
    }

    // MARK: - WP-64: winter-sport category + broad sport coverage

    private func ground(_ proposals: [ProposedMutation], profile: InterestProfile = InterestProfile()) -> GroundingResult {
        MutationGrounder.ground(proposals, index: index, profile: profile)
    }

    func test12_følgSkiskyting_groundsToSportEntity() {
        // "skiskyting" was ungroundable before WP-64 (no biathlon entity existed).
        let p = parse("Følg skiskyting")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertEqual(p[0].entityId, "sport-biathlon")
        let r = ground(p)
        XCTAssertTrue(r.rejected.isEmpty, "a followed winter sport must ground, not be rejected")
        XCTAssertEqual(r.grounded.map(\.entity.id), ["sport-biathlon"])
    }

    func test13_følgVintersport_groundsToUmbrellaCategory() {
        // The umbrella term grounds to ONE broad-scope category following — the
        // "all vintersport" mutation WP-65's bulk utterance counts as a single
        // suggestion.
        let p = parse("Følg vintersport")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .add)
        XCTAssertEqual(p[0].entityId, "category-winter-sports")
        let r = ground(p)
        XCTAssertTrue(r.rejected.isEmpty, "«vintersport» must ground, not be rejected")
        XCTAssertEqual(r.grounded.map(\.entity.id), ["category-winter-sports"])
    }

    func test14_merLangrenn_representativeIsSportEntity() {
        let p = parse("Mer langrenn")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].kind, .update)          // "mer" = increase
        XCTAssertEqual(p[0].entityId, "sport-cross-country")
        XCTAssertEqual(p[0].weight, 0.8)
    }

    func test15_everyWinterCategoryMemberIsGroundable() {
        // «vintersport» → settet: each member sport must have a real, groundable
        // entity, so expanding the umbrella never yields a dead reference.
        let members = SportVocabulary.categoryToSports["winter-sports"] ?? []
        XCTAssertEqual(members.count, 5)
        for sport in members {
            XCTAssertNotNil(
                index.representativeEntity(forSport: sport, preferredIn: InterestProfile()),
                "\(sport) must have a groundable entity"
            )
        }
    }

    func test16_wholeSportCommand_prefersSportEntity() {
        // WP-65 re-calibration: a bare sport word ("golf", "sykkel", "F1") means
        // the WHOLE sport, so it grounds to the sport-level entity — the honest
        // reading, and what the real FM proposes. (Superseded the earlier WP-64
        // guard that preferred a flagship tournament; grounding "golf" to one
        // random event was wrong.)
        XCTAssertEqual(parse("Mer sykkel i juli").map(\.entityId), ["sport-cycling"])
        XCTAssertEqual(parse("Følg golf").map(\.entityId), ["sport-golf"])
        XCTAssertEqual(parse("Litt F1").map(\.entityId), ["sport-f1"])
    }

    // MARK: - WP-65: bulk-fangst (many interests in one utterance)

    /// The owner's real utterance class — the acceptance case. Five clauses
    /// (golf, Hovland, all vintersport, Brann, litt F1) must ALL be caught: four
    /// ground to the right ids, and the unresolvable "Brann" is reported as a
    /// not-found proposal — never silently dropped.
    func test20_ownerUtterance_fiveClauses_noneDropped() {
        let p = parse("Jeg liker golf, spesielt Hovland, all vintersport, følger Brann og litt F1")
        XCTAssertEqual(p.count, 5, "every clause becomes a proposal — none dropped")

        let r = ground(p)
        XCTAssertEqual(
            Set(r.grounded.map(\.entity.id)),
            ["sport-golf", "viktor-hovland", "category-winter-sports", "sport-f1"],
            "the four resolvable clauses ground to the right ids"
        )
        XCTAssertEqual(r.rejected.map { $0.query.lowercased() }, ["brann"],
                       "the unresolvable clause is reported as not-found, not swallowed")
    }

    func test21_multiPart_explicitEntities_bothLand() {
        XCTAssertEqual(parse("Følg Viktor Hovland og Casper Ruud").map(\.entityId),
                       ["viktor-hovland", "casper-ruud"])
        XCTAssertEqual(parse("Følg Viktor Hovland, Magnus Carlsen og Casper Ruud").map(\.entityId),
                       ["viktor-hovland", "magnus-carlsen", "casper-ruud"])
    }

    func test22_multiPart_mixesSpecificAndBareSports() {
        // A specific team + a bare sport: fk-lyn-oslo (specific) + sport-f1 (whole sport).
        XCTAssertEqual(parse("Følg Lyn og litt F1").map(\.entityId), ["fk-lyn-oslo", "sport-f1"])
        // Declarative cue + two bare sports.
        XCTAssertEqual(parse("Jeg liker fotball og sykkel").map(\.entityId),
                       ["sport-football", "sport-cycling"])
    }

    func test23_multiPart_dedupesRepeatedClause() {
        // The same entity named twice yields a single proposal.
        XCTAssertEqual(parse("Følg Magnus Carlsen og Magnus Carlsen").map(\.entityId), ["magnus-carlsen"])
    }

    func test24_scopeAndLensTail_isNotASeparateClause() {
        // The comma tail "bare de norske" is a lens modifier, not a new interest —
        // it must merge back into "Mer sykkel", staying ONE clause (regression on
        // the split not breaking the lens case).
        let p = parse("Mer sykkel, bare de norske")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p[0].entityId, "sport-cycling")
        XCTAssertEqual(p[0].lens, .throughNorwegians)
    }

    func test25_unknownClause_inBulk_isReportedNotDropped() {
        // A resolvable team + an unknown sport: the team grounds, the unknown is
        // carried as a not-found proposal (the per-clause honesty contract).
        let p = parse("Følg 100 Thieves og cricket")
        XCTAssertEqual(p.count, 2)
        let r = ground(p)
        XCTAssertEqual(r.grounded.map(\.entity.id), ["100-thieves"])
        XCTAssertEqual(r.rejected.map { $0.query.lowercased() }, ["cricket"])
    }

    func test26_singleClause_isUnaffectedBySplitter() {
        // No connector → exactly one clause → identical to the pre-WP-65 path.
        XCTAssertEqual(parse("Følg Casper Ruud bare i Grand Slams").map(\.entityId), ["casper-ruud"])
        XCTAssertEqual(parse("Følg Tour de France med fokus på norske utøvere").map(\.entityId),
                       ["tour-de-france-2026"])
    }

    // MARK: - Availability + async surface

    func test_availability_reflectsBehavior() {
        XCTAssertEqual(MockInterestAssistant().availability(), .available)
        XCTAssertEqual(
            MockInterestAssistant(behavior: .unavailable("av")).availability(),
            .unavailable(message: "av")
        )
    }

    func test_asyncInterpret_matchesParser() async throws {
        let assistant = MockInterestAssistant()
        let turn = try await assistant.interpret(utterance: "Følg Magnus Carlsen", profile: InterestProfile(), index: index, feed: FeedQuery(now: Date()))
        guard case let .mutations(out) = turn else { return XCTFail("a command must route to mutations") }
        XCTAssertEqual(out.map(\.entityId), ["magnus-carlsen"])
    }

    func test_asyncInterpret_throwsWhenUnavailable() async {
        let assistant = MockInterestAssistant(behavior: .unavailable("Apple Intelligence er av."))
        do {
            _ = try await assistant.interpret(utterance: "Følg Lyn", profile: InterestProfile(), index: index, feed: FeedQuery(now: Date()))
            XCTFail("expected throw")
        } catch let error as AssistantError {
            XCTAssertEqual(error, .unavailable(message: "Apple Intelligence er av."))
        } catch {
            XCTFail("unexpected error \(error)")
        }
    }
}
