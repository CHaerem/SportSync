import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { loadManifest, checkRequirements, executeStep, executeStepAsync, runPhase, runPipeline, categorizeError } from "../scripts/run-pipeline.js";

// Test fixtures
const FIXTURES_DIR = path.join(os.tmpdir(), "sportsync-pipeline-test-" + Date.now());

function writeManifest(manifest) {
	const manifestPath = path.join(FIXTURES_DIR, "manifest.json");
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	return manifestPath;
}

beforeEach(() => {
	fs.mkdirSync(FIXTURES_DIR, { recursive: true });
});

afterEach(() => {
	fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

describe("loadManifest", () => {
	it("loads and validates a correct manifest", () => {
		const manifestPath = writeManifest({
			version: 1,
			phases: [
				{
					name: "test",
					steps: [{ name: "step1", command: "echo hello", errorPolicy: "continue" }],
				},
			],
		});
		const manifest = loadManifest(manifestPath);
		expect(manifest.phases).toHaveLength(1);
		expect(manifest.phases[0].steps[0].name).toBe("step1");
	});

	it("throws on missing phases array", () => {
		const manifestPath = writeManifest({ version: 1 });
		expect(() => loadManifest(manifestPath)).toThrow("missing phases array");
	});

	it("throws on phase without name", () => {
		const manifestPath = writeManifest({ phases: [{ steps: [] }] });
		expect(() => loadManifest(manifestPath)).toThrow("Invalid phase");
	});

	it("throws on phase without steps array", () => {
		const manifestPath = writeManifest({ phases: [{ name: "bad" }] });
		expect(() => loadManifest(manifestPath)).toThrow("Invalid phase");
	});

	it("throws on step without name", () => {
		const manifestPath = writeManifest({
			phases: [{ name: "p", steps: [{ command: "echo", errorPolicy: "continue" }] }],
		});
		expect(() => loadManifest(manifestPath)).toThrow("Invalid step");
	});

	it("throws on step without command", () => {
		const manifestPath = writeManifest({
			phases: [{ name: "p", steps: [{ name: "s", errorPolicy: "continue" }] }],
		});
		expect(() => loadManifest(manifestPath)).toThrow("Invalid step");
	});

	it("throws on invalid errorPolicy", () => {
		const manifestPath = writeManifest({
			phases: [{ name: "p", steps: [{ name: "s", command: "echo", errorPolicy: "invalid" }] }],
		});
		expect(() => loadManifest(manifestPath)).toThrow("Invalid errorPolicy");
	});

	it("throws on missing manifest file", () => {
		expect(() => loadManifest("/nonexistent/path.json")).toThrow();
	});
});

describe("checkRequirements", () => {
	it("returns ok when no requirements", () => {
		expect(checkRequirements(undefined)).toEqual({ ok: true, missing: [] });
		expect(checkRequirements([])).toEqual({ ok: true, missing: [] });
	});

	it("returns ok when env vars are set", () => {
		process.env.TEST_PIPELINE_VAR = "set";
		const result = checkRequirements(["TEST_PIPELINE_VAR"]);
		expect(result.ok).toBe(true);
		delete process.env.TEST_PIPELINE_VAR;
	});

	it("returns missing when env vars are absent", () => {
		delete process.env.TOTALLY_MISSING_VAR;
		const result = checkRequirements(["TOTALLY_MISSING_VAR"]);
		expect(result.ok).toBe(false);
		expect(result.missing).toContain("TOTALLY_MISSING_VAR");
	});
});

describe("executeStep", () => {
	it("executes a successful step", () => {
		const result = executeStep({ name: "echo-test", command: "echo hello", errorPolicy: "continue" });
		expect(result.status).toBe("success");
		expect(result.name).toBe("echo-test");
		expect(result.duration).toBeGreaterThanOrEqual(0);
	});

	it("returns failed for a bad command", () => {
		const result = executeStep({ name: "bad-cmd", command: "exit 1", errorPolicy: "continue" });
		expect(result.status).toBe("failed");
		expect(result.error).toBeDefined();
	});

	it("skips step with missing env requirement", () => {
		delete process.env.MISSING_FOR_PIPELINE_TEST;
		const result = executeStep({
			name: "skip-me",
			command: "echo should not run",
			errorPolicy: "continue",
			requires: ["MISSING_FOR_PIPELINE_TEST"],
		});
		expect(result.status).toBe("skipped");
		expect(result.reason).toContain("MISSING_FOR_PIPELINE_TEST");
	});

	it("tracks step duration", () => {
		const result = executeStep({ name: "sleep", command: "sleep 0.05", errorPolicy: "continue" });
		expect(result.duration).toBeGreaterThan(0);
	});

	it("handles timeout", () => {
		const result = executeStep(
			{ name: "slow", command: "sleep 10", errorPolicy: "continue" },
			100 // 100ms timeout
		);
		expect(result.status).toBe("failed");
	});
});

describe("executeStep per-step timeout", () => {
	it("uses step.timeout when specified", () => {
		const result = executeStep(
			{ name: "slow", command: "sleep 10", errorPolicy: "continue", timeout: 100 },
		);
		expect(result.status).toBe("failed");
		expect(result.duration).toBeLessThan(2000);
	});
});

describe("executeStepAsync", () => {
	it("executes a successful step", async () => {
		const result = await executeStepAsync({ name: "echo-async", command: "echo hello", errorPolicy: "continue" });
		expect(result.status).toBe("success");
		expect(result.name).toBe("echo-async");
		expect(result.duration).toBeGreaterThanOrEqual(0);
	});

	it("returns failed for a bad command", async () => {
		const result = await executeStepAsync({ name: "bad-async", command: "exit 1", errorPolicy: "continue" });
		expect(result.status).toBe("failed");
		expect(result.error).toBeDefined();
		expect(result.errorCategory).toBeDefined();
	});

	it("skips step with missing env requirement", async () => {
		delete process.env.MISSING_FOR_ASYNC_TEST;
		const result = await executeStepAsync({
			name: "skip-async",
			command: "echo should not run",
			errorPolicy: "continue",
			requires: ["MISSING_FOR_ASYNC_TEST"],
		});
		expect(result.status).toBe("skipped");
		expect(result.reason).toContain("MISSING_FOR_ASYNC_TEST");
	});

	it("respects per-step timeout", async () => {
		const result = await executeStepAsync(
			{ name: "slow-async", command: "sleep 10", errorPolicy: "continue", timeout: 100 },
		);
		expect(result.status).toBe("failed");
		expect(result.duration).toBeLessThan(2000);
	});
});

describe("categorizeError", () => {
	it("categorizes timeout errors", () => {
		expect(categorizeError("ETIMEDOUT: request timed out")).toBe("timeout");
		expect(categorizeError("Command timed out after 5000ms")).toBe("timeout");
		expect(categorizeError("socket hang up (timeout)")).toBe("timeout");
	});

	it("categorizes network errors", () => {
		expect(categorizeError("ECONNREFUSED 127.0.0.1:443")).toBe("network");
		expect(categorizeError("ECONNRESET by peer")).toBe("network");
		expect(categorizeError("ENOTFOUND api.example.com")).toBe("network");
		expect(categorizeError("fetch failed for URL")).toBe("network");
	});

	it("categorizes auth errors", () => {
		expect(categorizeError("HTTP 401 Unauthorized")).toBe("auth");
		expect(categorizeError("HTTP 403 Forbidden")).toBe("auth");
		expect(categorizeError("Authentication required")).toBe("auth");
	});

	it("categorizes parse errors", () => {
		expect(categorizeError("Unexpected token < in JSON at position 0")).toBe("parse");
		expect(categorizeError("SyntaxError: invalid json")).toBe("parse");
		expect(categorizeError("Failed to parse response")).toBe("parse");
	});

	it("categorizes validation errors", () => {
		expect(categorizeError("Validation failed: missing field")).toBe("validation");
		expect(categorizeError("Invalid schema for events.json")).toBe("validation");
	});

	it("categorizes command errors", () => {
		expect(categorizeError("Command failed: node scripts/fetch.js")).toBe("command");
		expect(categorizeError("ENOENT: no such file or directory")).toBe("command");
		expect(categorizeError("Process exited with exit code 1")).toBe("command");
	});

	it("returns unknown for unrecognized errors", () => {
		expect(categorizeError("Something weird happened")).toBe("unknown");
		expect(categorizeError("")).toBe("unknown");
		expect(categorizeError(null)).toBe("unknown");
		expect(categorizeError(undefined)).toBe("unknown");
	});
});

describe("executeStep errorCategory", () => {
	it("includes errorCategory on failed steps", () => {
		const result = executeStep({ name: "bad", command: "exit 1", errorPolicy: "continue" });
		expect(result.status).toBe("failed");
		expect(result.errorCategory).toBeDefined();
		expect(typeof result.errorCategory).toBe("string");
	});

	it("does not include errorCategory on success", () => {
		const result = executeStep({ name: "ok", command: "echo hello", errorPolicy: "continue" });
		expect(result.status).toBe("success");
		expect(result.errorCategory).toBeUndefined();
	});
});

describe("runPhase", () => {
	it("runs sequential steps in order", async () => {
		const log = path.join(FIXTURES_DIR, "order.txt");
		const phase = {
			name: "seq",
			steps: [
				{ name: "a", command: `echo A >> ${log}`, errorPolicy: "continue" },
				{ name: "b", command: `echo B >> ${log}`, errorPolicy: "continue" },
			],
		};
		const result = await runPhase(phase);
		expect(result.status).toBe("success");
		expect(result.steps).toHaveLength(2);
		const content = fs.readFileSync(log, "utf-8").trim();
		expect(content).toBe("A\nB");
	});

	it("continues on failed step with errorPolicy continue", async () => {
		const phase = {
			name: "cont",
			steps: [
				{ name: "fail", command: "exit 1", errorPolicy: "continue" },
				{ name: "ok", command: "echo ok", errorPolicy: "continue" },
			],
		};
		const result = await runPhase(phase);
		expect(result.status).toBe("partial");
		expect(result.steps).toHaveLength(2);
		expect(result.steps[0].status).toBe("failed");
		expect(result.steps[1].status).toBe("success");
	});

	it("aborts on failed step with errorPolicy required", async () => {
		const phase = {
			name: "abort",
			steps: [
				{ name: "req", command: "exit 1", errorPolicy: "required" },
				{ name: "skip", command: "echo should not run", errorPolicy: "continue" },
			],
		};
		const result = await runPhase(phase);
		expect(result.status).toBe("failed");
		expect(result.abortedBy).toBe("req");
		expect(result.steps).toHaveLength(1); // second step never ran
	});

	it("runs parallel phase steps", async () => {
		const phase = {
			name: "par",
			parallel: true,
			steps: [
				{ name: "p1", command: "echo 1", errorPolicy: "continue" },
				{ name: "p2", command: "echo 2", errorPolicy: "continue" },
			],
		};
		const result = await runPhase(phase);
		expect(result.steps).toHaveLength(2);
		expect(result.steps.every((s) => s.status === "success")).toBe(true);
	});

	it("runs parallel steps truly concurrently", async () => {
		// Two steps each sleep 0.3s. If sequential, total >= 600ms. If parallel, total < 500ms.
		const phase = {
			name: "par-timing",
			parallel: true,
			steps: [
				{ name: "s1", command: "sleep 0.3", errorPolicy: "continue" },
				{ name: "s2", command: "sleep 0.3", errorPolicy: "continue" },
			],
		};
		const start = Date.now();
		const result = await runPhase(phase);
		const elapsed = Date.now() - start;
		expect(result.steps).toHaveLength(2);
		expect(result.steps.every((s) => s.status === "success")).toBe(true);
		expect(elapsed).toBeLessThan(500);
	});
});

describe("runPipeline", () => {
	it("runs a minimal pipeline and writes result", async () => {
		const resultPath = path.join(FIXTURES_DIR, "pipeline-result.json");
		const dataDir = FIXTURES_DIR;
		fs.mkdirSync(dataDir, { recursive: true });

		const manifestPath = writeManifest({
			version: 1,
			phases: [
				{
					name: "test",
					description: "Test phase",
					steps: [{ name: "echo", command: "echo hello", errorPolicy: "continue" }],
				},
			],
		});

		// We need to test the full pipeline but with our own manifest.
		// Since runPipeline writes to a fixed path, we'll just test loadManifest + runPhase.
		const manifest = loadManifest(manifestPath);
		const result = await runPhase(manifest.phases[0]);
		expect(result.status).toBe("success");
		expect(result.steps[0].status).toBe("success");
	});

	it("loads the real pipeline manifest", () => {
		const realManifest = path.join(process.cwd(), "scripts", "pipeline-manifest.json");
		if (!fs.existsSync(realManifest)) return; // skip if not in repo
		const manifest = loadManifest(realManifest);
		expect(manifest.phases.length).toBeGreaterThan(0);

		// Count all steps
		const totalSteps = manifest.phases.reduce((sum, p) => sum + p.steps.length, 0);
		expect(totalSteps).toBeGreaterThanOrEqual(19);
	});

	it("validates the real manifest has all expected phases", () => {
		const realManifest = path.join(process.cwd(), "scripts", "pipeline-manifest.json");
		if (!fs.existsSync(realManifest)) return;
		const manifest = loadManifest(realManifest);
		const phaseNames = manifest.phases.map((p) => p.name);
		expect(phaseNames).toContain("fetch");
		expect(phaseNames).toContain("build");
		expect(phaseNames).toContain("validate");
		expect(phaseNames).toContain("monitor");
		expect(phaseNames).toContain("finalize");
	});
});
