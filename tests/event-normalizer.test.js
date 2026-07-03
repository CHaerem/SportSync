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
});
