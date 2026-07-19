//
//  RecentResults.swift
//  Sportivista
//
//  WP-106 — mirrors the parts of docs/data/recent-results.json (fetch-results.js)
//  the Nyheter «RESULTAT» section consumes. That file is keyed by sport
//  (`football`, `golf`, `tennis`, `f1`, …); v0 models the FOOTBALL array — the
//  populated, team-named results the client can lens-match to a followed team
//  and mask behind the spoiler shield. Other sport keys are ignored (decoded to
//  absent) rather than modelled, so a niche/empty sport array is never a crash;
//  they can be added here when the section grows to cover them.
//

import Foundation

struct RecentResults: Codable, Equatable {
	var football: [FootballResult]

	private enum CodingKeys: String, CodingKey { case football }

	init(football: [FootballResult] = []) { self.football = football }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		football = try c.decodeIfPresent([FootballResult].self, forKey: .football) ?? []
	}
}

/// One finished football match (fetch-results.js `football[]`). Only the fields
/// the RESULTAT row needs are modelled; the goal-scorer list, leagueCode etc.
/// are ignored by Codable.
struct FootballResult: Codable, Equatable {
	var homeTeam: String
	var awayTeam: String
	var homeScore: Int?
	var awayScore: Int?
	var date: Date?
	var league: String?
	var venue: String?
	var recapHeadline: String?
	var isFavorite: Bool

	private enum CodingKeys: String, CodingKey {
		case homeTeam, awayTeam, homeScore, awayScore, date, league, venue, recapHeadline, isFavorite
	}

	init(homeTeam: String, awayTeam: String, homeScore: Int? = nil, awayScore: Int? = nil,
	     date: Date? = nil, league: String? = nil, venue: String? = nil,
	     recapHeadline: String? = nil, isFavorite: Bool = false) {
		self.homeTeam = homeTeam
		self.awayTeam = awayTeam
		self.homeScore = homeScore
		self.awayScore = awayScore
		self.date = date
		self.league = league
		self.venue = venue
		self.recapHeadline = recapHeadline
		self.isFavorite = isFavorite
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		homeTeam = try c.decodeIfPresent(String.self, forKey: .homeTeam) ?? ""
		awayTeam = try c.decodeIfPresent(String.self, forKey: .awayTeam) ?? ""
		homeScore = try c.decodeIfPresent(Int.self, forKey: .homeScore)
		awayScore = try c.decodeIfPresent(Int.self, forKey: .awayScore)
		// fetch-results.js emits football dates WITHOUT seconds ("2026-07-18T21:00Z"),
		// which the shared SportivistaJSON strategy (internet-date-time, seconds
		// required) rejects. Decode the raw string and parse it leniently here so a
		// truncated timestamp is a nil date, never a whole-file decode failure —
		// the score/teams (what RESULTAT shows) never depend on it.
		date = (try c.decodeIfPresent(String.self, forKey: .date)).flatMap(Self.parseDate)
		league = try c.decodeIfPresent(String.self, forKey: .league)
		venue = try c.decodeIfPresent(String.self, forKey: .venue)
		recapHeadline = try c.decodeIfPresent(String.self, forKey: .recapHeadline)
		isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
	}

	/// Parse an ISO 8601 date in any of the shapes fetch-results.js / the agents
	/// emit: with fractional seconds, with whole seconds, or WITHOUT seconds
	/// ("…THH:mmZ"). `nil` for anything else (a missing/garbled date just sorts
	/// last — it never fails the decode).
	private static func parseDate(_ raw: String) -> Date? {
		if let d = withFractionalSeconds.date(from: raw) { return d }
		if let d = withSeconds.date(from: raw) { return d }
		return withoutSeconds.date(from: raw)
	}

	nonisolated(unsafe) private static let withFractionalSeconds: ISO8601DateFormatter = {
		let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
	}()
	nonisolated(unsafe) private static let withSeconds: ISO8601DateFormatter = {
		let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
	}()
	nonisolated(unsafe) private static let withoutSeconds: DateFormatter = {
		let f = DateFormatter()
		f.locale = Locale(identifier: "en_US_POSIX")
		f.timeZone = TimeZone(identifier: "UTC")
		f.dateFormat = "yyyy-MM-dd'T'HH:mmXXXXX"
		return f
	}()

	/// "2–1" (en dash) when both scores are present, else nil (the row then has
	/// no outcome to show/mask).
	var scoreLine: String? {
		guard let h = homeScore, let a = awayScore else { return nil }
		return "\(h)–\(a)"
	}
}
