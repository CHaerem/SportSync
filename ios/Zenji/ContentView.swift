//
//  ContentView.swift
//  Zenji
//
//  WP-10 scaffold → WP-12 wired in sync → WP-14 replaces the placeholder
//  agenda with the real one: a Tekst-TV header (ZENJI · dato · a quietly
//  ticking clock, no other chrome — CLAUDE.md "Calm dashboard") above
//  AgendaView, which does the actual day-grouped rendering. WP-15 adds the
//  one NotificationPlanner hook in `refresh()` below (the "after a
//  successful sync" reconcile point) — deliberately the ONLY WP-15 touch in
//  this file; the real agenda rendering is WP-14's.
//
//  Deliberately keeps its public `init(syncClient:dataStore:)` call
//  compatible with the WP-12 scaffold (the third parameter,
//  `notificationPlanner`, defaults): WP-15 (NotificationPlanner) landed in
//  parallel and the brief asked to keep `ZenjiApp.swift` changes to an
//  absolute minimum to avoid a merge conflict — `ZenjiApp.swift` constructs
//  this view with just `syncClient`/`dataStore` and needs zero edits.
//

import SwiftUI

struct ContentView: View {
    let syncClient: SyncClient
    let dataStore: DataStore
    let notificationPlanner: NotificationPlanner

    @State private var viewModel: AgendaViewModel
    @State private var now = Date()

    /// Ticks once a second — the "tikkende klokke-følelse" in the header,
    /// same idea as the web masthead's clock (dashboard.js `startClock`), just
    /// quieter (no seconds ticking sound, obviously — just the digits).
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(
        syncClient: SyncClient = SyncClient(),
        dataStore: DataStore = DataStore(),
        notificationPlanner: NotificationPlanner = NotificationPlanner()
    ) {
        self.syncClient = syncClient
        self.dataStore = dataStore
        self.notificationPlanner = notificationPlanner
        self._viewModel = State(initialValue: AgendaViewModel(dataStore: dataStore, syncClient: syncClient))
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEEE d. MMMM"
        return f
    }()

    private static let clockFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    private var dateLabel: String { Self.dateFormatter.string(from: now).uppercased() }
    private var clockLabel: String { Self.clockFormatter.string(from: now) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Rectangle()
                .fill(ZenjiTokens.accent.opacity(0.35))
                .frame(height: 1)
            AgendaView(viewModel: viewModel)
        }
        .background(ZenjiTokens.background.ignoresSafeArea())
        .foregroundStyle(ZenjiTokens.foreground)
        .task {
            await refresh()
        }
        .onReceive(clock) { now = $0 }
    }

    /// Loads whatever is already cached immediately (so the agenda isn't
    /// blank while the network round-trip is in flight — WP-12's "kall sync
    /// ved app-start" hook), then syncs and reloads. WP-15: reconciles local
    /// notifications after the sync completes, diffing whatever was cached
    /// before against whatever is cached now — this orchestration (rather
    /// than delegating straight to `viewModel.refresh(now:)`) is what lets
    /// the "previous events" snapshot land exactly between the two cache
    /// reloads, same shape as the WP-15 original.
    private func refresh() async {
        viewModel.reloadFromCache(now: now)
        let previousEvents = dataStore.loadEvents()
        _ = await syncClient.sync()
        viewModel.reloadFromCache(now: now)
        await notificationPlanner.reconcile(
            previousEvents: previousEvents,
            newEvents: dataStore.loadEvents(),
            interests: dataStore.loadInterests() ?? Interests(),
            lastSync: dataStore.lastSync
        )
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ZENJI")
                    .font(.zenjiMono(size: 26, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent)
                    .tracking(2)
                Text(dateLabel)
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
            }
            Spacer()
            Text(clockLabel)
                .font(.zenjiMono(size: 13))
                .monospacedDigit()
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ContentView()
}
