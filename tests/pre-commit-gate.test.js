import { describe, it, expect } from "vitest";
import { evaluateGate, evaluateCommitSafety } from "../scripts/pre-commit-gate.js";

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

describe("evaluateCommitSafety()", () => {
	it("passes when all files are in docs/data/", () => {
		const result = evaluateCommitSafety([
			"docs/data/events.json",
			"docs/data/standings.json",
			"docs/data/health-report.json",
		]);
		expect(result.pass).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("passes when files are in scripts/config/", () => {
		const result = evaluateCommitSafety([
			"scripts/config/chess-tournaments.json",
			"scripts/config/recipes/_registry.json",
		]);
		expect(result.pass).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("passes with mixed allowed paths", () => {
		const result = evaluateCommitSafety([
			"docs/data/featured.json",
			"scripts/config/esports-cs2-2026.json",
			"docs/data/days/2026-02-26.json",
		]);
		expect(result.pass).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("fails when docs/index.html is staged", () => {
		const result = evaluateCommitSafety([
			"docs/data/events.json",
			"docs/index.html",
		]);
		expect(result.pass).toBe(false);
		expect(result.violations).toContain("docs/index.html");
	});

	it("fails when docs/js/dashboard.js is staged", () => {
		const result = evaluateCommitSafety([
			"docs/data/standings.json",
			"docs/js/dashboard.js",
		]);
		expect(result.pass).toBe(false);
		expect(result.violations).toContain("docs/js/dashboard.js");
	});

	it("fails when script files are staged", () => {
		const result = evaluateCommitSafety([
			"docs/data/events.json",
			"scripts/fetch-standings.js",
		]);
		expect(result.pass).toBe(false);
		expect(result.violations).toContain("scripts/fetch-standings.js");
	});

	it("fails when test files are staged", () => {
		const result = evaluateCommitSafety(["tests/pre-commit-gate.test.js"]);
		expect(result.pass).toBe(false);
		expect(result.violations).toContain("tests/pre-commit-gate.test.js");
	});

	it("reports all violations, not just the first", () => {
		const result = evaluateCommitSafety([
			"docs/index.html",
			"docs/js/dashboard.js",
			"docs/js/asset-maps.js",
			"docs/data/events.json",
		]);
		expect(result.pass).toBe(false);
		expect(result.violations).toHaveLength(3);
		expect(result.violations).not.toContain("docs/data/events.json");
	});

	it("passes with empty file list", () => {
		const result = evaluateCommitSafety([]);
		expect(result.pass).toBe(true);
		expect(result.violations).toHaveLength(0);
	});
});
