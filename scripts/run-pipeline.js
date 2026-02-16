#!/usr/bin/env node

/**
 * Pipeline runner — reads pipeline-manifest.json and executes all phases.
 * The autopilot can add/remove/reorder steps by editing the manifest (allowed path).
 * Writes docs/data/pipeline-result.json with per-step outcomes.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "docs", "data");
const MANIFEST_PATH = path.join(__dirname, "pipeline-manifest.json");
const RESULT_PATH = path.join(DATA_DIR, "pipeline-result.json");

const STEP_TIMEOUT = 5 * 60 * 1000; // 5 minutes per step

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
 * Execute a single pipeline step.
 * @param {object} step - step definition from manifest
 * @param {number} timeout - timeout in ms
 * @returns {object} result { name, status, duration, error? }
 */
export function executeStep(step, timeout = STEP_TIMEOUT) {
	const start = Date.now();

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
			timeout,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});
		return {
			name: step.name,
			status: "success",
			duration: Date.now() - start,
		};
	} catch (err) {
		return {
			name: step.name,
			status: "failed",
			duration: Date.now() - start,
			error: err.message?.slice(0, 200) || "unknown error",
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
		const promises = phase.steps.map(
			(step) =>
				new Promise((resolve) => {
					resolve(executeStep(step));
				})
		);
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
