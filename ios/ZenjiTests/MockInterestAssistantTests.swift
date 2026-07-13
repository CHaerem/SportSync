//
//  MockInterestAssistantTests.swift
//  ZenjiTests
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
        XCTAssertEqual(p[0].entityId, "tour-de-france-2026") // representative cycling entity
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

    // MARK: - Availability + async surface

    func test_availability_reflectsBehavior() {
        XCTAssertEqual(MockInterestAssistant().availability(), .available)
        XCTAssertEqual(
            MockInterestAssistant(behavior: .unavailable("av")).availability(),
            .unavailable(message: "av")
        )
    }

    func test_asyncPropose_matchesParser() async throws {
        let assistant = MockInterestAssistant()
        let out = try await assistant.propose(utterance: "Følg Magnus Carlsen", profile: InterestProfile(), index: index)
        XCTAssertEqual(out.map(\.entityId), ["magnus-carlsen"])
    }

    func test_asyncPropose_throwsWhenUnavailable() async {
        let assistant = MockInterestAssistant(behavior: .unavailable("Apple Intelligence er av."))
        do {
            _ = try await assistant.propose(utterance: "Følg Lyn", profile: InterestProfile(), index: index)
            XCTFail("expected throw")
        } catch let error as AssistantError {
            XCTAssertEqual(error, .unavailable(message: "Apple Intelligence er av."))
        } catch {
            XCTFail("unexpected error \(error)")
        }
    }
}
