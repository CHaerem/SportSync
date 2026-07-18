//
//  Fixture.swift
//  SportivistaTests
//
//  WP-11: loads the checked-in JSON snapshots under SportivistaTests/Fixtures/ —
//  FRESH copies of the real docs/data/{events,entities,manifest}.json and
//  scripts/config/tracked.json at the time this package was written. These
//  are the Swift side's fasit for the data contract: updated deliberately
//  (re-copy + re-commit) when the contract changes, never regenerated
//  automatically. See ios/README.md.
//

import Foundation

/// Anchors `Bundle(for:)` lookups at the SportivistaTests bundle, where XcodeGen's
/// `resources: [SportivistaTests/Fixtures]` entry (project.yml) copies the fixture
/// files.
private final class FixtureBundleMarker {}

enum Fixture {
    static func url(_ name: String, ext: String = "json") -> URL {
        let bundle = Bundle(for: FixtureBundleMarker.self)
        guard let url = bundle.url(forResource: name, withExtension: ext) else {
            fatalError("Missing fixture \(name).\(ext) — check SportivistaTests/Fixtures/ and project.yml resources.")
        }
        return url
    }

    static func data(_ name: String, ext: String = "json") -> Data {
        // swiftlint:disable:next force_try
        try! Data(contentsOf: url(name, ext: ext))
    }

    /// The fixture parsed with plain JSONSerialization — used to compare
    /// raw element counts against what our Codable models decode, so decode
    /// tests catch silently-dropped elements rather than only "it didn't
    /// throw".
    static func rawArray(_ name: String) -> [Any] {
        let object = try! JSONSerialization.jsonObject(with: data(name))
        guard let array = object as? [Any] else {
            fatalError("Fixture \(name).json is not a top-level JSON array.")
        }
        return array
    }

    static func rawObject(_ name: String) -> [String: Any] {
        let object = try! JSONSerialization.jsonObject(with: data(name))
        guard let dict = object as? [String: Any] else {
            fatalError("Fixture \(name).json is not a top-level JSON object.")
        }
        return dict
    }
}
