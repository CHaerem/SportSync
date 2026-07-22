//
//  Standings.swift
//  Sportivista
//
//  WP-171 — mirrors docs/data/standings.json (fetch-standings.js): the league
//  table, the golf leaderboards and the F1 championship the static pipeline has
//  published every hour since v2. The web detail sheet has shown this since
//  WP-14 (detail.js `footballStanding`/`golfContext`/`addF1Context`); the app
//  did not even SYNC the file. This closes that parity debt — the model is
//  read-only and lenient (decodeIfPresent + defaults everywhere), so a missing
//  or reshaped key is an absent table, never a crash.
//
//  NB: standings are pipeline-cadence data. There is deliberately NO live
//  updating of tables (WP-171 non-goal) — the hourly static pipeline is enough.
//

import Foundation

struct Standings: Codable, Equatable, Sendable {
	var football: FootballStandings
	/// Keyed by tour (`pga`, `dpWorld`).
	var golf: [String: GolfLeaderboard]
	var f1: F1Standings

	private enum CodingKeys: String, CodingKey { case football, golf, f1 }

	init(football: FootballStandings = FootballStandings(), golf: [String: GolfLeaderboard] = [:], f1: F1Standings = F1Standings()) {
		self.football = football
		self.golf = golf
		self.f1 = f1
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		football = try c.decodeIfPresent(FootballStandings.self, forKey: .football) ?? FootballStandings()
		let tours = try c.decodeIfPresent([String: GolfLeaderboard?].self, forKey: .golf) ?? [:]
		golf = tours.compactMapValues { $0 }
		f1 = try c.decodeIfPresent(F1Standings.self, forKey: .f1) ?? F1Standings()
	}

	var isEmpty: Bool {
		football.premierLeague.isEmpty && football.laLiga.isEmpty && golf.isEmpty && f1.drivers.isEmpty
	}
}

struct FootballStandings: Codable, Equatable, Sendable {
	var premierLeague: [FootballStandingRow]
	var laLiga: [FootballStandingRow]

	private enum CodingKeys: String, CodingKey { case premierLeague, laLiga }

	init(premierLeague: [FootballStandingRow] = [], laLiga: [FootballStandingRow] = []) {
		self.premierLeague = premierLeague
		self.laLiga = laLiga
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		premierLeague = try c.decodeIfPresent([FootballStandingRow].self, forKey: .premierLeague) ?? []
		laLiga = try c.decodeIfPresent([FootballStandingRow].self, forKey: .laLiga) ?? []
	}
}

struct FootballStandingRow: Codable, Equatable, Sendable {
	var position: Int
	var team: String
	var teamShort: String?
	var played: Int
	var points: Int
	var gd: Int

	init(position: Int, team: String, teamShort: String? = nil, played: Int = 0, points: Int = 0, gd: Int = 0) {
		self.position = position
		self.team = team
		self.teamShort = teamShort
		self.played = played
		self.points = points
		self.gd = gd
	}

	private enum CodingKeys: String, CodingKey { case position, team, teamShort, played, points, gd }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		position = try c.decodeIfPresent(Int.self, forKey: .position) ?? 0
		team = try c.decodeIfPresent(String.self, forKey: .team) ?? ""
		teamShort = try c.decodeIfPresent(String.self, forKey: .teamShort)
		played = try c.decodeIfPresent(Int.self, forKey: .played) ?? 0
		points = try c.decodeIfPresent(Int.self, forKey: .points) ?? 0
		gd = try c.decodeIfPresent(Int.self, forKey: .gd) ?? 0
	}
}

struct GolfLeaderboard: Codable, Equatable, Sendable {
	var name: String?
	var status: String?
	var leaderboard: [GolfStandingRow]
	/// The players interests/catalog track (the Norwegians) — shown even when
	/// they are far down the board, which is the whole point of the surface.
	var trackedPlayers: [GolfStandingRow]

	private enum CodingKeys: String, CodingKey { case name, status, leaderboard, trackedPlayers }

	init(name: String? = nil, status: String? = nil, leaderboard: [GolfStandingRow] = [], trackedPlayers: [GolfStandingRow] = []) {
		self.name = name
		self.status = status
		self.leaderboard = leaderboard
		self.trackedPlayers = trackedPlayers
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		name = try c.decodeIfPresent(String.self, forKey: .name)
		status = try c.decodeIfPresent(String.self, forKey: .status)
		leaderboard = try c.decodeIfPresent([GolfStandingRow].self, forKey: .leaderboard) ?? []
		trackedPlayers = try c.decodeIfPresent([GolfStandingRow].self, forKey: .trackedPlayers) ?? []
	}
}

struct GolfStandingRow: Codable, Equatable, Sendable {
	var position: Int?
	var positionDisplay: String?
	var player: String
	var score: String?
	var thru: String?

	init(position: Int? = nil, positionDisplay: String? = nil, player: String, score: String? = nil, thru: String? = nil) {
		self.position = position
		self.positionDisplay = positionDisplay
		self.player = player
		self.score = score
		self.thru = thru
	}

	private enum CodingKeys: String, CodingKey { case position, positionDisplay, player, score, thru }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		position = try c.decodeIfPresent(Int.self, forKey: .position)
		positionDisplay = try c.decodeIfPresent(String.self, forKey: .positionDisplay)
		player = try c.decodeIfPresent(String.self, forKey: .player) ?? ""
		score = try c.decodeIfPresent(String.self, forKey: .score)
		thru = try c.decodeIfPresent(String.self, forKey: .thru)
	}
}

struct F1Standings: Codable, Equatable, Sendable {
	var drivers: [F1DriverStanding]

	private enum CodingKeys: String, CodingKey { case drivers }

	init(drivers: [F1DriverStanding] = []) { self.drivers = drivers }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		drivers = try c.decodeIfPresent([F1DriverStanding].self, forKey: .drivers) ?? []
	}
}

struct F1DriverStanding: Codable, Equatable, Sendable {
	var position: Int
	var driver: String
	var team: String?
	var points: Int

	init(position: Int, driver: String, team: String? = nil, points: Int = 0) {
		self.position = position
		self.driver = driver
		self.team = team
		self.points = points
	}

	private enum CodingKeys: String, CodingKey { case position, driver, team, points }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		position = try c.decodeIfPresent(Int.self, forKey: .position) ?? 0
		driver = try c.decodeIfPresent(String.self, forKey: .driver) ?? ""
		team = try c.decodeIfPresent(String.self, forKey: .team)
		points = try c.decodeIfPresent(Int.self, forKey: .points) ?? 0
	}
}
