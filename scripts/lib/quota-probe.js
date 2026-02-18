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

// Utilization thresholds — above these, AI steps are skipped
export const THRESHOLD_5H = 80;   // percent — preserve burst capacity
export const THRESHOLD_7D = 80;   // percent — preserve weekly cap

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

	return {
		fiveHour: h5 != null ? parseFloat(h5) : null,
		sevenDay: h7d != null ? parseFloat(h7d) : null,
		fiveHourReset: headers["anthropic-ratelimit-unified-5h-reset"] || null,
		sevenDayReset: headers["anthropic-ratelimit-unified-7d-reset"] || null,
		raw: {
			...(h5 != null && { "5h-utilization": h5 }),
			...(h7d != null && { "7d-utilization": h7d }),
		},
	};
}

/**
 * Determine if the system should skip AI steps based on utilization.
 * @param {object|null} quota — from parseRateLimitHeaders
 * @returns {{ constrained: boolean, reason: string }}
 */
export function evaluateQuota(quota) {
	if (!quota) return { constrained: false, reason: "no quota data (permissive)" };

	if (typeof quota.fiveHour === "number" && quota.fiveHour > THRESHOLD_5H) {
		return { constrained: true, reason: `5h utilization ${quota.fiveHour}% > ${THRESHOLD_5H}%` };
	}
	if (typeof quota.sevenDay === "number" && quota.sevenDay > THRESHOLD_7D) {
		return { constrained: true, reason: `7d utilization ${quota.sevenDay}% > ${THRESHOLD_7D}%` };
	}

	return { constrained: false, reason: "ok" };
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
					"x-api-key": token,
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
		thresholds: { fiveHour: THRESHOLD_5H, sevenDay: THRESHOLD_7D },
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
		console.log(`  Quota probe: ${h5}, ${h7d} → ${evaluation.reason}`);
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
