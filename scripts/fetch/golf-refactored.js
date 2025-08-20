import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";

export class GolfFetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.golf);
	}

	async fetchFromSource(source) {
		if (source.api === "livegolf" && source.requiresKey) {
			return await this.fetchLiveGolfAPI(source);
		}
		return await super.fetchFromSource(source);
	}

	async fetchLiveGolfAPI(source) {
		const apiKey = process.env[source.envKey];
		if (!apiKey) {
			console.log("LiveGolf API key not found, skipping premium data");
			return [];
		}

		try {
			console.log("Fetching golf events from LiveGolf API...");
			const eventsUrl = `${source.baseUrl}/events?api_key=${apiKey}`;
			const events = await this.apiClient.fetchJSON(eventsUrl);

			if (!Array.isArray(events)) {
				throw new Error("Invalid LiveGolf events response");
			}

			const now = new Date();
			const upcomingEvents = events.filter(event => 
				event.status === 'Scheduled' && 
				new Date(event.startDatetime) > now
			).slice(0, 6);

			const processedEvents = [];
			for (const event of upcomingEvents) {
				try {
					const detailUrl = `${source.baseUrl}/events/${event.id}?api_key=${apiKey}`;
					const eventDetail = await this.apiClient.fetchJSON(detailUrl);
					
					const norwegianPlayers = this.findNorwegianPlayers(eventDetail);
					if (norwegianPlayers.length > 0) {
						processedEvents.push({
							title: event.name || "Golf Tournament",
							time: event.startDatetime,
							venue: `${event.course || "TBD"}${event.location ? `, ${event.location}` : ""}`,
							tournament: event.tour?.name || "Golf Tour",
							norwegian: true,
							norwegianPlayers: norwegianPlayers,
							totalPlayers: eventDetail.leaderboard?.length || 0
						});
						console.log(`✅ Added ${event.name} with ${norwegianPlayers.length} Norwegian players`);
					}
				} catch (error) {
					console.warn(`Failed to process LiveGolf event ${event.name}:`, error.message);
				}
			}

			return processedEvents;
		} catch (error) {
			console.error("LiveGolf API error:", error.message);
			return [];
		}
	}

	findNorwegianPlayers(eventDetail) {
		if (!eventDetail.leaderboard || !Array.isArray(eventDetail.leaderboard)) {
			return [];
		}

		const norwegianPlayers = this.config.norwegian?.players || [];
		const found = [];

		for (const player of eventDetail.leaderboard) {
			const playerName = player.player || "";
			const isNorwegian = norwegianPlayers.some(norPlayer => {
				const norLower = norPlayer.toLowerCase();
				const playerLower = playerName.toLowerCase();
				
				// Check various name formats
				if (playerLower.includes(norLower)) return true;
				
				// Check reversed name format
				const [first, ...last] = norPlayer.split(' ');
				const reversed = `${last.join(' ')}, ${first}`.toLowerCase();
				if (playerLower.includes(reversed)) return true;
				
				// Check individual parts
				const parts = norPlayer.toLowerCase().split(' ');
				return parts.every(part => playerLower.includes(part));
			});

			if (isNorwegian) {
				const rounds = player.rounds || [];
				const firstRound = rounds.find(r => r.round === 1) || rounds[0];
				
				found.push({
					name: player.player,
					teeTime: firstRound?.teeTime || null,
					status: player.position ? `T${player.position}` : 'Scheduled'
				});
			}
		}

		return found;
	}

	transformESPNEvent(espnEvent) {
		const event = super.transformESPNEvent(espnEvent);
		if (!event) return null;

		// Check for Norwegian players in ESPN data
		const competitors = espnEvent.competitions?.[0]?.competitors || [];
		const norwegianCompetitors = competitors.filter(comp => {
			const playerName = comp.athlete?.displayName || "";
			return this.config.norwegian?.players?.some(norPlayer => 
				playerName.toLowerCase().includes(norPlayer.toLowerCase().split(' ').pop())
			);
		});

		if (norwegianCompetitors.length > 0) {
			event.norwegian = true;
			event.norwegianPlayers = norwegianCompetitors.map(comp => ({
				name: comp.athlete?.displayName || "Unknown",
				status: comp.status || null
			}));
			event.totalPlayers = competitors.length;
		}

		return event;
	}

	applyCustomFilters(events) {
		// For golf, only show tournaments with Norwegian players
		if (this.config.norwegian?.filterMode === "exclusive") {
			return events.filter(event => event.norwegian);
		}
		return super.applyCustomFilters(events);
	}
}

export async function fetchGolfESPN() {
	const fetcher = new GolfFetcher();
	return await fetcher.fetch();
}