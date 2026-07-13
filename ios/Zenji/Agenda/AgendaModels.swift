//
//  AgendaModels.swift
//  Zenji
//
//  WP-14 — the view-ready row/section types AgendaViewModel produces and
//  AgendaView renders. Plain data, no SwiftUI: every label here is already a
//  formatted String (via AgendaFormat) computed once by
//  `AgendaViewModel.buildSections`, not recomputed per render — the view
//  layer only lays these out.
//

import Foundation

/// One ordinary event row: when · what · where, plus the two independent
/// annotations FeedCompiler attaches (the reminder bell and the quiet visual
/// accent — see FeedCompiler.swift's header on why there are two, not one).
/// Carries the full `Event` for the tap-to-expand detail sheet (venue,
/// summary, every streaming option, AI provenance).
struct AgendaEventRow: Identifiable, Equatable {
    var id: String
    var timeLabel: String
    var title: String
    var channelLabel: String
    var isMustSee: Bool
    var mustWatch: Bool
    var event: Event
}

/// A folded stage race — dashboard.js `collapseSeries`'s Swift-side output,
/// re-shaped for display: one summary line ("Tour de France — 21 etapper"),
/// expandable to every stage.
struct AgendaSeriesRow: Identifiable, Equatable {
    var id: String
    /// The NEXT stage's own time (HH:mm) — never a window; mirrors
    /// dashboard.js's seriesRow, which shows the next stage's start time, not
    /// a start-to-end span for the whole race.
    var timeLabel: String
    var summaryLabel: String
    /// The next stage's own channel — same "first platform, honest '–'"
    /// convention as an ordinary row.
    var channelLabel: String
    /// True when ANY stage in the collapsed race is itself a must-watch
    /// (mirrors dashboard.js seriesRow's `s.stages.some(st => st.mustWatch)`)
    /// — the bell rings for the race even though the visual accent never
    /// applies to a collapsed row (FeedCompiler.isMustSee always returns
    /// false for a series — see FeedCompiler.swift's header).
    var mustWatch: Bool
    var tournament: String
    /// Chronological, full `Event`s (so the expanded detail can show each
    /// stage's own channel/venue).
    var stages: [Event]
    var nextStage: Event
}

/// One row in a day section — either an ordinary event or a collapsed series.
enum AgendaItem: Identifiable, Equatable {
    case event(AgendaEventRow)
    case series(AgendaSeriesRow)

    var id: String {
        switch self {
        case .event(let row): return row.id
        case .series(let row): return row.id
        }
    }
}

/// One Europe/Oslo calendar day's worth of rows, with its Norwegian section
/// label already resolved ("I DAG" / "I MORGEN" / "TIRSDAG 15. JULI").
struct AgendaSection: Identifiable, Equatable {
    var id: String
    var label: String
    var items: [AgendaItem]
}
