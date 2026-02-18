/**
 * Resolve autopilot runtime config — pure logic, no I/O.
 *
 * Merges the autopilot-config.json preferences with the current quota tier
 * to determine actual runtime parameters (model, maxTurns, allowedTools).
 *
 * Resolution rules:
 *   - Model: quota tier model overrides config model (constraints > preferences)
 *   - maxTurns: maxTurnsPerTier[tier] if valid, else config.maxTurns, else DEFAULTS.maxTurns
 *   - allowedTools: pass through from config (no tier override)
 *
 * Vision alignment: process autonomy — the autopilot can tune its own runtime
 * parameters by editing scripts/autopilot-config.json, while the quota tier
 * system enforces resource constraints.
 */

export const DEFAULTS = {
	model: "claude-opus-4-6",
	maxTurns: 300,
	allowedTools: "Read,Write,Edit,Glob,Grep,Bash(npm:*),Bash(node:*),Bash(git:*),Bash(gh:*),Bash(date:*),Bash(jq:*)",
};

export const VALID_MODELS = [
	"claude-opus-4-6",
	"claude-sonnet-4-6",
	"claude-haiku-4-5-20251001",
];

const MAX_TURNS_CAP = 1000;

/**
 * Resolve the effective autopilot runtime config.
 *
 * @param {object|null} config — contents of scripts/autopilot-config.json (may be null/malformed)
 * @param {object|null} quotaStatus — contents of docs/data/.quota-status.json (may be null/malformed)
 * @returns {{ model: string, maxTurns: number, allowedTools: string }}
 */
export function resolveAutopilotConfig(config, quotaStatus) {
	const cfg = config && typeof config === "object" ? config : {};
	const quota = quotaStatus && typeof quotaStatus === "object" ? quotaStatus : {};

	// --- Model ---
	// Quota tier model override takes precedence (constraints > preferences)
	const tierModel = quota.evaluation?.model || null;
	const configModel = typeof cfg.model === "string" ? cfg.model : null;

	let model = DEFAULTS.model;
	if (tierModel && VALID_MODELS.includes(tierModel)) {
		model = tierModel;
	} else if (configModel && VALID_MODELS.includes(configModel)) {
		model = configModel;
	}

	// --- maxTurns ---
	const tier = typeof quota.evaluation?.tier === "number" ? quota.evaluation.tier : 0;
	const perTier = Array.isArray(cfg.maxTurnsPerTier) ? cfg.maxTurnsPerTier : null;

	let maxTurns = DEFAULTS.maxTurns;
	if (perTier && tier >= 0 && tier < perTier.length && typeof perTier[tier] === "number") {
		maxTurns = perTier[tier];
	} else if (typeof cfg.maxTurns === "number" && cfg.maxTurns > 0) {
		maxTurns = cfg.maxTurns;
	}

	// Safety bounds
	maxTurns = Math.max(0, Math.min(maxTurns, MAX_TURNS_CAP));

	// --- allowedTools ---
	const allowedTools = typeof cfg.allowedTools === "string" && cfg.allowedTools.length > 0
		? cfg.allowedTools
		: DEFAULTS.allowedTools;

	return { model, maxTurns, allowedTools };
}
