//
//  Event.swift
//  Sportivista
//
//  WP-11: mirrors scripts/config/events.schema.json field-for-field — the
//  formal contract for ONE element of docs/data/events.json (itself a flat
//  array of these). Only `sport`, `title`, `time` are required by the
//  schema. Every other field is either Optional, or — for the arrays and
//  booleans the pipeline always emits even though the schema doesn't
//  strictly require them — defaulted so call sites don't have to unwrap an
//  empty `[]` or a `false` on every read.
//
//  Two forward-compatibility concerns, handled two different ways:
//
//  1. Unknown/new JSON keys: ignored automatically by Swift's Codable — a
//     decoder only looks up the keys listed in CodingKeys, so no extra code
//     is needed for this half of the contract.
//  2. Defaults for keys the pipeline always writes but the schema doesn't
//     require: Swift's *synthesized* Decodable does NOT apply a stored
//     property's default value when a key is missing (only genuinely
//     Optional properties decode to `nil` for free) — so this type has a
//     hand-written `init(from:)` using `decodeIfPresent(...) ?? default`.
//     `encode(to:)` is left to the compiler: it's still synthesized even
//     though init(from:) is hand-written, as long as every stored property
//     has a matching CodingKeys case (it does, 1:1 below).
//
//  `confidence`, `status`, `verificationStatus` and `source` are kept as
//  plain `String` rather than closed Swift enums, even though the JSON
//  Schema declares some of them as enums — a future new value from the
//  server should demote/ignore gracefully on an older client, not crash
//  decoding of the whole event.
//

import Foundation

struct Event: Codable, Equatable {
    // MARK: Required (events.schema.json `required`)

    var sport: String
    var title: String
    var time: Date

    // MARK: Identity

    /// Stable, server-generated id (WP-02): first 12 hex chars of sha256
    /// over the dedupe key `sport|title|time`. Absent on older payloads —
    /// the web client falls back to synthesizing one; this model doesn't.
    var id: String?

    // MARK: Core fields

    var tournament: String?
    var endTime: Date?
    var venue: String?
    /// Free-text tournament/tour context, used server-side by the
    /// streaming lookup and the .ics builder.
    var meta: String?
    var norwegian: Bool
    /// Norwegian viewing options, in priority order.
    var streaming: [StreamingChannel]
    var participants: [Participant]
    var norwegianPlayers: [NorwegianPlayer]
    var totalPlayers: Int?
    var link: String?
    /// e.g. "cancelled"/"postponed", or a live status mirrored from source.
    var status: String?
    /// Golf: featured tee-time groups around a Norwegian player.
    var featuredGroups: [FeaturedGroup]
    var homeTeam: String?
    var awayTeam: String?
    /// WP-05 stable entity ids, set by build-events.js when home/awayTeam
    /// word-boundary-matches a known team/league entity.
    var homeTeamEntityId: String?
    var awayTeamEntityId: String?
    var isFavorite: Bool
    /// Round/phase label, e.g. "Semifinale".
    var round: String?
    /// Playing surface, e.g. tennis "Grus"/"Hard" — a quiet key-fact line in the
    /// detail sheet ("Underlag") when present. Mirrors dashboard.js detail.js's
    /// defensive `e.surface` read; absent from most events.
    var surface: String?
    /// Computed by build-events.js — true when the event hits a
    /// tracked/must-watch entity.
    var mustWatch: Bool
    /// e.g. "BO3" (esports).
    var format: String?
    var stage: String?
    var result: String?
    var context: String?
    /// 1–5, agent-set importance.
    var importance: Int?
    var summary: String?

    // MARK: AI-research contract (CLAUDE.md "AI-research event schema")

    /// "ai-research" marks an event the research agent found/wrote.
    var source: String?
    /// "high" | "medium" | "low" — "high" requires 2+ evidence URLs,
    /// enforced server-side by scripts/validate-events.js.
    var confidence: String?
    var evidence: [String]
    var researchedAt: Date?
    var verifiedAt: Date?
    /// "confirmed" | "amended" | "removed" — see scripts/agents/verify.md.
    var verificationStatus: String?
    var verificationSources: [String]

