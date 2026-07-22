//
//  ESPNScoreboard.swift
//  Sportivista
//
//  WP-172 — the PURE parse + match half of the live poll: an ESPN soccer scoreboard
//  JSON blob → parsed matches → the running score for each board event they resolve
//  to (keyed by the event's stable id). No network here (LiveScorePoller does the
//  fetch); JSONSerialization + string matching only, so it is unit-tested with
//  fixture bytes (ESPNScoreboardTests). The twin of the parse/match loop in
//  docs/js/live.js `pollFootballScores`.
//

import Foundation

enum ESPNScoreboard {
    /// One competition parsed out of a scoreboard, before it is matched to a board
    /// event. Only `in`/`post` competitions are kept (a `pre` fixture has no score).
    struct ParsedMatch: Equatable {
        var homeName: String
        var awayName: String
        var home: Int
        var away: Int
        var clock: String
        var state: String
    }

    /// Parse an ESPN soccer scoreboard response into its in-progress / finished
    /// matches. Defensive against shape drift: a missing field drops that one match,
    /// never throws. Score is a String in the ESPN payload ("2") but tolerated as a
    /// number too.
    static func parse(_ data: Data) -> [ParsedMatch] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let events = root["events"] as? [[String: Any]] else { return [] }
        var out: [ParsedMatch] = []
        for ev in events {
            guard let comp = (ev["competitions"] as? [[String: Any]])?.first else { continue }
            let status = comp["status"] as? [String: Any]
            let state = ((status?["type"] as? [String: Any])?["state"] as? String) ?? ""
            guard state == "in" || state == "post" else { continue }
            let clock = (status?["displayClock"] as? String) ?? ""
            guard let competitors = comp["competitors"] as? [[String: Any]],
                  let home = side("home", in: competitors),
                  let away = side("away", in: competitors) else { continue }
            out.append(ParsedMatch(homeName: home.name, awayName: away.name,
                                   home: home.score, away: away.score, clock: clock, state: state))
        }
        return out
    }

    /// The home/away competitor's team name + integer score, or nil.
    private static func side(_ homeAway: String, in competitors: [[String: Any]]) -> (name: String, score: Int)? {
        guard let c = competitors.first(where: { ($0["homeAway"] as? String) == homeAway }) else { return nil }
        let name = ((c["team"] as? [String: Any])?["displayName"] as? String) ?? ""
        let score: Int
        if let s = c["score"] as? String { score = Int(s) ?? 0 }
        else if let n = c["score"] as? Int { score = n }
        else if let d = c["score"] as? Double { score = Int(d) }
        else { score = 0 }
        return (name, score)
    }

    /// Match parsed scoreboard entries to the board's football events (by home AND
    /// away team name) and return `[event id: LiveScore]`. Only events carrying both
    /// team names AND a stable id resolve; a scoreboard match with no board event is
    /// ignored (nothing to enrich). Mirrors docs/js/live.js's `ssTeamMatch` pairing.
    static func liveScores(from parsed: [ParsedMatch], events: [Event]) -> [String: LiveScore] {
        var out: [String: LiveScore] = [:]
        for match in parsed {
            guard let event = events.first(where: { event in
                guard event.sport.lowercased() == "football",
                      let home = event.homeTeam, !home.isEmpty,
                      let away = event.awayTeam, !away.isEmpty else { return false }
                return teamMatch(home, match.homeName) && teamMatch(away, match.awayName)
            }) else { continue }
            out[EventBridge.stableId(for: event)] = LiveScore(
                home: match.home, away: match.away,
                homeName: match.homeName, awayName: match.awayName,
                clock: match.clock, state: match.state
            )
        }
        return out
    }

    /// Fuzzy team-name match — the Swift twin of `ssTeamMatch` (docs/js/shared-
    /// constants.js): strip FC/AFC/CF/FK affixes then compare, or accept either name
    /// containing the other (so "Lyn" ≡ "FK Lyn Oslo" via containment).
    static func teamMatch(_ a: String, _ b: String) -> Bool {
        let la = a.lowercased(), lb = b.lowercased()
        if strip(la) == strip(lb) { return true }
        return la.contains(lb) || lb.contains(la)
    }

    private static func strip(_ s: String) -> String {
        var out = s
        for suffix in [" fc", " afc", " cf", " fk"] where out.hasSuffix(suffix) {
            out = String(out.dropLast(suffix.count))
        }
        for prefix in ["fc ", "afc "] where out.hasPrefix(prefix) {
            out = String(out.dropFirst(prefix.count))
        }
        return out.trimmingCharacters(in: .whitespaces)
    }
}
