//
//  AssistantIntentRoutingTests.swift
//  ZenjiTests
//
//  WP-16.4 — the command line understands BOTH profile changes and questions.
//  These pin the deterministic router: `MockAnswerer.isQuestion` and the
//  `MockInterestAssistant.interpret` intent split. Every WP-16 command phrase
//  must still route to `.mutations` (so the whole mutation pipeline is
//  untouched), while genuine questions route to `.answer`. FM is never run in
//  CI — the mock is the exact same code path minus the model.
//

import XCTest

final class AssistantIntentRoutingTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()
    private func feed() -> FeedQuery { AssistantTestSupport.liveFeed(now: AssistantTestSupport.iso("2026-07-14T09:00:00Z")) }

    // MARK: - isQuestion

    func test_questions_areRoutedToTheAnswerArm() {
        for q in [
            "Hva bør jeg se i kveld?",
            "Når går neste TdF-etappe?",
            "hvem spiller i dag",
            "Hvilke kamper er det i morgen?",
            "hvor kan jeg se Wimbledon?",
            "Hva skjer i helgen?",
        ] {
            XCTAssertTrue(MockAnswerer.isQuestion(q), "«\(q)» should be treated as a question")
        }
    }

    func test_commands_areNOTQuestions() {
        for c in [
            "Følg Casper Ruud bare i Grand Slams",
            "Slutt med tennis",
            "Mer sykkel i juli",
            "Fjern Hovland",
            "Prioriter 100 Thieves høyere",
            "Følg Tour de France med fokus på norske utøvere",
            "gjør noe fint med sporten min",
        ] {
            XCTAssertFalse(MockAnswerer.isQuestion(c), "«\(c)» is a command, not a question")
        }
    }

    // MARK: - interpret() routing

    func test_interpret_command_routesToMutations() async throws {
        let turn = try await MockInterestAssistant().interpret(
            utterance: "Følg Casper Ruud", profile: InterestProfile(), index: index, feed: feed()
        )
        guard case let .mutations(m) = turn else { return XCTFail("a command must route to mutations") }
        XCTAssertEqual(m.map(\.entityId), ["casper-ruud"])
    }

    func test_interpret_question_routesToAnswer() async throws {
        let turn = try await MockInterestAssistant().interpret(
            utterance: "Hva bør jeg se i kveld?", profile: InterestProfile(), index: index, feed: feed()
        )
        guard case let .answer(a) = turn else { return XCTFail("a question must route to an answer") }
        XCTAssertFalse(a.text.isEmpty)
        XCTAssertFalse(a.referencedEventIds.isEmpty, "the answer references real rows")
    }

    func test_interpret_producesNothing_forAQuestion_isAnEmptyAnswer_notMutations() async throws {
        // A usable model that returns nothing for a QUESTION must not fall
        // through to the mutation arm.
        let turn = try await MockInterestAssistant(behavior: .producesNothing).interpret(
            utterance: "Hva bør jeg se i kveld?", profile: InterestProfile(), index: index, feed: feed()
        )
        guard case let .answer(a) = turn else { return XCTFail("still the answer arm") }
        XCTAssertTrue(a.text.isEmpty)
    }
}
