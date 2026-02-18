#!/usr/bin/env node
/**
 * UX Evaluation — Loop 13
 *
 * Two-tier dashboard UX evaluation:
 *   Tier 1 (default): Deterministic DOM heuristics via Playwright
 *   Tier 2 (--vision): LLM screenshot analysis (daily, quota-permitting)
 *
 * Outputs:
 *   docs/data/ux-report.json   — latest evaluation
 *   docs/data/ux-history.json  — trend history (last 30 entries)
 *
 * Usage:
 *   node scripts/evaluate-ux.js            # DOM heuristics only
 *   node scripts/evaluate-ux.js --vision   # + LLM vision analysis
 *
 * Exit code 0 always — UX evaluation is best-effort, never blocks.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createServer } from "http";
import { readJsonIfExists, writeJsonPretty, iso, rootDataPath } from "./lib/helpers.js";
import { computeTrend } from "./lib/ux-heuristics.js";

const args = process.argv.slice(2);
const useVision = args.includes("--vision");
const dataDir = rootDataPath();
const docsDir = path.resolve(process.cwd(), "docs");

function startServer() {
	return new Promise((resolve) => {
		const server = createServer((req, res) => {
			const urlPath = (req.url || "/").split("?")[0];
			const safePath = path.join(docsDir, urlPath === "/" ? "index.html" : urlPath);
			if (!safePath.startsWith(docsDir)) {
				res.writeHead(403);
				res.end();
				return;
			}
			try {
				const content = fs.readFileSync(safePath);
				const ext = path.extname(safePath);
				const mimeTypes = {
					".html": "text/html", ".js": "text/javascript", ".css": "text/css",
					".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
				};
				res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
				res.end(content);
			} catch {
				res.writeHead(404);
				res.end("Not found");
			}
		});
		server.listen(0, "127.0.0.1", () => resolve(server));
	});
}

function runPlaywrightEval(url) {
	return new Promise((resolve, reject) => {
		const tmpScript = path.join(dataDir, ".ux-eval-runner.cjs");
		// Import the heuristics module path for the eval script
		const heuristicsPath = path.resolve(process.cwd(), "scripts", "lib", "ux-heuristics.js");

		fs.writeFileSync(tmpScript, `
const { chromium } = require('playwright');

(async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({
		viewport: { width: 480, height: 900 },
		deviceScaleFactor: 2,
	});
	await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(3000);

	// Run DOM heuristics inline (page.evaluate needs serializable code)
	const results = await page.evaluate(() => {
		const issues = [];
		function getStyle(el, prop) { return window.getComputedStyle(el).getPropertyValue(prop); }
		function parseColor(s) { const m = s.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); return m ? { r: +m[1], g: +m[2], b: +m[3] } : null; }
		function luminance({ r, g, b }) {
			const [rs, gs, bs] = [r, g, b].map(c => { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
			return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
		}
		function contrastRatio(c1, c2) { const l1 = luminance(c1); const l2 = luminance(c2); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

		function checkEmptySections() {
			const selectors = ["#the-brief", "#events", ".featured-section", ".sport-group"];
			let empty = 0; const si = [];
			for (const sel of selectors) {
				for (const el of document.querySelectorAll(sel)) {
					if (el.offsetHeight <= 0 || el.offsetWidth <= 0) continue;
					if (el.textContent.trim().length === 0 && el.querySelectorAll("img, svg, canvas").length === 0) {
						empty++; si.push({ severity: "warning", code: "empty_section", selector: sel, message: "Empty visible section: " + sel });
					}
				}
			}
			return { score: Math.max(0, 100 - empty * 25), details: empty + " empty section(s)", issues: si };
		}

		function checkBrokenImages() {
			let broken = 0; const bi = [];
			for (const img of document.querySelectorAll("img")) {
				if (img.naturalWidth === 0 && img.complete) {
					broken++; bi.push({ severity: "warning", code: "broken_image", selector: (img.src || "").slice(0, 80), message: "Broken image: " + (img.src || "").slice(0, 80) });
				}
			}
			return { score: Math.max(0, 100 - broken * 20), details: broken + " broken image(s)", issues: bi };
		}

		function checkContentOverflow() {
			const wrap = document.querySelector(".wrap");
			if (!wrap) return { score: 100, details: "No .wrap container", issues: [] };
			const ww = wrap.clientWidth; let ov = 0; const oi = [];
			for (const el of wrap.querySelectorAll("*")) {
				if (el.scrollWidth > ww + 2) {
					ov++;
					if (ov <= 5) oi.push({ severity: "warning", code: "overflow", selector: el.tagName.toLowerCase(), message: "Overflows container (" + el.scrollWidth + "px > " + ww + "px)" });
				}
			}
			return { score: Math.max(0, 100 - ov * 15), details: ov + " overflowing element(s)", issues: oi };
		}

		function checkContrastRatio() {
			const textEls = Array.from(document.querySelectorAll("h1,h2,h3,p,span,a,div,li,td,th,button,label"))
				.filter(el => el.offsetHeight > 0 && el.textContent.trim().length > 0 && el.children.length === 0).slice(0, 100);
			let lc = 0; const ci = [];
			for (const el of textEls) {
				const fg = parseColor(getStyle(el, "color")); const bg = parseColor(getStyle(el, "background-color"));
				if (!fg || !bg) continue;
				const bgA = getStyle(el, "background-color").match(/rgba\\(\\d+,\\s*\\d+,\\s*\\d+,\\s*([\\d.]+)\\)/);
				if (bgA && parseFloat(bgA[1]) < 0.1) continue;
				if (contrastRatio(fg, bg) < 4.5) { lc++; if (lc <= 3) ci.push({ severity: "info", code: "low_contrast", selector: el.tagName.toLowerCase(), message: "Low contrast ratio" }); }
			}
			return { score: Math.max(0, 100 - lc * 10), details: lc + " low-contrast element(s)", issues: ci };
		}

		function checkTouchTargets() {
			let small = 0; const ti = [];
			for (const el of document.querySelectorAll("a,button,[role='button'],input,select,[onclick]")) {
				if (el.offsetHeight === 0 || el.offsetWidth === 0) continue;
				const r = el.getBoundingClientRect();
				if (r.width < 10 && r.height < 10) continue;
				if (r.width < 44 || r.height < 44) {
					small++; if (small <= 3) ti.push({ severity: "info", code: "small_touch_target", selector: el.tagName.toLowerCase(), message: Math.round(r.width) + "x" + Math.round(r.height) + "px" });
				}
			}
			return { score: Math.max(0, 100 - small * 10), details: small + " small touch target(s)", issues: ti };
		}

		function checkLoadCompleteness() {
			const expected = [
				{ selector: "#the-brief", name: "Editorial brief" },
				{ selector: "#events", name: "Events section" },
				{ selector: "#day-nav", name: "Day navigator" },
			];
			let missing = 0; const li = [];
			for (const { selector, name } of expected) {
				const el = document.querySelector(selector);
				if (!el || el.offsetHeight === 0) { missing++; li.push({ severity: "warning", code: "missing_section", selector, message: "Missing: " + name }); }
			}
			return { score: Math.max(0, 100 - missing * 30), details: missing + " missing section(s)", issues: li };
		}

		function checkTextReadability() {
			let long = 0; const ri = [];
			for (const el of document.querySelectorAll("p,.brief-line,.event-line,span,li")) {
				if (el.offsetHeight === 0 || el.children.length > 0) continue;
				if (el.textContent.trim().length > 80) {
					long++; if (long <= 3) ri.push({ severity: "info", code: "long_text_line", selector: el.tagName.toLowerCase(), message: el.textContent.trim().length + " chars" });
				}
			}
			return { score: Math.max(0, 100 - Math.min(long * 5, 20)), details: long + " long text line(s)", issues: ri };
		}

		const metrics = {
			emptySections: checkEmptySections(), brokenImages: checkBrokenImages(),
			contentOverflow: checkContentOverflow(), contrastRatio: checkContrastRatio(),
			touchTargets: checkTouchTargets(), loadCompleteness: checkLoadCompleteness(),
			textReadability: checkTextReadability(),
		};
		const weights = { loadCompleteness: 0.25, emptySections: 0.20, brokenImages: 0.15, contentOverflow: 0.15, contrastRatio: 0.10, touchTargets: 0.10, textReadability: 0.05 };
		let ws = 0; const allIssues = [];
		for (const [k, m] of Object.entries(metrics)) { ws += m.score * (weights[k] || 0); allIssues.push(...m.issues); }
		return { score: Math.round(ws), metrics, issues: allIssues };
	});

	${useVision ? `
	// Take screenshot for vision analysis
	const screenshotPath = ${JSON.stringify(path.join(dataDir, "ux-screenshot.png"))};
	await page.screenshot({ path: screenshotPath, fullPage: true });
	results.screenshotPath = screenshotPath;
	` : ""}

	await browser.close();
	console.log(JSON.stringify(results));
})();
`);

		const child = spawn("node", [tmpScript], { stdio: ["ignore", "pipe", "inherit"] });
		let stdout = "";
		child.stdout.on("data", (d) => (stdout += d));

		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error("Playwright timed out"));
		}, 45000);

		child.on("close", (code) => {
			clearTimeout(timeout);
			try { fs.unlinkSync(tmpScript); } catch {}
			if (code === 0) {
				try { resolve(JSON.parse(stdout.trim())); }
				catch { reject(new Error("Failed to parse Playwright output")); }
			} else {
				reject(new Error(`Playwright exited with code ${code}`));
			}
		});

		child.on("error", (err) => {
			clearTimeout(timeout);
			try { fs.unlinkSync(tmpScript); } catch {}
			reject(err);
		});
	});
}

async function runVisionAnalysis(screenshotPath) {
	try {
		const { LLMClient } = await import("./lib/llm-client.js");
		const llm = new LLMClient();
		if (!llm.isAvailable()) {
			console.log("No LLM API key — skipping vision analysis");
			return null;
		}

		const imageBase64 = fs.readFileSync(screenshotPath).toString("base64");
		const systemPrompt = "You are a UX evaluator for a mobile sports dashboard (480px wide). Score the visual quality 0-100 and identify specific issues. Respond in JSON: { \"score\": number, \"assessment\": string, \"issues\": string[], \"suggestions\": string[] }";
		const userPrompt = `Evaluate this dashboard screenshot for visual quality, readability, layout, and design consistency. Consider: spacing, typography hierarchy, color usage, information density, visual flow. Be specific about issues.`;

		// Use Anthropic's vision API format if available
		if (llm.getProviderName() === "anthropic") {
			const apiKey = process.env.ANTHROPIC_API_KEY;
			const response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
					max_tokens: 1024,
					system: systemPrompt,
					messages: [{
						role: "user",
						content: [
							{ type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } },
							{ type: "text", text: userPrompt },
						],
					}],
					temperature: 0.3,
				}),
			});

			if (!response.ok) throw new Error(`Vision API error: ${response.status}`);
			const data = await response.json();
			const text = data.content?.[0]?.text || "";
			try {
				return JSON.parse(text);
			} catch {
				const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
				if (match) return JSON.parse(match[1].trim());
				return { score: 50, assessment: text.slice(0, 500), issues: [], suggestions: [] };
			}
		}

		// Fallback: use text-only LLM (no vision)
		console.log("Vision analysis requires Anthropic API — skipping");
		return null;
	} catch (err) {
		console.warn("Vision analysis failed:", err.message);
		return null;
	}
}

/**
 * Append report to history and cap at maxEntries.
 */
