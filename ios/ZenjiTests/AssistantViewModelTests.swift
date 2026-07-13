//
//  AssistantViewModelTests.swift
//  ZenjiTests
//
//  WP-16 — end-to-end through the view model with the deterministic mock in
//  place of Apple Intelligence: utterance → submit → grounded pending → confirm
//  → applied + persisted, plus the reject, rejected-free-text, and
//  model-unavailable paths. Proves the pieces wire together the same way the
//  shipping app runs them (only the assistant differs).
//

import XCTest

@MainActor
final class AssistantViewModelTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func makeVM(
        behavior: MockInterestAssistant.Behavior = .available,
        store: ProfileStore? = nil
    ) -> AssistantViewModel {
        AssistantViewModel(
            assistant: MockInterestAssistant(behavior: behavior),
            profileStore: store ?? AssistantTestSupport.tempProfileStore(),
            index: index
        )
    }

    func test_availability_reflectsAssistant() {
        XCTAssertEqual(makeVM().availability, .available)
        XCTAssertEqual(makeVM(behavior: .unavailable("av")).availability, .unavailable(message: "av"))
    }

    func test_submit_groundsIntoPending_withoutApplying() async {
        let vm = makeVM()
        vm.utterance = "Følg Casper Ruud bare i Grand Slams"
        await vm.submit()
        XCTAssertEqual(vm.pending.map(\.entity.id), ["casper-ruud"])
        XCTAssertEqual(vm.pending.first?.scope, "bare i Grand Slams")
        XCTAssertTrue(vm.profile.isEmpty, "nothing is applied until the user confirms")
    }

    func test_confirm_appliesAndPersists() async {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)
        vm.utterance = "Følg Casper Ruud bare i Grand Slams"
        await vm.submit()
        vm.confirm(vm.pending[0])

        XCTAssertEqual(vm.profile.rules.map(\.entityId), ["casper-ruud"])
        XCTAssertTrue(vm.pending.isEmpty)

        // Persisted — a fresh view model over the same store sees it.
        let reloaded = makeVM(store: store)
        XCTAssertEqual(reloaded.profile.rule(for: "casper-ruud")?.scope, "bare i Grand Slams")
    }

    func test_reject_dropsWithoutApplying() async {
        let vm = makeVM()
        vm.utterance = "Følg Magnus Carlsen"
        await vm.submit()
        vm.reject(vm.pending[0])
        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertTrue(vm.profile.isEmpty)
    }

    func test_endToEnd_addThenRemoveWholeSport() async {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)

        vm.utterance = "Følg Casper Ruud bare i Grand Slams"
        await vm.submit()
        vm.confirmAll()
        XCTAssertEqual(vm.profile.rules.map(\.entityId), ["casper-ruud"])

        vm.utterance = "Slutt med tennis"
        await vm.submit()
        XCTAssertEqual(vm.pending.map(\.entity.id), ["casper-ruud"])
        XCTAssertEqual(vm.pending.first?.kind, .remove)
        vm.confirmAll()
        XCTAssertTrue(vm.profile.isEmpty)
    }

    func test_submit_freeTextEntity_isRejected() async {
        let vm = makeVM()
        vm.utterance = "Følg cricket"
        await vm.submit()
        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertEqual(vm.rejected.count, 1)
        XCTAssertTrue(vm.rejected[0].explanation.contains("cricket"))
    }

    func test_submit_whenUnavailable_setsErrorMessage() async {
        let vm = makeVM(behavior: .unavailable("Apple Intelligence er av."))
        vm.utterance = "Følg Lyn"
        await vm.submit()
        XCTAssertEqual(vm.errorMessage, "Apple Intelligence er av.")
        XCTAssertTrue(vm.pending.isEmpty)
    }

    func test_removeRule_directlyUnfollows() async {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)
        vm.utterance = "Følg Magnus Carlsen"
        await vm.submit()
        vm.confirmAll()
        XCTAssertEqual(vm.profile.rules.count, 1)

        vm.removeRule(vm.profile.rules[0])
        XCTAssertTrue(vm.profile.isEmpty)
        XCTAssertTrue(makeVM(store: store).profile.isEmpty, "removal persisted")
    }
}
