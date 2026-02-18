/**
 * Quota Probe — reads real Max subscription utilization via response headers.
 *
 * Makes a minimal 1-token Haiku API call with the OAuth token and the
 * `anthropic-beta: oauth-2025-04-20` header.  The Anthropic API returns
 * rate-limit utilization percentages in response headers:
 *   - anthropic-ratelimit-unified-5h-utilization
 *   - anthropic-ratelimit-unified-7d-utilization
 *
 * Cost per probe: ~$0.001 (1 Haiku token).
 *
 * Vision alignment: self-correcting resource management — the system
 * measures its own consumption and throttles AI steps when quota is
 * scarce, preserving capacity for the user's interactive sessions.
 */

import https from "https";
import { writeJsonPretty, readJsonIfExists, rootDataPath } from "./helpers.js";
import path from "path";

const API_HOST = "api.anthropic.com";
const API_PATH = "/v1/messages";
const PROBE_MODEL = "claude-haiku-4-5-20251001";
const QUOTA_STATUS_FILE = ".quota-status.json";

/**
 * Quota tiers — graduated response to utilization.
 * The system yields to the user's personal Claude sessions:
 *
 *  Tier 0 "green"    — full capability, best models
 *  Tier 1 "moderate" — skip non-essential AI (discovery), downgrade featured model
 *  Tier 2 "high"     — only essential AI (enrichment if data changed), Sonnet everywhere
 *  Tier 3 "critical" — skip ALL AI steps, free operations only
 *
 * Each tier has a quotaPriority ceiling: steps with priority > ceiling are skipped.
 * Steps declare quotaPriority in the manifest (1=essential, 2=important, 3=nice-to-have).
 */
export const TIERS = [
	{ name: "green",    maxPriority: 3, model: null,               ceiling5h: 50, ceiling7d: 50 },
	{ name: "moderate", maxPriority: 2, model: "claude-sonnet-4-6", ceiling5h: 70, ceiling7d: 70 },
	{ name: "high",     maxPriority: 1, model: "claude-sonnet-4-6", ceiling5h: 85, ceiling7d: 85 },
	{ name: "critical", maxPriority: 0, model: null,               ceiling5h: Infinity, ceiling7d: Infinity },
];

/**
 * Parse rate-limit utilization from Anthropic API response headers.
 * @param {object} headers — Node http.IncomingMessage headers (lowercased)
 * @returns {object|null} { fiveHour, sevenDay, fiveHourReset, sevenDayReset, raw }
 */
export function parseRateLimitHeaders(headers) {
	if (!headers) return null;

	const h5 = headers["anthropic-ratelimit-unified-5h-utilization"];
	const h7d = headers["anthropic-ratelimit-unified-7d-utilization"];

	if (h5 == null && h7d == null) return null;

	// Headers return ratios (0–1); convert to percentages (0–100)
	// for consistency with thresholds, shouldGate(), and status page
	return {
		fiveHour: h5 != null ? Math.round(parseFloat(h5) * 10000) / 100 : null,
		sevenDay: h7d != null ? Math.round(parseFloat(h7d) * 10000) / 100 : null,
		fiveHourReset: headers["anthropic-ratelimit-unified-5h-reset"] || null,
		sevenDayReset: headers["anthropic-ratelimit-unified-7d-reset"] || null,
		raw: {
			...(h5 != null && { "5h-utilization": h5 }),
			...(h7d != null && { "7d-utilization": h7d }),
		},
	};
}

/**
 * Determine the quota tier based on current utilization.
 * Uses the HIGHER of 5h and 7d to pick the most conservative tier.
 * @param {object|null} quota — from parseRateLimitHeaders
 * @returns {{ tier: number, tierName: string, maxPriority: number, model: string|null, constrained: boolean, reason: string }}
 */
