import { describe, it, expect } from "vitest";
import { parseRateLimitHeaders, evaluateQuota, TIERS, minutesUntilReset } from "../scripts/lib/quota-probe.js";

describe("parseRateLimitHeaders", () => {
	it("parses both 5h and 7d utilization (converts ratio to percentage)", () => {
		const headers = {
			"anthropic-ratelimit-unified-5h-utilization": "0.425",
			"anthropic-ratelimit-unified-7d-utilization": "0.153",
			"anthropic-ratelimit-unified-5h-reset": "2026-02-18T15:00:00Z",
			"anthropic-ratelimit-unified-7d-reset": "2026-02-24T00:00:00Z",
		};
		const result = parseRateLimitHeaders(headers);
		expect(result.fiveHour).toBe(42.5);
		expect(result.sevenDay).toBe(15.3);
		expect(result.fiveHourReset).toBe("2026-02-18T15:00:00Z");
		expect(result.sevenDayReset).toBe("2026-02-24T00:00:00Z");
	});

	it("handles only 5h header present", () => {
		const headers = { "anthropic-ratelimit-unified-5h-utilization": "0.60" };
		const result = parseRateLimitHeaders(headers);
		expect(result.fiveHour).toBe(60);
		expect(result.sevenDay).toBeNull();
	});

	it("handles only 7d header present", () => {
		const headers = { "anthropic-ratelimit-unified-7d-utilization": "0.25" };
		const result = parseRateLimitHeaders(headers);
		expect(result.fiveHour).toBeNull();
		expect(result.sevenDay).toBe(25);
	});

	it("returns null when no rate limit headers present", () => {
		expect(parseRateLimitHeaders({ "content-type": "application/json" })).toBeNull();
	});

	it("returns null for null headers", () => {
		expect(parseRateLimitHeaders(null)).toBeNull();
	});

	it("handles zero utilization", () => {
		const headers = {
			"anthropic-ratelimit-unified-5h-utilization": "0",
			"anthropic-ratelimit-unified-7d-utilization": "0",
		};
		const result = parseRateLimitHeaders(headers);
		expect(result.fiveHour).toBe(0);
		expect(result.sevenDay).toBe(0);
	});

	it("handles 100% utilization (ratio = 1.0)", () => {
		const headers = {
			"anthropic-ratelimit-unified-5h-utilization": "1.0",
			"anthropic-ratelimit-unified-7d-utilization": "1.0",
		};
		const result = parseRateLimitHeaders(headers);
		expect(result.fiveHour).toBe(100);
		expect(result.sevenDay).toBe(100);
	});

	it("includes raw header values (original ratios)", () => {
		const headers = {
			"anthropic-ratelimit-unified-5h-utilization": "0.425",
			"anthropic-ratelimit-unified-7d-utilization": "0.153",
		};
		const result = parseRateLimitHeaders(headers);
		expect(result.raw["5h-utilization"]).toBe("0.425");
		expect(result.raw["7d-utilization"]).toBe("0.153");
	});

	it("handles missing reset headers gracefully", () => {
		const headers = { "anthropic-ratelimit-unified-5h-utilization": "0.30" };
		const result = parseRateLimitHeaders(headers);
		expect(result.fiveHourReset).toBeNull();
		expect(result.sevenDayReset).toBeNull();
	});
});

describe("evaluateQuota — tiered response", () => {
	it("returns tier 0 (green) when both utilizations are low", () => {
		const result = evaluateQuota({ fiveHour: 20, sevenDay: 30 });
		expect(result.tier).toBe(0);
		expect(result.tierName).toBe("green");
		expect(result.maxPriority).toBe(3);
		expect(result.model).toBeNull();
		expect(result.constrained).toBe(false);
	});

	it("returns tier 1 (moderate) when utilization exceeds 50%", () => {
		const result = evaluateQuota({ fiveHour: 55, sevenDay: 40 });
		expect(result.tier).toBe(1);
		expect(result.tierName).toBe("moderate");
		expect(result.maxPriority).toBe(2);
		expect(result.model).toBe("claude-sonnet-4-6");
		expect(result.constrained).toBe(true);
	});

	it("returns tier 1 when 7d exceeds 50% (even if 5h is low)", () => {
		const result = evaluateQuota({ fiveHour: 20, sevenDay: 55 });
		expect(result.tier).toBe(1);
		expect(result.tierName).toBe("moderate");
	});

	it("returns tier 2 (high) when utilization exceeds 70%", () => {
		const result = evaluateQuota({ fiveHour: 75, sevenDay: 60 });
		expect(result.tier).toBe(2);
		expect(result.tierName).toBe("high");
		expect(result.maxPriority).toBe(1);
		expect(result.model).toBe("claude-sonnet-4-6");
	});

	it("returns tier 3 (critical) when utilization exceeds 85%", () => {
		const result = evaluateQuota({ fiveHour: 90, sevenDay: 60 });
		expect(result.tier).toBe(3);
		expect(result.tierName).toBe("critical");
		expect(result.maxPriority).toBe(0);
		expect(result.constrained).toBe(true);
	});

	it("returns tier 3 when 7d exceeds 85%", () => {
		const result = evaluateQuota({ fiveHour: 30, sevenDay: 90 });
		expect(result.tier).toBe(3);
		expect(result.tierName).toBe("critical");
	});

	it("returns tier 0 for null quota (permissive fallback)", () => {
		const result = evaluateQuota(null);
		expect(result.tier).toBe(0);
		expect(result.constrained).toBe(false);
		expect(result.reason).toContain("permissive");
	});

	it("uses the HIGHER of 5h and 7d to determine tier", () => {
		// 5h is low (20%) but 7d is high (75%) → tier 2
		const result = evaluateQuota({ fiveHour: 20, sevenDay: 75 });
		expect(result.tier).toBe(2);
	});

	it("handles exactly-at-boundary: 50% is still green", () => {
		const result = evaluateQuota({ fiveHour: 50, sevenDay: 50 });
		expect(result.tier).toBe(0);
		expect(result.tierName).toBe("green");
	});

	it("handles exactly-at-boundary: 70% is moderate", () => {
		const result = evaluateQuota({ fiveHour: 70, sevenDay: 70 });
		expect(result.tier).toBe(1);
		expect(result.tierName).toBe("moderate");
	});

	it("handles exactly-at-boundary: 85% is high", () => {
		const result = evaluateQuota({ fiveHour: 85, sevenDay: 85 });
		expect(result.tier).toBe(2);
		expect(result.tierName).toBe("high");
	});

	it("handles null fiveHour (treats as 0)", () => {
		const result = evaluateQuota({ fiveHour: null, sevenDay: 30 });
		expect(result.tier).toBe(0);
	});

	it("handles null sevenDay (treats as 0)", () => {
		const result = evaluateQuota({ fiveHour: 30, sevenDay: null });
		expect(result.tier).toBe(0);
	});

	it("at 100% both windows, returns critical", () => {
		const result = evaluateQuota({ fiveHour: 100, sevenDay: 100 });
		expect(result.tier).toBe(3);
		expect(result.tierName).toBe("critical");
	});
});

