import { describe, it, expect } from "vitest";
import { checkTriggers } from "../scripts/check-proactive-triggers.js";

describe("checkTriggers", () => {
	const now = new Date("2026-04-03T14:00:00Z");

	it("detects breaking RSS headline", () => {
		const rss = {
			items: [
				{ title: "Champions League final result: Real Madrid wins", id: "new-1" },
				{ title: "Weather forecast for Oslo", id: "old-1" },
			],
		};
		const prevRss = {
			items: [{ title: "Weather forecast for Oslo", id: "old-1" }],
		};

		const result = checkTriggers(rss, prevRss, null, null, null, null, now);
		expect(result.shouldUpgrade).toBe(true);
		expect(result.triggers).toHaveLength(1);
		expect(result.triggers[0].type).toBe("breaking_rss");
	});

	it("ignores non-important new RSS items", () => {
		const rss = {
			items: [
				{ title: "Player signs autograph at event", id: "new-1" },
			],
		};
		const prevRss = { items: [] };

		const result = checkTriggers(rss, prevRss, null, null, null, null, now);
		expect(result.shouldUpgrade).toBe(false);
	});

	it("detects new health warnings", () => {
		const health = {
			issues: [
				{ code: "streaming_broken", severity: "warning", message: "0% match rate" },
				{ code: "old_warning", severity: "info", message: "existing" },
			],
		};
		const prevHealth = {
			issues: [{ code: "old_warning", severity: "info", message: "existing" }],
		};

		const result = checkTriggers(null, null, health, prevHealth, null, null, now);
		expect(result.shouldUpgrade).toBe(true);
		expect(result.triggers[0].type).toBe("health_degradation");
	});

	it("ignores existing warnings", () => {
		const health = {
			issues: [{ code: "old_warning", severity: "warning", message: "old" }],
		};
		const prevHealth = {
			issues: [{ code: "old_warning", severity: "warning", message: "old" }],
		};

		const result = checkTriggers(null, null, health, prevHealth, null, null, now);
		expect(result.shouldUpgrade).toBe(false);
	});

	it("detects stale featured with must-watch events", () => {
		const featured = {
			generatedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(), // 8h old
		};
		const events = [
			{ time: now.toISOString(), importance: 5, title: "Big match" },
		];

		const result = checkTriggers(null, null, null, null, featured, events, now);
		expect(result.shouldUpgrade).toBe(true);
		expect(result.triggers[0].type).toBe("stale_featured");
	});

	it("ignores stale featured without must-watch events", () => {
		const featured = {
			generatedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
		};
		const events = [
			{ time: now.toISOString(), importance: 2, title: "Minor match" },
		];

		const result = checkTriggers(null, null, null, null, featured, events, now);
		expect(result.shouldUpgrade).toBe(false);
	});

	it("returns shouldUpgrade false when no triggers", () => {
		const result = checkTriggers(null, null, null, null, null, null, now);
		expect(result.shouldUpgrade).toBe(false);
		expect(result.triggers).toHaveLength(0);
	});

	it("combines multiple triggers", () => {
		const rss = { items: [{ title: "Breaking: Hovland wins Masters", id: "new" }] };
		const prevRss = { items: [] };
		const health = { issues: [{ code: "new_problem", severity: "warning", message: "x" }] };
		const prevHealth = { issues: [] };

		const result = checkTriggers(rss, prevRss, health, prevHealth, null, null, now);
		expect(result.shouldUpgrade).toBe(true);
		expect(result.triggerCount).toBe(2);
	});
});