export function evaluateQuota(quota) {
	if (!quota) return { tier: 0, tierName: "green", maxPriority: 3, model: null, constrained: false, reason: "no quota data (permissive)" };

	const h5 = typeof quota.fiveHour === "number" ? quota.fiveHour : 0;
	const h7d = typeof quota.sevenDay === "number" ? quota.sevenDay : 0;

	// Walk tiers from most permissive to most restrictive
	for (let i = 0; i < TIERS.length - 1; i++) {
		const t = TIERS[i];
		if (h5 <= t.ceiling5h && h7d <= t.ceiling7d) {
			return {
				tier: i,
				tierName: t.name,
				maxPriority: t.maxPriority,
				model: t.model,
				constrained: i > 0,
				reason: i === 0 ? "ok" : `${t.name}: 5h ${h5}%, 7d ${h7d}%`,
			};
		}
	}

	// Exceeded all ceilings → critical
	const critical = TIERS[TIERS.length - 1];
	return {
		tier: TIERS.length - 1,
		tierName: critical.name,
		maxPriority: critical.maxPriority,
		model: critical.model,
		constrained: true,
		reason: `critical: 5h ${h5}%, 7d ${h7d}%`,
	};
}

/**
 * Make a minimal API call to read subscription utilization from headers.
 * @param {string} token — OAuth token (CLAUDE_CODE_OAUTH_TOKEN)
 * @param {number} timeoutMs — request timeout (default 10s)
 * @returns {Promise<object|null>} { fiveHour, sevenDay, ... } or null on failure
 */
export function probeQuota(token, timeoutMs = 10_000) {
	if (!token) {
		console.log("  Quota probe: no token available");
		return Promise.resolve(null);
	}

	const body = JSON.stringify({
		model: PROBE_MODEL,
		max_tokens: 1,
		messages: [{ role: "user", content: "." }],
	});

	return new Promise((resolve) => {
		const req = https.request(
			{
				hostname: API_HOST,
				path: API_PATH,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
					"anthropic-version": "2023-06-01",
					"anthropic-beta": "oauth-2025-04-20",
					"Content-Length": Buffer.byteLength(body),
				},
				timeout: timeoutMs,
			},
			(res) => {
				const quota = parseRateLimitHeaders(res.headers);

				// Consume body to free socket
				let responseBody = "";
				res.on("data", (c) => (responseBody += c));
				res.on("end", () => {
					if (res.statusCode >= 400) {
						const snippet = responseBody.slice(0, 200);
						console.warn(`  Quota probe: API returned ${res.statusCode}: ${snippet}`);
					}
					// Even on 4xx/5xx, headers may contain utilization data
					resolve(quota);
				});
			}
		);

		req.on("timeout", () => {
			console.warn("  Quota probe: request timed out");
			req.destroy();
			resolve(null);
		});

		req.on("error", (err) => {
			console.warn(`  Quota probe: ${err.message}`);
			resolve(null);
		});

		req.write(body);
		req.end();
	});
}

/**
 * Run the probe, evaluate thresholds, and persist results.
 * This is the main entry point for pipeline integration.
 * @returns {Promise<{ quota: object|null, evaluation: object }>}
 */
export async function checkQuota() {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	const quota = await probeQuota(token);
	const evaluation = evaluateQuota(quota);

	// Persist for downstream steps and autopilot visibility
	const statusPath = path.join(rootDataPath(), QUOTA_STATUS_FILE);
	const status = {
		probedAt: new Date().toISOString(),
		quota,
		evaluation,
		tiers: TIERS.map((t, i) => ({ tier: i, name: t.name, ceiling5h: t.ceiling5h, ceiling7d: t.ceiling7d })),
	};
	try {
		writeJsonPretty(statusPath, status);
	} catch {
		// Non-fatal — data dir may not exist yet in early pipeline phases
	}

	// Log
	if (quota) {
		const h5 = quota.fiveHour != null ? `5h: ${quota.fiveHour}%` : "5h: n/a";
		const h7d = quota.sevenDay != null ? `7d: ${quota.sevenDay}%` : "7d: n/a";
		const tierLabel = `tier ${evaluation.tier} (${evaluation.tierName})`;
		const modelNote = evaluation.model ? `, model → ${evaluation.model}` : "";
		console.log(`  Quota probe: ${h5}, ${h7d} → ${tierLabel}${modelNote}`);
	} else {
		console.log(`  Quota probe: ${evaluation.reason}`);
	}

	return { quota, evaluation };
}

/**
 * Read the last probe result from disk (for steps that run as child processes).
 * @returns {object|null}
 */
export function readQuotaStatus() {
	return readJsonIfExists(path.join(rootDataPath(), QUOTA_STATUS_FILE));
}
