//
//  FeaturedGroup.swift
//  Zenji
//
//  Golf only: a featured tee-time group around a tracked Norwegian player —
//  mirrors events.schema.json `definitions.featuredGroup`. The JSON Schema
//  leaves `groupmates` untyped (`"type": "array"`, no `items`) because the
//  hand-rolled validator (scripts/lib/validate-schema.js) doesn't support
//  nested array-item schemas — but scripts/fetch/golf.js always emits
//  `{name, teeTime}` objects for each groupmate, so that shape is modelled
//  explicitly here as `Groupmate`.
//

import Foundation

struct FeaturedGroup: Codable, Equatable, Hashable {
    struct Groupmate: Codable, Equatable, Hashable {
        var name: String?
        /// Display string, same convention as `FeaturedGroup.teeTime` /
        /// `NorwegianPlayer.teeTime` — not an ISO 8601 timestamp.
        var teeTime: String?
    }

    var player: String?
    var teeTime: String?
    var groupmates: [Groupmate]?
}
