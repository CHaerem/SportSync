//
//  MemoryDistillerTests.swift
//  ZenjiTests
//
//  WP-30 — episodic distillation: an assistant exchange becomes ONE compact,
//  structured note (never a transcript). Driven against the deterministic
//  MockMemoryDistiller (Apple Intelligence can't run in CI), it must classify
//  the durable signal, ground entityRefs through the index, set an expiry for an
//  "i kveld" plan, and stay quiet on idle chatter.
//

import XCTest

final class MemoryDistillerTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func distill(_ user: String, assistant: String = "") -> DistilledNote? {
        MockMemoryDistiller.distillSync(MemoryConversation(userText: user, assistantText: assistant), index: index, now: now)
    }

    func test_spoilerPreference_becomesASpoilerPolicyNote() {
        let note = distill("Jeg ser Tour de France på opptak i kveld, ikke røp resultatet")
        let note2 = try! XCTUnwrap(note)
        XCTAssertEqual(note2.kind, .spoilerPolicy)
        XCTAssertTrue(note2.summary.hasPrefix("Lærte:"), "the note is a compact learned line, not a transcript")
        XCTAssertTrue(note2.entityRefs.contains("tour-de-france-2026") || note2.entityRefs.contains("cycling"),
                      "entityRefs are grounded through the index")
    }

    func test_iKveldPlan_getsAnExpiry() {
        let note = try! XCTUnwrap(distill("Husk at jeg ser kampen i kveld"))
        XCTAssertNotNil(note.expiresAt, "an ephemeral 'i kveld' note ages out")
        XCTAssertEqual(note.expiresAt, MockMemoryDistiller.endOfOsloDay(now))
    }

    func test_knowledgeLevel_signalClassified() {
        let note = try! XCTUnwrap(distill("Jeg er helt fersk i sjakk, forklar gjerne"))
        XCTAssertEqual(note.kind, .knowledgeLevel)
    }

    func test_idleChatter_producesNoNote() {
        XCTAssertNil(distill("hva bør jeg se i kveld?"), "a plain question leaves no durable memory")
        XCTAssertNil(distill(""), "empty input ⇒ nil")
    }

    // MARK: - EpisodicNote ⇄ DistilledNote round-trip

    func test_distilledNote_roundTripsThroughEpisodicPayload() {
        let distilled = DistilledNote(summary: "Lærte: x", entityRefs: ["f1", "chess"], kind: .spoilerPolicy, expiresAt: now)
        let note = EpisodicNote(distilled: distilled, now: now)
        XCTAssertEqual(note.summary, "Lærte: x")
        XCTAssertEqual(note.entityRefs, ["f1", "chess"])
        XCTAssertEqual(note.memoryKindHint, .spoilerPolicy)
        XCTAssertTrue(note.isMemory)
        XCTAssertEqual(note.expiresAt?.timeIntervalSince1970 ?? 0, now.timeIntervalSince1970, accuracy: 1)
    }
}
