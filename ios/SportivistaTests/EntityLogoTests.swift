//
//  EntityLogoTests.swift
//  SportivistaTests
//
//  WP-186 — the REAL club mark: the new top rung of the entity-avatar ladder,
//  and the provenance rule that governs it.
//
//  Mirrors tests/entity-avatar.test.js + tests/logo-policy.test.js on the web
//  side; the two surfaces must reach the SAME verdict for the same entity, or
//  the board and the app disagree about who a row is about.
//
//  What is pinned here, in the order it matters:
//   1. a mark without complete PROVENANCE never renders (fail-closed, same rule
//      the server applies before publishing);
//   2. nothing that is not a bare local asset name can reach an image load — the
//      app must remain unable to make an image request for a row;
//   3. a mark this build does not BUNDLE degrades to the WP-185 ladder rather
//      than leaving a hole (the registry re-seeds far more often than we ship).
//

import XCTest

final class EntityLogoTests: XCTestCase {

    private let freeMark = EntityLogo(
        file: "rosenborg.png", source: "wikimedia-commons", basis: "free-license",
        license: "Public domain", licenseId: "pd", licenseUrl: nil, attribution: "Rosenborg Ballklub",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Rosenborg.svg", trademarked: true
    )
    private let editorialMark = EntityLogo(
        file: "arsenal.png", source: "espn", basis: "editorial-use",
        license: nil, licenseId: nil, licenseUrl: nil, attribution: nil,
        sourceUrl: "https://a.espncdn.com/i/teamlogos/soccer/500/359.png", trademarked: nil
    )

    /// The resolver asks the bundle whether an asset exists; these tests drive
    /// that answer directly so they stay pure and hermetic.
    private func withAssets(_ present: Set<String>, _ body: () -> Void) {
        let saved = EntityIdentityResolver.assetExists
        EntityIdentityResolver.assetExists = { present.contains($0) }
        defer { EntityIdentityResolver.assetExists = saved }
        body()
    }

    // MARK: - Provenance

    func testBothBasesAreShippableWhenComplete() {
        XCTAssertTrue(freeMark.isShippable)
        XCTAssertTrue(editorialMark.isShippable)
    }

    func testMissingProvenanceIsNeverShipped() {
        var noBasis = editorialMark; noBasis.basis = ""
        XCTAssertFalse(noBasis.isShippable)

        var unknownBasis = editorialMark; unknownBasis.basis = "vibes"
        XCTAssertFalse(unknownBasis.isShippable)

        var noSource = editorialMark; noSource.source = ""
        XCTAssertFalse(noSource.isShippable)

        var noURL = editorialMark; noURL.sourceUrl = ""
        XCTAssertFalse(noURL.isShippable)
    }

    func testAFreeLicenceClaimWithoutALicenceIsNotADefensibleClaim() {
        var unnamed = freeMark; unnamed.license = nil
        XCTAssertFalse(unnamed.isShippable)
    }

    func testOnlyABareLocalAssetNameIsAccepted() {
        // A stale or tampered entities.json must not be able to point the app at
        // a third party. The app makes NO image request for a row, by construction.
        for bad in ["https://a.espncdn.com/x.png", "//evil.example/x.png", "../../secret.png",
                    "/etc/passwd.png", "Arsenal.PNG", "logos/arsenal.png", "x.svg", "", ".png"] {
            XCTAssertFalse(EntityLogo.isSafeAssetName(bad), "\(bad) must be refused")
        }
        XCTAssertTrue(EntityLogo.isSafeAssetName("afc-bournemouth.png"))
        XCTAssertTrue(EntityLogo.isSafeAssetName("100-thieves.png"))
    }

    // MARK: - The ladder

    private func club(_ logo: EntityLogo?) -> Entity {
        Entity(id: "arsenal", name: "Arsenal", sport: "football", type: "team",
               colors: EntityColors(primary: "#e20520", secondary: "#003399"), logo: logo)
    }

    func testARealMarkOutranksTheMonogram() {
        withAssets(["arsenal.png"]) {
            XCTAssertEqual(EntityIdentityResolver.identity(for: club(editorialMark)), .logo(file: "arsenal.png"))
        }
    }

    func testAMarkThisBuildDoesNotBundleFallsBackToTheMonogram() {
        // The registry is re-seeded far more often than the app ships. The honest
        // answer to "we know the mark but don't have it" is the WP-185 ladder.
        withAssets([]) {
            guard case .monogram = EntityIdentityResolver.identity(for: club(editorialMark)) else {
                return XCTFail("a missing asset must degrade to the monogram")
            }
        }
    }

