//
//  AgendaView.swift
//  Zenji
//
//  WP-14 — the real, day-grouped Tekst-TV agenda: one quiet column, no
//  cards, no competing panels (CLAUDE.md "Calm dashboard"). Each row answers
//  only when · what · where; a tap opens the detail sheet (venue, summary,
//  every streaming option, AI provenance for source == "ai-research").
//  Pull-to-refresh re-syncs via AgendaViewModel.refresh().
//

import SwiftUI

struct AgendaView: View {
    var viewModel: AgendaViewModel

    /// A single optional target drives both sheets — Event isn't Identifiable
    /// (its `id` is optional on the model, per WP-11's forward-compat story),
    /// so this local wrapper is what `.sheet(item:)` needs.
    private enum DetailTarget: Identifiable {
        case event(Event)
        case series(AgendaSeriesRow)

        var id: String {
            switch self {
            case .event(let e): return EventBridge.stableId(for: e)
            case .series(let s): return s.id
            }
        }
    }

    @State private var detailTarget: DetailTarget?

    var body: some View {
        List {
            ForEach(viewModel.sections) { section in
                Section {
                    ForEach(section.items) { item in
                        rowView(for: item)
                            .listRowBackground(ZenjiTokens.background)
                            .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 20))
                    }
                } header: {
                    Text(section.label)
                        .font(.zenjiMono(size: 12, weight: .semibold))
                        .foregroundStyle(ZenjiTokens.accent)
                        .tracking(1)
                }
            }
            if viewModel.sections.isEmpty {
                emptyRow
                    .listRowBackground(ZenjiTokens.background)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ZenjiTokens.background)
        .refreshable {
            await viewModel.refresh()
        }
        .sheet(item: $detailTarget) { target in
            switch target {
            case .event(let event):
                EventDetailSheet(event: event)
            case .series(let series):
                SeriesDetailSheet(series: series)
            }
        }
    }

    @ViewBuilder
    private func rowView(for item: AgendaItem) -> some View {
        switch item {
        case .event(let row):
            EventRowView(row: row)
                .contentShape(Rectangle())
                .onTapGesture { detailTarget = .event(row.event) }
        case .series(let row):
            SeriesRowView(row: row)
                .contentShape(Rectangle())
                .onTapGesture { detailTarget = .series(row) }
        }
    }

    /// "Henter data …" before the very first sync ever completes, else the
    /// honest "nothing right now" — `lastSync == nil` is DataStore's own
    /// "never synced" flag (see DataStore.swift), not just "zero events".
    private var emptyRow: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("–")
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.4))
            Text(viewModel.lastSync == nil ? "Henter data …" : "Ingen kommende arrangementer akkurat nå.")
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Rows

/// One ordinary agenda row: a quiet amber dot for must-see, HH:mm (tabular
/// mono), title (+ a small bell when must-watch), channel, and a caret.
struct EventRowView: View {
    let row: AgendaEventRow

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            MustSeeDot(on: row.isMustSee)
            TimeColumn(text: row.timeLabel)
            HStack(spacing: 6) {
                Text(row.title)
                    .font(.zenjiMono(size: 14))
                    .foregroundStyle(ZenjiTokens.foreground)
                    .lineLimit(1)
                if row.mustWatch {
                    Text("🔔").font(.system(size: 10))
                }
            }
            Spacer(minLength: 8)
            ChannelLabel(text: row.channelLabel)
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.25))
        }
        .padding(.vertical, 8)
    }
}

/// A collapsed stage race: one summary line ("Tour de France — 21 etapper"),
/// the next stage's own time/channel, expandable via the detail sheet.
struct SeriesRowView: View {
    let row: AgendaSeriesRow

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            MustSeeDot(on: false) // series rows are never visually accented (FeedCompiler.isMustSee)
            TimeColumn(text: row.timeLabel)
            HStack(spacing: 6) {
                Text(row.summaryLabel)
                    .font(.zenjiMono(size: 14))
                    .foregroundStyle(ZenjiTokens.foreground)
                    .lineLimit(1)
                if row.mustWatch {
                    Text("🔔").font(.system(size: 10))
                }
            }
            Spacer(minLength: 8)
            ChannelLabel(text: row.channelLabel)
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.25))
        }
        .padding(.vertical, 8)
    }
}

/// The gentlest possible emphasis (CLAUDE.md): a small filled amber dot when
/// on, an invisible placeholder of the same size when off, so rows stay
/// aligned either way.
private struct MustSeeDot: View {
    let on: Bool

    var body: some View {
        Circle()
            .fill(on ? ZenjiTokens.accent : Color.clear)
            .frame(width: 6, height: 6)
            .padding(.top, 6)
    }
}

/// The time column: tabular mono, a sensible minimum width so ordinary
/// "HH:mm" rows line up, but `.fixedSize()` so a wider multi-day window
/// ("13.–20. juli") takes the extra space it needs on ONE line instead of
/// wrapping into the title column (AgendaFormat.timeLabel's whole point is a
/// compact single-line window).
private struct TimeColumn: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.zenjiMono(size: 14, weight: .medium))
            .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .frame(minWidth: 56, alignment: .leading)
    }
}

/// The channel column: an honest faint "–" when unknown, full-opacity text
/// otherwise (CLAUDE.md "Channel shown quietly, with an honest faint '–'
/// when unknown").
private struct ChannelLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.zenjiMono(size: 12))
            .foregroundStyle(text == "–" ? ZenjiTokens.foreground.opacity(0.3) : ZenjiTokens.foreground.opacity(0.7))
            .lineLimit(1)
    }
}

#Preview {
    AgendaView(viewModel: AgendaViewModel())
}
