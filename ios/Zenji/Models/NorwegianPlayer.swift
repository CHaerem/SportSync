//
//  NorwegianPlayer.swift
//  Zenji
//
//  A Norwegian athlete involved in an event — mirrors events.schema.json
//  `definitions.norwegianPlayer`. WP-04 canonicalised the old polymorphic
//  shape (string | {name} | {name, teeTime, teeTimeUTC, status} | null) down
//  to a single object with a required "name" — never a bare string or null.
//
//  `teeTime` is a locale-formatted DISPLAY string (e.g. "14:30", built with
//  `Date#toLocaleTimeString("no-NO", …)` in scripts/fetch/golf.js) — not an
//  ISO 8601 timestamp, so it stays a plain String. `teeTimeUTC` IS always an
//  ISO 8601 string (`Date#toISOString()`), so it decodes as a real `Date`
//  through the shared ZenjiJSON date strategy like every other Date field.
//

import Foundation

struct NorwegianPlayer: Codable, Equatable, Hashable {
    var name: String
    var teeTime: String?
    var teeTimeUTC: Date?
    var status: String?
    /// WP-05 stable entity id (docs/data/entities.json), set by
    /// build-events.js when the name word-boundary-matches a known athlete.
    var entityId: String?
}
