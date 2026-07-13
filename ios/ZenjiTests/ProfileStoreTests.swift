//
//  ProfileStoreTests.swift
//  ZenjiTests
//
//  WP-16 acceptance — persistence round-trip. Save → load returns an equal
//  profile; a missing or corrupt file yields an empty profile (never throws on
//  read, WP-12 DataStore's robustness contract); writes are atomic. All through
//  a throwaway temp directory, never this process's real Application Support.
//

import XCTest

final class ProfileStoreTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func sampleProfile() -> InterestProfile {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        return InterestProfile()
            .applying(GroundedMutation(kind: .add, entity: index.entity(id: "casper-ruud")!, scope: "bare i Grand Slams", weight: 0.6, reason: "fordi Ruud", previousRule: nil), now: now)
            .applying(GroundedMutation(kind: .add, entity: index.entity(id: "viktor-hovland")!, scope: nil, weight: 0.5, reason: "golf-favoritt", previousRule: nil), now: now)
    }

    func test_saveThenLoad_roundTripsEqual() throws {
        let store = AssistantTestSupport.tempProfileStore()
        let profile = sampleProfile()
        try store.save(profile)
        XCTAssertEqual(store.load(), profile)
    }

    func test_load_fromEmptyDirectory_isEmptyProfile() {
        let store = AssistantTestSupport.tempProfileStore()
        XCTAssertTrue(store.load().isEmpty)
    }

    func test_load_corruptFile_isEmptyProfile() throws {
        let store = AssistantTestSupport.tempProfileStore()
        let url = store.directoryURL.appendingPathComponent(ProfileStore.filename)
        try Data("{ not json".utf8).write(to: url)
        XCTAssertTrue(store.load().isEmpty, "corrupt cache must degrade to empty, not crash")
    }

    func test_save_overwritesPreviousProfile() throws {
        let store = AssistantTestSupport.tempProfileStore()
        try store.save(sampleProfile())

        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let replacement = InterestProfile().applying(
            GroundedMutation(kind: .add, entity: index.entity(id: "magnus-carlsen")!, scope: nil, weight: 0.5, reason: "sjakk", previousRule: nil),
            now: now
        )
        try store.save(replacement)
        XCTAssertEqual(store.load().rules.map(\.entityId), ["magnus-carlsen"])
    }

    func test_reasonSurvivesRoundTrip() throws {
        let store = AssistantTestSupport.tempProfileStore()
        try store.save(sampleProfile())
        let loaded = store.load()
        XCTAssertEqual(loaded.rule(for: "casper-ruud")?.reason, "fordi Ruud")
        XCTAssertFalse(loaded.rules.contains { $0.reason.isEmpty }, "every rule keeps its Norwegian reason")
    }
}
