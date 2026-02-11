#!/usr/bin/env node
/**
 * Quality Regression Gate
 *
 * Compares current ai-quality.json against the previous commit's version.
 * Detects score drops, event count collapses, and failed batch increases.
 * Appends findings to health-report.json if present.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";

const dataDir = rootDataPath();

export function detectQualityRegression(current, previous) {
	const issues = [];

	if (!current) {
		issues.push({ severity: "warning", code: "quality_missing", message: "Current ai-quality.json is missing" });
		return { issues, hasRegression: false };
	}

	if (!previous) {
		return { issues, hasRegression: false };
	}

	// Enrichment score regression
	const currentEnrichScore = current.enrichment?.score ?? null;
	const prevEnrichScore = previous.enrichment?.score ?? null;
	if (currentEnrichScore !== null && prevEnrichScore !== null) {
		const drop = prevEnrichScore - currentEnrichScore;
		if (drop > 15) {
			issues.push({
				severity: "warning",
				code: "enrichment_regression",
				message: `Enrichment score dropped from ${prevEnrichScore} to ${currentEnrichScore} (-${drop})`,
			});
		}
	}

	// Featured score regression
	const currentFeaturedScore = current.featured?.score ?? null;
	const prevFeaturedScore = previous.featured?.score ?? null;
	if (currentFeaturedScore !== null && prevFeaturedScore !== null) {
		const drop = prevFeaturedScore - currentFeaturedScore;
		if (drop > 20) {
			issues.push({
				severity: "warning",
				code: "featured_regression",
				message: `Featured score dropped from ${prevFeaturedScore} to ${currentFeaturedScore} (-${drop})`,
			});
		}
	}

	// Event count collapse
	const currentEvents = current.enrichment?.totalEvents ?? current.enrichment?.after?.totalEvents ?? null;
	const prevEvents = previous.enrichment?.totalEvents ?? previous.enrichment?.after?.totalEvents ?? null;
	if (currentEvents !== null && prevEvents !== null && prevEvents > 0) {
		const dropPct = (prevEvents - currentEvents) / prevEvents;
		if (dropPct > 0.5) {
			issues.push({
				severity: "critical",
				code: "event_count_collapse",
				message: `Event count dropped from ${prevEvents} to ${currentEvents} (-${Math.round(dropPct * 100)}%)`,
			});
		}
	}

	// Failed batches increase
	const currentFailed = current.enrichment?.failedBatches ?? 0;
	const prevFailed = previous.enrichment?.failedBatches ?? 0;
	if (currentFailed > prevFailed) {
		issues.push({
			severity: "warning",
			code: "failed_batches_increase",
			message: `Failed batches increased from ${prevFailed} to ${currentFailed}`,
		});
	}

	const hasRegression = issues.length > 0;
	return { issues, hasRegression };
}

function getPreviousQuality() {
	try {
		const raw = execSync("git show HEAD:docs/data/ai-quality.json", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

async function main() {
	const current = readJsonIfExists(path.join(dataDir, "ai-quality.json"));
	const previous = getPreviousQuality();

	const result = detectQualityRegression(current, previous);

	console.log(`Quality regression check: ${result.issues.length} issue(s) found`);
	for (const issue of result.issues) {
		console.log(`  [${issue.severity}] ${issue.message}`);
	}

	// Append to health report if it exists
	const healthPath = path.join(dataDir, "health-report.json");
	const healthReport = readJsonIfExists(healthPath);
	if (healthReport) {
		healthReport.issues = [...(healthReport.issues || []), ...result.issues];
		if (result.issues.some((i) => i.severity === "critical")) {
			healthReport.status = "critical";
		} else if (result.issues.length > 0 && healthReport.status === "healthy") {
			healthReport.status = "warning";
		}
		healthReport.qualityRegression = result;
		writeJsonPretty(healthPath, healthReport);
		console.log("Appended findings to health-report.json");
	}

	// Create GitHub issue if regressions in CI
	if (result.hasRegression && process.env.GITHUB_ACTIONS) {
		try {
			const title = `Quality regression: ${result.issues.map((i) => i.code).join(", ")}`;
			const body = JSON.stringify(result.issues, null, 2);
			execSync(`gh issue create --label maintenance --title "${title.slice(0, 200)}" --body '${body.replace(/'/g, "'\\''")}'`, { stdio: "inherit" });
		} catch (err) {
			console.warn("Failed to create GitHub issue:", err.message);
		}
	}
}

if (process.argv[1]?.includes("check-quality-regression")) {
	main().catch((err) => {
		console.error("Quality regression check failed:", err);
		process.exit(1);
	});
}
