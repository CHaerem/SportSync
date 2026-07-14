//
//  AssistantAnswerTests.swift
//  ZenjiTests
//
//  WP-16.4 — the answer arm end-to-end through the view model with the
//  deterministic mock and a fixed local feed: a question produces an answer
//  that references the RIGHT rows (with their real time · title · channel),
//  never touches the profile, and never pollutes the WP-16.3 forsto-ikke-log
//  (a question isn't a misunderstood command).
//

import XCTest

@MainActor
final class AssistantAnswerTests: XCTestCase {

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

    func test_tonight_answersWithTheEveningRow() async {
        let vm = makeVM()
        vm.utterance = "Hva bør jeg se i kveld?"
        await vm.submit()

        let answer = vm.answer
        XCTAssertNotNil(answer, "a question produces an answer, not a diff")
        XCTAssertTrue(vm.pending.isEmpty)
        XCTAssertTrue(answer?.rows.contains { $0.title == "VM-semifinale 1" } ?? false,
                      "the evening semifinal is the tonight answer")
        XCTAssertTrue(answer?.text.contains("TV 2") ?? false, "the prose names the channel")
        XCTAssertTrue(vm.profile.isEmpty, "a question changes nothing")
    }

    func test_nextTourDeFranceStage_answersWithEtappe10() async {
        let vm = makeVM()
        vm.utterance = "Når går neste TdF-etappe?"
        await vm.submit()

        let answer = vm.answer
        XCTAssertNotNil(answer)
        XCTAssertEqual(answer?.rows.first?.id, "bfafa2ba58a1", "next TdF stage after 09:00 is Etappe 10")
        XCTAssertTrue(answer?.text.contains("TV 2 Play") ?? false)
    }

    func test_question_isNotLoggedAsMisunderstood() async {
        let vm = makeVM()
        vm.utterance = "Hva bør jeg se i kveld?"
        await vm.submit()
        XCTAssertTrue(vm.misunderstoodEntries.isEmpty, "answering a question is not a misunderstanding")
    }

    func test_command_stillRoutesToADiff_notAnAnswer() async {
        let vm = makeVM()
        vm.utterance = "Følg Magnus Carlsen"
        await vm.submit()
        XCTAssertNil(vm.answer)
        XCTAssertEqual(vm.pending.map(\.entity.id), ["magnus-carlsen"])
    }
}
