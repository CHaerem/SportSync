//
//  MisunderstoodLogViewModelTests.swift
//  SportivistaTests
//
//  WP-16.3 acceptance — AssistantViewModel wiring for the "forsto ikke"-log:
//  each of the four outcomes is logged automatically at the moment a submit
//  ends without an applied mutation, a later "mente du" confirm resolves a
//  prior rejected-entity entry, and the note/delete/export API the UI drives
//  round-trips through the SAME store. Driven against MockInterestAssistant
//  (FM can't run in CI) — never FoundationModels.
//

import XCTest

@MainActor
final class MisunderstoodLogViewModelTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func makeVM(behavior: MockInterestAssistant.Behavior = .available) -> AssistantViewModel {
        AssistantViewModel(
            assistant: MockInterestAssistant(behavior: behavior),
            profileStore: AssistantTestSupport.tempProfileStore(),
            index: index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog()
        )
    }

    // MARK: - The four outcomes

    func test_rejectedEntity_isLogged() async {
        let vm = makeVM()
        vm.utterance = "Følg cricket"
        await vm.submit()

        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertEqual(vm.rejected.count, 1)
        XCTAssertEqual(vm.misunderstoodEntries.count, 1)
        let entry = vm.misunderstoodEntries[0]
        XCTAssertEqual(entry.utterance, "Følg cricket")
        XCTAssertEqual(entry.outcome, .rejectedEntity)
        XCTAssertFalse(entry.explanation.reason.isEmpty)
        XCTAssertFalse(entry.isResolved)
        XCTAssertEqual(vm.misunderstoodCount, 1)
    }

    func test_emptyModelResponse_isLogged() async {
        let vm = makeVM(behavior: .producesNothing)
        vm.utterance = "gjør noe fint med sporten min"
        await vm.submit()

        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertNil(vm.errorMessage)
        XCTAssertEqual(vm.misunderstoodEntries.count, 1)
        XCTAssertEqual(vm.misunderstoodEntries[0].outcome, .emptyModelResponse)
        XCTAssertEqual(vm.misunderstoodEntries[0].utterance, "gjør noe fint med sporten min")
    }

    func test_inexpressible_generationFailure_isLogged() async {
        let vm = makeVM(behavior: .throwsGenerationFailure("Modellen ga ugyldig JSON."))
        vm.utterance = "følg en umulig kombinasjon"
        await vm.submit()

        XCTAssertEqual(vm.errorMessage, "Modellen ga ugyldig JSON.")
        XCTAssertEqual(vm.misunderstoodEntries.count, 1)
        let entry = vm.misunderstoodEntries[0]
        XCTAssertEqual(entry.outcome, .inexpressible)
        XCTAssertEqual(entry.utterance, "følg en umulig kombinasjon")
        XCTAssertEqual(entry.explanation.reason, "Modellen ga ugyldig JSON.")
    }

    func test_unavailable_isNOTLogged() async {
        // Apple Intelligence being off is a device-state gate, not a
        // misunderstood utterance — it must not pollute the log.
        let vm = makeVM(behavior: .unavailable("Apple Intelligence er av."))
        vm.utterance = "Følg Lyn"
        await vm.submit()

        XCTAssertEqual(vm.errorMessage, "Apple Intelligence er av.")
        XCTAssertTrue(vm.misunderstoodEntries.isEmpty)
    }

    func test_allRejectedByUser_loggedOnlyWhenNoneConfirmed() async {
        let vm = makeVM()
        vm.utterance = "Følg Casper Ruud bare i Grand Slams"
        await vm.submit()
        XCTAssertEqual(vm.pending.map(\.entity.id), ["casper-ruud"])

        vm.reject(vm.pending[0])

        XCTAssertEqual(vm.misunderstoodEntries.count, 1)
        let entry = vm.misunderstoodEntries[0]
        XCTAssertEqual(entry.outcome, .allRejectedByUser)
        XCTAssertEqual(entry.utterance, "Følg Casper Ruud bare i Grand Slams")
        XCTAssertTrue(entry.explanation.understood.contains("Casper Ruud"))
        XCTAssertTrue(vm.profile.isEmpty, "nothing was ever applied")
    }

    func test_confirmed_doesNotLogAllRejectedByUser() async {
        let vm = makeVM()
        vm.utterance = "Følg Casper Ruud bare i Grand Slams"
        await vm.submit()
        vm.confirm(vm.pending[0])

        XCTAssertTrue(vm.misunderstoodEntries.isEmpty, "a confirmed mutation is a success, not a miss")
    }

    func test_partialBatch_confirmOneRejectAnother_doesNotLogAllRejected() async {
        // Two proposals in one batch; confirming even ONE means the utterance
        // was NOT entirely rejected by the user.
        let vm = makeVM()
        vm.utterance = "Følg Casper Ruud og Magnus Carlsen"
        await vm.submit()
        guard vm.pending.count == 2 else {
            XCTFail("expected the mock to detect both entities in one utterance, got \(vm.pending.map(\.entity.id))")
            return
        }
        let first = vm.pending[0]
        let second = vm.pending[1]
        vm.confirm(first)
        vm.reject(second)

        XCTAssertTrue(vm.misunderstoodEntries.isEmpty, "at least one mutation was confirmed — not an all-rejected miss")
    }

    // MARK: - Resolved (WP-16.3 §3 — a later "mente du" confirm)

    func test_menteDuConfirm_marksEarlierRejectedEntityLogResolved() async {
        let vm = makeVM()
        // "Hovlan" is a real WP-16.2 case: a strong partial match (Viktor
        // Hovland) that is offered as a suggestion but never auto-served.
        vm.utterance = "Følg Hovlan"
        await vm.submit()

        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertEqual(vm.rejected.count, 1)
        XCTAssertEqual(vm.misunderstoodEntries.count, 1)
        XCTAssertEqual(vm.misunderstoodEntries[0].outcome, .rejectedEntity)
        XCTAssertEqual(vm.misunderstoodCount, 1, "unresolved — counts toward the badge")

        let rejection = vm.rejected[0]
        XCTAssertEqual(rejection.suggestions.first?.id, "viktor-hovland")
        vm.choose(rejection.suggestions[0], for: rejection)
        XCTAssertEqual(vm.pending.map(\.entity.id), ["viktor-hovland"])

        vm.confirm(vm.pending[0])

        XCTAssertEqual(vm.misunderstoodEntries.count, 1, "kept — a resolved entry is a valuable success case")
        XCTAssertTrue(vm.misunderstoodEntries[0].isResolved)
        XCTAssertEqual(vm.misunderstoodCount, 0, "resolved entries no longer count toward the badge")
    }

    func test_menteDuRejected_doesNotResolveTheLogEntry() async {
        let vm = makeVM()
        vm.utterance = "Følg Hovlan"
        await vm.submit()
        let rejection = vm.rejected[0]
        vm.choose(rejection.suggestions[0], for: rejection)
        vm.reject(vm.pending[0]) // the rescued suggestion is ALSO turned down

        XCTAssertFalse(vm.misunderstoodEntries[0].isResolved, "only a CONFIRM resolves the original miss")
    }

    // MARK: - Note / delete / export API the UI drives

    func test_setNote_updatesEntryAndPersists() async {
        let vm = makeVM()
        vm.utterance = "Følg cricket"
        await vm.submit()
        let entry = vm.misunderstoodEntries[0]

        vm.setMisunderstoodNote("Jeg mente egentlig rugby", for: entry)
        XCTAssertEqual(vm.misunderstoodEntries[0].note, "Jeg mente egentlig rugby")

        vm.setMisunderstoodNote(nil, for: vm.misunderstoodEntries[0])
        XCTAssertNil(vm.misunderstoodEntries[0].note)
    }

    func test_deleteMisunderstood_removesOnlyThatEntry() async {
        let vm = makeVM()
        vm.utterance = "Følg cricket"
        await vm.submit()
        vm.utterance = "Følg quidditch"
        await vm.submit()
        XCTAssertEqual(vm.misunderstoodEntries.count, 2)

        vm.deleteMisunderstood(vm.misunderstoodEntries[0])
        XCTAssertEqual(vm.misunderstoodEntries.count, 1)
    }

    func test_deleteAllMisunderstood_empties() async {
        let vm = makeVM()
        vm.utterance = "Følg cricket"
        await vm.submit()
        vm.deleteAllMisunderstood()
        XCTAssertTrue(vm.misunderstoodEntries.isEmpty)
        XCTAssertEqual(vm.misunderstoodCount, 0)
    }

    func test_exportPayload_reflectsCurrentLog() async throws {
        let vm = makeVM()
        vm.utterance = "Følg cricket"
        await vm.submit()

        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: vm.misunderstoodExportPayload()) as? [[String: Any]])
        XCTAssertEqual(json.count, 1)
        XCTAssertEqual(json[0]["utterance"] as? String, "Følg cricket")
        XCTAssertNil(json[0]["id"], "no device-generated id leaves the device via export")
    }
}
