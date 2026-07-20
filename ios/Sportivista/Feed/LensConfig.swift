//
//  LensConfig.swift
//  Sportivista
//
//  The shared lens TUNABLES, decoded once from the bundled
//  `lens-config.json` — the SAME file the web serves at docs/config/lens-config.json
//  and reads in docs/js/lens.js. project.yml bundles `../docs/config/lens-config.json`
//  as a resource into the app, widget, and test targets, so a value changed in that
//  one file follows on both platforms. The lens ALGORITHM stays twinned in
//  FeedCompiler.swift <-> lens.js and is frozen by the golden feed-vectors; only
//  these PARAMETERS live in config.
//
//  Fail-safe: if the resource is missing or unparseable (it never should be — a
//  bundled resource can't 404), `load()` returns `fallback`, whose values are
//  byte-identical to what FeedCompiler pinned before the extraction. So a bad
//  bundle degrades to today's behaviour, never a crash or a silent semantic drift.
//

import Foundation

struct LensConfig: Decodable, Sendable {
    var followBroadlyDefault: [String]
    var entityGatedSports: [String]
    var retentionDays: Int
    var mustSeeImportance: Int
    var enduranceSports: [String]
    var sportNb: [String: String]

    /// Values identical to FeedCompiler's pre-extraction constants — the safety net.
    static let fallback = LensConfig(
        followBroadlyDefault: [
            "football", "golf", "f1", "cycling",
            "biathlon", "cross-country", "alpine", "nordic", "ski jumping",
        ],
        entityGatedSports: ["chess", "esports"],
        retentionDays: 14,
        mustSeeImportance: 4,
        enduranceSports: [
            "cycling", "athletics", "biathlon", "cross-country", "alpine", "nordic", "ski jumping",
        ],
        sportNb: [
            "football": "fotball", "golf": "golf", "f1": "Formel 1", "cycling": "sykkel",
            "tennis": "tennis", "chess": "sjakk", "esports": "esport", "athletics": "friidrett",
            "biathlon": "skiskyting", "cross-country": "langrenn", "alpine": "alpint",
        ]
    )

    /// Loaded once per process. `Bundle(for:)` on a marker class resolves to
    /// whichever target bundle this file was compiled into (app / widget / tests),
    /// exactly like FeedVectorTests anchors its fixture folder.
    static let shared: LensConfig = load()

    static func load() -> LensConfig {
        let bundle = Bundle(for: LensConfigBundleMarker.self)
        guard
            let url = bundle.url(forResource: "lens-config", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode(LensConfig.self, from: data)
        else {
            return fallback
        }
        return decoded
    }
}

private final class LensConfigBundleMarker {}
