//
//  LiveScorePlan.swift
//  Sportivista
//
//  WP-172 — the PURE gate deciding which ESPN scoreboards to poll THIS minute. It is
//  the whole surface-pressure story: the app polls a league ONLY when a followed-or-
//  board football match in it is inside its match window right now, so the common
//  single-live-match case fetches ONE scoreboard, not the whole list — and NEVER
//  polls at all when nothing is on. The twin of docs/js/live.js `footballLeaguesToPoll`.
//
//  No network, no store, no clock read beyond the `now` passed in — so it is unit-
//  tested directly (LiveScorePlanTests) with hand-built events.
//

import Foundation

enum LiveScorePlan {
    /// The match window past kickoff a league stays pollable for: a ~2h15 match plus a
    /// short post-match tail so a JUST-finished row still resolves its final score
    /// (ESPN `state: "post"`). Kept equal to the web gate's 3h tail.
    static let matchTail: TimeInterval = 3 * 60 * 60

    /// The leagues to poll at `now`: the config list narrowed to those with a football
    /// event whose kickoff sits in `(now - matchTail, now]`, mapped by tournament name.
    /// A live match with a tournament that maps to no league targets nothing (never
    /// "poll everything"); two matches in one league dedupe to one poll.
    static func leaguesToPoll(events: [Event], now: Date, leagues: [LiveLeague] = LiveLeague.all) -> [LiveLeague] {
        let floor = now.addingTimeInterval(-matchTail)
        var codes = Set<String>()
        for event in events where event.sport.lowercased() == "football" {
            let kickoff = event.time
            guard kickoff <= now, kickoff > floor else { continue }
            if let league = LiveLeague.forEvent(event, in: leagues) { codes.insert(league.code) }
        }
        return leagues.filter { codes.contains($0.code) }
    }
}
