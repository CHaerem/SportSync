/**
 * Response validators for external API data.
 * Each validator returns { valid: boolean, data: any, warnings: string[] }.
 * Validators preserve resilience: they filter invalid items rather than
 * rejecting the entire response.
 */

function warn(warnings, code, message) {
	warnings.push(`[${code}] ${message}`);
}

export function validateESPNScoreboard(data, sportName = "unknown") {
	const warnings = [];

	if (!data || typeof data !== "object") {
		warn(warnings, "invalid_response", `${sportName}: response is not an object`);
		return { valid: false, events: [], warnings };
	}

	if (!Array.isArray(data.events)) {
		warn(warnings, "missing_events", `${sportName}: response missing 'events' array`);
		return { valid: false, events: [], warnings };
	}

	const validEvents = data.events.filter((event) => {
		if (!event || typeof event !== "object") {
			warn(warnings, "invalid_event", `${sportName}: non-object event filtered out`);
			return false;
		}
		if (!event.date) {
			warn(warnings, "missing_date", `${sportName}: event missing 'date'`);
			return false;
		}
		if (!Array.isArray(event.competitions) || event.competitions.length === 0) {
			warn(warnings, "missing_competitions", `${sportName}: event '${event.name || "unknown"}' has no competitions`);
			return false;
		}
		const comp = event.competitions[0];
		if (!Array.isArray(comp.competitors) || comp.competitors.length === 0) {
			warn(warnings, "missing_competitors", `${sportName}: event '${event.name || "unknown"}' has no competitors`);
			return false;
		}
		return true;
	});

	return { valid: true, events: validEvents, warnings };
}

export function validateESPNStandings(data, standingType = "unknown") {
	const warnings = [];

	if (!data || typeof data !== "object") {
		warn(warnings, "invalid_response", `${standingType}: response is not an object`);
		return { valid: false, entries: [], warnings };
	}

	const group = data.children?.[0];
	if (!group?.standings?.entries) {
		warn(warnings, "missing_entries", `${standingType}: no standings entries found`);
		return { valid: false, entries: [], warnings };
	}

	if (!Array.isArray(group.standings.entries) || group.standings.entries.length === 0) {
		warn(warnings, "empty_entries", `${standingType}: standings entries array is empty`);
		return { valid: true, entries: [], warnings };
	}

	return { valid: true, entries: group.standings.entries, warnings };
}

export function validatePandaScoreResponse(data) {
	const warnings = [];

	if (!Array.isArray(data)) {
		warn(warnings, "invalid_response", "PandaScore: response is not an array");
		return { valid: false, items: [], warnings };
	}

	const validItems = data.filter((item) => {
		if (!item || typeof item !== "object") {
			warn(warnings, "invalid_item", "PandaScore: non-object item filtered out");
			return false;
		}
		return true;
	});

	return { valid: true, items: validItems, warnings };
}

export function validateFetcherOutput(data, sportName = "unknown") {
	const warnings = [];

	if (!data || typeof data !== "object") {
		warn(warnings, "invalid_output", `${sportName}: fetcher output is not an object`);
		return { valid: false, data: null, warnings };
	}

	if (!data.lastUpdated) {
		warn(warnings, "missing_timestamp", `${sportName}: fetcher output missing 'lastUpdated'`);
	}

	if (!Array.isArray(data.tournaments)) {
		warn(warnings, "missing_tournaments", `${sportName}: fetcher output missing 'tournaments' array`);
		return { valid: false, data: { ...data, tournaments: [] }, warnings };
	}

	const validTournaments = data.tournaments.filter((t) => {
		if (!t || typeof t !== "object") {
			warn(warnings, "invalid_tournament", `${sportName}: non-object tournament filtered out`);
			return false;
		}
		if (!t.name) {
			warn(warnings, "missing_name", `${sportName}: tournament missing 'name'`);
			return false;
		}
		if (!Array.isArray(t.events)) {
			warn(warnings, "missing_events", `${sportName}: tournament '${t.name}' missing 'events' array`);
			return false;
		}
		return true;
	});

	return {
		valid: true,
		data: { ...data, tournaments: validTournaments },
		warnings,
	};
}
