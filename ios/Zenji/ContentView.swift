//
//  ContentView.swift
//  Zenji
//
//  WP-10 scaffold: a Tekst-TV header + an empty, day-grouped agenda shell with
//  a single placeholder row. No data — SyncClient (WP-12) and FeedCompiler
//  (WP-13) populate this later; NotificationPlanner (WP-15) and the real
//  widget timeline (WP-14) follow. Norwegian UI per project convention.
//

import SwiftUI

struct ContentView: View {
    private let today = Date()

    private var dateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nb_NO")
        formatter.dateFormat = "EEEE d. MMMM"
        return formatter.string(from: today).uppercased()
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
