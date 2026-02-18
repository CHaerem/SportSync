import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";
import { EventFilters } from "../lib/filters.js";
import fs from "fs";
import path from "path";

export class ChessFetcher extends BaseFetcher {
	constructor() {
		super(sportsConfig.chess);
	}

	async fetchFromSource(source) {
		if (source.api === "curated") {
			return await this.fetchCuratedTournaments(source);
		} else if (source.api === "lichess") {
			return await this.fetchLichessBroadcasts(source);
		}
		return [];
	}

	async fetchCuratedTournaments(source) {
		const events = [];
		
		try {
			const tournamentsPath = path.resolve(process.cwd(), source.configFiles.tournaments);
			const playersPath = path.resolve(process.cwd(), source.configFiles.players);
			
			const tournaments = this.loadJsonFile(tournamentsPath, []);
			const players = this.loadJsonFile(playersPath, []);
			
			for (const tournament of tournaments) {
				const participants = players
					.filter(p => tournament.participantsHint?.includes(p.name))
					.map(p => p.name);
				
				for (const round of tournament.rounds || []) {
					const roundLabel = round.round ? `Round ${round.round}` : "Round";
					events.push({
						title: `${roundLabel} – ${tournament.name}`,
						time: round.date,
						venue: tournament.venue || "Chess Arena",
						tournament: tournament.name,
						participants: participants,
						norwegian: participants.length > 0,
						meta: tournament.name
					});
				}
			}
		} catch (error) {
			console.error("Error loading curated chess data:", error.message);
		}
		
		return events;
	}

	async fetchLichessBroadcasts(source) {
		const events = [];

		try {
			// Use /api/broadcast/top which returns structured JSON with active/upcoming
			const data = await this.apiClient.fetchJSON("https://lichess.org/api/broadcast/top");

			if (!data || typeof data !== "object") {
				console.warn("Invalid Lichess broadcast/top response");
				return events;
			}

			const active = Array.isArray(data.active) ? data.active : [];
			const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
			const allBroadcasts = [...active, ...upcoming];
			console.log(`Lichess broadcasts: ${active.length} active, ${upcoming.length} upcoming`);

			for (const entry of allBroadcasts) {
				const tour = entry.tour || {};
				const rounds = entry.rounds || [];
				const round = entry.round || {};
				const info = tour.info || {};

				const norwegianPlayers = this.findNorwegianPlayers(tour);

				if (norwegianPlayers.length === 0) continue;

				// Add upcoming/ongoing rounds
				const allRounds = rounds.length > 0 ? rounds : (round.id ? [round] : []);
				const upcomingRounds = allRounds.filter(r => !r.finished);

				if (upcomingRounds.length > 0) {
					for (const r of upcomingRounds) {
						events.push({
							title: `${r.name || "Round"} – ${tour.name}`,
							time: r.startsAt ? new Date(r.startsAt).toISOString() : new Date().toISOString(),
							venue: info.location || "Online",
							tournament: tour.name,
							participants: norwegianPlayers,
							norwegian: norwegianPlayers.length > 0,
							meta: tour.name,
						});
					}
				} else {
					const startDate = tour.dates && tour.dates[0] ? new Date(tour.dates[0]) : new Date();
					events.push({
						title: tour.name,
						time: startDate.toISOString(),
						venue: info.location || "Online",
						tournament: tour.name,
						participants: norwegianPlayers,
						norwegian: norwegianPlayers.length > 0,
						meta: `Professional Chess - ${tour.name}`,
					});
				}

				console.log(`Chess: ${tour.name} (tier ${tour.tier || "?"}, Norwegian: ${norwegianPlayers.join(", ") || "none"})`);
			}
		} catch (error) {
			console.warn("Failed to fetch Lichess broadcasts:", error.message);
		}

		return events;
	}

	findNorwegianPlayers(tour) {
		const norwegianNames = this.config.norwegian?.players || [];
		// Check name, description, info.players, and round names
		const searchText = [
			tour.name || "",
			tour.description || "",
			tour.info?.players || "",
			...(Array.isArray(tour.rounds) ? tour.rounds.map(r => r.name || "") : []),
		].join(" ").toLowerCase();

		return norwegianNames.filter(player => {
			const playerLower = player.toLowerCase();
			if (searchText.includes(playerLower)) return true;
			// Last name match only for names long enough to avoid false positives
			const lastName = playerLower.split(" ").pop();
			return lastName.length > 5 && searchText.includes(lastName);
		});
	}

	transformToEvents(rawData) {
		const events = [];
		
		for (const item of rawData) {
			const normalized = EventNormalizer.normalize(item, this.config.sport);
			if (normalized && EventNormalizer.validateEvent(normalized)) {
				events.push(normalized);
			}
		}
		
		return EventNormalizer.deduplicate(events);
	}

	applyCustomFilters(events) {
		// Apply current week filter if configured, but give Norwegian-relevant
		// events a wider window (30 days) so upcoming tournaments with Magnus etc.
		// surface before the week they happen
		if (this.config.filters?.currentWeek) {
			const norwegian = events.filter(e => e.norwegian);
			const generic = events.filter(e => !e.norwegian);
			const filteredGeneric = EventFilters.filterCurrentWeek(generic);
			const filteredNorwegian = EventFilters.filterByTimeRange(norwegian, 30);
			events = [...filteredNorwegian, ...filteredGeneric];
		}

		return super.applyCustomFilters(events);
	}

	formatResponse(events) {
		const response = super.formatResponse(events);
		// Empty chess results are intentional (no Norwegian players found),
		// not a fetch failure — don't retain stale data
		if (events.length === 0) response._noRetain = true;
		return response;
	}

	loadJsonFile(filepath, fallback = null) {
		try {
			const content = fs.readFileSync(filepath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
			console.warn(`Failed to load ${filepath}:`, error.message);
			return fallback;
		}
	}
}

export async function fetchChessOpen() {
	const fetcher = new ChessFetcher();
	return await fetcher.fetch();
}