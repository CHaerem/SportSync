//
//  PerfSignpost.swift
//  Zenji
//
//  WP-63 — os_signpost instrumentation of the app's two known hotpaths (the
//  WP-60 performance audit): the agenda reload pipeline and the assistant's
//  submit preludium. These are lightweight `OSSignposter` intervals under one
//  dedicated subsystem, so a real on-device stall shows up in Instruments'
//  "os_signpost" / "Points of Interest" instrument as a named, timed interval
//  instead of an opaque blob on the main thread. See ios/README.md §"Ytelse:
//  signposts + MetricKit" for how to read them.
//
//  Pure observation: the intervals wrap existing work and change no value the
//  pipelines produce (the golden agenda vectors stay bit-identical). Signposts
//  compile to near-nothing in Release and are free to leave in shipping code —
//  they are the on-device counterpart to the local MetricKit log (MetricLog.swift).
//

import Foundation
import os

/// The single home for Zenji's performance signposters. One subsystem
/// (`app.sportivista.perf`) so every perf signpost is trivially filtered in
/// Instruments without drowning in the app's ordinary logging; one signposter
/// per hotpath category, each emitting a few named intervals.
enum PerfSignpost {
    /// Filter on this in Instruments (os_signpost instrument → Subsystem) to see
    /// only Zenji's performance intervals.
    static let subsystem = "app.sportivista.perf"

    /// The agenda reload pipeline (WP-60's off-main path in
    /// `AgendaViewModel.computeReloadSync`). Emits three nested intervals:
    /// `load` (cache read + JSON decode), `index` (EntityIndex build), and
    /// `compile` (FeedCompiler + section building), inside an outer `reload`.
    static let reload = OSSignposter(subsystem: subsystem, category: "reload")

    /// The assistant submit preludium (`AssistantViewModel.submit`) — the
    /// synchronous local prep (feed build + memory context) that runs before the
    /// on-device model call. Emits one `submit-prelude` interval.
    static let assistant = OSSignposter(subsystem: subsystem, category: "assistant")
}
