//
//  BriefRitual.swift
//  Sportivista
//
//  WP-181 — the RITUAL around «Min brief» (WP-174). The brief engine composes
//  the same calm 2–3 sentences it always has; this file only NAMES the surface
//  and says WHEN it is the morning vs. the evening brief, so the same line reads
//  as a daily ritual («Morgenbriefen» / «Kveldsbriefen») instead of an anonymous
//  grey line. It touches nothing in the composer (MinBrief) — WP-174's frozen
//  contract is untouched; this is drapery, not machinery.
//
//  ONE cross-surface definition: the Oslo wall-clock split is twinned bit-for-bit
//  with docs/js/shared-constants.js (`SS_BRIEF_EVENING_HOUR` / `ssBriefRitual` /
//  `ssBriefRitualName`), so the web hero title, the iOS Nyheter brief header and
//  the widget's morning brief line all agree on the same boundary and the same
//  names.
//
//  Deliberately in Feed/ (not News/): the widget's timeline builder gates its
//  morning brief line on `phase(at:)`, and the widget target compiles Feed/ but
//  NOT News/ — a Foundation-only Oslo-time helper is widget-safe, the way
//  FeedCompiler's own osloTimeZone/osloDayKey are.
//

import Foundation

enum BriefRitual {
	/// The Oslo hour at/after which the brief becomes «Kveldsbriefen» (before it,
	/// «Morgenbriefen»). Twin of shared-constants.js `SS_BRIEF_EVENING_HOUR`. 15:
	/// «før ~12» is trivially morning, «etter ~15» flips to evening; the 12–15
	/// afternoon resolves to morning (the evening editorial content doesn't
	/// refresh until 17:00 Oslo anyway).
	static let eveningHour = 15

	enum Phase: Equatable { case morning, evening }

	static var osloCalendar: Calendar {
		var calendar = Calendar(identifier: .gregorian)
		calendar.timeZone = FeedCompiler.osloTimeZone
		return calendar
	}

	/// Which half of the day `date` falls in, Oslo-local.
	static func phase(at date: Date, calendar: Calendar = BriefRitual.osloCalendar) -> Phase {
		calendar.component(.hour, from: date) >= eveningHour ? .evening : .morning
	}

	/// The ritual's Norwegian name in bestemt form (twin of `ssBriefRitualName`).
	static func name(at date: Date, calendar: Calendar = BriefRitual.osloCalendar) -> String {
		phase(at: date, calendar: calendar) == .evening ? "Kveldsbriefen" : "Morgenbriefen"
	}
}
