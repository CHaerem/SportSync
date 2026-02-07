import { describe, it, expect } from "vitest";
import { iso, normalizeToUTC, hasEvents, countEvents, mergePrimaryAndOpen } from "../scripts/lib/helpers.js";

describe("iso()", () => {
	it("returns valid ISO string for current time", () => {
		const result = iso();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	it("converts timestamp to ISO string", () => {
		const result = iso(0);
		expect(result).toBe("1970-01-01T00:00:00.000Z");
	});
});

describe("normalizeToUTC()", () => {
	it("returns ISO string for valid date", () => {
		const result = normalizeToUTC("2025-08-20T14:00:00Z");
		expect(result).toBe("2025-08-20T14:00:00.000Z");
	});

	it("handles null/undefined by returning current time", () => {
		const result = normalizeToUTC(null);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("handles invalid date string by returning current time", () => {
		const result = normalizeToUTC("not-a-date");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("hasEvents()", () => {
	it("returns false for null", () => {
		expect(hasEvents(null)).toBe(false);
	});

	it("returns false for empty tournaments", () => {
		expect(hasEvents({ tournaments: [] })).toBe(false);
	});

	it("returns false for tournaments with empty events", () => {
		expect(hasEvents({ tournaments: [{ name: "T1", events: [] }] })).toBe(false);
	});

	it("returns true for tournaments with events", () => {
		expect(
			hasEvents({
				tournaments: [{ name: "T1", events: [{ title: "Match" }] }],
			})
		).toBe(true);
	});
});

describe("countEvents()", () => {
	it("returns 0 for null", () => {
		expect(countEvents(null)).toBe(0);
	});

	it("counts events across tournaments", () => {
		const data = {
			tournaments: [
				{ name: "T1", events: [{ title: "A" }, { title: "B" }] },
				{ name: "T2", events: [{ title: "C" }] },
			],
		};
		expect(countEvents(data)).toBe(3);
	});
});

describe("mergePrimaryAndOpen()", () => {
	it("returns primary when open has no events", () => {
		const primary = { tournaments: [{ name: "T1", events: [{ title: "A" }] }] };
		const open = { tournaments: [] };
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.tournaments).toHaveLength(1);
	});

	it("merges non-overlapping tournaments", () => {
		const primary = { tournaments: [{ name: "PGA", events: [{ title: "A" }] }] };
		const open = { tournaments: [{ name: "DP World", events: [{ title: "B" }] }] };
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.tournaments).toHaveLength(2);
	});

	it("open overrides when tournament names overlap (hasEvents checks tournaments prop)", () => {
		const primary = { tournaments: [{ name: "PGA", events: [{ title: "Primary" }] }] };
		const open = { tournaments: [{ name: "PGA", events: [{ title: "Open" }] }] };
		const result = mergePrimaryAndOpen(primary, open);
		expect(result.tournaments).toHaveLength(1);
		// Note: hasEvents() checks for .tournaments prop, individual tournament objects don't have it
		// so open overrides primary for same-named tournaments
		expect(result.tournaments[0].events[0].title).toBe("Open");
	});
});
