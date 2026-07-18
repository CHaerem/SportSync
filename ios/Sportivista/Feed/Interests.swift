//
//  Interests.swift
//  Sportivista
//
//  WP-13: the personalisation config the FeedCompiler predicates key off — a
//  Swift port of the fields of scripts/config/interests.json that the golden
//  feed-vectors embed (see tests/fixtures/feed-vectors/README.md
//  §"input.interests"). This is the USER's source of truth on the server; on
//  the client it arrives as data and is only ever read here.
//
//  Shape (per the vectors' trimmed copy):
//
//    {
//      "followBroadly": ["football", "golf", ...],   // sports kept wholesale
//      "alwaysTrack": {
//        "athletes":    [{ name, aliases[], sport }],
//        "teams":       [{ name, aliases[], sport }],
//        "tournaments": [{ name, aliases[], sport, notify? }]
//      },
//      "notify": { "leadMinutes": 30 }
//    }
//
//  `Entity.notify` is optional and its DEFAULT depends on the bucket, exactly
//  like the server's `normalizeEntity(entry, { defaultNotify })`
//  (scripts/lib/helpers.js): teams & athletes default to notify:true, while
//  tournaments default to notify:false. That default is applied by
//  `FeedCompiler.notifyEntities`, not stored here, so the raw config stays a
//  faithful mirror of the JSON.
//

import Foundation

struct Interests: Codable, Equatable {
    struct Entity: Codable, Equatable {
        var name: String
        var aliases: [String]
        /// Sport tag used by the sport-scoped bell matcher; nil = matches any
        /// sport (server `matchInterest` only scopes when BOTH the entity and
        /// the event name a sport).
        var sport: String?
        /// Explicit notify flag; nil means "use the bucket default" — see the
        /// file header and `FeedCompiler.notifyEntities`.
        var notify: Bool?

        private enum CodingKeys: String, CodingKey {
            case name, aliases, sport, notify
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = try c.decode(String.self, forKey: .name)
            aliases = try c.decodeIfPresent([String].self, forKey: .aliases) ?? []
            sport = try c.decodeIfPresent(String.self, forKey: .sport)
            notify = try c.decodeIfPresent(Bool.self, forKey: .notify)
        }

        init(name: String, aliases: [String] = [], sport: String? = nil, notify: Bool? = nil) {
            self.name = name
            self.aliases = aliases
            self.sport = sport
            self.notify = notify
        }

        /// Every string this entity can be recognised by (name + aliases),
        /// mirroring server `entityTerms`.
        var terms: [String] {
            ([name] + aliases).filter { !$0.isEmpty }
        }
    }

    struct AlwaysTrack: Codable, Equatable {
        var athletes: [Entity]
        var teams: [Entity]
        var tournaments: [Entity]

        private enum CodingKeys: String, CodingKey {
            case athletes, teams, tournaments
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            athletes = try c.decodeIfPresent([Entity].self, forKey: .athletes) ?? []
            teams = try c.decodeIfPresent([Entity].self, forKey: .teams) ?? []
            tournaments = try c.decodeIfPresent([Entity].self, forKey: .tournaments) ?? []
        }

        init(athletes: [Entity] = [], teams: [Entity] = [], tournaments: [Entity] = []) {
            self.athletes = athletes
            self.teams = teams
            self.tournaments = tournaments
        }
    }

    struct Notify: Codable, Equatable {
        var leadMinutes: Int?
    }

    /// nil = the field was absent (fall back to the server DEFAULT list); an
    /// explicit empty array means "follow no sport broadly" — the JS
    /// `interests.followBroadly || DEFAULT` treats `[]` as present, so the
    /// port must distinguish absent from empty. Hence Optional, not defaulted.
    var followBroadly: [String]?
    var alwaysTrack: AlwaysTrack
    var notify: Notify?

    private enum CodingKeys: String, CodingKey {
        case followBroadly, alwaysTrack, notify
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        followBroadly = try c.decodeIfPresent([String].self, forKey: .followBroadly)
        alwaysTrack = try c.decodeIfPresent(AlwaysTrack.self, forKey: .alwaysTrack) ?? AlwaysTrack()
        notify = try c.decodeIfPresent(Notify.self, forKey: .notify)
    }

    init(followBroadly: [String]? = nil, alwaysTrack: AlwaysTrack = AlwaysTrack(), notify: Notify? = nil) {
        self.followBroadly = followBroadly
        self.alwaysTrack = alwaysTrack
        self.notify = notify
    }
}
