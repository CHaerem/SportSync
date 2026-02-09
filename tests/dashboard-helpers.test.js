import { describe, it, expect } from "vitest";
import {
	escapeHtml,
	formatEventTime,
	getRelativeTime,
	sportDisplayName,
	getAbbreviatedTeamName,
	truncateTitle,
	passesFilter,
	isFavoriteEvent,
} from "../docs/js/dashboard-helpers.js";

describe("escapeHtml()", () => {
	it("escapes HTML special characters", () => {
		expect(escapeHtml('<script>alert("xss")</script>')).toBe(
			"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
		);
	});

	it("escapes ampersands", () => {
		expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
	});

	it("escapes single quotes", () => {
		expect(escapeHtml("it's")).toBe("it&#039;s");
	});

	it("returns empty string for non-string input", () => {
		expect(escapeHtml(null)).toBe("");
		expect(escapeHtml(undefined)).toBe("");
		expect(escapeHtml(42)).toBe("");
	});

	it("returns unchanged string when no special characters", () => {
		expect(escapeHtml("hello world")).toBe("hello world");
	});
});

describe("formatEventTime()", () => {
	it("returns TBD for null/undefined", () => {
		expect(formatEventTime(null)).toBe("TBD");
		expect(formatEventTime(undefined)).toBe("TBD");
		expect(formatEventTime("")).toBe("TBD");
	});

	it("formats a UTC time to Oslo timezone in 24h format", () => {
		// 2025-06-15T14:00:00Z = 16:00 in Europe/Oslo (UTC+2 in summer)
		const result = formatEventTime("2025-06-15T14:00:00Z");
		expect(result).toBe("16:00");
	});

	it("formats a winter time correctly (UTC+1)", () => {
		// 2025-01-15T14:00:00Z = 15:00 in Europe/Oslo (UTC+1 in winter)
		const result = formatEventTime("2025-01-15T14:00:00Z");
		expect(result).toBe("15:00");
	});
});

describe("getRelativeTime()", () => {
	const baseTime = new Date("2025-06-15T12:00:00Z");

	it('returns "Soon" for null input', () => {
		expect(getRelativeTime(null, baseTime)).toBe("Soon");
	});

	it('returns "Started" for past events', () => {
		expect(getRelativeTime("2025-06-15T10:00:00Z", baseTime)).toBe("Started");
	});

	it('returns "Starting now" for events within 5 minutes', () => {
		expect(getRelativeTime("2025-06-15T12:03:00Z", baseTime)).toBe("Starting now");
	});

	it("returns minutes for events under 1 hour away", () => {
		expect(getRelativeTime("2025-06-15T12:30:00Z", baseTime)).toBe("In 30 min");
	});

	it("returns hours for events under 24 hours away", () => {
		expect(getRelativeTime("2025-06-15T18:00:00Z", baseTime)).toBe("In 6 hours");
	});

	it('returns "In 1 hour" for exactly 1 hour', () => {
		expect(getRelativeTime("2025-06-15T13:00:00Z", baseTime)).toBe("In 1 hour");
	});

	it('returns "Tomorrow" for events 24-48 hours away', () => {
		expect(getRelativeTime("2025-06-16T12:00:00Z", baseTime)).toBe("Tomorrow");
	});

	it("returns weekday name for events 2-7 days away", () => {
		// 2025-06-18 is a Wednesday
		const result = getRelativeTime("2025-06-18T12:00:00Z", baseTime);
		expect(result).toBe("Wednesday");
	});

	it('returns "In N days" for events more than 7 days away', () => {
		expect(getRelativeTime("2025-06-25T12:00:00Z", baseTime)).toBe("In 10 days");
	});
});

