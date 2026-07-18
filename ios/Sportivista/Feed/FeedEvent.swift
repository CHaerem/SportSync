//
//  FeedEvent.swift
//  Sportivista
//
//  WP-13: the input value the FeedCompiler predicates operate on. It carries
//  exactly the fields the five personalisation predicates read (see
//  tests/fixtures/feed-vectors/README.md §"The five predicates") and nothing
//  more — a deliberately small, pure-data surface that decodes straight from
//  a golden feed-vector's `events[]` element AND bridges from the WP-11
//  `Event` model for the real app (see `init(from:)` overloads below).
//
//  Why a separate type from WP-11's `Event`, rather than porting the
//  predicates onto it directly:
//
//    • `Event.time` is a NON-optional `Date` (events.schema.json makes `time`
//      required, and the pipeline always emits it). The golden vectors,
//      however, deliberately include a `"time": null` case
//      (01-multiday-window-golf.json, event `g-notime`) to pin the
//      "no time → never in window / never relevant" branch of the JS
//      predicates. Decoding that element into `Event` would THROW, so the
//      vector suite could not be replayed against `Event` at all. `FeedEvent`
//      models `time` as `Date?` so the null case decodes and the predicate
//      returns the same `false` the JS reference does.
//    • It keeps the predicate layer independent of the full 40-field Event
//      contract; only the handful of fields the predicates actually read are
//      here, matching the README's "unlisted fields are absent" convention.
//
//  Forward compatibility: unknown/new JSON keys are ignored automatically by
//  Codable synthesis. Fields the pipeline always writes but that a vector may
//  omit are defaulted (via a hand-written `init(from:)`), exactly as `Event`
//  does — Swift's synthesized Decodable does not apply stored-property
//  defaults for missing keys, only genuine Optionals decode to nil for free.
//

import Foundation

struct FeedEvent: Codable, Equatable {
    /// Stable handle. In the golden vectors this is a fixture-local id used to
    /// name events in the expectation sets; in real data it is the WP-02 hash.
    var id: String?

    var sport: String
    var title: String
    var tournament: String?

    /// Optional so the pinned `"time": null` vector case decodes; the
    /// predicates treat a nil `time` exactly as the JS `!event.time` guard.
    var time: Date?
    var endTime: Date?

    var homeTeam: String?
    var awayTeam: String?

    var norwegian: Bool
    var norwegianPlayers: [NorwegianPlayer]
    var participants: [Participant]

    var isFavorite: Bool
    var importance: Int?

    /// "ai-research" makes an event relevant regardless of confidence — see
    /// DIVERGENCES.md §4 (confidence does NOT gate feed inclusion today).
    var source: String?
    var confidence: String?

    /// Rendering-only ("cancelled"/"postponed"); pinned NOT to affect any
    /// selection predicate (11-edge-cancelled.json).
    var status: String?

    private enum CodingKeys: String, CodingKey {
        case id, sport, title, tournament, time, endTime, homeTeam, awayTeam,
             norwegian, norwegianPlayers, participants, isFavorite, importance,
             source, confidence, status
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        // JS reads `(e.sport || "")` / `e.title || ''`; mirror the tolerant
        // default so a missing field never crashes the port.
        sport = try c.decodeIfPresent(String.self, forKey: .sport) ?? ""
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        tournament = try c.decodeIfPresent(String.self, forKey: .tournament)
        time = try c.decodeIfPresent(Date.self, forKey: .time)
        endTime = try c.decodeIfPresent(Date.self, forKey: .endTime)
        homeTeam = try c.decodeIfPresent(String.self, forKey: .homeTeam)
        awayTeam = try c.decodeIfPresent(String.self, forKey: .awayTeam)
        norwegian = try c.decodeIfPresent(Bool.self, forKey: .norwegian) ?? false
        norwegianPlayers = try c.decodeIfPresent([NorwegianPlayer].self, forKey: .norwegianPlayers) ?? []
        participants = try c.decodeIfPresent([Participant].self, forKey: .participants) ?? []
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
        importance = try c.decodeIfPresent(Int.self, forKey: .importance)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        confidence = try c.decodeIfPresent(String.self, forKey: .confidence)
        status = try c.decodeIfPresent(String.self, forKey: .status)
    }

    /// Direct memberwise-style initializer for tests / synthetic rows.
    init(
        id: String? = nil,
        sport: String,
        title: String,
        tournament: String? = nil,
        time: Date? = nil,
        endTime: Date? = nil,
        homeTeam: String? = nil,
        awayTeam: String? = nil,
        norwegian: Bool = false,
        norwegianPlayers: [NorwegianPlayer] = [],
        participants: [Participant] = [],
        isFavorite: Bool = false,
        importance: Int? = nil,
        source: String? = nil,
        confidence: String? = nil,
        status: String? = nil
    ) {
        self.id = id
        self.sport = sport
        self.title = title
        self.tournament = tournament
        self.time = time
        self.endTime = endTime
        self.homeTeam = homeTeam
        self.awayTeam = awayTeam
        self.norwegian = norwegian
        self.norwegianPlayers = norwegianPlayers
        self.participants = participants
        self.isFavorite = isFavorite
        self.importance = importance
        self.source = source
        self.confidence = confidence
        self.status = status
    }

    /// Bridge from the WP-11 `Event` (the shape the SyncClient cache decodes)
    /// so the real app (WP-14) can feed cached events straight into the
    /// FeedCompiler. `Event.time` is non-optional, so it maps 1:1.
    init(from event: Event) {
        self.id = event.id
        self.sport = event.sport
        self.title = event.title
        self.tournament = event.tournament
        self.time = event.time
        self.endTime = event.endTime
        self.homeTeam = event.homeTeam
        self.awayTeam = event.awayTeam
        self.norwegian = event.norwegian
        self.norwegianPlayers = event.norwegianPlayers
        self.participants = event.participants
        self.isFavorite = event.isFavorite
        self.importance = event.importance
        self.source = event.source
        self.confidence = event.confidence
        self.status = event.status
    }
}
