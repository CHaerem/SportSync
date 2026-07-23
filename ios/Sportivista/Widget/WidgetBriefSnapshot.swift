//
//  WidgetBriefSnapshot.swift
//  Sportivista
//
//  WP-181 — the medium widget's morning brief line, PRE-RENDERED by the app.
//
//  Same reasoning as WidgetResultSnapshot (WP-176): the widget target compiles no
//  profile, no personal memory and NOT the brief engine (News/MinBrief is not in
//  its sources), so it cannot compose «Min brief» itself. The app — which holds
//  the profile, the lens and the spoiler shield MinBrief already runs through —
//  composes the brief once (NewsBoard.headline) and writes that one line here;
//  the widget renders a string it was handed. The brief is spoiler-safe BY
//  CONSTRUCTION (MinBrief names a screened entity's result without its outcome),
//  so nothing here can leak more than the app's own Nyheter board already shows.
//
//  `generatedAt` is load-bearing: the brief's language is day-relative
//  («i dag»/«i kveld»), so the widget only shows the line while it is from the
//  CURRENT Oslo day (`isFresh`) — the same day-gate the Nyheter board (WP-136)
//  and the web hero (`featuredIsFresh`) apply, so a stale brief never survives
//  its own day on the home screen. An ABSENT/empty/stale snapshot means no brief
//  line at all — the honest quiet state.
//

import Foundation

struct WidgetBriefSnapshot: Codable, Equatable, Sendable {
	/// The App Group cache filename. Sportivista-owned bookkeeping alongside the
	/// synced files (like `widget-result.json`), derived per device from that
	/// device's own profile — never something the server publishes.
	static let filename = "widget-brief.json"

	/// «I din verden i dag: …» — the composed brief line (NewsBoard.headline).
	/// Nil ⇒ no line.
	var line: String?
	/// When the app composed it — the day-gate reads this so a day-relative brief
	/// never outlives its Oslo day on the widget.
	var generatedAt: Date?

	static let empty = WidgetBriefSnapshot(line: nil, generatedAt: nil)

	init(line: String? = nil, generatedAt: Date? = nil) {
		self.line = line
		self.generatedAt = generatedAt
	}

	var hasBrief: Bool { !(line ?? "").isEmpty }

	/// True only while the snapshot is from the SAME Oslo calendar day as `now`
	/// (and non-empty) — the day-gate that keeps a stale «i kveld» brief off the
	/// widget the next morning.
	func isFresh(now: Date) -> Bool {
		guard hasBrief, let generatedAt else { return false }
		return FeedCompiler.osloDayKey(generatedAt) == FeedCompiler.osloDayKey(now)
	}
}