describe("sportDisplayName()", () => {
	it("maps football correctly", () => {
		expect(sportDisplayName("football")).toBe("⚽ Football");
	});

	it("maps golf correctly", () => {
		expect(sportDisplayName("golf")).toBe("⛳ Golf");
	});

	it("maps tennis correctly", () => {
		expect(sportDisplayName("tennis")).toBe("🎾 Tennis");
	});

	it("maps f1 correctly", () => {
		expect(sportDisplayName("f1")).toBe("🏎️ F1");
	});

	it("maps formula1 correctly", () => {
		expect(sportDisplayName("formula1")).toBe("🏎️ F1");
	});

	it("maps chess correctly", () => {
		expect(sportDisplayName("chess")).toBe("♟️ Chess");
	});

	it("maps esports correctly", () => {
		expect(sportDisplayName("esports")).toBe("🎮 Esports");
	});

	it("returns unknown code as-is", () => {
		expect(sportDisplayName("cricket")).toBe("cricket");
	});
});

describe("getAbbreviatedTeamName()", () => {
	it("returns empty string for null/undefined", () => {
		expect(getAbbreviatedTeamName(null)).toBe("");
		expect(getAbbreviatedTeamName(undefined)).toBe("");
	});

	it("removes FC suffix", () => {
		expect(getAbbreviatedTeamName("Chelsea FC")).toBe("Chelsea");
	});

	it("removes FK suffix", () => {
		expect(getAbbreviatedTeamName("Bodø/Glimt FK")).toBe("Bodø/Glimt");
	});

	it("removes FC prefix", () => {
		expect(getAbbreviatedTeamName("FC Barcelona")).toBe("Barcelona");
	});

	it("replaces United suffix with Utd then shortens if needed", () => {
		// "Manchester Utd" is 14 chars (>12), so it gets shortened to first word
		expect(getAbbreviatedTeamName("Manchester United")).toBe("Manchester");
	});

	it("shortens long names with &", () => {
		expect(getAbbreviatedTeamName("Brighton & Hove Albion")).toBe("Brighton");
	});

	it("shortens long multi-word names", () => {
		expect(getAbbreviatedTeamName("Wolverhampton Wanderers")).toBe("Wolverhampton");
	});

	it("keeps short names unchanged", () => {
		expect(getAbbreviatedTeamName("Arsenal")).toBe("Arsenal");
	});
});

describe("truncateTitle()", () => {
	it("returns short titles unchanged", () => {
		expect(truncateTitle("Hello", 10)).toBe("Hello");
	});

	it("truncates long titles with ellipsis", () => {
		expect(truncateTitle("This is a very long title", 15)).toBe("This is a ve...");
	});

	it("returns exact-length titles unchanged", () => {
		expect(truncateTitle("12345", 5)).toBe("12345");
	});
});

describe("isFavoriteEvent()", () => {
	it("detects Barcelona as favorite football team", () => {
		expect(
			isFavoriteEvent({ sport: "football", title: "Barcelona vs Real Madrid", homeTeam: "Barcelona", awayTeam: "Real Madrid" })
		).toBe(true);
	});

	it("detects Liverpool as favorite football team", () => {
		expect(
			isFavoriteEvent({ sport: "football", title: "Liverpool vs Arsenal", homeTeam: "Liverpool", awayTeam: "Arsenal" })
		).toBe(true);
	});

	it("detects Lyn as favorite football team", () => {
		expect(
			isFavoriteEvent({ sport: "football", title: "Lyn vs Skeid", homeTeam: "Lyn", awayTeam: "Skeid" })
		).toBe(true);
	});

	it("returns false for non-favorite football teams", () => {
		expect(
			isFavoriteEvent({ sport: "football", title: "Arsenal vs Chelsea", homeTeam: "Arsenal", awayTeam: "Chelsea" })
		).toBe(false);
	});

	it("detects 100 Thieves as favorite esports team", () => {
		expect(
			isFavoriteEvent({ sport: "esports", title: "100 Thieves vs Cloud9" })
		).toBe(true);
	});

	it("detects 100T abbreviation", () => {
		expect(
			isFavoriteEvent({ sport: "esports", title: "100T vs Sentinels" })
		).toBe(true);
	});

	it("detects golf events with Norwegian players", () => {
		expect(
			isFavoriteEvent({
				sport: "golf",
				title: "PGA Championship",
				norwegian: true,
				norwegianPlayers: [{ name: "Viktor Hovland" }],
			})
		).toBe(true);
	});

	it("returns false for golf without Norwegian players", () => {
		expect(
			isFavoriteEvent({ sport: "golf", title: "PGA Championship", norwegian: false, norwegianPlayers: [] })
		).toBe(false);
	});

	it("returns false for unrecognized sports", () => {
		expect(isFavoriteEvent({ sport: "tennis", title: "Wimbledon Final" })).toBe(false);
	});
});

