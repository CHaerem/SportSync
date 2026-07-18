//
//  TrackedConfig.swift
//  Sportivista
//
//  WP-11: mirrors scripts/config/tracked.json (published verbatim to
//  docs/data/tracked.json) — the AI-managed, transparent record of what the
//  research agent tracks and why. Every entry carries a defensible `reason`
//  plus provenance (`addedAt` / `addedBy` / `evidence`), per CLAUDE.md's
//  config model.
//

import Foundation

struct TrackedConfig: Codable, Equatable {
    struct Entry: Codable, Equatable {
        var id: String
        var name: String
        var sport: String?
        var reason: String
        var addedAt: Date
        var addedBy: String
        var evidence: [String]
        /// e.g. "high" — not a closed Swift enum, same reasoning as
        /// Event.swift's confidence/status fields.
        var priority: String?
        var expires: Date?

        private enum CodingKeys: String, CodingKey {
            case id, name, sport, reason, addedAt, addedBy, evidence, priority, expires
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            name = try c.decode(String.self, forKey: .name)
            reason = try c.decode(String.self, forKey: .reason)
            addedAt = try c.decode(Date.self, forKey: .addedAt)
            addedBy = try c.decode(String.self, forKey: .addedBy)
            sport = try c.decodeIfPresent(String.self, forKey: .sport)
            evidence = try c.decodeIfPresent([String].self, forKey: .evidence) ?? []
            priority = try c.decodeIfPresent(String.self, forKey: .priority)
            expires = try c.decodeIfPresent(Date.self, forKey: .expires)
        }
    }

    var lastUpdated: Date?
    var lastUpdatedBy: String?
    var version: Int
    var leagues: [Entry]
    var athletes: [Entry]
    var tournaments: [Entry]
    var notes: [String]

    private enum CodingKeys: String, CodingKey {
        case lastUpdated, lastUpdatedBy, version, leagues, athletes, tournaments, notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .version)
        lastUpdated = try c.decodeIfPresent(Date.self, forKey: .lastUpdated)
        lastUpdatedBy = try c.decodeIfPresent(String.self, forKey: .lastUpdatedBy)
        leagues = try c.decodeIfPresent([Entry].self, forKey: .leagues) ?? []
        athletes = try c.decodeIfPresent([Entry].self, forKey: .athletes) ?? []
        tournaments = try c.decodeIfPresent([Entry].self, forKey: .tournaments) ?? []
        notes = try c.decodeIfPresent([String].self, forKey: .notes) ?? []
    }
}
