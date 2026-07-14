//
//  AgendaView.swift
//  Zenji
//
//  WP-14 → WP-14.1 — the real, day-grouped Tekst-TV agenda, realised against
//  DESIGN.md ("Agendaens semantikk" + "Radens anatomi"): one quiet centred
//  column (max 640pt), ruled by hairlines, no cards, no competing panels.
//  Each row answers only when · what · where. A tap anywhere on the row opens
//  the detail sheet — there is NO chevron; the rhythm signals tappability.
//
//  What WP-14.1 changed versus the first WP-14 pass (all eight audited
//  breaches; the day-ordering ones live in AgendaViewModel/FeedCompiler, the
//  rest here):
//   • Titles are never truncated — up to two lines, never a "…".
//   • The 🔔 emoji is gone from rows (the amber dot is the whole must-see
//     language; the reminder state moved to the detail sheet).
//   • The iOS chevron is gone; a quiet mono ⓘ appears ONLY on AI-research rows.
//   • The channel never shrinks the title — it drops to its own dempet line
//     under the title on a narrow (compact) screen, and only sits on the
//     right on a wide one.
//

import SwiftUI

struct AgendaView: View {
    var viewModel: AgendaViewModel
    /// WP-16.4 — a "Følg <entitet>" context action tapped in the detail sheet;
    /// ContentView routes it into the assistant's diff/confirm flow. Defaults to
    /// a no-op so the WP-14 `#Preview` and any standalone use still compile.
    var onFollow: (Entity) -> Void = { _ in }

    /// A single optional target drives both sheets. The event case carries the
    /// whole `AgendaEventRow` (not just the `Event`) so the detail sheet has the
    /// precomputed WP-16.4 context data (whyShown + followable) too.
    private enum DetailTarget: Identifiable {
        case event(AgendaEventRow)
        case series(AgendaSeriesRow)

        var id: String {
            switch self {
            case .event(let row): return row.id
            case .series(let s): return s.id
            }
        }
    }

    @State private var detailTarget: DetailTarget?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if viewModel.sections.isEmpty {
                    emptyRow
                } else {
                    ForEach(Array(viewModel.sections.enumerated()), id: \.element.id) { index, section in
                        dayHeader(section.label, isFirst: index == 0)
                        ForEach(section.items) { item in
                            rowView(for: item)
                                .contentShape(Rectangle())
                                .onTapGesture { open(item) }
                            hairline
                        }
                    }
                }
            }
            .frame(maxWidth: 640, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center) // centre the column on wide screens
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
        .background(ZenjiTokens.background)
        .refreshable {
            await viewModel.refresh()
        }
        .sheet(item: $detailTarget) { target in
            switch target {
            case .event(let row):
                EventDetailSheet(row: row, onFollow: onFollow)
            case .series(let series):
                SeriesDetailSheet(series: series)
            }
        }
    }

    // MARK: - Day section header (28pt before, 10pt after — DESIGN.md "Rytme")

    private func dayHeader(_ label: String, isFirst: Bool) -> some View {
        Text(label)
            .font(.zenjiMono(size: 13, weight: .semibold))
            .tracking(1) // +8 % of 13pt (DESIGN.md "dagoverskrift … +8 % sporing")
            .foregroundStyle(ZenjiTokens.accent)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, isFirst ? 12 : 28)
            .padding(.bottom, 10)
    }

    private var hairline: some View {
        Rectangle()
            .fill(ZenjiTokens.hairline)
            .frame(height: 1)
    }

    @ViewBuilder
    private func rowView(for item: AgendaItem) -> some View {
        switch item {
        case .event(let row):
            EventRowView(row: row)
        case .series(let row):
            SeriesRowView(row: row)
        }
    }

    private func open(_ item: AgendaItem) {
        switch item {
        case .event(let row): detailTarget = .event(row)
        case .series(let row): detailTarget = .series(row)
        }
    }

    /// "Henter data …" before the very first sync ever completes, else the
    /// honest "nothing right now" — `lastSync == nil` is DataStore's own
    /// "never synced" flag (see DataStore.swift), not just "zero events".
    private var emptyRow: some View {
        Text(viewModel.lastSync == nil ? "Henter data …" : "Ingen kommende arrangementer akkurat nå.")
            .font(.zenjiMono(size: 15))
            .foregroundStyle(ZenjiTokens.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 24)
    }
}

// MARK: - Rows

/// One ordinary agenda row (DESIGN.md "Radens anatomi"): amber must-see dot,
/// the time (or a multi-day window) in a fixed left column, then the title —
/// up to two lines, never truncated — with a quiet meta line and the channel.
/// A mono ⓘ trails ONLY on AI-research events.
struct EventRowView: View {
    let row: AgendaEventRow

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            MustSeeDot(on: row.isMustSee)
            TimeColumn(text: row.timeLabel)
            RowBody(title: row.title, meta: row.metaLabel, channel: row.channelLabel)
            InfoGlyph(on: row.isAIResearch)
        }
        .padding(.vertical, 12)
    }
}

