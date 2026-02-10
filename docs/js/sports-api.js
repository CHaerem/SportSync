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
