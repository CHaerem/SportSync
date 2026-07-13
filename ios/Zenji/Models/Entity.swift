//
//  Entity.swift
//  Zenji
//
//  WP-11: mirrors docs/data/entities.json — the WP-05 stable-id index of
//  athletes/teams/tournaments/leagues, built by scripts/build-entities.js
//  from tracked.json + norwegian-golfers.json + sports-config.js. This is
//  the lookup table `Event.norwegianPlayers[].entityId` /
//  `homeTeamEntityId` / `awayTeamEntityId` point into.
//

import Foundation

struct Entity: Codable, Equatable, Hashable {
    var id: String
    var name: String
    var aliases: [String]
    var sport: String
    /// "athlete" | "team" | "tournament" | "league" — kept as String rather
    /// than a closed Swift enum; see Event.swift's note on the same choice.
    var type: String

    private enum CodingKeys: String, CodingKey { case id, name, aliases, sport, type }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        sport = try c.decode(String.self, forKey: .sport)
        type = try c.decode(String.self, forKey: .type)
        aliases = try c.decodeIfPresent([String].self, forKey: .aliases) ?? []
    }
}
