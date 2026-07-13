//
//  ContentView.swift
//  Zenji
//
//  WP-10 scaffold: a Tekst-TV header + an empty, day-grouped agenda shell
//  with a single placeholder row. WP-12 wires in the sync status line below
//  the date ("Sist synket: … · N events") and triggers a sync at app start;
//  the agenda itself is still a placeholder — FeedCompiler (WP-13) and the
//  real day-grouped rendering (WP-14) populate it later. NotificationPlanner
//  (WP-15) follows. Norwegian UI per project convention.
//

import SwiftUI

struct ContentView: View {
    let syncClient: SyncClient
    let dataStore: DataStore

    @State private var lastSync: Date?
    @State private var eventCount: Int = 0

    init(syncClient: SyncClient = SyncClient(), dataStore: DataStore = DataStore()) {
        self.syncClient = syncClient
        self.dataStore = dataStore
    }

    private let today = Date()

    private var dateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nb_NO")
        formatter.dateFormat = "EEEE d. MMMM"
        return formatter.string(from: today).uppercased()
    }

    private var syncStatusLabel: String {
        guard let lastSync else { return "Sist synket: aldri" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nb_NO")
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return "Sist synket: \(formatter.string(from: lastSync)) · \(eventCount) events"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Rectangle()
                .fill(ZenjiTokens.accent.opacity(0.35))
                .frame(height: 1)
            agenda
        }
        .background(ZenjiTokens.background.ignoresSafeArea())
        .foregroundStyle(ZenjiTokens.foreground)
        .task {
            await refresh()
        }
    }

    /// Loads whatever is already cached immediately (so the status line
    /// isn't blank while the network round-trip is in flight), then syncs
    /// and reloads — this is the "kall sync ved app-start" hook from WP-12.
    private func refresh() async {
        reloadFromCache()
        _ = await syncClient.sync()
        reloadFromCache()
    }

    private func reloadFromCache() {
        lastSync = dataStore.lastSync
        eventCount = dataStore.loadEvents().count
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("ZENJI")
                .font(.zenjiMono(size: 28, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .tracking(2)
            Text(dateLabel)
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
            Text(syncStatusLabel)
                .font(.zenjiMono(size: 11))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Day-grouped agenda shell. Today there is exactly one group ("I DAG")
    /// holding the placeholder row — real grouping arrives with WP-12/WP-13.
    private var agenda: some View {
        List {
            Section {
                placeholderRow
            } header: {
                Text("I DAG")
                    .font(.zenjiMono(size: 12, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.accent)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ZenjiTokens.background)
    }

    private var placeholderRow: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("–")
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.4))
            Text("Ingen events lastet — sync kommer i WP-12")
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
        }
        .listRowBackground(ZenjiTokens.background)
        .padding(.vertical, 6)
    }
}

#Preview {
    ContentView()
}
