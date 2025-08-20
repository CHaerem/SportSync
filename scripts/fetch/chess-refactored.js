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
			const data = await this.apiClient.fetchJSON(source.url);
			
			if (!data?.tours || !Array.isArray(data.tours)) {
				console.warn("Invalid Lichess broadcast response");
				return events;
			}
			
			const proTournaments = data.tours.filter(tour => {
				if (!source.filterProfessional) return true;
				
				const name = (tour.name || "").toLowerCase();
				const desc = (tour.description || "").toLowerCase();
				
				const isElite = [
					'world championship', 'candidates', 'grand prix', 'fide',
					'norway chess', 'tata steel', 'sinquefield', 'grand slam'
				].some(keyword => name.includes(keyword) || desc.includes(keyword));
				
				const isAmateur = [
					'bullet', 'blitz arena', 'rapid arena', 'titled tuesday',
					'hourly', 'daily arena', 'amateur'
				].some(keyword => name.includes(keyword) || desc.includes(keyword));
				
				return isElite && !isAmateur;
			});
			
			for (const tour of proTournaments) {
				const norwegianPlayers = this.findNorwegianPlayers(tour);
				
				if (norwegianPlayers.length > 0) {
					events.push({
						title: tour.name,
						time: new Date().toISOString(),
						venue: "Online/Live",
						tournament: tour.name,
						participants: norwegianPlayers,
						norwegian: true,
						meta: `Professional Chess - ${tour.name}`
					});
				}
			}
		} catch (error) {
			console.warn("Failed to fetch Lichess broadcasts:", error.message);
		}
		
		return events;
	}

	findNorwegianPlayers(tour) {
		const norwegianNames = this.config.norwegian?.players || [];
		const tourText = JSON.stringify(tour).toLowerCase();
		
		return norwegianNames.filter(player => {
			const playerLower = player.toLowerCase();
			return tourText.includes(playerLower) || 
				   playerLower.split(' ').every(part => tourText.includes(part));
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
		// Apply current week filter if configured
		if (this.config.filters?.currentWeek) {
			events = EventFilters.filterCurrentWeek(events);
		}
		
		return super.applyCustomFilters(events);
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