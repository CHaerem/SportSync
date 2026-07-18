//
//  StreamingChannel.swift
//  Sportivista
//
//  One Norwegian viewing option on an Event — mirrors events.schema.json
//  `definitions.streamingChannel`. All fields are optional in the schema
//  itself, so plain Optional properties are enough: Swift's synthesized
//  Codable already decodes a missing key to `nil` for an Optional property
//  and ignores JSON keys it doesn't know about, so no custom init is needed
//  here (unlike Event.swift, which also needs array/Bool *defaults*).
//

import Foundation

struct StreamingChannel: Codable, Equatable, Hashable {
    var platform: String?
    var url: String?
    /// True while the channel is an unverified guess (e.g. the shared
    /// "NRK / TV 2" placeholder before the verify agent resolves it).
    var tentative: Bool?
}
