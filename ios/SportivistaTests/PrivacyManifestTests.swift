//
//  PrivacyManifestTests.swift
//  SportivistaTests
//
//  WP-190 — the two artefacts that make G1 reachable at all (an app cannot get
//  external TestFlight testers without them) are exactly the kind that rot
//  silently: nothing at runtime reads `PrivacyInfo.xcprivacy`, and nothing at
//  runtime notices if the privacy-policy link 404s. These tests are the guard.
//
//  Network-free by construction: the manifests are read from the REPO (a path
//  relative to this file via `#filePath`, the same trick FeedVectorTests uses to
//  reach the shared fixtures), and the policy URL is only checked for SHAPE —
//  never fetched. A test that hit the network would be a flake, not a gate.
//

import XCTest

final class PrivacyManifestTests: XCTestCase {

    /// ios/ — the directory holding project.yml, derived from this file's path.
    private var iosDir: URL {
        URL(fileURLWithPath: #filePath)            // …/ios/SportivistaTests/PrivacyManifestTests.swift
            .deletingLastPathComponent()           // …/ios/SportivistaTests
            .deletingLastPathComponent()           // …/ios
    }

    private func manifest(at relativePath: String) throws -> [String: Any] {
        let url = iosDir.appendingPathComponent(relativePath)
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil)
        return try XCTUnwrap(plist as? [String: Any], "\(relativePath) is not a plist dictionary")
    }

    /// The reason codes declared for one required-reason API category.
    private func reasons(_ manifest: [String: Any], category: String) -> [String]? {
        let apis = manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]] ?? []
        guard let entry = apis.first(where: { $0["NSPrivacyAccessedAPIType"] as? String == category })
        else { return nil }
        return entry["NSPrivacyAccessedAPITypeReasons"] as? [String]
    }

    // MARK: - App manifest

    func test_appManifest_declaresNoTrackingAndNoCollection() throws {
        let m = try manifest(at: "Sportivista/PrivacyInfo.xcprivacy")
        XCTAssertEqual(m["NSPrivacyTracking"] as? Bool, false,
                       "Sportivista har ingen sporing — flagget skal stå eksplisitt false.")
        XCTAssertEqual((m["NSPrivacyTrackingDomains"] as? [String])?.count, 0)
        // The whole product position: nothing is collected TO US. If a future
        // change actually collects something, this test SHOULD fail loudly —
        // and docs/personvern.html has to change in the same PR.
        XCTAssertEqual((m["NSPrivacyCollectedDataTypes"] as? [[String: Any]])?.count, 0)
    }

    func test_appManifest_declaresUserDefaultsWithTheAppOwnDataReason() throws {
        let m = try manifest(at: "Sportivista/PrivacyInfo.xcprivacy")
        // CA92.1 = "user defaults, information accessible only to the app itself".
        // That is exactly UserDefaults.standard for OnboardingGate/ThemeOverride/
        // the notification preferences — no shared app-group suite.
        XCTAssertEqual(reasons(m, category: "NSPrivacyAccessedAPICategoryUserDefaults"), ["CA92.1"])
    }

    func test_appManifest_declaresNoUnusedRequiredReasonCategories() throws {
        let m = try manifest(at: "Sportivista/PrivacyInfo.xcprivacy")
        // Over-declaring is as inaccurate as under-declaring. The app uses no
        // file-timestamp / boot-time / disk-space / active-keyboard API (verified
        // by grep over ios/Sportivista, WP-190).
        for unused in ["NSPrivacyAccessedAPICategoryFileTimestamp",
                       "NSPrivacyAccessedAPICategorySystemBootTime",
                       "NSPrivacyAccessedAPICategoryDiskSpace",
                       "NSPrivacyAccessedAPICategoryActiveKeyboards"] {
            XCTAssertNil(reasons(m, category: unused),
                         "\(unused) er deklarert, men ingen kode bruker den.")
        }
    }

    // MARK: - Widget manifest

    func test_widgetManifest_isTheStricterCase() throws {
        let m = try manifest(at: "SportivistaWidget/PrivacyInfo.xcprivacy")
        XCTAssertEqual(m["NSPrivacyTracking"] as? Bool, false)
        XCTAssertEqual((m["NSPrivacyTrackingDomains"] as? [String])?.count, 0)
        XCTAssertEqual((m["NSPrivacyCollectedDataTypes"] as? [[String: Any]])?.count, 0)
        // The widget target compiles no UserDefaults/@AppStorage code at all
        // (project.yml keeps its source list to the read half of Sync + Feed).
        XCTAssertEqual((m["NSPrivacyAccessedAPITypes"] as? [[String: Any]])?.count, 0)
    }

    // MARK: - The human-readable twin

    func test_privacyPolicyURL_pointsAtThePublishedPage() {
        // Shape only — never fetched. The page itself lives at
        // docs/personvern.html and is deliberately outside the sign-in gate.
        XCTAssertEqual(DegView.privacyURL.scheme, "https")
        XCTAssertEqual(DegView.privacyURL.host, "sportivista.com")
        XCTAssertEqual(DegView.privacyURL.path, "/personvern.html")
    }

    func test_privacyPolicyPageExistsAndIsUngated() throws {
        let page = iosDir
            .deletingLastPathComponent()                 // repo root
            .appendingPathComponent("docs/personvern.html")
        let html = try String(contentsOf: page, encoding: .utf8)
        // Must NOT be behind the whole-site sign-in gate: App Store review and a
        // prospective user both have to read it without an account.
        // Match the ACTUAL wiring, not the prose: the file's own header comment
        // names both mechanisms in order to explain why it opts out of them.
        XCTAssertFalse(html.contains("src=\"js/gate-boot.js\""),
                       "Personvernsiden må stå utenfor innloggings-gaten.")
        XCTAssertFalse(html.contains("<body class=\"gated\""),
                       "Personvernsiden må stå utenfor innloggings-gaten.")
        XCTAssertTrue(html.contains("<title>Sportivista · Personvern</title>"))
    }
}