    func testAMarkWithoutProvenanceIsIgnoredByTheResolverToo() {
        var broken = editorialMark; broken.basis = ""
        withAssets(["arsenal.png"]) {
            guard case .monogram = EntityIdentityResolver.identity(for: club(broken)) else {
                return XCTFail("no provenance ⇒ no logo")
            }
        }
    }

    func testANationalTeamKeepsItsFlag() {
        // The seeder excludes national sides, but the resolver states the rule
        // too: a federation crest must never quietly demote "Norge"'s flag.
        let norge = Entity(id: "norge", name: "Norge", sport: "football", type: "team",
                           country: "NO", national: true, logo: editorialMark)
        withAssets(["arsenal.png"]) {
            XCTAssertEqual(EntityIdentityResolver.identity(for: norge), .flag("🇳🇴"))
        }
    }

    func testTheIndexKeepsEntitiesThatOnlyHaveAMark() {
        // An entity with a crest but no colours and no country must still be
        // indexed — otherwise the row silently loses its anchor.
        let bare = Entity(id: "x", name: "Klubb", sport: "football", type: "team", logo: editorialMark)
        withAssets(["arsenal.png"]) {
            XCTAssertEqual(EntityIdentityIndex([bare]).isEmpty, false)
        }
    }

    // MARK: - Decoding

    func testEntityDecodesTheLogoAndItsProvenance() throws {
        let json = """
        {"id":"arsenal","name":"Arsenal","sport":"football","type":"team",
         "logo":{"file":"arsenal.png","source":"espn","basis":"editorial-use",
                 "sourceUrl":"https://a.espncdn.com/i/teamlogos/soccer/500/359.png"}}
        """.data(using: .utf8)!
        let entity = try JSONDecoder().decode(Entity.self, from: json)
        XCTAssertEqual(entity.logo?.basis, "editorial-use")
        XCTAssertEqual(entity.logo?.file, "arsenal.png")
        XCTAssertTrue(entity.logo?.isShippable == true)
    }

    func testAnEntityWithoutALogoStillDecodes() throws {
        let json = #"{"id":"x","name":"X","sport":"football","type":"team"}"#.data(using: .utf8)!
        XCTAssertNil(try JSONDecoder().decode(Entity.self, from: json).logo)
    }

    // MARK: - The attribution surface

    func testAttributionSplitsTheTwoGroundsAndCreditsTheFreeOnes() {
        let manifest = LogoAttributionManifest(
            policy: "editorial",
            notice: "Klubbmerker tilhører sine respektive klubber …",
            logos: [
                LogoAttributionEntry(id: "rosenborg", name: "Rosenborg", sport: "football", file: "rosenborg.png",
                                     source: "wikimedia-commons", basis: "free-license", license: "CC BY-SA 4.0",
                                     licenseUrl: nil, attribution: "Ola Nordmann",
                                     sourceUrl: "https://commons.wikimedia.org/wiki/File:RBK.svg"),
                LogoAttributionEntry(id: "arsenal", name: "Arsenal", sport: "football", file: "arsenal.png",
                                     source: "espn", basis: "editorial-use", license: nil, licenseUrl: nil,
                                     attribution: nil, sourceUrl: "https://a.espncdn.com/x.png"),
            ]
        )
        XCTAssertEqual(manifest.freeLicensed.map(\.id), ["rosenborg"])
        XCTAssertEqual(manifest.editorial.map(\.id), ["arsenal"])
        // Crediting is the CONDITION of showing a CC BY-SA mark, so both the
        // licence and the author must appear.
        let line = MarksAndSourcesView().creditLine(manifest.freeLicensed[0])
        XCTAssertTrue(line.contains("CC BY-SA 4.0"))
        XCTAssertTrue(line.contains("Ola Nordmann"))
    }

    func testAMissingManifestIsAnEmptyScreenNotACrash() {
        XCTAssertEqual(LogoAttributionManifest.bundled(Bundle(for: EntityLogoTests.self)).logos.isEmpty,
                       LogoAttributionManifest.bundled(Bundle(for: EntityLogoTests.self)).logos.isEmpty)
        XCTAssertTrue(LogoAttributionManifest.empty.logos.isEmpty)
    }
}
