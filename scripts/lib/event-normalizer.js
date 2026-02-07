import { normalizeToUTC } from "./helpers.js";
import { applyNorwegianStreaming } from "./norwegian-streaming.js";

export class EventNormalizer {
	static normalize(event, sport) {
		if (!event) return null;
		
		try {
			// Apply Norwegian streaming services
			const eventWithStreaming = applyNorwegianStreaming({
				...event,
				sport: sport,
				league: event.league || event.tournament || event.meta
			});
			
			return {
				id: this.generateId(event, sport),
				title: this.sanitizeString(event.title || "Unknown Event"),
				time: normalizeToUTC(event.time || event.date || new Date()),
				venue: this.sanitizeString(event.venue || "TBD"),
				sport: sport,
				meta: this.sanitizeString(event.meta || event.tournament || ""),
				tournament: this.sanitizeString(event.tournament || event.meta || ""),
				streaming: this.normalizeStreaming(eventWithStreaming.streaming),
				norwegian: Boolean(event.norwegian),
				homeTeam: this.sanitizeString(event.homeTeam),
				awayTeam: this.sanitizeString(event.awayTeam),
				participants: this.normalizeParticipants(event.participants),
				norwegianPlayers: event.norwegianPlayers || null,
				totalPlayers: event.totalPlayers || null,
				isFavorite: Boolean(event.isFavorite),
				additional: this.extractAdditional(event)
			};
		} catch (error) {
			console.error("Error normalizing event:", error, event);
			return null;
		}
	}

	static generateId(event, sport) {
		const title = (event.title || "").toLowerCase().replace(/\s+/g, "-");
		const time = new Date(event.time || event.date || Date.now()).getTime();
		return `${sport}-${title}-${time}`.substring(0, 100);
	}

	static sanitizeString(str) {
		if (!str) return "";
		if (typeof str !== "string") return String(str);
		return str.trim().substring(0, 500);
	}

	static normalizeStreaming(streaming) {
		if (!streaming) return [];
		if (!Array.isArray(streaming)) return [];
		
		return streaming.map(stream => {
			if (typeof stream === "string") {
				return { platform: stream, url: "", type: "unknown" };
			}
			return {
				platform: this.sanitizeString(stream.platform || "Unknown"),
				url: this.sanitizeString(stream.url || ""),
				type: this.sanitizeString(stream.type || "unknown")
			};
		}).filter(s => s.platform);
	}

	static normalizeParticipants(participants) {
		if (!participants) return [];
		if (!Array.isArray(participants)) return [];
		
		return participants
			.map(p => this.sanitizeString(p))
			.filter(p => p.length > 0)
			.slice(0, 50);
	}

	static extractAdditional(event) {
		const additional = {};
		
		const knownFields = [
			"title", "time", "date", "venue", "sport", "meta", "tournament",
			"streaming", "norwegian", "homeTeam", "awayTeam", "participants",
			"norwegianPlayers", "totalPlayers", "isFavorite"
		];
		
		for (const [key, value] of Object.entries(event)) {
			if (!knownFields.includes(key) && value != null) {
				if (typeof value === "object" && !Array.isArray(value)) {
					additional[key] = this.sanitizeObject(value);
				} else if (Array.isArray(value)) {
					additional[key] = value.slice(0, 10);
				} else {
					additional[key] = this.sanitizeString(String(value));
				}
			}
		}
		
		return Object.keys(additional).length > 0 ? additional : undefined;
	}

	static sanitizeObject(obj, maxDepth = 2, currentDepth = 0) {
		if (currentDepth >= maxDepth) return {};
		if (!obj || typeof obj !== "object") return {};
		
		const result = {};
		for (const [key, value] of Object.entries(obj)) {
			if (value == null) continue;
			
			if (typeof value === "object" && !Array.isArray(value)) {
				result[key] = this.sanitizeObject(value, maxDepth, currentDepth + 1);
			} else if (Array.isArray(value)) {
				result[key] = value.slice(0, 5);
			} else {
				result[key] = this.sanitizeString(String(value));
			}
		}
		return result;
	}

	static validateEvent(event) {
		if (!event) return false;
		if (!event.title || event.title === "Unknown Event") return false;
		if (!event.time) return false;

		const eventDate = new Date(event.time);
		if (isNaN(eventDate.getTime())) return false;

		const now = new Date();
		// Allow events that started up to 6 hours ago (ongoing matches/rounds)
		const graceWindow = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		const oneYearFromNow = new Date(now.getTime() + 365 * 86400000);
		if (eventDate < graceWindow || eventDate > oneYearFromNow) {
			console.warn(`Event date out of range: ${event.title} at ${event.time}`);
			return false;
		}

		return true;
	}

	static deduplicate(events) {
		const seen = new Map();
		const unique = [];
		
		for (const event of events) {
			const key = `${event.sport}-${event.title}-${event.time}`;
			if (!seen.has(key)) {
				seen.set(key, true);
				unique.push(event);
			}
		}
		
		return unique;
	}
}