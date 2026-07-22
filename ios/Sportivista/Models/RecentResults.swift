//
//  RecentResults.swift
//  Sportivista
//
//  WP-106 — mirrors the parts of docs/data/recent-results.json (fetch-results.js)
//  the Nyheter «RESULTAT» section consumes. That file is keyed by sport
//  (`football`, `golf`, `tennis`, `f1`, …); v0 modelled only the FOOTBALL array.
//
//  WP-171 adds the other three keys: The Open's final leaderboard and the F1
//  podium were already IN this file, fetched every pipeline run, and no surface
//  ever showed them — «hva skjedde i går» was football-only. Every sport is
//  still decoded leniently (decodeIfPresent + defaults), so a missing or empty
//  sport key is an absent section, never a crash.
//

import Foundation

struct RecentResults: Codable, Equatable {
	var football: [FootballResult]
	/// Keyed by tour (`pga`, `dpWorld`); a null tour (no tournament in window)
	/// decodes to absent.
	var golf: [String: GolfTourResult]
	var tennis: [TennisResult]
	var f1: [F1RaceResult]

	private enum CodingKeys: String, CodingKey { case football, golf, tennis, f1 }

	init(football: [FootballResult] = [], golf: [String: GolfTourResult] = [:],
	     tennis: [TennisResult] = [], f1: [F1RaceResult] = []) {
		self.football = football
		self.golf = golf
		self.tennis = tennis
		self.f1 = f1
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		football = try c.decodeIfPresent([FootballResult].self, forKey: .football) ?? []
		// The tour values are nullable in the source file — decode optionals and
		// drop the nulls rather than failing the whole decode.
		let tours = try c.decodeIfPresent([String: GolfTourResult?].self, forKey: .golf) ?? [:]
		golf = tours.compactMapValues { $0 }
		tennis = try c.decodeIfPresent([TennisResult].self, forKey: .tennis) ?? []
		f1 = try c.decodeIfPresent([F1RaceResult].self, forKey: .f1) ?? []
	}
}

/// One tour's tournament result (`golf.pga` / `golf.dpWorld`). `status` is
/// ESPN's lowercased status — only `final` is a RESULT (an in-progress
/// leaderboard belongs to the agenda, not to «hva skjedde»).
struct GolfTourResult: Codable, Equatable {
	var tournamentName: String?
	var status: String?
	var completedRound: Int?
	var topPlayers: [GolfResultPlayer]
	var norwegianPlayers: [GolfResultPlayer]

	init(tournamentName: String? = nil, status: String? = nil, completedRound: Int? = nil,
	     topPlayers: [GolfResultPlayer] = [], norwegianPlayers: [GolfResultPlayer] = []) {
		self.tournamentName = tournamentName
		self.status = status
		self.completedRound = completedRound
		self.topPlayers = topPlayers
		self.norwegianPlayers = norwegianPlayers
	}

	private enum CodingKeys: String, CodingKey { case tournamentName, status, completedRound, topPlayers, norwegianPlayers }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		tournamentName = try c.decodeIfPresent(String.self, forKey: .tournamentName)
		status = try c.decodeIfPresent(String.self, forKey: .status)
		completedRound = try c.decodeIfPresent(Int.self, forKey: .completedRound)
		topPlayers = try c.decodeIfPresent([GolfResultPlayer].self, forKey: .topPlayers) ?? []
		norwegianPlayers = try c.decodeIfPresent([GolfResultPlayer].self, forKey: .norwegianPlayers) ?? []
	}

	var isFinal: Bool { (status ?? "").lowercased() == "final" }
}

/// One line of a golf leaderboard result.
struct GolfResultPlayer: Codable, Equatable {
	var position: Int?
	var player: String
	var score: String?
	var roundScore: String?
	var thru: String?

	init(position: Int? = nil, player: String, score: String? = nil, roundScore: String? = nil, thru: String? = nil) {
		self.position = position
		self.player = player
		self.score = score
		self.roundScore = roundScore
		self.thru = thru
	}

	private enum CodingKeys: String, CodingKey { case position, player, score, roundScore, thru }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		position = try c.decodeIfPresent(Int.self, forKey: .position)
		player = try c.decodeIfPresent(String.self, forKey: .player) ?? ""
		score = try c.decodeIfPresent(String.self, forKey: .score)
		roundScore = try c.decodeIfPresent(String.self, forKey: .roundScore)
		thru = try c.decodeIfPresent(String.self, forKey: .thru)
	}
}

/// One finished tennis match (`tennis[]`). The file names the WINNER explicitly;
/// the board deliberately builds an outcome-NEUTRAL title from the pair so the
/// row itself never spoils who won (the outcome sits behind the shield).
struct TennisResult: Codable, Equatable {
	var winner: String
	var loser: String
	var score: String?
	var date: Date?
	var tournament: String?
	var round: String?
	var isFavorite: Bool

	init(winner: String, loser: String, score: String? = nil, date: Date? = nil,
	     tournament: String? = nil, round: String? = nil, isFavorite: Bool = false) {
		self.winner = winner
		self.loser = loser
		self.score = score
		self.date = date
		self.tournament = tournament
		self.round = round
		self.isFavorite = isFavorite
	}

	private enum CodingKeys: String, CodingKey { case winner, loser, score, date, tournament, round, isFavorite }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		winner = try c.decodeIfPresent(String.self, forKey: .winner) ?? ""
		loser = try c.decodeIfPresent(String.self, forKey: .loser) ?? ""
		score = try c.decodeIfPresent(String.self, forKey: .score)
		// Same lenient parse as FootballResult: the fetchers emit several ISO
		// shapes; an unparseable stamp is a nil date, never a decode failure.
		date = (try c.decodeIfPresent(String.self, forKey: .date)).flatMap(FootballResult.parseISODate)
		tournament = try c.decodeIfPresent(String.self, forKey: .tournament)
		round = try c.decodeIfPresent(String.self, forKey: .round)
		isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
	}
}

