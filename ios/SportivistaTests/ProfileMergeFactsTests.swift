//
//  ProfileMergeFactsTests.swift
//  SportivistaTests
//
//  WP-30 — structured memory facts ride the WP-19 sync merge (extends it): the
//  facts layer is LAST-WRITER-WINS + tombstone, exactly like rules, and keeps
//  the CRDT properties (commutative, idempotent, tombstone-respecting) so memory
//  converges across the user's own devices / a QR import.
//

import XCTest

final class ProfileMergeFactsTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func fact(id: String, value: String, updatedAt: Date, deviceID: String, deleted: Bool = false) -> MemoryFact {
        MemoryFact(id: id, sport: "f1", kind: .spoilerPolicy, value: value, reason: "r", updatedAt: updatedAt, deviceID: deviceID, deleted: deleted)
    }

    private func state(_ facts: [MemoryFact]) -> ProfileSyncState { ProfileSyncState(facts: facts) }

    func test_lastWriterWins_newerUpdatedAt() {
        let a = state([fact(id: "f", value: "old", updatedAt: t0, deviceID: "A")])
        let b = state([fact(id: "f", value: "new", updatedAt: t0.addingTimeInterval(60), deviceID: "B")])
        XCTAssertEqual(ProfileMerge.merge(local: a, remote: b).merged.facts.first?.value, "new")
    }

    func test_tombstoneWinsOnClockTie() {
        let live = state([fact(id: "f", value: "v", updatedAt: t0, deviceID: "A")])
        let dead = state([fact(id: "f", value: "v", updatedAt: t0, deviceID: "B", deleted: true)])
        XCTAssertEqual(ProfileMerge.merge(local: live, remote: dead).merged.facts.first?.deleted, true,
                       "on an equal clock a deletion is not revived on a coin-flip")
    }

    func test_deletionReplicates_notRevivedByStaleLiveCopy() {
        let stale = state([fact(id: "f", value: "v", updatedAt: t0, deviceID: "A")])
        let deleted = state([fact(id: "f", value: "v", updatedAt: t0.addingTimeInterval(120), deviceID: "A", deleted: true)])
        let merged = ProfileMerge.merge(local: stale, remote: deleted).merged
        XCTAssertEqual(merged.facts.first?.deleted, true, "a newer delete beats a stale live edit")
        XCTAssertTrue(MemoryState(from: merged).facts.isEmpty, "and the live view shows nothing")
    }

    func test_commutative() {
        let a = state([fact(id: "f1", value: "a", updatedAt: t0, deviceID: "A"),
                       fact(id: "f2", value: "b", updatedAt: t0.addingTimeInterval(10), deviceID: "A")])
        let b = state([fact(id: "f1", value: "a2", updatedAt: t0.addingTimeInterval(5), deviceID: "B")])
        XCTAssertEqual(ProfileMerge.merge(local: a, remote: b).merged,
                       ProfileMerge.merge(local: b, remote: a).merged,
                       "merge is order-independent")
    }

    func test_idempotent() {
        let a = state([fact(id: "f", value: "v", updatedAt: t0, deviceID: "A")])
        XCTAssertEqual(ProfileMerge.merge(local: a, remote: a).merged, a.deduplicated())
    }

    func test_pushSet_carriesFactsRemoteIsBehindOn() {
        let local = state([fact(id: "f", value: "new", updatedAt: t0.addingTimeInterval(60), deviceID: "A")])
        let remote = state([fact(id: "f", value: "old", updatedAt: t0, deviceID: "B")])
        let push = ProfileMerge.merge(local: local, remote: remote).toPush
        XCTAssertEqual(push.facts.map(\.value), ["new"], "the remote is behind on the newer fact")
    }

    func test_qrPayload_carriesFactsRoundTrip() throws {
        let s = state([fact(id: "f", value: "opptak", updatedAt: t0, deviceID: "A")]).normalized()
        let payload = try ProfileShareCodec.encode(s)
        XCTAssertEqual(try ProfileShareCodec.decode(payload), s, "facts survive the QR/share payload round-trip")
    }
}
