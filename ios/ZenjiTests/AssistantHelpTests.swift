//
//  AssistantHelpTests.swift
//  ZenjiTests
//
//  WP-68 — the assistant's app-help knowledge. Apple Intelligence can't run in
//  CI, so these drive the curated `AssistantHelp` document + the deterministic
//  MockAnswerer/AssistantViewModel path — the same code the shipping app runs
//  through the FM `getHelp` tool, minus the model.
//
//  Two guarantees:
//    • COHERENCE — every command in the WP-66 catalogue (`CommandKind`) has a
//      curated help entry, so a new command can never ship without help text.
//    • ANSWERS — "hva kan du?", "hvordan nullstiller jeg?", "hvordan følger jeg
//      noe?" are answered from curated fact (referencing a concrete action),
//      never from an empty agenda feed; and a general world-knowledge question
//      is honestly declined (the honesty rule holds).
//

import XCTest

final class AssistantHelpTests: XCTestCase {

    // MARK: - Coherence: every command arm has help text

    func test_everyCommandKind_hasCuratedHelp() {
        for kind in CommandKind.allCases {
            guard let entry = AssistantHelp.entry(for: kind) else {
                XCTFail("command arm \(kind.rawValue) has NO help entry — every AssistantCommand must have app-help (WP-68 coherence)")
                continue
            }
            XCTAssertFalse(entry.title.trimmingCharacters(in: .whitespaces).isEmpty, "\(kind.rawValue) help title must be non-empty")
            XCTAssertFalse(entry.howTo.trimmingCharacters(in: .whitespaces).isEmpty, "\(kind.rawValue) how-to must be non-empty")
            XCTAssertFalse(entry.keywords.isEmpty, "\(kind.rawValue) must carry at least one routing keyword")
        }
    }

    func test_document_mentionsEveryCommandTitle() {
        let doc = AssistantHelp.document()
        for kind in CommandKind.allCases {
            let title = AssistantHelp.entry(for: kind)?.title ?? "‹mangler›"
            XCTAssertTrue(doc.contains(title), "the help document must include «\(title)» so the FM tool never drifts behind the catalogue")
        }
        // The document is versioned and names the three capability arms.
        XCTAssertTrue(doc.contains("hjelp v\(AssistantHelp.version)"))
        XCTAssertTrue(doc.contains("ENDRE HVA DU FØLGER"))
        XCTAssertTrue(doc.contains("SPØRRE OM AGENDAEN"))
        XCTAssertTrue(doc.contains("STYRE APPEN"))
    }

    // MARK: - The curated answerer (pure)

    func test_overview_answersCapabilityQuestion_withAnAction() {
        let answer = AssistantHelp.answer(for: "Hva kan du?")
        XCTAssertNotNil(answer, "«hva kan du?» is a capability question")
        // References a concrete action the user can take.
        XCTAssertTrue(answer?.text.contains("Følg") ?? false, "the overview points at «Følg …»")
        XCTAssertTrue(answer?.referencedEventIds.isEmpty ?? false, "an app-help answer references no agenda rows")
    }

    func test_howTo_reset_referencesTheNullstillAction() {
        let answer = AssistantHelp.answer(for: "Hvordan nullstiller jeg?")
        XCTAssertTrue(answer?.text.lowercased().contains("nullstill") ?? false, "the reset how-to names the «nullstill» action")
    }

    func test_howTo_follow_referencesTheFollowAction() {
        let answer = AssistantHelp.answer(for: "Hvordan følger jeg noe?")
        XCTAssertTrue(answer?.text.contains("Følg") ?? false, "the follow how-to shows «Følg …»")
    }

    func test_howTo_theme_referencesTheThemeAction() {
        let answer = AssistantHelp.answer(for: "Hvordan bytter jeg tema?")
        XCTAssertTrue(answer?.text.lowercased().contains("tema") ?? false)
    }

    func test_generalWorldKnowledge_isDeclined_notAnswered() {
        // The honesty rule (WP-68 ikke-mål): the help arm must NOT answer general
        // world knowledge — it returns nil, so the utterance falls through to the
        // agenda answer arm rather than becoming a fabricated app-help reply.
        XCTAssertNil(AssistantHelp.answer(for: "Hvordan spiller man sjakk?"))
        XCTAssertNil(AssistantHelp.answer(for: "Hva er hovedstaden i Frankrike?"))
    }

    func test_agendaQuestions_areNotHelp() {
        // Real agenda questions must NOT be captured by the help arm.
        for q in ["Hva er på i dag?", "Hva skjer i kveld?", "Når går neste etappe?", "Hva kan jeg se i kveld?"] {
            XCTAssertNil(AssistantHelp.answer(for: q), "«\(q)» is an agenda question, not app-help")
        }
    }
}

// MARK: - End-to-end through the view model + the eval corpus

@MainActor
final class AssistantHelpViewModelTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()
    private let now = AssistantTestSupport.iso("2026-07-14T09:00:00Z")

    private func makeVM() -> AssistantViewModel {
        let feed = AssistantTestSupport.liveFeed(now: now)
        return AssistantViewModel(
            assistant: MockInterestAssistant(),
            profileStore: AssistantTestSupport.tempProfileStore(),
            index: index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog(),
            feedProvider: { feed }
        )
    }

    func test_helpQuestion_answersFromCuratedFact_notTheFeed() async {
        let vm = makeVM()
        vm.utterance = "Hva kan du?"
        await vm.submit()

        XCTAssertNotNil(vm.answer, "a help question produces an answer, not a diff")
        XCTAssertTrue(vm.pending.isEmpty, "help changes nothing to confirm")
        XCTAssertTrue(vm.profile.isEmpty, "a help question never touches the profile")
        XCTAssertTrue(vm.answer?.rows.isEmpty ?? false, "app-help references no agenda rows")
        XCTAssertTrue(vm.answer?.text.contains("Følg") ?? false, "the answer references a concrete action")
    }

    func test_helpQuestion_isNotLoggedAsMisunderstood() async {
        let vm = makeVM()
        vm.utterance = "Hvordan nullstiller jeg?"
        await vm.submit()
        XCTAssertNotNil(vm.answer)
        XCTAssertTrue(vm.misunderstoodEntries.isEmpty, "answering a help question is not a misunderstanding")
        XCTAssertTrue(vm.answer?.text.lowercased().contains("nullstill") ?? false)
    }

    // MARK: - The `help` corpus category runs green under the mock (CI assertion)

    func test_helpCorpusCases_passUnderTheMock() async throws {
        let corpus = try EvalCorpus.decode(Fixture.data("eval-corpus"))
        let helpCases = corpus.cases.filter { $0.category == "help" }
        XCTAssertGreaterThanOrEqual(helpCases.count, 4, "the corpus must carry at least 4 help cases (WP-68)")

        let runner = EvalRunner(
            assistant: MockInterestAssistant(),
            index: AssistantTestSupport.liveIndex(),
            feed: AssistantTestSupport.liveFeed(now: corpus.clock)
        )
        for c in helpCases {
            let result = await runner.run(c)
            XCTAssertTrue(
                result.passed,
                "help case \(c.id) — «\(c.utterance)» — failed under the mock: " +
                result.checks.filter { !$0.passed }.map { "\($0.label): \($0.detail)" }.joined(separator: " · ")
            )
        }
    }
}
