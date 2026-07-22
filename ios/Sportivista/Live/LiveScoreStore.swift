//
//  LiveScoreStore.swift
//  Sportivista
//
//  WP-172 — the tiny @Observable holding the current live scores by event id. The
//  poller writes it every minute (foreground only); the agenda row reads it back in
//  its body, so a score update repaints ONLY that row's meta line — never a feed
//  recompile, never the golden-vector pipeline (the five predicates never see this).
//  Shared by ContentView between the agenda and, when it lands, the entity page.
//

import Foundation
import Observation

@MainActor
@Observable
final class LiveScoreStore {
    /// Current live/finished scores by event stable id. Empty = nothing live.
    private(set) var scores: [String: LiveScore] = [:]

    /// Replace the whole set with this minute's poll result. A full replace (not a
    /// merge) is correct: the poll computes every in-window match each minute, so a
    /// match that dropped out of its window simply stops appearing — its stale score
    /// clears instead of lingering.
    func apply(_ scores: [String: LiveScore]) {
        // Assigning an equal dictionary would still invalidate observers; skip the
        // no-op so a quiet minute (same scores) doesn't repaint every visible row.
        guard scores != self.scores else { return }
        self.scores = scores
    }

    func clear() { apply([:]) }

    /// The live score for an event id, or nil.
    func score(for id: String) -> LiveScore? { scores[id] }

    #if DEBUG
    /// Seed a deterministic score for the screenshot / sim demo harness
    /// (SPORTIVISTA_DEMO=live) — the app never starts the poller in a demo run, so the
    /// seeded score survives (mirrors the other Demo seeds' cache-only approach).
    func seedForDemo(_ scores: [String: LiveScore]) { self.scores = scores }
    #endif
}
