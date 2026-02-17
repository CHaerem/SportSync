export const sportsConfig = {
	football: {
		sport: "football",
		enabled: true,
		source: "ESPN API + fotball.no",
		sources: [
			{
				api: "espn",
				type: "scoreboard",
				baseUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer",
				leagues: [
					{ code: "eng.1", name: "Premier League" },
					{ code: "esp.1", name: "La Liga" },
					{ code: "esp.copa_del_rey", name: "Copa del Rey" },
					{ code: "uefa.champions", name: "Champions League" },
					{ code: "nor.1", name: "Eliteserien" },
					{ code: "nor.2", name: "OBOS-ligaen" },
					{ code: "fifa.world", name: "International" }
				]
			},
			{
				api: "fotball.no",
				type: "custom",
				enabled: true
			}
		],
		filters: {
			timeRange: 7,
			maxEvents: 20,
			custom: true
		},
		norwegian: {
			teams: ["FK Lyn Oslo", "Lyn", "Norway", "Norge"],
			filterMode: "focused"
		},
		streaming: {
			norwegian: [
				{ platform: "TV2 Play", url: "https://play.tv2.no", type: "tv2" }
			]
		}
	},

	tennis: {
		sport: "tennis",
		enabled: true,
		source: "ESPN Tennis API",
		sources: [
			{
				api: "espn",
				type: "scoreboard",
				endpoints: [
					{ name: "ATP Tour", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard" },
					{ name: "ATP Events", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/events" },
					{ name: "WTA Tour", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard" },
					{ name: "WTA Events", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/events" }
				]
			}
		],
		filters: {
			timeRange: 7,
			maxEvents: 10,
			custom: true
		},
		norwegian: {
			players: ["Casper Ruud"],
			filterMode: "exclusive"
		}
	},

	golf: {
		sport: "golf",
		enabled: true,
		source: "ESPN API + PGA Tour",
		sources: [
			{
				api: "espn",
				type: "scoreboard",
				tours: [
					{ url: "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard", name: "PGA Tour" },
					{ url: "https://site.api.espn.com/apis/site/v2/sports/golf/eur/scoreboard", name: "DP World Tour" }
				]
			}
		],
		filters: {
			timeRange: 14,
			maxEvents: 6,
			custom: true
		},
		norwegian: {
			players: [
				"Viktor Hovland",
				"Kristoffer Reitan",
				"Kris Ventura",
				"Espen Kofstad",
				"Anders Krogstad",
				"Kristian Krogh Johannessen",
				"Eivind Henriksen",
				"Andreas Halvorsen"
			],
			filterMode: "exclusive"
		}
	},

	f1: {
		sport: "formula1",
		enabled: true,
		source: "ESPN F1 Racing API",
		sources: [
			{
				api: "espn",
				type: "scoreboard",
				url: "https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard"
			}
		],
		filters: {
			timeRange: 30,
			maxEvents: 4
		},
		norwegian: {
			enabled: false
		}
	},

	chess: {
		sport: "chess",
		enabled: true,
		source: "Curated + Lichess",
		sources: [
			{
				api: "curated",
				type: "config",
				configFiles: {
					tournaments: "scripts/config/chess-tournaments.json",
					players: "scripts/config/norwegian-chess-players.json"
				}
			},
			{
				api: "lichess",
				type: "broadcast",
				url: "https://lichess.org/api/broadcast",
				filterProfessional: true
			}
		],
		filters: {
			currentWeek: true,
			custom: true
		},
		norwegian: {
			players: ["Magnus Carlsen", "Johan-Sebastian Christiansen", "Aryan Tari"],
			filterMode: "inclusive"
		},
		streaming: [
			{ platform: "Chess24", url: "https://chess24.com", type: "chess24" },
			{ platform: "Lichess", url: "https://lichess.org", type: "lichess" }
		]
	},

	esports: {
		sport: "esports",
		enabled: true,
		source: "HLTV community API",
		sources: [
			{
				api: "hltv",
				type: "community",
				url: "https://hltv-api.vercel.app/api/matches.json"
			},
			{
				api: "fallback",
				type: "manual",
				enabled: true
			}
		],
		filters: {
			currentWeek: true,
			maxEvents: 10,
			teams: ["100 Thieves", "100T", "Team Liquid", "NAVI", "G2", "Astralis"]
		},
		norwegian: {
			teams: ["100 Thieves", "100T"],
			players: ["rain"],
			filterMode: "inclusive"
		},
		streaming: [
			{ platform: "Twitch", url: "https://twitch.tv/esworldcup", type: "twitch" },
			{ platform: "YouTube", url: "https://youtube.com/@EsportsWorldCup", type: "youtube" }
		]
	}
};

export const globalConfig = {
	cache: {
		enabled: true,
		ttl: 60000,
		staleWhileRevalidate: true
	},
	api: {
		userAgent: "SportSync/2.0",
		timeout: 10000,
		retries: 2,
		retryDelay: 500,
		rateLimit: 150
	},
	output: {
		maxEventsPerSport: 50,
		includeMetadata: true,
		prettyPrint: true
	},
	fallback: {
		useLastGood: true,
		retainDays: 7
	}
};