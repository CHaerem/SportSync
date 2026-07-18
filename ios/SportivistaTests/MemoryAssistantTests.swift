//
//  MemoryAssistantTests.swift
//  SportivistaTests
//
//  WP-30 — the memory shows up in the assistant: a Q&A answer CHANGES when the
//  memory says the user is a beginner (retrieval, driven through the mock), the
//  saveMemory tool round-trips a learned fact into the store, and the view model
//  exposes the "Hva jeg vet om deg" CRUD + "Glem alt" + behaviour recording.
//

import XCTest

final class MemoryAssistantTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()
    private let now = AssistantTestSupport.iso("2026-07-13T10:00:00Z")

    // MARK: - Answer reflects a knowledge-level memory

    func test_answerIntent_changesWithKnowledgeLevelMemory() async throws {
        let events = [EventBuilder.make(sport: "chess", title: "Sjakk-NM runde 3", time: "2026-07-13T16:00:00Z")]
        let feed = FeedQuery.build(events: events, interests: Interests(followBroadly: ["chess"]), now: now)
        let mock = MockInterestAssistant()
        let profile = InterestProfile()
        let question = "hva skjer i sjakk i dag?"

        let plain = try await mock.interpret(utterance: question, profile: profile, index: index, feed: feed)
        let beginner = MemoryState(facts: [MemoryFact(sport: "chess", kind: .knowledgeLevel, value: "nybegynner", reason: "r", updatedAt: now)])
        let personal = try await mock.interpret(utterance: question, profile: profile, index: index, feed: feed, memory: MemoryContext(state: beginner))

        guard case let .answer(a1) = plain, case let .answer(a2) = personal else {
            return XCTFail("both should route to the answer arm")
        }
        XCTAssertNotEqual(a1.text, a2.text, "the same question yields a different answer once memory knows the user is a beginner")
        XCTAssertTrue(a2.text.contains("fagtermer"), "the personalised answer offers to explain fagtermer")
        XCTAssertFalse(a1.text.contains("fagtermer"), "the memory-free answer does not")
    }

    // MARK: - saveMemory tool round-trip

    #if canImport(FoundationModels)
    func test_saveMemoryTool_roundTripsThroughTheStore() async throws {
        let store = AssistantTestSupport.tempMemoryStore()
        let tool = SaveMemoryTool(sink: store)
        _ = try await tool.call(arguments: .init(kind: "spoilerPolicy", entityId: "", sport: "f1", value: "opptak", reason: "ser på opptak"))

        let facts = store.load().facts
        XCTAssertEqual(facts.count, 1)
        XCTAssertEqual(facts.first?.kind, .spoilerPolicy)
        XCTAssertEqual(facts.first?.sport, "f1")
        XCTAssertEqual(facts.first?.value, "opptak")
    }

    func test_saveMemoryTool_kindMapping() {
        XCTAssertEqual(SaveMemoryTool.memoryKind(from: "knowledgeLevel"), .knowledgeLevel)
        XCTAssertEqual(SaveMemoryTool.memoryKind(from: "spoiler"), .spoilerPolicy)
        XCTAssertEqual(SaveMemoryTool.memoryKind(from: "vrøvl"), .note)
    }
    #endif

    // MARK: - View-model CRUD + forget-all

    @MainActor
    func test_viewModel_memoryCRUD_andForgetAll() {
        let store = AssistantTestSupport.tempMemoryStore()
        let vm = AssistantViewModel(assistant: MockInterestAssistant(), profileStore: store.profileStore, index: index, memoryStore: store)
        XCTAssertEqual(vm.memoryItemCount, 0)

        // Add a fact.
        vm.updateFact(MemoryFact(sport: "chess", kind: .knowledgeLevel, value: "nybegynner", reason: "r", updatedAt: now))
        XCTAssertEqual(vm.memory.facts.count, 1)

        // Edit it in place (same id).
        var edited = try! XCTUnwrap(vm.memory.facts.first)
        edited.value = "middels"
        vm.updateFact(edited)
        XCTAssertEqual(vm.memory.facts.count, 1)
        XCTAssertEqual(vm.memory.facts.first?.value, "middels")

        // A behaviour open on an event registers a stat.
        vm.recordOpened(EventBuilder.make(sport: "tennis", title: "x", time: "2026-07-13T18:00:00Z", homeTeamEntityId: "fk-lyn-oslo"))
        XCTAssertTrue(vm.memory.behavior.contains { $0.kind == .open })

        // Delete the fact (tombstone) — gone from the live view.
        vm.deleteFact(edited)
        XCTAssertTrue(vm.memory.facts.isEmpty)

        // Forget-all clears everything remembered.
        vm.forgetAllMemory()
        XCTAssertTrue(vm.memory.isEmpty)
    }

    @MainActor
    func test_viewModel_spoilerShield_tracksMemory() {
        let store = AssistantTestSupport.tempMemoryStore()
        let vm = AssistantViewModel(assistant: MockInterestAssistant(), profileStore: store.profileStore, index: index, memoryStore: store)
        XCTAssertTrue(vm.spoilerShield.isEmpty)
        vm.updateFact(MemoryFact(sport: "f1", kind: .spoilerPolicy, value: "opptak", reason: "r", updatedAt: now))
        XCTAssertTrue(vm.spoilerShield.sports.contains("f1"), "the exposed shield reflects a just-added spoiler policy")
    }
}