describe("minutesUntilReset", () => {
	it("calculates minutes to a future reset", () => {
		const now = new Date("2026-02-18T12:00:00Z");
		const reset = "2026-02-18T13:00:00Z";
		expect(minutesUntilReset(reset, now)).toBe(60);
	});

	it("returns 0 for a past reset", () => {
		const now = new Date("2026-02-18T14:00:00Z");
		const reset = "2026-02-18T13:00:00Z";
		expect(minutesUntilReset(reset, now)).toBe(0);
	});

	it("returns null for null input", () => {
		expect(minutesUntilReset(null)).toBeNull();
	});

	it("returns null for invalid date", () => {
		expect(minutesUntilReset("not-a-date")).toBeNull();
	});
});

describe("evaluateQuota — reset-time intelligence", () => {
	it("relaxes tier when 5h is driving and resets within 60min", () => {
		const quota = {
			fiveHour: 55, sevenDay: 30,
			fiveHourReset: new Date(Date.now() + 30 * 60000).toISOString(),
			sevenDayReset: new Date(Date.now() + 48 * 3600000).toISOString(),
		};
		const result = evaluateQuota(quota);
		// Without reset intelligence, 55% → tier 1. With 5h resetting in 30min → tier 0.
		expect(result.tier).toBe(0);
		expect(result.tierName).toBe("green");
		expect(result.resetNote).toContain("5h resets in");
	});

	it("does not relax when 7d is the driver", () => {
		const quota = {
			fiveHour: 30, sevenDay: 55,
			fiveHourReset: new Date(Date.now() + 30 * 60000).toISOString(),
			sevenDayReset: new Date(Date.now() + 120 * 3600000).toISOString(),
		};
		const result = evaluateQuota(quota);
		// 7d is driving (55% > 30%) and 7d doesn't reset soon → stays tier 1
		expect(result.tier).toBe(1);
		expect(result.resetNote).toBeNull();
	});

	it("relaxes when 7d is driving and resets within 60min", () => {
		const quota = {
			fiveHour: 30, sevenDay: 55,
			fiveHourReset: new Date(Date.now() + 120 * 60000).toISOString(),
			sevenDayReset: new Date(Date.now() + 45 * 60000).toISOString(),
		};
		const result = evaluateQuota(quota);
		expect(result.tier).toBe(0);
		expect(result.resetNote).toContain("7d resets in");
	});

	it("does not relax when reset is far away", () => {
		const quota = {
			fiveHour: 55, sevenDay: 30,
			fiveHourReset: new Date(Date.now() + 180 * 60000).toISOString(),
			sevenDayReset: new Date(Date.now() + 48 * 3600000).toISOString(),
		};
		const result = evaluateQuota(quota);
		expect(result.tier).toBe(1);
		expect(result.resetNote).toBeNull();
	});

	it("does not relax below tier 0", () => {
		const quota = {
			fiveHour: 20, sevenDay: 20,
			fiveHourReset: new Date(Date.now() + 10 * 60000).toISOString(),
		};
		const result = evaluateQuota(quota);
		expect(result.tier).toBe(0);
	});

	it("relaxes tier 2 to tier 1 when 5h resets soon", () => {
		const quota = {
			fiveHour: 75, sevenDay: 40,
			fiveHourReset: new Date(Date.now() + 20 * 60000).toISOString(),
			sevenDayReset: new Date(Date.now() + 72 * 3600000).toISOString(),
		};
		const result = evaluateQuota(quota);
		// Without reset: 75% → tier 2. With 5h resetting in 20min → tier 1.
		expect(result.tier).toBe(1);
		expect(result.tierName).toBe("moderate");
	});
});

describe("TIERS config", () => {
	it("has 4 tiers", () => {
		expect(TIERS).toHaveLength(4);
	});

	it("tier ceilings are monotonically increasing", () => {
		for (let i = 0; i < TIERS.length - 1; i++) {
			expect(TIERS[i].ceiling5h).toBeLessThan(TIERS[i + 1].ceiling5h);
		}
	});

	it("max priorities are monotonically decreasing", () => {
		for (let i = 0; i < TIERS.length - 1; i++) {
			expect(TIERS[i].maxPriority).toBeGreaterThan(TIERS[i + 1].maxPriority);
		}
	});
});
