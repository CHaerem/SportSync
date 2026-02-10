// Sports API integration for fetching live data with tournament support
class SportsAPI {
	constructor() {}

	// Football API - multiple leagues support
	async fetchFootballEvents() {
		try {
			const response = await fetch(
				"/SportSync/data/football.json?t=" + Date.now()
			);

			if (response.ok) {
				const data = await response.json();
				return this.formatTournamentData(data.tournaments || []);
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error("Error loading football data:", error);
			return [];
		}
	}

	// Golf events - multiple tours support
	async fetchGolfEvents() {
		try {
			const response = await fetch("/SportSync/data/golf.json?t=" + Date.now());

			if (response.ok) {
				const data = await response.json();
				return this.formatTournamentData(data.tournaments || []);
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error("Error loading golf data:", error);
			return []; // Return empty array
		}
	}

	// Tennis events - multiple tour support
	async fetchTennisEvents() {
		try {
			const response = await fetch(
				"/SportSync/data/tennis.json?t=" + Date.now()
			);

			if (response.ok) {
				const data = await response.json();
				return this.formatTournamentData(data.tournaments || []);
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error("Error loading tennis data:", error);
			return []; // Return empty array
		}
	}

	// Formula 1 events - sessions breakdown
	async fetchF1Events() {
		try {
			const response = await fetch("/SportSync/data/f1.json?t=" + Date.now());

			if (response.ok) {
				const data = await response.json();
				return this.formatTournamentData(data.tournaments || []);
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error("Error loading F1 data:", error);
			return []; // Return empty array
		}
	}

	// Chess events - tournament categories
	async fetchChessEvents() {
		try {
			const response = await fetch(
				"/SportSync/data/chess.json?t=" + Date.now()
			);

			if (response.ok) {
				const data = await response.json();
				return this.formatTournamentData(data.tournaments || []);
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error("Error loading chess data:", error);
			return []; // Return empty array
		}
	}

	// Esports events - game categories
	async fetchEsportsEvents() {
		try {
			const response = await fetch(
				"/SportSync/data/esports.json?t=" + Date.now()
			);

			if (response.ok) {
				const data = await response.json();
				return this.formatTournamentData(data.tournaments || []);
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error("Error loading esports data:", error);
			return []; // Return empty array
		}
	}

	// Format helpers
	formatTournamentData(tournaments) {
		return tournaments.map((tournament) => ({
			tournament: tournament.name,
			events: tournament.events.map((event) => ({
				title: event.title,
				meta: event.meta,
				time: event.time, // Keep original timestamp for calendar view
				timeFormatted: this.formatDateTime(event.time), // Add formatted version for display
				venue: event.venue,
				sport: event.sport || "unknown",
				streaming: event.streaming || [],
				norwegian: event.norwegian || false,
				homeTeam: event.homeTeam,
				awayTeam: event.awayTeam,
				// Preserve golf-specific fields
				norwegianPlayers: event.norwegianPlayers || [],
				totalPlayers: event.totalPlayers || null,
				link: event.link || null,
				status: event.status || null,
				featuredGroups: event.featuredGroups || [],
				// Preserve other sport-specific fields
				participants: event.participants || [],
			})),
		}));
	}

	formatDateTime(date, time) {
		if (!date) return "TBD";

		const eventDate = new Date(date);
		const now = new Date();

		// Get the calendar dates (ignoring time) for comparison
		const eventDay = new Date(
			eventDate.getFullYear(),
			eventDate.getMonth(),
			eventDate.getDate()
		);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrow = new Date(today);
		tomorrow.setDate(today.getDate() + 1);

		// Compare calendar dates, not time differences
		if (eventDay.getTime() === today.getTime()) return "Today";
		if (eventDay.getTime() === tomorrow.getTime()) return "Tomorrow";

		// For events more than tomorrow, calculate days difference
		const timeDiff = eventDay - today;
		const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));

		if (daysDiff > 0 && daysDiff <= 7) return `${daysDiff} days`;

		return eventDate.toLocaleDateString("en-NO", {
			month: "short",
			day: "numeric",
			hour: time ? "2-digit" : undefined,
			minute: time ? "2-digit" : undefined,
		});
	}

	// Get events for calendar view
	async getAllEventsForWeek() {
		try {
			const allSports = await Promise.all([
				this.fetchFootballEvents(),
				this.fetchGolfEvents(),
				this.fetchTennisEvents(),
				this.fetchF1Events(),
				this.fetchChessEvents(),
				this.fetchEsportsEvents(),
			]);

			const events = [];
			const sportNames = [
				"football",
				"golf",
				"tennis",
				"formula1",
				"chess",
				"esports",
			];

			allSports.forEach((sportData, sportIndex) => {
				const sportName = sportNames[sportIndex];
				sportData.forEach((tournament) => {
					tournament.events.forEach((event) => {
						events.push({
							...event,
							sport: sportName,
							tournament: tournament.tournament,
						});
					});
				});
			});

			return this.groupEventsByDay(events);
		} catch (error) {
			console.error("Error getting weekly events:", error);
			return this.getMockWeeklyEvents();
		}
	}

	groupEventsByDay(events) {
		const days = {};
		const now = new Date();

		// Initialize 7 days starting from today
		for (let i = 0; i < 7; i++) {
			const date = new Date(now);
			date.setDate(now.getDate() + i);
			const dateKey = date.toISOString().split("T")[0];
			days[dateKey] = {
				date: date,
				events: [],
			};
		}

		events.forEach((event) => {
			if (event.time && event.time !== "TBD") {
				const eventDate = new Date(event.time);
				const dateKey = eventDate.toISOString().split("T")[0];

				if (days[dateKey]) {
					days[dateKey].events.push({
						...event,
						timeFormatted: eventDate.toLocaleTimeString("en-NO", {
							hour: "2-digit",
							minute: "2-digit",
							timeZone: "Europe/Oslo",
						}),
					});
				}
			}
		});

		return days;
	}

	// Mock data with tournament structure and streaming info
	getMockFootballTournaments() {
		return [
			{
				tournament: "Premier League",
				events: [
					{
						title: "Arsenal vs Manchester City",
						meta: "Premier League",
						time: new Date(Date.now() + 86400000).toISOString(),
						venue: "Emirates Stadium",
						sport: "football",
						streaming: [
							{
								platform: "Viaplay",
								url: "https://viaplay.no",
								type: "viaplay",
							},
							{ platform: "Sky Sports", url: null, type: "sky" },
						],
						norwegian: false,
					},
					{
						title: "Liverpool vs Chelsea",
						meta: "Premier League",
						time: new Date(Date.now() + 172800000).toISOString(),
						venue: "Anfield",
						sport: "football",
						streaming: [
							{
								platform: "Viaplay",
								url: "https://viaplay.no",
								type: "viaplay",
							},
							{ platform: "NBC Sports", url: null, type: "nbc" },
						],
						norwegian: false,
					},
				],
			},
			{
				tournament: "Eliteserien",
				events: [
					{
						title: "Brann vs Rosenborg",
						meta: "Eliteserien",
						time: new Date(Date.now() + 259200000).toISOString(),
						venue: "Brann Stadion",
						sport: "football",
						streaming: [
							{ platform: "TV2 Play", url: "https://play.tv2.no", type: "tv2" },
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
						],
						norwegian: true,
					},
				],
			},
			{
				tournament: "La Liga",
				events: [
					{
						title: "Real Madrid vs Barcelona",
						meta: "La Liga",
						time: new Date(Date.now() + 345600000).toISOString(),
						venue: "Santiago Bernabéu",
						sport: "football",
						streaming: [
							{
								platform: "Viaplay",
								url: "https://viaplay.no",
								type: "viaplay",
							},
							{ platform: "ESPN+", url: null, type: "espn" },
						],
						norwegian: false,
					},
				],
			},
		];
	}

	getMockGolfTournaments() {
		return [
			{
				tournament: "PGA Tour",
				events: [
					{
						title: "The Players Championship",
						meta: "PGA Tour",
						time: new Date(Date.now() + 172800000).toISOString(),
						venue: "TPC Sawgrass",
						sport: "golf",
						streaming: [
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
							{ platform: "Golf Channel", url: null, type: "golf" },
						],
						norwegian: false,
					},
					{
						title: "Arnold Palmer Invitational",
						meta: "PGA Tour",
						time: new Date(Date.now() + 604800000).toISOString(),
						venue: "Bay Hill Club",
						sport: "golf",
						streaming: [
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
							{ platform: "NBC Sports", url: null, type: "nbc" },
						],
						norwegian: false,
					},
				],
			},
			{
				tournament: "DP World Tour",
				events: [
					{
						title: "Dubai Desert Classic",
						meta: "DP World Tour",
						time: new Date(Date.now() + 432000000).toISOString(),
						venue: "Emirates Golf Club",
						sport: "golf",
						streaming: [
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
							{ platform: "Sky Sports", url: null, type: "sky" },
						],
						norwegian: false,
					},
				],
			},
		];
	}

	getMockTennisTournaments() {
		return [
			{
				tournament: "ATP Masters 1000",
				events: [
					{
						title: "Casper Ruud vs Novak Djokovic",
						meta: "ATP Masters 1000",
						time: new Date(Date.now() + 86400000).toISOString(),
						venue: "Indian Wells",
						sport: "tennis",
						streaming: [
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
							{ platform: "Tennis Channel", url: null, type: "tennis" },
						],
						norwegian: true,
					},
					{
						title: "Carlos Alcaraz vs Daniil Medvedev",
						meta: "ATP Masters 1000",
						time: new Date(Date.now() + 172800000).toISOString(),
						venue: "Indian Wells",
						sport: "tennis",
						streaming: [
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
							{ platform: "ESPN", url: null, type: "espn" },
						],
						norwegian: false,
					},
				],
			},
			{
				tournament: "WTA 1000",
				events: [
					{
						title: "Iga Swiatek vs Aryna Sabalenka",
						meta: "WTA 1000",
						time: new Date(Date.now() + 259200000).toISOString(),
						venue: "Indian Wells",
						sport: "tennis",
						streaming: [
							{
								platform: "Discovery+",
								url: "https://discoveryplus.no",
								type: "discovery",
							},
							{ platform: "WTA TV", url: null, type: "wta" },
						],
						norwegian: false,
					},
				],
			},
		];
	}

	getMockF1Tournaments() {
		return [
			{
				tournament: "Formula 1 2025",
				events: [
					{
						title: "Bahrain Grand Prix",
						meta: "Formula 1 2025",
						time: new Date(Date.now() + 604800000).toISOString(),
						venue: "Bahrain International Circuit",
						sport: "formula1",
						streaming: [
							{
								platform: "Viaplay",
								url: "https://viaplay.no",
								type: "viaplay",
							},
							{
								platform: "F1 TV",
								url: "https://f1tv.formula1.com",
								type: "f1tv",
							},
						],
						norwegian: false,
					},
					{
						title: "Saudi Arabian Grand Prix",
						meta: "Formula 1 2025",
						time: new Date(Date.now() + 1209600000).toISOString(),
						venue: "Jeddah Corniche Circuit",
						sport: "formula1",
						streaming: [
							{
								platform: "Viaplay",
								url: "https://viaplay.no",
								type: "viaplay",
							},
							{ platform: "Sky Sports F1", url: null, type: "sky" },
						],
						norwegian: false,
					},
				],
			},
		];
	}

	getMockChessTournaments() {
		return [
			{
				tournament: "FIDE Grand Prix",
				events: [
					{
						title: "Magnus Carlsen vs Hikaru Nakamura",
						meta: "FIDE Grand Prix",
						time: new Date(Date.now() + 86400000).toISOString(),
						venue: "Chess.com",
						sport: "chess",
						streaming: [
							{
								platform: "Chess.com",
								url: "https://chess.com/tv",
								type: "chess",
							},
							{
								platform: "Twitch",
								url: "https://twitch.tv/chess",
								type: "twitch",
							},
						],
						norwegian: true,
					},
				],
			},
			{
				tournament: "Norway Chess",
				events: [
					{
						title: "Norway Chess 2025",
						meta: "Super Tournament",
						time: new Date(Date.now() + 7776000000).toISOString(),
						venue: "Stavanger",
						sport: "chess",
						streaming: [
							{ platform: "NRK", url: "https://nrk.no", type: "nrk" },
							{
								platform: "Chess24",
								url: "https://chess24.com",
								type: "chess24",
							},
						],
						norwegian: true,
					},
				],
			},
		];
	}

	getMockEsportsTournaments() {
		return [
			{
				tournament: "CS2 Major",
				events: [
					{
						title: "100 Thieves vs G2 Esports",
						meta: "CS2 Major",
						time: new Date(Date.now() + 86400000).toISOString(),
						venue: "Copenhagen Arena",
						sport: "esports",
						streaming: [
							{
								platform: "Twitch",
								url: "https://twitch.tv/esl_csgo",
								type: "twitch",
							},
							{
								platform: "YouTube",
								url: "https://youtube.com/@ESL",
								type: "youtube",
							},
						],
						norwegian: false,
					},
				],
			},
			{
				tournament: "LoL Worlds",
				events: [
					{
						title: "League of Legends World Championship",
						meta: "LoL Worlds 2025",
						time: new Date(Date.now() + 15552000000).toISOString(),
						venue: "London, UK",
						sport: "esports",
						streaming: [
							{
								platform: "Twitch",
								url: "https://twitch.tv/riotgames",
								type: "twitch",
							},
							{
								platform: "YouTube",
								url: "https://youtube.com/@lolesports",
								type: "youtube",
							},
						],
						norwegian: false,
					},
				],
			},
			{
				tournament: "Valorant Champions",
				events: [
					{
						title: "Valorant Champions 2025",
						meta: "VCT Champions",
						time: new Date(Date.now() + 12960000000).toISOString(),
						venue: "Los Angeles",
						sport: "esports",
						streaming: [
							{
								platform: "Twitch",
								url: "https://twitch.tv/valorant",
								type: "twitch",
							},
							{
								platform: "YouTube",
								url: "https://youtube.com/@valorantesports",
								type: "youtube",
							},
						],
						norwegian: false,
					},
				],
			},
		];
	}

	getMockWeeklyEvents() {
		const events = {};
		const now = new Date();

		for (let i = 0; i < 7; i++) {
			const date = new Date(now);
			date.setDate(now.getDate() + i);
			const dateKey = date.toISOString().split("T")[0];

			events[dateKey] = {
				date: date,
				events:
					i < 3
						? [
								{
									title: "Sample Event",
									sport: "football",
									tournament: "Premier League",
									timeFormatted: "15:00",
								},
						  ]
						: [],
			};
		}

		return events;
	}
}
