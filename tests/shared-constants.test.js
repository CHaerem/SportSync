import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Set up global environment
globalThis.window = globalThis;

const src = readFileSync(join(import.meta.dirname, "../docs/js/shared-constants.js"), "utf-8");
eval(src);

describe("SS_CONSTANTS", () => {
	it("exports time constants", () => {
		expect(SS_CONSTANTS.MS_PER_MINUTE).toBe(60000);
		expect(SS_CONSTANTS.MS_PER_HOUR).toBe(3600000);
		expect(SS_CONSTANTS.MS_PER_DAY).toBe(86400000);
	});

	it("exports NORWEGIAN_CLUBS", () => {
		expect(SS_CONSTANTS.NORWEGIAN_CLUBS).toContain("lyn");
		expect(SS_CONSTANTS.NORWEGIAN_CLUBS).toContain("bodø/glimt");
		expect(SS_CONSTANTS.NORWEGIAN_CLUBS).toContain("rosenborg");
		expect(SS_CONSTANTS.NORWEGIAN_CLUBS.length).toBeGreaterThanOrEqual(14);
	});

	it("exports UEFA_COMPETITION_CODES", () => {
		expect(SS_CONSTANTS.UEFA_COMPETITION_CODES).toContain("uefa.champions");
		expect(SS_CONSTANTS.UEFA_COMPETITION_CODES).toContain("uefa.europa");
		expect(SS_CONSTANTS.UEFA_COMPETITION_CODES).toContain("uefa.europa.conf");
	});

	it("is frozen (immutable)", () => {
		expect(Object.isFrozen(SS_CONSTANTS)).toBe(true);
	});
});

describe("isEventInWindow", () => {
	it("returns true for event inside window", () => {
		const event = { time: "2026-03-04T15:00:00Z" };
		const start = new Date("2026-03-04T00:00:00Z");
		const end = new Date("2026-03-05T00:00:00Z");
		expect(isEventInWindow(event, start, end)).toBe(true);
	});

	it("returns false for event outside window", () => {
		const event = { time: "2026-03-05T15:00:00Z" };
		const start = new Date("2026-03-04T00:00:00Z");
		const end = new Date("2026-03-05T00:00:00Z");
		expect(isEventInWindow(event, start, end)).toBe(false);
	});

	it("handles multi-day events with endTime", () => {
		const event = {
			time: "2026-03-03T08:00:00Z",
			endTime: "2026-03-06T18:00:00Z",
		};
		const start = new Date("2026-03-05T00:00:00Z");
		const end = new Date("2026-03-06T00:00:00Z");
		// Event started before window but endTime overlaps — should be included
		expect(isEventInWindow(event, start, end)).toBe(true);
	});

	it("returns false when event endTime is before window", () => {
		const event = {
			time: "2026-03-01T08:00:00Z",
			endTime: "2026-03-02T18:00:00Z",
		};
		const start = new Date("2026-03-04T00:00:00Z");
		const end = new Date("2026-03-05T00:00:00Z");
		expect(isEventInWindow(event, start, end)).toBe(false);
	});

	it("returns false for null event time", () => {
		expect(isEventInWindow({}, new Date(), new Date())).toBe(false);
		expect(isEventInWindow({ time: null }, new Date(), new Date())).toBe(false);
	});

	it("returns false for null event", () => {
		expect(isEventInWindow(null, new Date(), new Date())).toBe(false);
	});

	it("accepts numeric timestamps for window bounds", () => {
		const event = { time: "2026-03-04T12:00:00Z" };
		const start = new Date("2026-03-04T00:00:00Z").getTime();
		const end = new Date("2026-03-05T00:00:00Z").getTime();
		expect(isEventInWindow(event, start, end)).toBe(true);
	});

	it("handles event at exact window boundary (start is exclusive of end)", () => {
		const event = { time: "2026-03-05T00:00:00Z" };
		const start = new Date("2026-03-04T00:00:00Z");
		const end = new Date("2026-03-05T00:00:00Z");
		// start < we (true) && end >= ws (true for single-point event at boundary)
		// start = end = Mar 5, ws = Mar 4, we = Mar 5
		// start < we => Mar5 < Mar5 => false
		expect(isEventInWindow(event, start, end)).toBe(false);
	});
});

