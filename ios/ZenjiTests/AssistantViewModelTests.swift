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
            index: index,
            // WP-16.3: a throwaway temp directory, never this process's real
            // Application Support — same guarantee as `tempProfileStore()`.
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog()
        )
    }

    func test_availability_reflectsAssistant() {
        XCTAssertEqual(makeVM().availability, .available)
        XCTAssertEqual(makeVM(behavior: .unavailable("av")).availability, .unavailable(message: "av"))
    }

    // MARK: - WP-65 — bulk-fangst + per-clause reporting

    func test_submit_bulkUtterance_reportsEveryClauseInTally() async {
        let vm = makeVM()
        vm.utterance = "Jeg liker golf, spesielt Hovland, all vintersport, følger Brann og litt F1"
        await vm.submit()

        // The four resolvable clauses become confirmable proposals.
        XCTAssertEqual(
            Set(vm.pending.map(\.entity.id)),
            ["sport-golf", "viktor-hovland", "category-winter-sports", "sport-f1"]
        )
        // The unresolvable one is shown as a rejection, not dropped.
        XCTAssertEqual(vm.rejected.map { $0.query.lowercased() }, ["brann"])

        // The per-clause tally names ALL of it — added AND not-found — so nothing
        // is silently swallowed. (The mock normalises a residual query to lower
        // case; the tally faithfully reflects the rejection's query.)
        let tally = vm.mutationTally
        XCTAssertNotNil(tally, "a multi-clause utterance publishes a tally")
        XCTAssertEqual(Set(tally?.added ?? []), ["Golf", "Viktor Hovland", "Vintersport", "Formel 1"])
        XCTAssertEqual(tally?.updated ?? [], [])
        XCTAssertEqual(tally?.notFound.map { $0.lowercased() }, ["brann"])
        XCTAssertTrue(tally?.summary.lowercased().contains("brann") ?? false, "the summary names the not-found clause")
    }

    func test_submit_singleClause_hasNoTally() async {
        let vm = makeVM()
        vm.utterance = "Følg Casper Ruud"
        await vm.submit()
        XCTAssertNil(vm.mutationTally, "a single-clause utterance needs no per-clause regnskap")
    }

    func test_tallyBuilder_isNilForTrivialAndNamesEveryClause() {
        // Pure builder: nil for a single outcome, structured for several.
        let ruud = index.entity(id: "casper-ruud")!
        let one = GroundedMutation(kind: .add, entity: ruud, scope: nil, weight: 0.5, reason: "r", previousRule: nil)
        XCTAssertNil(AssistantExplanation.tally(grounded: [one], rejected: []))

        let hov = index.entity(id: "viktor-hovland")!
        let two = GroundedMutation(kind: .add, entity: hov, scope: nil, weight: 0.5, reason: "r", previousRule: nil)
        let reject = RejectedMutation(query: "Brann", explanation: "x", suggestions: [],
                                      proposal: ProposedMutation(kind: .add, entityId: "", entityQuery: "Brann", reason: "r"))
        let tally = AssistantExplanation.tally(grounded: [one, two], rejected: [reject])
        XCTAssertEqual(tally?.added, ["Casper Ruud", "Viktor Hovland"])
        XCTAssertEqual(tally?.notFound, ["Brann"])
        XCTAssertTrue(tally?.summary.contains("la til") ?? false)
        XCTAssertTrue(tally?.summary.contains("fant ikke") ?? false)
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

    // MARK: - Lens end-to-end (WP-16.1) — the original bug utterance

    func test_submit_lensThroughNorwegians_appliesAndPersists() async {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)
        vm.utterance = "Følg Tour de France med fokus på norske utøvere"
        await vm.submit()

        // A confirmable change — NOT the old dead-end "fant ingen endringer".
        XCTAssertNil(vm.explanation)
        XCTAssertEqual(vm.pending.map(\.entity.id), ["tour-de-france-2026"])
        XCTAssertEqual(vm.pending.first?.lens, .throughNorwegians)

        vm.confirm(vm.pending[0])
        XCTAssertEqual(vm.profile.rule(for: "tour-de-france-2026")?.lens, .throughNorwegians)

        // The perspective survives a persistence round-trip.
        let reloaded = makeVM(store: store)
        XCTAssertEqual(reloaded.profile.rule(for: "tour-de-france-2026")?.lens, .throughNorwegians)
    }

    // MARK: - Always-explain (WP-16.1) — no bare "fant ingen endringer"

    func test_submit_producesNothing_explainsHonestly() async {
        // A usable model that returned no structured output — the exact device
        // bug. The UI must get a structured explanation, never a dead end.
        let vm = makeVM(behavior: .producesNothing)
        vm.utterance = "gjør noe fint med sporten min"
        await vm.submit()

        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertNil(vm.errorMessage)
        let explanation = try? XCTUnwrap(vm.explanation)
        XCTAssertNotNil(explanation)
        XCTAssertFalse(explanation?.understood.isEmpty ?? true)
        XCTAssertFalse(explanation?.reason.isEmpty ?? true)
        XCTAssertNotEqual(explanation?.reason, "Fant ingen endringer i det du skrev.",
                          "the forbidden dead-end message must never appear")
    }

    func test_submit_unknownEntity_explainsAndSuggests() async {
        let vm = makeVM()
        vm.utterance = "Følg quidditch"
        await vm.submit()

        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertEqual(vm.rejected.count, 1, "the unknown thing is shown as a rejection")
        XCTAssertNotNil(vm.explanation, "and it is explained, not collapsed to silence")
        XCTAssertTrue(vm.explanation?.reason.contains("quidditch") ?? false,
                      "the explanation names what couldn't be found")
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

    // MARK: - WP-32 — resetProfile(_:)

    func test_resetProfile_followedOnly_clearsProfile_keepsMemoryAndLog_firesOnProfileChanged() async {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)
        vm.utterance = "Følg Magnus Carlsen"
        await vm.submit()
        vm.confirmAll()
        XCTAssertEqual(vm.profile.rules.count, 1)
        vm.refreshMemory()
        // Seed a memory fact + a misunderstood entry directly through the same
        // stores the view model was built with isn't exposed, so drive it via
        // a real user turn that both saves memory-worthy behaviour (a reject)
        // and logs a miss.
        vm.utterance = "Følg quidditch"
        await vm.submit()
        XCTAssertFalse(vm.misunderstoodEntries.isEmpty, "a rejected free-text entity logged a misunderstood entry")

        var recompiles = 0
        vm.onProfileChanged = { recompiles += 1 }
        vm.resetProfile(.followedOnly)

        XCTAssertTrue(vm.profile.isEmpty, "the profile is cleared")
        XCTAssertTrue(makeVM(store: store).profile.isEmpty, "…and persisted")
        XCTAssertFalse(vm.misunderstoodEntries.isEmpty, "the misunderstood log is untouched at this level")
        XCTAssertEqual(recompiles, 1, "onProfileChanged fires so the agenda recompiles on the spot")
    }

    func test_resetProfile_everything_clearsProfileMemoryAndLog() async {
        let store = AssistantTestSupport.tempProfileStore()
        let vm = makeVM(store: store)
        vm.utterance = "Følg Magnus Carlsen"
        await vm.submit()
        vm.confirmAll()
        vm.utterance = "Følg quidditch"
        await vm.submit()
        XCTAssertFalse(vm.misunderstoodEntries.isEmpty)

        vm.resetProfile(.everything)

        XCTAssertTrue(vm.profile.isEmpty)
        XCTAssertTrue(vm.memory.isEmpty, "all personal memory is forgotten at the GDPR level")
        XCTAssertTrue(vm.misunderstoodEntries.isEmpty, "the misunderstood log is emptied at the GDPR level")
    }

    func test_resetProfile_clearsPresentableResults() async {
        let vm = makeVM()
        vm.utterance = "Følg Casper Ruud bare i Grand Slams"
        await vm.submit()
        XCTAssertFalse(vm.pending.isEmpty)

        vm.resetProfile(.followedOnly)
        XCTAssertTrue(vm.pending.isEmpty, "a reset clears any in-flight proposal — nothing left to confirm against a wiped profile")
        XCTAssertFalse(vm.hasPresentableResult)
    }
}
