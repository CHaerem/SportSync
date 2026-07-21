//
//  CoverageRequestTests.swift
//  SportivistaTests
//
//  WP-165 — the pure URL builder behind the «meld inn ønsket» tap. Network-free:
//  it only asserts the shape of the pre-filled public GitHub issue URL, whose
//  `coverage-request` label + `### Entitet` / `### Sport` body are the parse
//  contract shared with scripts/lib/demand.js and the web builder.
//

// Hostless logic bundle: the app's Profile/ sources (incl. CoverageRequest.swift)
// are compiled directly into this test target — no `@testable import Sportivista`,
// same pattern as the other SportivistaTests.
import XCTest

final class CoverageRequestTests: XCTestCase {

    /// Decode a query item back to its (percent-decoded) value.
    private func queryValue(_ url: URL, _ name: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == name })?.value
    }

    func test_buildsPublicCoverageRequestURL() throws {
        let url = try XCTUnwrap(CoverageRequest.issueURL(name: "Liverpool", sport: "football"))
        let comps = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(comps.scheme, "https")
        XCTAssertEqual(comps.host, "github.com")
        XCTAssertEqual(comps.path, "/CHaerem/sportivista/issues/new")
        XCTAssertEqual(queryValue(url, "labels"), "coverage-request")
        XCTAssertEqual(queryValue(url, "title"), "[dekning] Liverpool")
    }

    func test_bodyCarriesTheEntityAndSportSections() throws {
        let url = try XCTUnwrap(CoverageRequest.issueURL(name: "Liverpool", sport: "football"))
        let body = try XCTUnwrap(queryValue(url, "body"))
        // The exact `### <heading>\n\n<value>` shape scripts/lib/demand.js parses.
        XCTAssertTrue(body.contains("### Entitet\n\nLiverpool"), body)
        XCTAssertTrue(body.contains("### Sport\n\nfootball"), body)
    }

    func test_missingSportWritesTheUnsetPlaceholder() throws {
        let url = try XCTUnwrap(CoverageRequest.issueURL(name: "Vipers Kristiansand"))
        let body = try XCTUnwrap(queryValue(url, "body"))
        XCTAssertTrue(body.contains("### Sport\n\n(ikke satt)"), body)
    }

    func test_trimsNameAndCarriesNoProfileData() throws {
        let url = try XCTUnwrap(CoverageRequest.issueURL(name: "  Brann  ", sport: "football"))
        XCTAssertEqual(queryValue(url, "title"), "[dekning] Brann")
        let body = try XCTUnwrap(queryValue(url, "body")).lowercased()
        XCTAssertTrue(body.contains("anonym"))
        // The disclaimer says «ingen profil- eller enhetsdata»; what must NOT leak is
        // any actual transported identifier (a device/profile id or storage key).
        XCTAssertFalse(body.contains("ss-device"))
        XCTAssertFalse(body.contains("ss-profile"))
        XCTAssertFalse(body.contains("entityid"))
    }

    func test_emptyNameReturnsNil() {
        XCTAssertNil(CoverageRequest.issueURL(name: ""))
        XCTAssertNil(CoverageRequest.issueURL(name: "   "))
    }

    func test_specialCharactersRoundTripThroughEncoding() throws {
        // Bodø/Glimt: the slash + non-ASCII must survive encode → decode intact.
        let url = try XCTUnwrap(CoverageRequest.issueURL(name: "Bodø/Glimt", sport: "football"))
        XCTAssertEqual(queryValue(url, "title"), "[dekning] Bodø/Glimt")
        let body = try XCTUnwrap(queryValue(url, "body"))
        XCTAssertTrue(body.contains("### Entitet\n\nBodø/Glimt"), body)
    }
}
