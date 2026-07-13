// lib/event-normalizer.js: normalization shape guarantees for fetcher output.
import { describe, it, expect } from "vitest";
import { EventNormalizer } from "../scripts/lib/event-normalizer.js";

describe("EventNormalizer", () => {
	it("normalizes a minimal event with required fields", () => {
		const event = EventNormalizer.normalize(
			{ title: "Liverpool vs Arsenal", time: "2026-08-15T14:00:00Z" },
			"football"
		);
		expect(event).not.toBeNull();
		expect(event.title).toBe("Liverpool vs Arsenal");
		expect(event.sport).toBe("football");
		expect(Number.isNaN(Date.parse(event.time))).toBe(false);
	});

	it("returns null for null input", () => {
		expect(EventNormalizer.normalize(null, "football")).toBeNull();
	});

	it("passes through streaming info untouched", () => {
		const event = EventNormalizer.normalize(
			{ title: "x", time: "2026-08-15T14:00:00Z", streaming: [{ platform: "NRK" }] },
			"biathlon"
		);
		expect(event.streaming).toHaveLength(1);
		expect(event.streaming[0].platform).toBe("NRK");
	});

	// WP-04: the chess curated/Lichess fetch paths set participants as bare name
	// strings and never set norwegianPlayers — this used to come out here as
	// `norwegianPlayers: null` (never valid) with un-objectified participants.
	it("normalizes participants to canonical {name} objects and a missing norwegianPlayers to []", () => {
		const event = EventNormalizer.normalize(
			{ title: "Round 1", time: "2026-08-15T14:00:00Z", participants: ["Johan-Sebastian Christiansen"] },
			"chess"
		);
		expect(event.participants).toEqual([{ name: "Johan-Sebastian Christiansen" }]);
		expect(event.norwegianPlayers).toEqual([]);
	});

	it("normalizes a null norwegianPlayers field to []", () => {
		const event = EventNormalizer.normalize(
			{ title: "x", time: "2026-08-15T14:00:00Z", norwegianPlayers: null },
			"chess"
		);
		expect(event.norwegianPlayers).toEqual([]);
	});
});