/// A collapsed stage race: one summary line ("Tour de France — 21 etapper"),
/// the next stage's own time/channel; expandable via the detail sheet.
struct SeriesRowView: View {
    let row: AgendaSeriesRow

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            MustSeeDot(on: false) // series rows are never visually accented (FeedCompiler.isMustSee)
            TimeColumn(text: row.timeLabel)
            RowBody(title: row.summaryLabel, meta: nil, channel: row.channelLabel)
            InfoGlyph(on: row.isAIResearch)
        }
        .padding(.vertical, 12)
    }
}

/// Title (≤ 2 lines, never truncated to a "…") + the channel. The title has
/// priority: on a compact width the channel drops to its own dempet line
/// UNDER the title so the title keeps the full column; on a regular width the
/// channel sits quietly on the right. Either way the channel never squeezes
/// the title (DESIGN.md: "Kanal … krymper ALDRI tittelen").
private struct RowBody: View {
    let title: String
    let meta: String?
    let channel: String
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        if sizeClass == .regular {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    titleText
                    if let meta { MetaText(meta) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ChannelLabel(text: channel)
                    .fixedSize()
                    .padding(.top, 2)
            }
        } else {
            VStack(alignment: .leading, spacing: 3) {
                titleText
                secondaryLine
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var titleText: some View {
        Text(title)
            .font(.zenjiMono(size: 17))
            .foregroundStyle(ZenjiTokens.foreground)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true) // grow to 2 lines, never clip
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The one dempet line under the title on a narrow screen. The channel
    /// (the "hvor" answer) is never truncated; the meta is a "ved behov"
    /// extra, so when "meta · kanal" doesn't fit, the meta is dropped WHOLE
    /// (never shown as an "…"-clipped fragment) and only the channel remains.
    @ViewBuilder
    private var secondaryLine: some View {
        if let meta {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                    MetaText(meta).fixedSize()
                    Text("·")
                        .font(.zenjiMono(size: 15))
                        .foregroundStyle(ZenjiTokens.muted.opacity(0.6))
                        .fixedSize()
                    ChannelLabel(text: channel).fixedSize()
                }
                ChannelLabel(text: channel).fixedSize()
            }
        } else {
            ChannelLabel(text: channel).fixedSize()
        }
    }
}

/// The gentlest possible emphasis (DESIGN.md: "Prikken er hele språket"): a
/// small filled amber dot when on, an invisible placeholder of the same size
/// when off, so rows stay aligned either way. Left of the time column.
private struct MustSeeDot: View {
    let on: Bool

    var body: some View {
        Circle()
            .fill(on ? ZenjiTokens.accent : Color.clear)
            .frame(width: 6, height: 6)
            .padding(.top, 7)
    }
}

/// The time column. An ordinary "HH:mm" reads at 17pt semibold tabular (the
/// DESIGN.md time scale); a multi-day window ("13.–20. juli") reads a notch
/// quieter (13pt medium) so a week-long range stays compact and doesn't shove
/// the title off the row — it is a date span, not a clock. Either way it lives
/// in the SAME left column (never merged into the title). `.fixedSize` lets it
/// take exactly the width it needs; the min width keeps "HH:mm" rows aligned.
private struct TimeColumn: View {
    let text: String

    /// A clock always carries ":"; a window ("13.–20. juli") or honest "–"
    /// never does.
    private var isClock: Bool { text.contains(":") }

    var body: some View {
        Text(text)
            .font(.zenjiMono(size: isClock ? 17 : 13, weight: isClock ? .semibold : .medium))
            .foregroundStyle(ZenjiTokens.foreground)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .frame(minWidth: 58, alignment: .leading)
            .padding(.top, isClock ? 0 : 2)
    }
}

/// The channel ("hvor"): dempet, 15pt. An honest, fainter "–" when unknown
/// (DESIGN.md "Ærlig innhold": ukjent kanal er «–»).
private struct ChannelLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.zenjiMono(size: 15))
            .foregroundStyle(text == "–" ? ZenjiTokens.muted.opacity(0.5) : ZenjiTokens.muted)
            .lineLimit(1)
    }
}

/// The quiet meta line ("turnering"): 15pt dempet.
private struct MetaText: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.zenjiMono(size: 15))
            .foregroundStyle(ZenjiTokens.muted)
            .lineLimit(1)
    }
}

/// The provenance marker: a quiet mono ⓘ, shown ONLY on AI-research rows
/// (DESIGN.md). Tapping the row opens the detail sheet, where the confidence
/// and every evidence link live. An invisible placeholder keeps non-AI rows
/// aligned with AI ones.
private struct InfoGlyph: View {
    let on: Bool

    var body: some View {
        Text("ⓘ")
            .font(.zenjiMono(size: 14))
            .foregroundStyle(on ? ZenjiTokens.muted : Color.clear)
            .padding(.top, 2)
            .accessibilityLabel(on ? "Funnet av AI" : "")
    }
}

#Preview {
    AgendaView(viewModel: AgendaViewModel())
}