describe("passesFilter()", () => {
	const makeEvent = (overrides) => ({
		sport: "football",
		title: "Test Match",
		time: new Date().toISOString(),
		...overrides,
	});

	it('passes all events with "all" filter and no sport selection', () => {
		const event = makeEvent({});
		const result = passesFilter(event, {
			currentFilter: "all",
			selectedSports: new Set(),
			preferences: null,
			isFavoriteEvent: null,
		});
		expect(result).toBe(true);
	});

	it("filters by sport when sports are selected", () => {
		const footballEvent = makeEvent({ sport: "football" });
		const golfEvent = makeEvent({ sport: "golf" });

		const opts = {
			currentFilter: "all",
			selectedSports: new Set(["football"]),
			preferences: null,
			isFavoriteEvent: null,
		};

		expect(passesFilter(footballEvent, opts)).toBe(true);
		expect(passesFilter(golfEvent, opts)).toBe(false);
	});

	it("handles formula1 sport filter mapping for f1 events", () => {
		const f1Event = makeEvent({ sport: "f1" });
		const opts = {
			currentFilter: "all",
			selectedSports: new Set(["formula1"]),
			preferences: null,
			isFavoriteEvent: null,
		};
		expect(passesFilter(f1Event, opts)).toBe(true);
	});

	it("supports multiple selected sports", () => {
		const footballEvent = makeEvent({ sport: "football" });
		const golfEvent = makeEvent({ sport: "golf" });
		const tennisEvent = makeEvent({ sport: "tennis" });

		const opts = {
			currentFilter: "all",
			selectedSports: new Set(["football", "golf"]),
			preferences: null,
			isFavoriteEvent: null,
		};

		expect(passesFilter(footballEvent, opts)).toBe(true);
		expect(passesFilter(golfEvent, opts)).toBe(true);
		expect(passesFilter(tennisEvent, opts)).toBe(false);
	});

	it('filters today events with "today" filter', () => {
		const todayEvent = makeEvent({ time: new Date().toISOString() });
		const tomorrowDate = new Date();
		tomorrowDate.setDate(tomorrowDate.getDate() + 2);
		const futureEvent = makeEvent({ time: tomorrowDate.toISOString() });

		const opts = {
			currentFilter: "today",
			selectedSports: new Set(),
			preferences: null,
			isFavoriteEvent: null,
		};

		expect(passesFilter(todayEvent, opts)).toBe(true);
		expect(passesFilter(futureEvent, opts)).toBe(false);
	});

	it('filters week events with "week" filter', () => {
		const todayEvent = makeEvent({ time: new Date().toISOString() });
		const nextMonthDate = new Date();
		nextMonthDate.setDate(nextMonthDate.getDate() + 30);
		const farFutureEvent = makeEvent({ time: nextMonthDate.toISOString() });

		const opts = {
			currentFilter: "week",
			selectedSports: new Set(),
			preferences: null,
			isFavoriteEvent: null,
		};

		expect(passesFilter(todayEvent, opts)).toBe(true);
		expect(passesFilter(farFutureEvent, opts)).toBe(false);
	});

	it('uses isFavoriteEvent fallback for "favorites" filter', () => {
		const event = makeEvent({ sport: "football", title: "Liverpool vs Arsenal", homeTeam: "Liverpool", awayTeam: "Arsenal" });
		const opts = {
			currentFilter: "favorites",
			selectedSports: new Set(),
			preferences: null,
			isFavoriteEvent,
		};

		expect(passesFilter(event, opts)).toBe(true);
	});
});
