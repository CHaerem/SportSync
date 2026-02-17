#!/usr/bin/env node

/**
 * Pipeline runner — reads pipeline-manifest.json and executes all phases.
 * The autopilot can add/remove/reorder steps by editing the manifest (allowed path).
 * Writes docs/data/pipeline-result.json with per-step outcomes.
 */

import { execSync, exec as execCb } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(execCb);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "docs", "data");
const MANIFEST_PATH = path.join(__dirname, "pipeline-manifest.json");
const RESULT_PATH = path.join(DATA_DIR, "pipeline-result.json");

const STEP_TIMEOUT = 5 * 60 * 1000; // 5 minutes per step

/**
 * Categorize an error message for pattern detection by the autopilot.
 * @param {string} message - error message
 * @returns {string} category: network|timeout|validation|auth|parse|command|unknown
 */
export function categorizeError(message) {
	if (!message) return "unknown";
	const m = message.toLowerCase();
	if (m.includes("etimedout") || m.includes("timedout") || m.includes("timed out") || m.includes("timeout")) return "timeout";
	if (m.includes("econnrefused") || m.includes("econnreset") || m.includes("enotfound") || m.includes("fetch failed") || m.includes("network")) return "network";
	if (m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("forbidden") || m.includes("auth")) return "auth";
	if (m.includes("validation") || m.includes("schema")) return "validation";
	if (m.includes("json") || m.includes("parse") || m.includes("unexpected token") || m.includes("syntaxerror")) return "parse";
	if (m.includes("command failed") || m.includes("enoent") || m.includes("not found") || m.includes("exit code")) return "command";
	return "unknown";
}

/**
 * Load and validate the pipeline manifest.
 * @returns {object} parsed manifest
 */
export function loadManifest(manifestPath = MANIFEST_PATH) {
	const raw = fs.readFileSync(manifestPath, "utf-8");
	const manifest = JSON.parse(raw);
	if (!manifest.phases || !Array.isArray(manifest.phases)) {
		throw new Error("Invalid manifest: missing phases array");
	}
	for (const phase of manifest.phases) {
		if (!phase.name || !Array.isArray(phase.steps)) {
			throw new Error(`Invalid phase: ${JSON.stringify(phase)}`);
		}
		for (const step of phase.steps) {
			if (!step.name || !step.command) {
				throw new Error(`Invalid step in phase "${phase.name}": ${JSON.stringify(step)}`);
			}
			if (!["continue", "required"].includes(step.errorPolicy)) {
				throw new Error(`Invalid errorPolicy "${step.errorPolicy}" for step "${step.name}"`);
			}
		}
	}
	return manifest;
}

/**
 * Check if all required env vars for a step are set.
 * @param {string[]} requires - env var names
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkRequirements(requires) {
	if (!requires || requires.length === 0) return { ok: true, missing: [] };
	const missing = requires.filter((v) => !process.env[v]);
	return { ok: missing.length === 0, missing };
}

/**
 * Execute a single pipeline step (synchronous).
 * @param {object} step - step definition from manifest
 * @param {number} timeout - default timeout in ms (step.timeout overrides)
 * @returns {object} result { name, status, duration, error? }
 */
export function executeStep(step, timeout = STEP_TIMEOUT) {
	const start = Date.now();
	const stepTimeout = step.timeout || timeout;

	// Check requirements
	const { ok, missing } = checkRequirements(step.requires);
	if (!ok) {
		return {
			name: step.name,
			status: "skipped",
			duration: 0,
			reason: `missing env: ${missing.join(", ")}`,
		};
	}

	try {
		execSync(step.command, {
			cwd: ROOT,
			timeout: stepTimeout,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});
		return {
			name: step.name,
			status: "success",
			duration: Date.now() - start,
		};
	} catch (err) {
		const errorMsg = err.message?.slice(0, 200) || "unknown error";
		return {
			name: step.name,
			status: "failed",
			duration: Date.now() - start,
			error: errorMsg,
			errorCategory: categorizeError(err.message),
		};
	}
}

/**
 * Execute a single pipeline step (async — for true parallel execution).
 * @param {object} step - step definition from manifest
 * @param {number} timeout - default timeout in ms (step.timeout overrides)
 * @returns {Promise<object>} result { name, status, duration, error? }
 */
