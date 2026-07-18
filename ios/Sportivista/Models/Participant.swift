//
//  Participant.swift
//  Sportivista
//
//  A participant in an individual-sport event (golf, tennis, chess, …) —
//  mirrors events.schema.json `properties.participants.items`. WP-04
//  canonicalised this to a single object shape with a required "name" —
//  never a bare string, never null — so `name` is a plain, non-optional
//  String here.
//

import Foundation

struct Participant: Codable, Equatable, Hashable {
    var name: String
}
