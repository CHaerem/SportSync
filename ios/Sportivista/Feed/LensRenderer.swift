//
//  LensRenderer.swift
//  Sportivista
//
//  WP-18 — the dossier's P320 made real: "rad = event × deltakelse × linse".
//  A sport reaches you THROUGH the entities you follow. Golf is the hero: with
//  a `.throughNorwegians`/`.throughAthletes` lens active, a golf tournament
//  stops rendering as "The Open" and becomes "Reitan teer av 14:32" — the
//  event, seen from the followed athlete's seat.
//
//  This is a PURE, rendering-only layer that runs AFTER FeedCompiler has done
//  relevance / must-see / must-watch / series collapse (it never touches those
//  five predicates — the golden vectors stay bit-identical). Given an event and
//  a lens, it produces zero or more athlete-centred row descriptors; the Agenda
//  layer turns each into an `AgendaEventRow` and re-groups by the effective
//  (athlete) time.
//
//  Why it lives in Feed/ and defines its OWN `LensMode` instead of importing the
//  Assistant module's `Lens`: the SportivistaWidgetExtension target compiles Feed/ but
//  NOT Assistant/ (see FeedCompiler.swift's note on the same constraint). So this
//  file may only reference Foundation + Models (Event/NorwegianPlayer/Participant)
//  + Feed (TextMatch). The Agenda layer — which DOES see both — maps a followed
//  rule's `Lens` → this `LensMode` before calling the renderer.
//
//  Two honesty rules the brief pins (P320 "ærlighet over fylde"):
//    • NEVER invent a time. A focus athlete with no tee time keeps the event's
//      own time and is surfaced by NAME in the meta line — never a fabricated
//      clock.
//    • Graceful degradation. No lens, or no per-athlete participation data to
//      render through, returns nil — the caller renders the ordinary row, so a
//      sport without per-athlete timing (or an event with no matching athletes)
//      is never disturbed.
//

import Foundation

/// The perspective an event is rendered through — a Feed-local mirror of the
/// Assistant module's `Lens`, decoupled so this file compiles in the widget
/// target. The Agenda layer maps a followed rule's `Lens` → this.
enum LensMode: Equatable {
	/// The whole sport, every participant — the DEFAULT. No lens rendering.
	case sportAsSuch
	/// Through the Norwegian athletes/teams in the event ("med fokus på norske").
	case throughNorwegians
	/// Through specific followed athletes — matched by their WP-05 entity id
	/// (authoritative) or, for participants that carry no id, by name.
	case throughAthletes(ids: Set<String>, names: [String])

	var isDefault: Bool { self == .sportAsSuch }
}

enum LensRenderer {

	/// One lens-rendered row: the same when · what · where an agenda row
	/// answers, re-centred on the followed athlete(s).
	struct LensRow: Equatable {
		/// The athletes this row is about (surname-forward display).
		var athleteNames: [String]
		/// The athlete's own start/tee time. When present it OVERRIDES the event
		/// time for sorting, day-grouping AND display (P320). `nil` → keep the
		/// event's own time (graceful degradation — never a fabricated clock).
		var effectiveTime: Date?
		/// The reformulated, athlete-perspective title (calm Norwegian). For a
		/// timed golf row: "Reitan teer av — The Open". For the untimed
		/// degradation it stays the event's own title (the athletes move to
		/// `metaDetail` instead).
		var title: String
		/// The quiet meta line for this row: the player's status verbatim
		/// (round/score/position, NEVER parsed or invented) for a timed row, or
		/// the followed names for the untimed degradation. `nil` → the caller
		/// keeps the event's own meta line.
		var metaDetail: String?
		/// Stable per-participation suffix (entity ids / normalised names +
		/// slot) so lens rows dedupe and SwiftUI-diff correctly against each
		/// other and the plain row they replace.
		var idSuffix: String
	}

