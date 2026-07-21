//
//  ProfileCodecGoldenTests.swift
//  SportivistaTests
//
//  Cross-platform codec golden: a ProfileShareCodec payload the Swift side emits,
//  checked in and ALSO decoded by the JS test (tests/profile-codec-golden.test.js).
//  This is the ONE test that proves the iOS ↔ web codec is byte-compatible — the
//  real interop risk (raw DEFLATE, ISO-8601 second precision, base64url,
//  sorted-keys, the synthesized Lens JSON shape). A JS-only round-trip can't catch
//  a divergence from Swift's actual bytes; this can.
//

import XCTest

final class ProfileCodecGoldenTests: XCTestCase {

    /// The canonical golden state — mirror it field-for-field in the JS test.
    private func goldenState() -> ProfileSyncState {
        let at = Date(timeIntervalSince1970: 1_784_000_000) // 2026-07-13T13:33:20Z
        let rule = InterestRule(entityId: "team-liverpool", entityName: "Liverpool",
                                sport: "football", scope: nil, weight: 0.5,
                                reason: "Fulgt fra web", addedAt: at)
        return ProfileSyncState(rules: [SyncedRule(rule: rule, modifiedAt: at, deviceID: "dev-phone")])
    }

    /// The checked-in golden payload (produced by ProfileShareCodec.encode of
    /// goldenState). Regenerate by un-skipping `test_dumpGoldenPayload` below.
    private let goldenPayload = "fY3LasMwEEV_JczaLqrdB2gXCIVA6aZdtWShSKNYIGuMNE4oRv_ecVNKV93Nfcy5C1iaE2MuoD8ODeAUCrlgr8obyz9BniOu5wIOIzI60N7Ego3oc7C434Fez3YaKCE0MArGB3RblqBT3UOrHtvbuzfV677XnXqHKxT0Asa5_4uYOPDnXkaB0YxtDGfME1H8zV7MKCh4_hNETGWll4kyb8vrbAeRtcoumkJJ6k9zPPHGZ7O54FFevqvieyI-mrhSLhhOg3jq5r7WQ_0C"

    func test_encodeMatchesTheCheckedInGolden() throws {
        let payload = try ProfileShareCodec.encode(goldenState())
        XCTAssertEqual(payload, goldenPayload,
            "Swift codec bytes changed. If intentional, regenerate the golden (un-skip the dump test) AND update tests/profile-codec-golden.test.js.")
    }

    func test_decodeRoundTrips() throws {
        let decoded = try ProfileShareCodec.decode(goldenPayload)
        XCTAssertEqual(decoded.normalized(), goldenState().normalized())
    }

    /// One-shot generator: un-skip, run, copy the printed payload into
    /// `goldenPayload` above AND into tests/fixtures/profile-payloads/liverpool.txt.
    func test_dumpGoldenPayload() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["DUMP_GOLDEN"] == nil,
                      "set DUMP_GOLDEN=1 to print the payload")
        let payload = try ProfileShareCodec.encode(goldenState())
        print("GOLDEN-PAYLOAD-START:\(payload):GOLDEN-PAYLOAD-END")
    }
}
