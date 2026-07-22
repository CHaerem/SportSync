//
//  LiveLeague.swift
//  Sportivista
//
//  WP-172 — the ESPN soccer leagues the app may live-poll, and the mapping from a
//  board event's `tournament` back to its league code. This is the Swift twin of
//  `SS_FOOTBALL_LEAGUES` + `ssFootballLeagueForEvent` in docs/js/shared-constants.js,
//  which is itself pinned against scripts/config/sports-config.js by
//  tests/live-leagues.test.js. The two platforms keep the SAME six leagues so a Lyn
//  (Eliteserien / nor.1) or OBOS (nor.2) match finally gets a live score — the old
//  web gate hardcoded only eng.1/esp.1/fifa.world, and iOS had no score polling at all.
//

import Foundation

/// One live-pollable football league (ESPN scoreboard code + display name).
struct LiveLeague: Equatable, Sendable {
    let code: String
    let name: String

    /// The leagues the app live-polls — the Swift mirror of `SS_FOOTBALL_LEAGUES`
    /// (docs/js/shared-constants.js), i.e. the sports-config football leagues minus
    /// esp.copa_del_rey (the same trim the seed-registry mirror makes). Keep in step
    /// with the JS list; `LiveLeagueTests` pins the codes.
    static let all: [LiveLeague] = [
        LiveLeague(code: "eng.1", name: "Premier League"),
        LiveLeague(code: "esp.1", name: "La Liga"),
        LiveLeague(code: "nor.1", name: "Eliteserien"),
        LiveLeague(code: "nor.2", name: "OBOS-ligaen"),
        LiveLeague(code: "uefa.champions", name: "Champions League"),
        LiveLeague(code: "fifa.world", name: "FIFA World Cup"),
    ]

    /// The league a football event belongs to, matched by its `tournament` against
    /// the league display name (accent-insensitive containment either way, so
    /// "Eliteserien 2026" ⊇ "Eliteserien" and "Champions" ⊆ "UEFA Champions League"),
    /// else nil. Mirrors `ssFootballLeagueForEvent` — normalize via the same
    /// diacritic-folding TextMatch the feed uses.
    static func forEvent(_ event: Event, in leagues: [LiveLeague] = all) -> LiveLeague? {
        let t = TextMatch.normalize(event.tournament)
        guard !t.isEmpty else { return nil }
        for league in leagues {
            let n = TextMatch.normalize(league.name)
            if !n.isEmpty, t.contains(n) || n.contains(t) { return league }
        }
        return nil
    }
}