describe("isNoteworthyNorwegianResult", () => {
	it("returns true for Norwegian club in UEFA Champions League", () => {
		expect(isNoteworthyNorwegianResult({
			homeTeam: "Bodø/Glimt",
			awayTeam: "Barcelona",
			leagueCode: "uefa.champions",
		})).toBe(true);
	});

	it("returns true for Norwegian club as away team in Europa League", () => {
		expect(isNoteworthyNorwegianResult({
			homeTeam: "Ajax",
			awayTeam: "Molde",
			leagueCode: "uefa.europa",
		})).toBe(true);
	});

	it("returns false for Norwegian club in domestic league", () => {
		expect(isNoteworthyNorwegianResult({
			homeTeam: "Rosenborg",
			awayTeam: "Lyn",
			leagueCode: "nor.1",
		})).toBe(false);
	});

	it("returns false for non-Norwegian clubs in UEFA", () => {
		expect(isNoteworthyNorwegianResult({
			homeTeam: "Liverpool",
			awayTeam: "Barcelona",
			leagueCode: "uefa.champions",
		})).toBe(false);
	});

	it("handles missing fields gracefully", () => {
		expect(isNoteworthyNorwegianResult({})).toBe(false);
		expect(isNoteworthyNorwegianResult({ homeTeam: "Lyn" })).toBe(false);
	});
});

describe("escapeHtml", () => {
	it("escapes ampersands", () => {
		expect(escapeHtml("A & B")).toBe("A &amp; B");
	});

	it("escapes angle brackets", () => {
		expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
	});

	it("escapes quotes", () => {
		expect(escapeHtml('"hello\'')).toBe("&quot;hello&#039;");
	});

	it("returns empty string for non-string input", () => {
		expect(escapeHtml(null)).toBe("");
		expect(escapeHtml(undefined)).toBe("");
		expect(escapeHtml(42)).toBe("");
	});

	it("returns empty string for empty input", () => {
		expect(escapeHtml("")).toBe("");
	});

	it("passes through safe strings unchanged", () => {
		expect(escapeHtml("Hello World")).toBe("Hello World");
	});
});

describe("ssShortName", () => {
	it("strips FC suffix", () => {
		expect(ssShortName("Liverpool FC")).toBe("Liverpool");
	});

	it("strips AFC suffix", () => {
		expect(ssShortName("Bournemouth AFC")).toBe("Bournemouth");
	});

	it("strips FC prefix", () => {
		expect(ssShortName("FC Barcelona")).toBe("Barcelona");
	});

	it("strips FK suffix", () => {
		expect(ssShortName("Bodø/Glimt FK")).toBe("Bodø/Glimt");
	});

	it("handles null/empty", () => {
		expect(ssShortName(null)).toBe("");
		expect(ssShortName("")).toBe("");
	});

	it("preserves names without prefixes/suffixes", () => {
		expect(ssShortName("Arsenal")).toBe("Arsenal");
	});
});

describe("ssTeamMatch", () => {
	it("matches exact names", () => {
		expect(ssTeamMatch("Liverpool", "Liverpool")).toBe(true);
	});

	it("matches after normalization (FC stripped)", () => {
		expect(ssTeamMatch("Liverpool FC", "Liverpool")).toBe(true);
	});

	it("matches by substring inclusion", () => {
		expect(ssTeamMatch("Manchester United", "Man United")).toBe(false);
		expect(ssTeamMatch("Manchester United", "Manchester")).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(ssTeamMatch("LIVERPOOL", "liverpool")).toBe(true);
	});

	it("handles reverse inclusion", () => {
		expect(ssTeamMatch("Arsenal", "Arsenal FC")).toBe(true);
	});
});
