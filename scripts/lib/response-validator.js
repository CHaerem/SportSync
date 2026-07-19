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
