//
//  FuzzyResolverTests.swift
//  SportivistaTests
//
//  WP-16.2 acceptance — the fuzzy entity resolver + the now-working "mente du"
//  tap. The first on-device user test typed "Følg Tour de France med fokus på
//  norske utøvere" and got «Fant ikke 'tour de france' — mente du: Tour de
//  France 2026?», and tapping the suggestion did NOTHING. These prove the
//  design fix: fuzzy intelligence lives in the deterministic lookup (the index
//  + resolver), NOT in letting the model's free text loose — so "tour de
//  france", "tdf" and the typo "Tour de Farnce" are SERVED straight to the
//  grounder, and any genuinely ambiguous phrase becomes tappable candidates
//  that re-ground the original intent.
//
//  Driven against the real, checked-in entities.json fixture (so the stored
//  year-strip aliases + "TdF" initials are exercised) and the deterministic
//  mock — never FoundationModels.
//

import XCTest

@MainActor
final class FuzzyResolverTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    // MARK: - Resolver: the three phrases that must resolve to one entity

    func test_resolve_lowercaseYearlessName_servesTdF() {
        let r = index.resolve("tour de france")
        XCTAssertEqual(r.served?.id, "tour-de-france-2026", "the bare, yearless name resolves via the year-strip alias")
    }

    func test_resolve_initials_servesTdF() {
        let r = index.resolve("tdf")
        XCTAssertEqual(r.served?.id, "tour-de-france-2026", "the acronym resolves via the stored initials")
    }

    func test_resolve_typo_servesTdF() {
        // "Farnce" is edit-distance 2 from "France" inside a full 3-word phrase.
        let r = index.resolve("Tour de Farnce")
        XCTAssertEqual(r.served?.id, "tour-de-france-2026", "a same-shape typo still resolves unambiguously")
    }

    func test_resolve_absent_isEmpty() {
        let r = index.resolve("cricket")
        XCTAssertNil(r.served)
        XCTAssertTrue(r.candidates.isEmpty, "nothing genuinely close → no misleading suggestion")
    }

    func test_resolve_partialPrefix_suggestsButDoesNotAutoServe() {
        // A bare single-word truncation ("Hovlan") is a strong SUGGESTION but not
        // a confident identity — it must not be auto-served (the deliberate line
        // that keeps the hard grounding rule honest), only offered as "mente du".
        let r = index.resolve("Hovlan")
        XCTAssertNil(r.served)
        XCTAssertEqual(r.candidates.first?.entity.id, "viktor-hovland")
    }

    // MARK: - Resolver: ambiguity → candidates, never a silent pick

    func test_resolve_ambiguous_returnsCandidatesWithoutServing() {
        let ambiguous = EntityIndex([
            Entity(id: "jonas-bakke", name: "Jonas Bakke", sport: "cycling", type: "athlete"),
            Entity(id: "jonas-berg", name: "Jonas Berg", sport: "cycling", type: "athlete"),
        ])
        let r = ambiguous.resolve("Jonas")
        XCTAssertNil(r.served, "two equally-close matches must not auto-resolve to one")
        XCTAssertEqual(Set(r.candidates.map(\.entity.id)), ["jonas-bakke", "jonas-berg"])
    }

    // MARK: - searchEntities tool quality (the model's first line of defence)

    func test_searchTool_findsByYearlessNameAndInitials() {
        XCTAssertTrue(index.search("tour de france").contains { $0.id == "tour-de-france-2026" })
        XCTAssertTrue(index.search("tdf").contains { $0.id == "tour-de-france-2026" })
        // Sport-word expansion still works alongside the fuzzy hits.
        XCTAssertTrue(index.search("tennis").contains { $0.id == "casper-ruud" })
    }

    // MARK: - Grounder: an unresolved id is SERVED via the resolver

    private func groundFreeText(_ query: String, lens: Lens = .sportAsSuch) -> GroundingResult {
        let proposal = ProposedMutation(
            kind: .add, entityId: "", entityQuery: query, reason: "følg", lens: lens
        )
        return MutationGrounder.ground([proposal], index: index, profile: InterestProfile())
    }

    func test_ground_tourDeFrance_isServedNotRejected() {
        let result = groundFreeText("tour de france")
        XCTAssertTrue(result.rejected.isEmpty, "«tour de france» must never reach the rejection path again")
        XCTAssertEqual(result.grounded.map(\.entity.id), ["tour-de-france-2026"])
    }

    func test_ground_tdf_isServed() {
        XCTAssertEqual(groundFreeText("tdf").grounded.map(\.entity.id), ["tour-de-france-2026"])
    }

    func test_ground_typo_isServed() {
        let result = groundFreeText("Tour de Farnce")
        XCTAssertTrue(result.rejected.isEmpty)
        XCTAssertEqual(result.grounded.map(\.entity.id), ["tour-de-france-2026"])
    }

    func test_ground_servedMutation_keepsTheLens() {
        // The exact first-user-test intent: the resolved entity carries the
        // «med fokus på norske utøvere» lens through the rescue.
        let result = groundFreeText("tour de france", lens: .throughNorwegians)
        XCTAssertEqual(result.grounded.first?.entity.id, "tour-de-france-2026")
        XCTAssertEqual(result.grounded.first?.lens, .throughNorwegians)
    }

    func test_ground_genuinelyUnknown_stillRejected() {
        let result = groundFreeText("cricket")
        XCTAssertTrue(result.grounded.isEmpty)
        XCTAssertEqual(result.rejected.count, 1)
    }

    // MARK: - The "mente du" tap now DOES something (was a dead button)

    func test_menteDuTap_regroundsIntoConfirmablePending() async {
        let ambiguous = EntityIndex([
            Entity(id: "jonas-bakke", name: "Jonas Bakke", sport: "cycling", type: "athlete"),
            Entity(id: "jonas-berg", name: "Jonas Berg", sport: "cycling", type: "athlete"),
        ])
        let vm = AssistantViewModel(
            assistant: MockInterestAssistant(),
            profileStore: AssistantTestSupport.tempProfileStore(),
            index: ambiguous,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog()
        )
        vm.utterance = "Følg Jonas"
        await vm.submit()

        // Ambiguous → a rejection with ≥2 tappable candidates, nothing pending.
        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertEqual(vm.rejected.count, 1)
        let rejection = vm.rejected[0]
        XCTAssertGreaterThanOrEqual(rejection.suggestions.count, 2)

        // Tapping a suggestion re-grounds it into a confirmable DIFF.
        let picked = rejection.suggestions[0]
        vm.choose(picked, for: rejection)
        XCTAssertEqual(vm.pending.map(\.entity.id), [picked.id])
        XCTAssertTrue(vm.rejected.isEmpty, "the resolved rejection is cleared")
        XCTAssertTrue(vm.profile.isEmpty, "still nothing applied until the user confirms")

        // And confirming it applies exactly that entity.
        vm.confirm(vm.pending[0])
        XCTAssertEqual(vm.profile.rules.map(\.entityId), [picked.id])
    }
}
