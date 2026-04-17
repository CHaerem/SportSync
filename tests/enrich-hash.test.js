import { describe, it, expect } from "vitest";
import { computeEnrichHash } from "../scripts/enrich-events.js";

describe("computeEnrichHash()", () => {
	const baseEvent = {
		sport: "football",
		tournament: "Premier League",
		title: "Arsenal vs Chelsea",
		time: "2026-04-17T15:00:00Z",
		venue: "Emirates Stadium",
		homeTeam: "Arsenal",
		awayTeam: "Chelsea",
		participants: [],
		norwegianPlayers: [],
		status: "scheduled",
	};

	it("returns a 32-char hex string (MD5)", () => {
		const hash = computeEnrichHash(baseEvent);
		expect(hash).toMatch(/^[0-9a-f]{32}$/);
	});

	it("same events produce the same hash (deterministic)", () => {
		const hash1 = computeEnrichHash(baseEvent);
		const hash2 = computeEnrichHash(baseEvent);
		expect(hash1).toBe(hash2);
	});

	it("same events with a copy produce the same hash", () => {
		const copy = { ...baseEvent };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(copy));
	});

	it("different title produces different hash", () => {
		const altered = { ...baseEvent, title: "Liverpool vs Man City" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different sport produces different hash", () => {
		const altered = { ...baseEvent, sport: "tennis" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different tournament produces different hash", () => {
		const altered = { ...baseEvent, tournament: "La Liga" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different time produces different hash", () => {
		const altered = { ...baseEvent, time: "2026-04-18T15:00:00Z" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different venue produces different hash", () => {
		const altered = { ...baseEvent, venue: "Stamford Bridge" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different homeTeam produces different hash", () => {
		const altered = { ...baseEvent, homeTeam: "Liverpool" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different awayTeam produces different hash", () => {
		const altered = { ...baseEvent, awayTeam: "Tottenham" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different status produces different hash", () => {
		const altered = { ...baseEvent, status: "completed" };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different participants produces different hash", () => {
		const altered = { ...baseEvent, participants: ["Player A"] };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	it("different norwegianPlayers produces different hash", () => {
		const altered = { ...baseEvent, norwegianPlayers: ["Martin Odegaard"] };
		expect(computeEnrichHash(baseEvent)).not.toBe(computeEnrichHash(altered));
	});

	// --- Irrelevant field changes should NOT affect hash ---

	it("ignores enrichment metadata (importance)", () => {
		const withMeta = { ...baseEvent, importance: 5 };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withMeta));
	});

	it("ignores enrichment metadata (summary)", () => {
		const withMeta = { ...baseEvent, summary: "A big match" };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withMeta));
	});

	it("ignores enrichment metadata (tags)", () => {
		const withMeta = { ...baseEvent, tags: ["rivalry", "top-4"] };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withMeta));
	});

	it("ignores enrichedAt timestamp", () => {
		const withMeta = { ...baseEvent, enrichedAt: "2026-04-17T16:00:00Z" };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withMeta));
	});

	it("ignores _enrichHash field", () => {
		const withHash = { ...baseEvent, _enrichHash: "abc123" };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withHash));
	});

	it("ignores norwegianRelevance (enrichment output)", () => {
		const withMeta = { ...baseEvent, norwegianRelevance: 4 };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withMeta));
	});

	it("ignores importanceReason (enrichment output)", () => {
		const withMeta = { ...baseEvent, importanceReason: "Big derby" };
		expect(computeEnrichHash(baseEvent)).toBe(computeEnrichHash(withMeta));
	});

	// --- Edge cases ---

	it("handles empty event object", () => {
		const hash = computeEnrichHash({});
		expect(hash).toMatch(/^[0-9a-f]{32}$/);
	});

	it("handles event with only sport field", () => {
		const hash = computeEnrichHash({ sport: "golf" });
		expect(hash).toMatch(/^[0-9a-f]{32}$/);
	});

	it("handles null/undefined participants gracefully", () => {
		const noParticipants = { ...baseEvent, participants: undefined };
		const nullParticipants = { ...baseEvent, participants: null };
		// Both should produce the same hash (both fall back to [])
		expect(computeEnrichHash(noParticipants)).toBe(computeEnrichHash(nullParticipants));
	});

	it("handles null/undefined norwegianPlayers gracefully", () => {
		const noPlayers = { ...baseEvent, norwegianPlayers: undefined };
		const nullPlayers = { ...baseEvent, norwegianPlayers: null };
		expect(computeEnrichHash(noPlayers)).toBe(computeEnrichHash(nullPlayers));
	});

	it("participants are sorted (order-insensitive)", () => {
		const event1 = { ...baseEvent, participants: ["Alice", "Bob"] };
		const event2 = { ...baseEvent, participants: ["Bob", "Alice"] };
		expect(computeEnrichHash(event1)).toBe(computeEnrichHash(event2));
	});

	it("norwegianPlayers are sorted (order-insensitive)", () => {
		const event1 = { ...baseEvent, norwegianPlayers: ["Hovland", "Odegaard"] };
		const event2 = { ...baseEvent, norwegianPlayers: ["Odegaard", "Hovland"] };
		expect(computeEnrichHash(event1)).toBe(computeEnrichHash(event2));
	});

	it("handles participants as objects with name field", () => {
		const withObjects = { ...baseEvent, participants: [{ name: "Alice" }, { name: "Bob" }] };
		const withStrings = { ...baseEvent, participants: ["Alice", "Bob"] };
		expect(computeEnrichHash(withObjects)).toBe(computeEnrichHash(withStrings));
	});

	it("handles norwegianPlayers as objects with name field", () => {
		const withObjects = { ...baseEvent, norwegianPlayers: [{ name: "Hovland" }] };
		const withStrings = { ...baseEvent, norwegianPlayers: ["Hovland"] };
		expect(computeEnrichHash(withObjects)).toBe(computeEnrichHash(withStrings));
	});

	it("two distinct events produce distinct hashes", () => {
		const event1 = { ...baseEvent };
		const event2 = {
			sport: "tennis",
			tournament: "Wimbledon",
			title: "Ruud vs Djokovic",
			time: "2026-06-30T14:00:00Z",
			venue: "Centre Court",
			homeTeam: undefined,
			awayTeam: undefined,
			participants: ["Casper Ruud", "Novak Djokovic"],
			norwegianPlayers: ["Casper Ruud"],
			status: "scheduled",
		};
		expect(computeEnrichHash(event1)).not.toBe(computeEnrichHash(event2));
	});
});
