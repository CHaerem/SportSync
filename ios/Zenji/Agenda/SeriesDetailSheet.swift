//
//  SeriesDetailSheet.swift
//  Zenji
//
//  WP-14 — the expanded view of a collapsed stage race: which Norwegians are
//  in it, what's happening right now (the next stage's own summary), and
//  every stage as its own quiet when/what/where line — the "kan
//  ekspanderes" half of the series row (mirrors dashboard.js `seriesDetail`).
//

import SwiftUI

struct SeriesDetailSheet: View {
    let series: AgendaSeriesRow
    @Environment(\.dismiss) private var dismiss

    /// Every Norwegian across all stages, first-seen order, de-duplicated —
    /// mirrors dashboard.js seriesDetail's `riders` collection.
    private var norwegianNames: [String] {
        var seen = Set<String>()
        var names: [String] = []
        for stage in series.stages {
            for player in stage.norwegianPlayers where !seen.contains(player.name) {
                seen.insert(player.name)
                names.append(player.name)
            }
        }
        return names
    }

    var body: some View {
        NavigationStack {
            List {
                if !norwegianNames.isEmpty {
                    DetailRow(label: "Norske", value: norwegianNames.joined(separator: ", "))
                }
                if let summary = series.nextStage.summary, !summary.isEmpty {
                    DetailRow(label: "Nå", value: summary)
                }

                Section {
                    ForEach(Array(series.stages.enumerated()), id: \.offset) { _, stage in
                        StageRow(stage: stage, isNext: EventBridge.stableId(for: stage) == EventBridge.stableId(for: series.nextStage))
                    }
                } header: {
                    Text("ETAPPER")
                        .font(.zenji(.caption2, weight: .semibold))
                        .foregroundStyle(ZenjiTokens.accent)
                        .tracking(0.5)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ZenjiTokens.cell)
            .navigationTitle(series.tournament)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .foregroundStyle(ZenjiTokens.accent)
                        .zenjiTapTarget()
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// One stage: date + time, title, channel — the next stage is quietly
/// marked with the accent dot (the same gentle emphasis an ordinary
/// must-see row gets), everything else plain.
private struct StageRow: View {
    let stage: Event
    let isNext: Bool

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEE d. MMM HH:mm"
        return f
    }()

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(isNext ? ZenjiTokens.accent : Color.clear)
                .frame(width: 6, height: 6)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.dateFormatter.string(from: stage.time))
                    .font(.zenji(.caption2))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
                Text(stage.title)
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.label)
            }
            Spacer()
            Text(AgendaFormat.channelLabel(stage.streaming))
                .font(.zenji(.caption2))
                .foregroundStyle(ZenjiTokens.secondaryLabel)
        }
        .padding(.vertical, 4)
        .listRowBackground(ZenjiTokens.cell)
    }
}
