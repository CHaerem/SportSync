import { describe, it, expect } from "vitest";
import { evaluateGate } from "../scripts/pre-commit-gate.js";

const makeEvents = (n) => Array.from({ length: n }, (_, i) => ({ id: i, sport: "football" }));

describe("evaluateGate()", () => {
	it("passes with enough events and healthy status", () => {
		const result = evaluateGate(makeEvents(10), { status: "healthy" });
		expect(result.pass).toBe(true);
		expect(result.reasons).toHaveLength(0);
	});

	it("passes with warning health status", () => {
		const result = evaluateGate(makeEvents(8), { status: "warning" });
		expect(result.pass).toBe(true);
		expect(result.reasons).toHaveLength(0);
	});

	it("fails when events are below minimum", () => {
		const result = evaluateGate(makeEvents(3), { status: "healthy" });
		expect(result.pass).toBe(false);
		expect(result.reasons).toHaveLength(1);
		expect(result.reasons[0]).toContain("Too few events");
		expect(result.reasons[0]).toContain("3");
	});

	it("fails when health status is critical", () => {
		const result = evaluateGate(makeEvents(10), { status: "critical" });
		expect(result.pass).toBe(false);
		expect(result.reasons).toHaveLength(1);
		expect(result.reasons[0]).toContain("critical");
	});

	it("fails with both low events and critical health", () => {
		const result = evaluateGate(makeEvents(2), { status: "critical" });
		expect(result.pass).toBe(false);
		expect(result.reasons).toHaveLength(2);
	});

	it("handles null events", () => {
		const result = evaluateGate(null, { status: "healthy" });
		expect(result.pass).toBe(false);
		expect(result.reasons[0]).toContain("0");
	});

	it("handles null health report", () => {
		const result = evaluateGate(makeEvents(10), null);
		expect(result.pass).toBe(true);
	});

	it("handles both null inputs", () => {
		const result = evaluateGate(null, null);
		expect(result.pass).toBe(false);
		expect(result.reasons).toHaveLength(1);
		expect(result.reasons[0]).toContain("Too few events");
	});
});
