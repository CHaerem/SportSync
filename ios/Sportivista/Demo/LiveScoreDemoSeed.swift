//
//  LiveScoreDemoSeed.swift
//  Sportivista
//
//  WP-172 (DEBUG) — a deterministic, network-free harness for the live-score row:
//  it seeds ONE authoritatively-live football match (status "in", so it reads live at
//  any hour) with an EXPLICIT id, plus the matching `LiveScore` in the store keyed on
//  that same id — so the agenda row shows "2–1 · 67'" in its meta line with no real
//  match and no ESPN call (the poller is not started in a demo run). Reproduces the
//  acceptance criterion "iOS viser stilling for pågående fulgt kamp i sim-demo" and
//  the dark/light screenshots. Never compiled into release (`#if DEBUG`); lives in
//  Sportivista/Demo/ (app-only, WP-48) like the other seeds.
//

#if DEBUG
import Foundation

enum LiveScoreDemoSeed {
    /// The board's live match carries this explicit id, so `EventBridge.stableId`
    /// returns it and the seeded store score keys line up (the row reads
    /// `liveStore.score(for: row.id)`).
    static let liveEventId = "demo-live-lyn-sogndal"

    /// Seed the cache (a broad football follow + a live Lyn match + a calm upcoming
    /// row) and the live-score store, then the caller reloads the agenda. The live
    /// match's row shows the running score in its meta line.
    @MainActor
    static func seed(profileStore: ProfileStore, liveStore: LiveScoreStore, now: Date = Date()) {
        let cache = CacheStore()
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        func at(_ offsetHours: Double) -> String { iso.string(from: now.addingTimeInterval(offsetHours * 3600)) }

        let events: [[String: Any]] = [
            // The LIVE followed match. status "in" ⇒ live at any hour (liveState step 1);
            // the endTime an hour out keeps the row on the board (and re-homed onto
            // «I dag») even right after midnight, when a bare "started an hour ago"
            // start would otherwise fall on the previous, dropped day. At an ordinary
            // hour both endpoints share the Oslo day, so the time column reads "HH:mm".
            [
                "id": liveEventId,
                "sport": "football", "title": "Lyn – Sogndal", "tournament": "Eliteserien",
                "time": at(-1), "endTime": at(1), "status": "in",
                "homeTeam": "Lyn", "awayTeam": "Sogndal",
                "streaming": [["platform": "TV 2 Play"]],
            ],
            // A calm upcoming row for context — not live, no score.
            [
                "id": "demo-brann-molde",
                "sport": "football", "title": "Brann – Molde", "tournament": "Eliteserien",
                "time": at(6), "homeTeam": "Brann", "awayTeam": "Molde",
                "streaming": [["platform": "TV 2 Play"]],
            ],
        ]
        let interests: [String: Any] = [
            "followBroadly": ["football"],
            "alwaysTrack": ["athletes": [], "teams": [], "tournaments": []],
        ]

        write(events, "events.json", cache)
        write(interests, "interests.json", cache)
        try? cache.writeSyncState(SyncState(etag: nil, appliedFiles: [:], lastSync: now))

        liveStore.seedForDemo([
            liveEventId: LiveScore(home: 2, away: 1, homeName: "Lyn", awayName: "Sogndal",
                                   clock: "67'", state: "in"),
        ])
    }

    private static func write(_ object: Any, _ filename: String, _ cache: CacheStore) {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        try? cache.write(data, filename: filename)
    }
}
#endif
