//
//  ProfileShareCodecTests.swift
//  ZenjiTests
//
//  WP-19 — the QR / delelenke bridge, the valuable-NOW cross-device path that
//  needs no paid account. Pins: a compressed payload round-trips, a deep link
//  round-trips, importing MERGES (never overwrites — the whole contract), a
//  shared tombstone deletes on import, and malformed/old/empty payloads fail
//  calmly. Also that the QR bitmap builds. No iCloud, no network.
//

import XCTest

final class ProfileShareCodecTests: XCTestCase {

    private func t(_ offset: TimeInterval) -> Date { Date(timeIntervalSince1970: 1_700_000_000 + offset) }

    private func synced(_ id: String, at: TimeInterval, device: String, deleted: Bool = false, weight: Double = 0.5) -> SyncedRule {
        SyncedRule(rule: InterestRule(entityId: id, entityName: id.capitalized, sport: "tennis", scope: nil,
                                      weight: weight, reason: "fordi \(id)", addedAt: t(0)),
                   modifiedAt: t(at), deviceID: device, deleted: deleted)
    }

    private func state(_ rules: SyncedRule...) -> ProfileSyncState { ProfileSyncState(rules: rules) }

    // MARK: - Payload round-trip

    func test_encodeDecode_roundTrips() throws {
        let original = state(synced("a", at: 10, device: "A"), synced("b", at: 20, device: "B"))
        let payload = try ProfileShareCodec.encode(original)
        let decoded = try ProfileShareCodec.decode(payload)
        XCTAssertEqual(decoded, original.normalized())
    }

    func test_payload_isURLSafe() throws {
        let payload = try ProfileShareCodec.encode(state(synced("a", at: 10, device: "A")))
        XCTAssertFalse(payload.contains("+"))
        XCTAssertFalse(payload.contains("/"))
        XCTAssertFalse(payload.contains("="))
    }

    // MARK: - Deep link round-trip

    func test_link_roundTrips() throws {
        let original = state(synced("a", at: 10, device: "A"))
        let url = try ProfileShareCodec.link(for: original)
        XCTAssertEqual(url.scheme, "sportivista")
        XCTAssertEqual(url.host, "profile")
        XCTAssertEqual(try ProfileShareCodec.state(from: url), original.normalized())
    }

    // MARK: - Import MERGES (the contract)

    func test_import_mergesRatherThanOverwrites() throws {
        // Local follows "a" and "b"; the imported payload follows "b" (older) and
        // "c". After import: a (kept), b (local wins — newer), c (adopted).
        let local = state(synced("a", at: 30, device: "L"),
                          synced("b", at: 30, device: "L", weight: 0.9))
        let shared = state(synced("b", at: 10, device: "R", weight: 0.1),
                           synced("c", at: 20, device: "R"))
        let payload = try ProfileShareCodec.encode(shared)

        let outcome = try ProfileShareCodec.merge(payload: payload, into: local)
        XCTAssertEqual(outcome.merged.profile.rules.map(\.entityId), ["a", "b", "c"], "nothing lost — union")
        XCTAssertEqual(outcome.merged.rules.first { $0.entityId == "b" }?.rule.weight, 0.9,
                       "the newer LOCAL edit survives the import")
        // The result is exactly the underlying merge — import is merge.
        XCTAssertEqual(outcome.merged, ProfileMerge.merge(local: local, remote: shared).merged)
    }

    func test_import_respectsSharedTombstone() throws {
        // A phone that UNFOLLOWED "a" shares its profile; importing must delete
        // "a" locally (the shared tombstone is newer).
        let local = state(synced("a", at: 10, device: "L"))
        let shared = state(synced("a", at: 40, device: "R", deleted: true))
        let payload = try ProfileShareCodec.encode(shared)

        let outcome = try ProfileShareCodec.merge(payload: payload, into: local)
        XCTAssertTrue(outcome.merged.profile.isEmpty, "the shared deletion replicates on import")
    }

    // MARK: - Errors

    func test_import_emptyPayload_throwsEmpty() throws {
        let payload = try ProfileShareCodec.encode(ProfileSyncState())
        XCTAssertThrowsError(try ProfileShareCodec.merge(payload: payload, into: ProfileSyncState())) { error in
            XCTAssertEqual(error as? ProfileShareError, .empty)
        }
    }

    func test_decode_garbage_throwsMalformed() {
        XCTAssertThrowsError(try ProfileShareCodec.decode("!!!not base64!!!")) { error in
            XCTAssertEqual(error as? ProfileShareError, .malformed)
        }
    }

    func test_link_wrongScheme_throwsMalformed() {
        let url = URL(string: "https://example.com/profile?v=1&d=abc")!
        XCTAssertThrowsError(try ProfileShareCodec.state(from: url)) { error in
            XCTAssertEqual(error as? ProfileShareError, .malformed)
        }
    }

    func test_link_futureVersion_throwsUnsupported() throws {
        let payload = try ProfileShareCodec.encode(state(synced("a", at: 10, device: "A")))
        let url = URL(string: "sportivista://profile?v=999&d=\(payload)")!
        XCTAssertThrowsError(try ProfileShareCodec.state(from: url)) { error in
            XCTAssertEqual(error as? ProfileShareError, .unsupportedVersion(999))
        }
    }

    // MARK: - QR bitmap

    func test_qrImage_buildsForALink() throws {
        let url = try ProfileShareCodec.link(for: state(synced("a", at: 10, device: "A")))
        XCTAssertNotNil(ProfileQRCode.image(for: url.absoluteString), "a valid link yields a QR bitmap")
        XCTAssertNil(ProfileQRCode.image(for: ""), "an empty string yields no image")
    }
}
