//
//  ZenjiJSON.swift
//  Zenji
//
//  WP-11: the one shared JSONDecoder factory every model in Models/ decodes
//  through. The data pipeline (scripts/build-events.js et al.) emits ISO
//  8601 timestamps in BOTH shapes seen across docs/data/events.json:
//
//    - with fractional seconds: "2026-07-16T04:00:00.000Z"
//      (JS `Date#toISOString()` — most machine-written timestamps)
//    - without fractional seconds: "2026-08-02T15:00:00Z"
//      (hand-written by agents/tests, e.g. tracked.json's `addedAt`)
//
//  A single ISO8601DateFormatter only accepts one of the two shapes, so this
//  factory tries the fractional-seconds formatter first and falls back to
//  the whole-second one. Every `Date`-typed property across Models/ goes
//  through this decoder — the strategy is set once here, not per field.
//

import Foundation

enum ZenjiJSON {
    /// Shared decoder for every Zenji model (Event, Entity, Manifest,
    /// TrackedConfig, …). Unknown/new JSON keys are ignored automatically by
    /// Swift's Codable synthesis — a decoder only ever looks up the keys its
    /// CodingKeys enum lists — so this factory only needs to teach it the
    /// date shapes; forward compatibility with new server fields needs no
    /// extra code here.
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = withFractionalSeconds.date(from: raw) {
                return date
            }
            if let date = withoutFractionalSeconds.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO 8601 date string (with or without fractional seconds), got \"\(raw)\""
            )
        }
        return decoder
    }()

    // `ISO8601DateFormatter` isn't `Sendable`, which trips Swift 6's strict
    // concurrency checking for global state — but both formatters below are
    // configured once at first access and only ever read via the thread-safe
    // `.date(from:)` afterwards, never mutated again, so it's safe to opt
    // them out of the (over-cautious, for this read-only usage) check.

    /// e.g. "2026-07-16T04:00:00.000Z".
    nonisolated(unsafe) private static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// e.g. "2026-08-02T15:00:00Z".
    nonisolated(unsafe) private static let withoutFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
