//
//  AppVersionCheckTests.swift
//  ZenjiTests
//
//  «Har jeg siste versjon?» — the pure judgement (AppVersionCheck, Sync/)
//  between the build-time Info.plist stamp and the published
//  app-version.json. The Bundle-reading glue (BuildStamp, app root) is
//  deliberately not compiled here.
//

import XCTest

final class AppVersionCheckTests: XCTestCase {

    private let published = AppVersion(iosCommit: "a1b2c3d", committedAt: nil, generatedAt: nil)

    func test_matchingStamp_isCurrent() {
        XCTAssertEqual(AppVersionCheck.isCurrent(stamp: "a1b2c3d", published: published), true)
    }

    func test_differentStamp_isStale() {
        XCTAssertEqual(AppVersionCheck.isCurrent(stamp: "0ff1ce0", published: published), false)
    }

    func test_dirtyStamp_comparesOnBaseCommit() {
        XCTAssertEqual(AppVersionCheck.isCurrent(stamp: "a1b2c3d-dirty", published: published), true)
        XCTAssertEqual(AppVersionCheck.isCurrent(stamp: "0ff1ce0-dirty", published: published), false)
    }

    func test_noPublishedTruth_orUnstampedBuild_hasNoVerdict() {
        XCTAssertNil(AppVersionCheck.isCurrent(stamp: "a1b2c3d", published: nil))
        XCTAssertNil(AppVersionCheck.isCurrent(stamp: "ukjent", published: published))
        XCTAssertNil(AppVersionCheck.isCurrent(stamp: "", published: published))
    }

    func test_line_saysSiste_nyereFinnes_orJustTheStamp() {
        XCTAssertEqual(
            AppVersionCheck.line(stamp: "a1b2c3d", date: "16.07 21:40", published: published),
            "BYGG a1b2c3d · 16.07 21:40 · SISTE"
        )
        XCTAssertEqual(
            AppVersionCheck.line(stamp: "0ff1ce0", date: "16.07 21:40", published: published),
            "BYGG 0ff1ce0 · 16.07 21:40 · NYERE FINNES (a1b2c3d)"
        )
        XCTAssertEqual(
            AppVersionCheck.line(stamp: "a1b2c3d", date: "", published: nil),
            "BYGG a1b2c3d"
        )
    }

    func test_appVersion_decodesFromPublishedJson() throws {
        let json = #"{"iosCommit":"a1b2c3d","committedAt":"2026-07-16T21:00:00+02:00","generatedAt":"2026-07-16T19:05:00.000Z"}"#
        let v = try ZenjiJSON.decoder.decode(AppVersion.self, from: Data(json.utf8))
        XCTAssertEqual(v.iosCommit, "a1b2c3d")
    }
}
