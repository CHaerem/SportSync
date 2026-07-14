//
//  MisunderstoodLogStoreTests.swift
//  ZenjiTests
//
//  WP-16.3 acceptance — the local "forsto ikke"-log's persistence: round-trip,
//  most-recent-first ordering, the 200-entry cap (oldest dropped first),
//  resolved-marking, notes, deletion, and — the privacy contract — the
//  exported "Del rapport" payload carries ONLY utterance/outcome/explanation/
//  note/timestamp/resolved, never a device-generated id or anything else.
//  Everything through a throwaway temp directory, mirroring ProfileStoreTests.
//

import XCTest

final class MisunderstoodLogStoreTests: XCTestCase {

    private func sampleExplanation(_ reason: String = "fant ikke noe") -> AssistantExplanation {
        AssistantExplanation(understood: "Jeg forsto ingenting konkret.", reason: reason)
    }

    // MARK: - Round trip

    func test_record_thenLoad_roundTripsAllFields() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let id = store.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: sampleExplanation(), now: now)

        let entries = store.load()
        XCTAssertEqual(entries.count, 1)
        let entry = entries[0]
        XCTAssertEqual(entry.id, id)
        XCTAssertEqual(entry.utterance, "Følg cricket")
        XCTAssertEqual(entry.outcome, .rejectedEntity)
        XCTAssertEqual(entry.explanation.reason, "fant ikke noe")
        XCTAssertEqual(entry.timestamp, now)
        XCTAssertNil(entry.note)
        XCTAssertNil(entry.resolvedAt)
        XCTAssertFalse(entry.isResolved)
    }

    func test_load_fromEmptyDirectory_isEmpty() {
        XCTAssertTrue(AssistantTestSupport.tempMisunderstoodLog().load().isEmpty)
    }

    func test_load_corruptFile_isEmpty() throws {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        try Data("{ not json".utf8).write(to: store.directoryURL.appendingPathComponent(MisunderstoodLogStore.filename))
        XCTAssertTrue(store.load().isEmpty, "corrupt log must degrade to empty, never crash")
    }

    func test_record_mostRecentFirst() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        store.record(utterance: "først", outcome: .emptyModelResponse, explanation: sampleExplanation())
        store.record(utterance: "sist", outcome: .emptyModelResponse, explanation: sampleExplanation())
        XCTAssertEqual(store.load().map(\.utterance), ["sist", "først"])
    }

    // MARK: - Capacity (WP-16.3 §1 — capped to 200, oldest dropped first)

    func test_capacity_dropsOldestBeyond200() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        for i in 0..<210 {
            store.record(utterance: "ytring \(i)", outcome: .emptyModelResponse, explanation: sampleExplanation())
        }
        let entries = store.load()
        XCTAssertEqual(entries.count, MisunderstoodLogStore.capacity)
        // Most-recent-first: the newest (209) is at the front, the oldest kept
        // is 10 (0...9 were evicted).
        XCTAssertEqual(entries.first?.utterance, "ytring 209")
        XCTAssertEqual(entries.last?.utterance, "ytring 10")
        XCTAssertFalse(entries.contains { $0.utterance == "ytring 0" }, "the oldest entries are evicted first")
    }

    // MARK: - Resolved marking (WP-16.3 §3)

    func test_markResolved_setsResolvedAt() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        let id = store.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: sampleExplanation())
        let now = Date(timeIntervalSince1970: 1_700_000_500)
        store.markResolved(id, now: now)

        let entry = store.load().first!
        XCTAssertEqual(entry.resolvedAt, now)
        XCTAssertTrue(entry.isResolved)
    }

    func test_markResolved_unknownId_isNoOp() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        store.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: sampleExplanation())
        store.markResolved(UUID())
        XCTAssertFalse(store.load().first!.isResolved)
    }

    // MARK: - Notes

    func test_setNote_setsAndTrims() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        let id = store.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: sampleExplanation())
        store.setNote("  Jeg mente rugby  ", for: id)
        XCTAssertEqual(store.load().first?.note, "Jeg mente rugby")
    }

    func test_setNote_emptyOrWhitespace_clearsToNil() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        let id = store.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: sampleExplanation())
        store.setNote("noe", for: id)
        store.setNote("   ", for: id)
        XCTAssertNil(store.load().first?.note)
    }

    // MARK: - Delete

    func test_delete_removesOnlyThatEntry() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        let keep = store.record(utterance: "behold", outcome: .rejectedEntity, explanation: sampleExplanation())
        let drop = store.record(utterance: "slett", outcome: .rejectedEntity, explanation: sampleExplanation())
        store.delete(drop)
        let entries = store.load()
        XCTAssertEqual(entries.map(\.id), [keep])
    }

    func test_deleteAll_empties() {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        store.record(utterance: "a", outcome: .rejectedEntity, explanation: sampleExplanation())
        store.record(utterance: "b", outcome: .rejectedEntity, explanation: sampleExplanation())
        store.deleteAll()
        XCTAssertTrue(store.load().isEmpty)
    }

    // MARK: - Export payload (the "Del rapport" privacy contract)

    func test_exportPayload_containsExactlyTheAllowedFields_withNote() throws {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let id = store.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: sampleExplanation("fant ikke cricket"), now: now)
        store.setNote("Jeg mente rugby", for: id)
        store.markResolved(id, now: now.addingTimeInterval(60))

        let data = store.exportPayload()
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        XCTAssertEqual(json.count, 1)
        XCTAssertEqual(Set(json[0].keys), ["utterance", "outcome", "understood", "reason", "note", "timestamp", "resolved"],
                       "the export carries ONLY the linguistic raw material — no id, no device/person metadata")
        XCTAssertEqual(json[0]["utterance"] as? String, "Følg cricket")
        XCTAssertEqual(json[0]["outcome"] as? String, "rejectedEntity")
        XCTAssertEqual(json[0]["reason"] as? String, "fant ikke cricket")
        XCTAssertEqual(json[0]["note"] as? String, "Jeg mente rugby")
        XCTAssertEqual(json[0]["resolved"] as? Bool, true)
    }

    func test_exportPayload_omitsNoteKey_whenNilAndNeverLeaksId() throws {
        let store = AssistantTestSupport.tempMisunderstoodLog()
        store.record(utterance: "Følg cricket", outcome: .emptyModelResponse, explanation: sampleExplanation())

        let data = store.exportPayload()
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        XCTAssertEqual(Set(json[0].keys), ["utterance", "outcome", "understood", "reason", "timestamp", "resolved"],
                       "a nil note is OMITTED, not encoded as null")
        XCTAssertNil(json[0]["id"], "the device-generated UUID never leaves the device")
        XCTAssertEqual(json[0]["resolved"] as? Bool, false)
    }

    func test_exportPayload_mostRecentFirst_andEmptyLogIsEmptyArray() throws {
        let empty = AssistantTestSupport.tempMisunderstoodLog()
        let emptyJSON = try XCTUnwrap(try JSONSerialization.jsonObject(with: empty.exportPayload()) as? [[String: Any]])
        XCTAssertTrue(emptyJSON.isEmpty, "an empty log exports as an empty JSON array")

        let store = AssistantTestSupport.tempMisunderstoodLog()
        store.record(utterance: "først", outcome: .emptyModelResponse, explanation: sampleExplanation())
        store.record(utterance: "sist", outcome: .emptyModelResponse, explanation: sampleExplanation())
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: store.exportPayload()) as? [[String: Any]])
        XCTAssertEqual(json.map { $0["utterance"] as? String }, ["sist", "først"])
    }
}