	/// Produce lens rows for `event` under `mode`, or `nil` when the lens does
	/// not apply (default lens) or there is no per-athlete participation to
	/// render through. `nil` is the graceful-degradation signal: the caller then
	/// renders the ordinary row untouched.
	static func render(event: Event, mode: LensMode, followedIds: Set<String>) -> [LensRow]? {
		guard !mode.isDefault else { return nil }
		let focus = focusPlayers(in: event, mode: mode)
		guard !focus.isEmpty else { return nil }

		let isGolf = TextMatch.normalize(event.sport) == "golf"
		let eventTitle = event.title

		var rows: [LensRow] = []

		// Timed participations (a real tee time) → one row per DISTINCT time.
		// Athletes sharing the exact same time collapse into one calm row
		// (surnames joined, the shared time in the time column); distinct times
		// each get their own row, so every tee time keeps the honest time column
		// rather than being crammed into text. This is the "roligste" choice the
		// brief asks us to make and document: the time column stays sacred.
		let timed = focus.filter { $0.teeTimeUTC != nil }
		let byTime = Dictionary(grouping: timed, by: { $0.teeTimeUTC! })
		for time in byTime.keys.sorted() {
			let players = (byTime[time] ?? []).sorted { surname($0.name) < surname($1.name) }
			let names = players.map { surname($0.name) }
			rows.append(LensRow(
				athleteNames: names,
				effectiveTime: time,
				title: teeOffTitle(names: names, eventTitle: eventTitle, isGolf: isGolf),
				metaDetail: statusDetail(players),
				idSuffix: "lens|\(players.map(\.key).joined(separator: "+"))|\(time.timeIntervalSince1970)"
			))
		}

		// Untimed participations (no tee time) → ONE combined row at the event's
		// own time, the followed names moved into the meta line. This is the
		// honest degradation AND, today, the common golf case (tournament tee
		// times are published only once a round is imminent). No fabricated time.
		let untimed = focus.filter { $0.teeTimeUTC == nil }
		if !untimed.isEmpty {
			let players = untimed.sorted { surname($0.name) < surname($1.name) }
			let names = players.map { surname($0.name) }
			rows.append(LensRow(
				athleteNames: names,
				effectiveTime: nil,
				title: eventTitle,
				metaDetail: names.joined(separator: " · "),
				idSuffix: "lens|\(players.map(\.key).joined(separator: "+"))|window"
			))
		}

		return rows.isEmpty ? nil : rows
	}

	// MARK: - Focus resolution

	/// One athlete-participation the lens focuses on, normalised across the two
	/// data shapes (golf's rich `norwegianPlayers`, other sports' bare
	/// `participants`).
	private struct FocusPlayer {
		var name: String
		var teeTimeUTC: Date?
		var status: String?
		/// Dedupe/id key: the entity id when known, else the normalised name.
		var key: String
	}

	private static func focusPlayers(in event: Event, mode: LensMode) -> [FocusPlayer] {
		switch mode {
		case .sportAsSuch:
			return []
		case .throughNorwegians:
			// Every Norwegian in the event — you follow the tournament THROUGH
			// its Norwegians, so all of them are the focus (not only those you
			// separately, individually track).
			return dedupe(event.norwegianPlayers.map(focus(from:)))
		case let .throughAthletes(ids, names):
			let wanted = Set(names.map { TextMatch.normalize($0) })
			var out: [FocusPlayer] = []
			for p in event.norwegianPlayers {
				let byId = p.entityId.map(ids.contains) ?? false
				let byName = wanted.contains(TextMatch.normalize(p.name))
				if byId || byName { out.append(focus(from: p)) }
			}
			for p in event.participants where wanted.contains(TextMatch.normalize(p.name)) {
				out.append(FocusPlayer(name: p.name, teeTimeUTC: nil, status: nil, key: TextMatch.normalize(p.name)))
			}
			return dedupe(out)
		}
	}

	private static func focus(from p: NorwegianPlayer) -> FocusPlayer {
		FocusPlayer(
			name: p.name,
			teeTimeUTC: p.teeTimeUTC,
			status: p.status,
			key: p.entityId ?? TextMatch.normalize(p.name)
		)
	}

	/// First-wins de-dupe on `key`, preserving order.
	private static func dedupe(_ players: [FocusPlayer]) -> [FocusPlayer] {
		var seen = Set<String>()
		return players.filter { seen.insert($0.key).inserted }
	}

	// MARK: - Title / meta formatting

	/// The athlete-perspective title for a timed row. Golf gets the "teer av"
	/// verb the brief models; any other (rare) timed sport stays name-forward
	/// without inventing a verb.
	private static func teeOffTitle(names: [String], eventTitle: String, isGolf: Bool) -> String {
		let subjects = names.joined(separator: " · ")
		guard !eventTitle.isEmpty else {
			return isGolf ? "\(subjects) teer av" : subjects
		}
		return isGolf ? "\(subjects) teer av — \(eventTitle)" : "\(subjects) — \(eventTitle)"
	}

	/// The player status(es) for a timed row's meta — verbatim, deduped, joined.
	/// Returns nil when no status is known (the title already names the event, so
	/// an empty meta line is honest, not a gap).
	private static func statusDetail(_ players: [FocusPlayer]) -> String? {
		var seen = Set<String>()
		let parts = players
			.compactMap { $0.status?.trimmingCharacters(in: .whitespacesAndNewlines) }
			.filter { !$0.isEmpty && seen.insert($0).inserted }
		return parts.isEmpty ? nil : parts.joined(separator: " · ")
	}

	/// The surname (last whitespace-separated component) for the calm,
	/// name-forward display the brief uses ("Reitan", "Hovland"). Falls back to
	/// the whole string for a single-token name.
	static func surname(_ full: String) -> String {
		let trimmed = full.trimmingCharacters(in: .whitespaces)
		let parts = trimmed.split(separator: " ")
		return parts.last.map(String.init) ?? trimmed
	}
}
