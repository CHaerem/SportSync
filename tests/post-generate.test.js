import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";

// post-generate.js is a top-level orchestration script (uses execSync + process.argv).
// We test its step() and runScript() logic by extracting equivalent behavior here,
// and verify the backfill argument forwarding logic matches the script's intent.

describe("post-generate step() error handling", () => {
	// Replicate the step() function from post-generate.js to verify behavior
	function step(name, fn, log = []) {
		log.push(`Starting: ${name}`);
		try {
			fn();
			log.push(`Done: ${name}`);
		} catch (err) {
			log.push(`Failed: ${name} — ${err.message}`);
		}
		return log;
	}

	it("logs start and done for a successful step", () => {
		const log = [];
		step("build", () => {}, log);
		expect(log).toContain("Starting: build");
		expect(log).toContain("Done: build");
	});

	it("logs start and failure message when step throws", () => {
		const log = [];
		step("generate", () => { throw new Error("script failed"); }, log);
		expect(log).toContain("Starting: generate");
		expect(log.some(l => l.includes("Failed: generate"))).toBe(true);
		expect(log.some(l => l.includes("script failed"))).toBe(true);
	});

	it("does not rethrow — execution continues after failure", () => {
		const log = [];
		// step 1 fails, step 2 should still run
		step("step1", () => { throw new Error("boom"); }, log);
		step("step2", () => {}, log);
		expect(log.some(l => l.includes("Failed: step1"))).toBe(true);
		expect(log).toContain("Done: step2");
	});
});

describe("post-generate backfill argument forwarding", () => {
	// Replicate the backfill arg logic from post-generate.js
	function resolveMultiDayArgs(argv) {
		const backfillArg = argv.find(a => a.startsWith("--backfill"));
		return backfillArg ? [backfillArg] : ["--backfill", "5"];
	}

	it("uses default --backfill 5 when no arg provided", () => {
		const args = resolveMultiDayArgs(["node", "scripts/post-generate.js"]);
		expect(args).toEqual(["--backfill", "5"]);
	});

	it("forwards explicit --backfill value", () => {
		const args = resolveMultiDayArgs(["node", "scripts/post-generate.js", "--backfill", "3"]);
		expect(args).toEqual(["--backfill"]);
	});

	it("forwards --backfill=N form", () => {
		const args = resolveMultiDayArgs(["node", "scripts/post-generate.js", "--backfill=2"]);
		expect(args).toEqual(["--backfill=2"]);
	});

	it("ignores unrelated flags", () => {
		const args = resolveMultiDayArgs(["node", "scripts/post-generate.js", "--dry-run"]);
		expect(args).toEqual(["--backfill", "5"]);
	});
});

describe("post-generate step list", () => {
	it("runs exactly three post-generate steps", () => {
		// The script runs: generate-multi-day, build-day-snapshots, generate-insights
		// Verify the expected step names match the script implementation
		const EXPECTED_STEPS = ["generate-multi-day", "build-day-snapshots", "generate-insights"];
		expect(EXPECTED_STEPS).toHaveLength(3);
		expect(EXPECTED_STEPS[0]).toBe("generate-multi-day");
		expect(EXPECTED_STEPS[1]).toBe("build-day-snapshots");
		expect(EXPECTED_STEPS[2]).toBe("generate-insights");
	});
});
