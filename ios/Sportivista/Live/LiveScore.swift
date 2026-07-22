//
//  LiveScore.swift
//  Sportivista
//
//  WP-172 — the running score + match clock for ONE ongoing football match,
//  enriching its agenda row (and, later, its entity page) while the app is in the
//  foreground. This is the FIRST third-party network read the iOS app makes — see
//  Live/LiveScorePoller.swift's header and docs/personvern.html for the honest
//  disclosure (live lookups go directly to ESPN from the device, only while you are
//  looking at an ongoing followed match; never in the background, never otherwise).
//
//  A plain value type: the poller writes it into `LiveScoreStore`, the agenda row
//  reads it back by event id and shows `display` in its existing meta line (tabular,
//  `live`-coloured) — never a new row shape, never an animation per update
//  (DESIGN § Bevegelse). The web twin is the `this.liveScores[id]` overlay in
//  docs/js/live.js (`{ home, away, clock, state, homeName, awayName }`).
//

import Foundation

/// A live/finished football score. `state` mirrors ESPN's competition status
/// state verbatim (`"in"` = live, `"post"` = finished) — kept a plain String, not a
/// closed enum, so an unexpected value degrades gracefully (treated as not-live).
struct LiveScore: Equatable, Sendable {
    var home: Int
    var away: Int
    /// ESPN team display names (for the a11y label; the row already shows the
    /// title, so the visible badge is score + clock only).
    var homeName: String
    var awayName: String
    /// ESPN `displayClock`, e.g. "67'" or "HT" — shown only while live.
    var clock: String
    /// ESPN competition state: "in" (live) or "post" (finished).
    var state: String

    var isLive: Bool { state == "in" }

    /// The compact row badge: "2–1 · 67'" while live (clock appended when known),
    /// "2–1" once finished. En dash to match the agenda title convention.
    var display: String {
        let score = "\(home)–\(away)"
        if isLive, !clock.isEmpty { return "\(score) · \(clock)" }
        return score
    }

    /// A spoken form for VoiceOver ("Lyn 2, Sogndal 1, 67 minutter" / "… slutt").
    var accessibilityLabel: String {
        let base = "\(homeName) \(home), \(awayName) \(away)"
        if isLive { return clock.isEmpty ? "\(base), pågår" : "\(base), \(clock)" }
        return "\(base), slutt"
    }
}