/// One finished F1 session (`f1[]`) with its finishing order.
struct F1RaceResult: Codable, Equatable {
	var raceName: String
	var type: String?
	var date: Date?
	var circuit: String?
	var topDrivers: [F1ResultDriver]

	init(raceName: String, type: String? = nil, date: Date? = nil, circuit: String? = nil, topDrivers: [F1ResultDriver] = []) {
		self.raceName = raceName
		self.type = type
		self.date = date
		self.circuit = circuit
		self.topDrivers = topDrivers
	}

	private enum CodingKeys: String, CodingKey { case raceName, type, date, circuit, topDrivers }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		raceName = try c.decodeIfPresent(String.self, forKey: .raceName) ?? ""
		type = try c.decodeIfPresent(String.self, forKey: .type)
		date = (try c.decodeIfPresent(String.self, forKey: .date)).flatMap(FootballResult.parseISODate)
		circuit = try c.decodeIfPresent(String.self, forKey: .circuit)
		topDrivers = try c.decodeIfPresent([F1ResultDriver].self, forKey: .topDrivers) ?? []
	}
}

/// One finishing position in an F1 session.
struct F1ResultDriver: Codable, Equatable {
	var position: Int?
	var driver: String
	var team: String?
	var status: String?

	init(position: Int? = nil, driver: String, team: String? = nil, status: String? = nil) {
		self.position = position
		self.driver = driver
		self.team = team
		self.status = status
	}

	private enum CodingKeys: String, CodingKey { case position, driver, team, status }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		position = try c.decodeIfPresent(Int.self, forKey: .position)
		driver = try c.decodeIfPresent(String.self, forKey: .driver) ?? ""
		team = try c.decodeIfPresent(String.self, forKey: .team)
		status = try c.decodeIfPresent(String.self, forKey: .status)
	}
}

/// One finished football match (fetch-results.js `football[]`). WP-171 models
/// `goalScorers` too — the fetcher has always paid for it and no surface ever
/// rendered it, so «2–1» never said WHO scored or WHEN.
struct FootballResult: Codable, Equatable {
	var homeTeam: String
	var awayTeam: String
	var homeScore: Int?
	var awayScore: Int?
	var date: Date?
	var league: String?
	var venue: String?
	var goalScorers: [GoalScorer]
	var recapHeadline: String?
	var isFavorite: Bool

	private enum CodingKeys: String, CodingKey {
		case homeTeam, awayTeam, homeScore, awayScore, date, league, venue, goalScorers, recapHeadline, isFavorite
	}

	init(homeTeam: String, awayTeam: String, homeScore: Int? = nil, awayScore: Int? = nil,
	     date: Date? = nil, league: String? = nil, venue: String? = nil,
	     goalScorers: [GoalScorer] = [], recapHeadline: String? = nil, isFavorite: Bool = false) {
		self.homeTeam = homeTeam
		self.awayTeam = awayTeam
		self.homeScore = homeScore
		self.awayScore = awayScore
		self.date = date
		self.league = league
		self.venue = venue
		self.goalScorers = goalScorers
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
		date = (try c.decodeIfPresent(String.self, forKey: .date)).flatMap(Self.parseISODate)
		league = try c.decodeIfPresent(String.self, forKey: .league)
		venue = try c.decodeIfPresent(String.self, forKey: .venue)
		goalScorers = try c.decodeIfPresent([GoalScorer].self, forKey: .goalScorers) ?? []
		recapHeadline = try c.decodeIfPresent(String.self, forKey: .recapHeadline)
		isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
	}

	/// Parse an ISO 8601 date in any of the shapes fetch-results.js / the agents
	/// emit: with fractional seconds, with whole seconds, or WITHOUT seconds
	/// ("…THH:mmZ"). `nil` for anything else (a missing/garbled date just sorts
	/// last — it never fails the decode). Shared by the tennis/F1 results
	/// (WP-171) — they come out of the same fetcher with the same shapes.
	static func parseISODate(_ raw: String) -> Date? {
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

/// One goal (fetch-results.js `goalScorers[]`): who scored, for which team, in
/// which minute (the raw source string, e.g. "8'" / "90'+2").
struct GoalScorer: Codable, Equatable {
	var player: String
	var team: String?
	var minute: String?

	init(player: String, team: String? = nil, minute: String? = nil) {
		self.player = player
		self.team = team
		self.minute = minute
	}

	private enum CodingKeys: String, CodingKey { case player, team, minute }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		player = try c.decodeIfPresent(String.self, forKey: .player) ?? ""
		team = try c.decodeIfPresent(String.self, forKey: .team)
		minute = try c.decodeIfPresent(String.self, forKey: .minute)
	}

	/// "8' Kristian Eriksen (SK Brann)" — the row's detail line. Empty when the
	/// scorer has no name (nothing honest to show).
	var line: String {
		let who = player.trimmingCharacters(in: .whitespaces)
		guard !who.isEmpty else { return "" }
		let min = (minute ?? "").trimmingCharacters(in: .whitespaces)
		let side = (team ?? "").trimmingCharacters(in: .whitespaces)
		return "\(min.isEmpty ? "" : "\(min) ")\(who)\(side.isEmpty ? "" : " (\(side))")"
	}
}