export function updateHistory(report, historyPath, maxEntries = 30) {
	const history = readJsonIfExists(historyPath) || [];
	history.push({
		generatedAt: report.generatedAt,
		score: report.score,
		tier: report.tier,
		issueCount: report.issues.length,
		metricScores: Object.fromEntries(
			Object.entries(report.metrics).map(([k, v]) => [k, v.score])
		),
	});
	const trimmed = history.slice(-maxEntries);
	writeJsonPretty(historyPath, trimmed);
	return trimmed;
}

async function main() {
	const server = await startServer();
	const port = server.address().port;
	const url = `http://127.0.0.1:${port}/`;

	try {
		console.log("Running UX evaluation...");
		const results = await runPlaywrightEval(url);

		// Build report
		const report = {
			generatedAt: iso(),
			score: results.score,
			tier: "dom",
			metrics: results.metrics,
			issues: results.issues,
			vision: null,
		};

		// Tier 2: Vision analysis
		if (useVision && results.screenshotPath) {
			console.log("Running LLM vision analysis...");
			const vision = await runVisionAnalysis(results.screenshotPath);
			if (vision) {
				report.vision = vision;
				report.tier = "vision";
			}
			// Clean up screenshot
			try { fs.unlinkSync(results.screenshotPath); } catch {}
		}

		// Write report
		writeJsonPretty(path.join(dataDir, "ux-report.json"), report);
		console.log(`UX score: ${report.score}/100 (${report.tier})`);
		console.log(`Issues: ${report.issues.length}`);
		for (const [name, metric] of Object.entries(report.metrics)) {
			console.log(`  ${name}: ${metric.score}/100 — ${metric.details}`);
		}

		// Update history
		const historyPath = path.join(dataDir, "ux-history.json");
		const history = updateHistory(report, historyPath);
		const trend = computeTrend(history);
		console.log(`Trend: ${trend} (${history.length} entries)`);
	} finally {
		server.close();
	}
}

main().catch((err) => {
	console.error("UX evaluation failed:", err.message);
	console.error("UX evaluation is best-effort — this does not block the pipeline.");
	process.exit(0);
});
