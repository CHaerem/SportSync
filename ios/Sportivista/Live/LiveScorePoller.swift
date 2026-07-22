//
//  LiveScorePoller.swift
//  Sportivista
//
//  WP-172 — the app's ONE piece of third-party networking. Everything else in the
//  app reads sportivista.com (SyncClient) or the local cache; this fetches ESPN's
//  public soccer scoreboards **directly from the device**, and ONLY:
//    • while the app is in the FOREGROUND (ContentView starts it on `.active`, stops
//      it on `.background` — no BGTask, no background poll), and
//    • when a followed-or-board football match is inside its match window right now
//      (LiveScorePlan gates it; nothing on ⇒ zero requests).
//  This is the honest privacy boundary stated in docs/personvern.html: live lookups
//  go to ESPN from your device only while you are looking at an ongoing match.
//
//  Network is behind the injected `LiveScoreTransport`, so tests drive a recording
//  mock — no real request ever fires in a test (LiveScorePollerTests). The pure poll
//  (`pollOnce`) is a static function of events + now + transport; the instance just
//  owns the 60 s timer, the in-flight guard, and writing the result to the store.
//

import Foundation

/// The one ESPN call the poller makes, abstracted so tests substitute it.
protocol LiveScoreTransport: Sendable {
    /// The raw bytes of `…/soccer/<league>/scoreboard`, or nil on any error/non-200.
    func scoreboard(leagueCode: String) async -> Data?
}

/// The real transport: a plain `URLSession` GET, no auth, no cookies of our own.
struct ESPNLiveTransport: LiveScoreTransport {
    var session: URLSession = .shared
    var host = "https://site.api.espn.com/apis/site/v2/sports/soccer"

    func scoreboard(leagueCode: String) async -> Data? {
        guard let url = URL(string: "\(host)/\(leagueCode)/scoreboard") else { return nil }
        guard let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return data
    }
}

@MainActor
final class LiveScorePoller {
    let transport: LiveScoreTransport
    private let store: LiveScoreStore
    /// How the poller gets the current board — an async closure so the events decode
    /// runs OFF the main actor (the caller passes a `Task.detached { dataStore.loadEvents() }`).
    private let loadEvents: () async -> [Event]
    private var timer: Timer?
    private var isPolling = false

    init(store: LiveScoreStore,
         transport: LiveScoreTransport = ESPNLiveTransport(),
         loadEvents: @escaping () async -> [Event]) {
        self.store = store
        self.transport = transport
        self.loadEvents = loadEvents
    }

    /// Begin foreground polling: an immediate tick + a 60 s repeating one. Idempotent
    /// (a second `start()` while running is a no-op).
    func start() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            Task { await self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        Task { await tick() }
    }

    /// Stop polling — called when the app leaves the foreground. Clears the timer;
    /// the already-displayed scores stay until the next foreground poll refreshes them.
    func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// One poll: load the board off-main, run the pure poll, write the result. The
    /// in-flight guard means a slow network round-trip never overlaps the next tick.
    func tick(now: Date = Date()) async {
        guard !isPolling else { return }
        isPolling = true
        defer { isPolling = false }
        let events = await loadEvents()
        let scores = await Self.pollOnce(events: events, now: now, transport: transport)
        store.apply(scores)
    }

    /// The pure poll: plan (LiveScorePlan) → fetch each gated league via `transport`
    /// → parse + match (ESPNScoreboard) → combined `[event id: LiveScore]`. No store,
    /// no timer; the ONE place a test needs to drive to prove the whole chain. Returns
    /// empty when nothing is in-window (so the store clears — no stale scores).
    static func pollOnce(events: [Event], now: Date, transport: LiveScoreTransport) async -> [String: LiveScore] {
        let leagues = LiveScorePlan.leaguesToPoll(events: events, now: now)
        guard !leagues.isEmpty else { return [:] }
        var combined: [String: LiveScore] = [:]
        for league in leagues {
            guard let data = await transport.scoreboard(leagueCode: league.code) else { continue }
            for (id, score) in ESPNScoreboard.liveScores(from: ESPNScoreboard.parse(data), events: events) {
                combined[id] = score
            }
        }
        return combined
    }
}
