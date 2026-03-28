import { describe, it, expect } from "vitest";
import { mergePrimaryAndOpen, hasEvents } from "../scripts/lib/helpers.js";

// Fixtures
function makeData(tournaments = []) {
	return { tournaments };
}

function makeTournament(name, eventCount = 2) {
	return {
		name,
		events: Array.from({ length: eventCount }, (_, i) => ({
			title: `Event ${i + 1}`,
			time: new Date().toISOString(),
		})),
	};
}

function emptyTournament(name) {
	return { name, events: [] };
}

describe("hasEvents()", () => {
	it("returns false for null/undefined", () => {
		expect(hasEvents(null)).toBe(false);
		expect(hasEvents(undefined)).toBe(false);
	});

	it("returns false when tournaments array is missing", () => {
		expect(hasEvents({})).toBe(false);
	});

	it("returns false when all tournaments have empty events", () => {
		const data = makeData([emptyTournament("PL"), emptyTournament("CL")]);
		expect(hasEvents(data)).toBe(false);
	});

	it("returns true when at least one tournament has events", () => {
		const data = makeData([emptyTournament("PL"), makeTournament("CL", 1)]);
		expect(hasEvents(data)).toBe(true);
	});
});

describe("mergePrimaryAndOpen()", () => {
	it("returns open data when primary is null", () => {
		const open = makeData([makeTournament("CS2")]);
		expect(mergePrimaryAndOpen(null, open)).toBe(open);
	});

	it("returns primary when open is null", () => {
		const primary = makeData([makeTournament("PL")]);
		expect(mergePrimaryAndOpen(primary, null)).toBe(primary);
	});

	it("returns open when primary has no events", () => {
		const primary = makeData([emptyTournament("PL")]);
		const open = makeData([makeTournament("PL", 3)]);
		const result = mergePrimaryAndOpen(primary, open);
		expect(result).toBe(open);
	});

	it("returns primary when open has no events", () => {
		const primary = makeData([makeTournament("PL")]);
		const open = makeData([emptyTournament("PL")]);
		const result = mergePrimaryAndOpen(primary, open);
		expect(result).toBe(primary);
	});

	it("merges open tournaments not present in primary", () => {
		const primary = makeData([makeTournament("PL")]);
		const open = makeData([makeTournament("CS2")]);
		const result = mergePrimaryAndOpen(primary, open);
		const names = result.tournaments.map(t => t.name);
		expect(names).toContain("PL");
		expect(names).toContain("CS2");
	});

	it("result contains a single entry for a tournament name shared by primary and open", () => {
		// When primary and open both have a tournament with the same name and both have events,
		// exactly one of them appears in the result (no duplicates).
		const primaryTournament = makeTournament("PL");
		const openTournament = makeTournament("PL");

		const primary = makeData([primaryTournament]);
		const open = makeData([openTournament]);
		const result = mergePrimaryAndOpen(primary, open);

		const plEntries = result.tournaments.filter(t => t.name === "PL");
		expect(plEntries).toHaveLength(1);
	});

	it("open tournament fills in when primary tournament has no events for same name", () => {
		const primary = makeData([emptyTournament("PL"), makeTournament("CL")]);
		const open = makeData([makeTournament("PL", 2)]);
		const result = mergePrimaryAndOpen(primary, open);

		const pl = result.tournaments.find(t => t.name === "PL");
		expect(pl.events).toHaveLength(2);
	});

	it("preserves primary metadata fields in merged result", () => {
		const primary = { ...makeData([makeTournament("PL")]), lastUpdated: "2026-01-01T00:00:00Z", sport: "football" };
		const open = makeData([makeTournament("CS2")]);
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.lastUpdated).toBe("2026-01-01T00:00:00Z");
		expect(result.sport).toBe("football");
	});
});