export async function executeStepAsync(step, timeout = STEP_TIMEOUT) {
	const start = Date.now();
	const stepTimeout = step.timeout || timeout;

	const { ok, missing } = checkRequirements(step.requires);
	if (!ok) {
		return {
			name: step.name,
			status: "skipped",
			duration: 0,
			reason: `missing env: ${missing.join(", ")}`,
		};
	}

	try {
		await execAsync(step.command, {
			cwd: ROOT,
			timeout: stepTimeout,
			env: { ...process.env },
			maxBuffer: 10 * 1024 * 1024,
		});
		return {
			name: step.name,
			status: "success",
			duration: Date.now() - start,
		};
	} catch (err) {
		const errorMsg = err.message?.slice(0, 200) || "unknown error";
		return {
			name: step.name,
			status: "failed",
			duration: Date.now() - start,
			error: errorMsg,
			errorCategory: categorizeError(err.message),
		};
	}
}

/**
 * Run a phase: either parallel or sequential.
 * @param {object} phase - phase definition from manifest
 * @returns {Promise<{ name, status, steps }>}
 */
export async function runPhase(phase) {
	const results = [];

	if (phase.parallel) {
		const promises = phase.steps.map((step) => executeStepAsync(step));
		const settled = await Promise.allSettled(promises);
		for (const r of settled) {
			results.push(r.status === "fulfilled" ? r.value : { name: "unknown", status: "failed", duration: 0, error: r.reason?.message });
		}
	} else {
		for (const step of phase.steps) {
			const result = executeStep(step);
			results.push(result);

			// Abort phase on required step failure
			if (result.status === "failed" && step.errorPolicy === "required") {
				return { name: phase.name, status: "failed", steps: results, abortedBy: step.name };
			}
		}
	}

	const failed = results.some((r) => r.status === "failed");
	return { name: phase.name, status: failed ? "partial" : "success", steps: results };
}

/**
 * Run the full pipeline.
 * @param {string} manifestPath - path to manifest JSON
 * @returns {Promise<object>} pipeline result
 */
export async function runPipeline(manifestPath = MANIFEST_PATH) {
	const startedAt = new Date().toISOString();
	const startMs = Date.now();

	const manifest = loadManifest(manifestPath);
	const phases = {};
	let aborted = false;
	let gateStatus = "pass";

	for (const phase of manifest.phases) {
		if (aborted) {
			phases[phase.name] = { name: phase.name, status: "skipped", steps: [] };
			continue;
		}

		console.log(`\n=== Phase: ${phase.name} — ${phase.description} ===`);
		const result = await runPhase(phase);
		phases[phase.name] = result;

		// Log step outcomes
		for (const step of result.steps) {
			const icon = step.status === "success" ? "+" : step.status === "skipped" ? "~" : "x";
			console.log(`  [${icon}] ${step.name} (${step.duration}ms)${step.error ? ` — ${step.error.slice(0, 80)}` : ""}${step.reason ? ` — ${step.reason}` : ""}`);
		}

		if (result.abortedBy) {
			console.log(`  !! Phase "${phase.name}" aborted by required step "${result.abortedBy}"`);
			aborted = true;
			gateStatus = "fail";
		}
	}

	// Determine gate from pre-commit-gate step result
	const finalizePhase = phases.finalize;
	if (finalizePhase) {
		const gateStep = finalizePhase.steps.find((s) => s.name === "pre-commit-gate");
		if (gateStep && gateStep.status === "failed") {
			gateStatus = "fail";
		}
	}

	// Count totals
	const allSteps = Object.values(phases).flatMap((p) => p.steps);
	const summary = {
		total: allSteps.length,
		success: allSteps.filter((s) => s.status === "success").length,
		failed: allSteps.filter((s) => s.status === "failed").length,
		skipped: allSteps.filter((s) => s.status === "skipped").length,
	};

	const pipelineResult = {
		startedAt,
		completedAt: new Date().toISOString(),
		duration: Date.now() - startMs,
		gate: gateStatus,
		phases,
		summary,
	};

	// Write result
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(RESULT_PATH, JSON.stringify(pipelineResult, null, 2));
	console.log(`\nPipeline complete: ${summary.success}/${summary.total} steps succeeded, gate=${gateStatus}`);

	return pipelineResult;
}

// CLI entry point
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
	runPipeline().then((result) => {
		if (result.gate === "fail") {
			process.exitCode = 1;
		}
	}).catch((err) => {
		console.error("Pipeline runner error:", err.message);
		process.exitCode = 1;
	});
}
