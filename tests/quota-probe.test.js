import { describe, it, expect } from "vitest";
import { parseRateLimitHeaders, evaluateQuota, THRESHOLD_5H, THRESHOLD_7D } from "../scripts/lib/quota-probe.js";

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
		const headers = { "content-type": "application/json" };
		expect(parseRateLimitHeaders(headers)).toBeNull();
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

describe("evaluateQuota", () => {
	it("returns unconstrained when both are below threshold", () => {
		const result = evaluateQuota({ fiveHour: 40, sevenDay: 50 });
		expect(result.constrained).toBe(false);
		expect(result.reason).toBe("ok");
	});

	it("constrains when 5h exceeds threshold", () => {
		const result = evaluateQuota({ fiveHour: THRESHOLD_5H + 1, sevenDay: 10 });
		expect(result.constrained).toBe(true);
		expect(result.reason).toContain("5h");
		expect(result.reason).toContain(`${THRESHOLD_5H + 1}%`);
	});

	it("constrains when 7d exceeds threshold", () => {
		const result = evaluateQuota({ fiveHour: 10, sevenDay: THRESHOLD_7D + 1 });
		expect(result.constrained).toBe(true);
		expect(result.reason).toContain("7d");
	});

	it("does not constrain at exactly threshold", () => {
		const result = evaluateQuota({ fiveHour: THRESHOLD_5H, sevenDay: THRESHOLD_7D });
		expect(result.constrained).toBe(false);
	});

	it("returns unconstrained for null quota (permissive fallback)", () => {
		const result = evaluateQuota(null);
		expect(result.constrained).toBe(false);
		expect(result.reason).toContain("permissive");
	});

	it("handles null fiveHour gracefully", () => {
		const result = evaluateQuota({ fiveHour: null, sevenDay: 30 });
		expect(result.constrained).toBe(false);
	});

	it("handles null sevenDay gracefully", () => {
		const result = evaluateQuota({ fiveHour: 30, sevenDay: null });
		expect(result.constrained).toBe(false);
	});

	it("5h check takes priority over 7d when both exceed", () => {
		const result = evaluateQuota({ fiveHour: 95, sevenDay: 95 });
		expect(result.constrained).toBe(true);
		expect(result.reason).toContain("5h");
	});

	it("constrains at 100%", () => {
		const result = evaluateQuota({ fiveHour: 100, sevenDay: 100 });
		expect(result.constrained).toBe(true);
	});

	it("does not constrain at 0%", () => {
		const result = evaluateQuota({ fiveHour: 0, sevenDay: 0 });
		expect(result.constrained).toBe(false);
	});
});

describe("thresholds", () => {
	it("5h threshold is 80%", () => {
		expect(THRESHOLD_5H).toBe(80);
	});

	it("7d threshold is 80%", () => {
		expect(THRESHOLD_7D).toBe(80);
	});
});