    // MARK: Legacy enrichment fields

    var norwegianRelevance: Int?
    var tags: [String]

    private enum CodingKeys: String, CodingKey {
        case id, sport, tournament, title, time, endTime, venue, meta, norwegian, streaming,
             participants, norwegianPlayers, totalPlayers, link, status, featuredGroups,
             homeTeam, awayTeam, homeTeamEntityId, awayTeamEntityId, isFavorite, round,
             surface, mustWatch, format, stage, result, context, importance, summary, source,
             confidence, evidence, researchedAt, verifiedAt, verificationStatus,
             verificationSources, norwegianRelevance, tags
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        sport = try c.decode(String.self, forKey: .sport)
        title = try c.decode(String.self, forKey: .title)
        time = try c.decode(Date.self, forKey: .time)

        id = try c.decodeIfPresent(String.self, forKey: .id)

        tournament = try c.decodeIfPresent(String.self, forKey: .tournament)
        endTime = try c.decodeIfPresent(Date.self, forKey: .endTime)
        venue = try c.decodeIfPresent(String.self, forKey: .venue)
        meta = try c.decodeIfPresent(String.self, forKey: .meta)
        norwegian = try c.decodeIfPresent(Bool.self, forKey: .norwegian) ?? false
        streaming = try c.decodeIfPresent([StreamingChannel].self, forKey: .streaming) ?? []
        participants = try c.decodeIfPresent([Participant].self, forKey: .participants) ?? []
        norwegianPlayers = try c.decodeIfPresent([NorwegianPlayer].self, forKey: .norwegianPlayers) ?? []
        totalPlayers = try c.decodeIfPresent(Int.self, forKey: .totalPlayers)
        link = try c.decodeIfPresent(String.self, forKey: .link)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        featuredGroups = try c.decodeIfPresent([FeaturedGroup].self, forKey: .featuredGroups) ?? []
        homeTeam = try c.decodeIfPresent(String.self, forKey: .homeTeam)
        awayTeam = try c.decodeIfPresent(String.self, forKey: .awayTeam)
        homeTeamEntityId = try c.decodeIfPresent(String.self, forKey: .homeTeamEntityId)
        awayTeamEntityId = try c.decodeIfPresent(String.self, forKey: .awayTeamEntityId)
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
        round = try c.decodeIfPresent(String.self, forKey: .round)
        surface = try c.decodeIfPresent(String.self, forKey: .surface)
        mustWatch = try c.decodeIfPresent(Bool.self, forKey: .mustWatch) ?? false
        format = try c.decodeIfPresent(String.self, forKey: .format)
        stage = try c.decodeIfPresent(String.self, forKey: .stage)
        result = try c.decodeIfPresent(String.self, forKey: .result)
        context = try c.decodeIfPresent(String.self, forKey: .context)
        importance = try c.decodeIfPresent(Int.self, forKey: .importance)
        summary = try c.decodeIfPresent(String.self, forKey: .summary)

        source = try c.decodeIfPresent(String.self, forKey: .source)
        confidence = try c.decodeIfPresent(String.self, forKey: .confidence)
        evidence = try c.decodeIfPresent([String].self, forKey: .evidence) ?? []
        researchedAt = try c.decodeIfPresent(Date.self, forKey: .researchedAt)
        verifiedAt = try c.decodeIfPresent(Date.self, forKey: .verifiedAt)
        verificationStatus = try c.decodeIfPresent(String.self, forKey: .verificationStatus)
        verificationSources = try c.decodeIfPresent([String].self, forKey: .verificationSources) ?? []

        norwegianRelevance = try c.decodeIfPresent(Int.self, forKey: .norwegianRelevance)
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
    }
}
