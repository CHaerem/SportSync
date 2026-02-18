import { describe, it, expect } from "vitest";
import { resolveAutopilotConfig, DEFAULTS, VALID_MODELS } from "../scripts/lib/resolve-autopilot-config.js";

// Helper to build a quota status object
function makeQuota(tier, tierName, model = null) {
	return {
		evaluation: { tier, tierName, model, constrained: tier > 0, reason: `${tierName}` },
		quota: { fiveHour: tier * 20, sevenDay: tier * 20 },
	};
}

// Helper to build a config object
function makeConfig(overrides = {}) {
	return {
		model: "claude-opus-4-6",
		maxTurns: 300,
		maxTurnsPerTier: [300, 200, 100, 0],
		allowedTools: "Read,Write,Edit,Glob,Grep,Bash(npm:*),Bash(node:*),Bash(git:*),Bash(gh:*),Bash(date:*),Bash(jq:*)",
		...overrides,
	};
}

describe("resolveAutopilotConfig", () => {
	describe("happy path", () => {
		it("returns config values at tier 0 (green) with no quota override", () => {
			const result = resolveAutopilotConfig(makeConfig(), makeQuota(0, "green"));
			expect(result.model).toBe("claude-opus-4-6");
			expect(result.maxTurns).toBe(300);
			expect(result.allowedTools).toContain("Read,Write,Edit");
		});

		it("uses config model when quota has no model override", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ model: "claude-sonnet-4-6" }),
				makeQuota(0, "green", null),
			);
			expect(result.model).toBe("claude-sonnet-4-6");
		});
	});

	describe("quota overrides", () => {
		it("uses quota tier model over config model at moderate tier", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ model: "claude-opus-4-6" }),
				makeQuota(1, "moderate", "claude-sonnet-4-6"),
			);
			expect(result.model).toBe("claude-sonnet-4-6");
		});

		it("uses quota tier model at high tier", () => {
			const result = resolveAutopilotConfig(
				makeConfig(),
				makeQuota(2, "high", "claude-sonnet-4-6"),
			);
			expect(result.model).toBe("claude-sonnet-4-6");
		});

		it("selects maxTurns from maxTurnsPerTier based on quota tier", () => {
			const config = makeConfig({ maxTurnsPerTier: [300, 200, 100, 0] });
			expect(resolveAutopilotConfig(config, makeQuota(0, "green")).maxTurns).toBe(300);
			expect(resolveAutopilotConfig(config, makeQuota(1, "moderate")).maxTurns).toBe(200);
			expect(resolveAutopilotConfig(config, makeQuota(2, "high")).maxTurns).toBe(100);
			expect(resolveAutopilotConfig(config, makeQuota(3, "critical")).maxTurns).toBe(0);
		});
	});

	describe("safety — null/empty inputs", () => {
		it("returns defaults when config is null", () => {
			const result = resolveAutopilotConfig(null, makeQuota(0, "green"));
			expect(result.model).toBe(DEFAULTS.model);
			expect(result.maxTurns).toBe(DEFAULTS.maxTurns);
			expect(result.allowedTools).toBe(DEFAULTS.allowedTools);
		});

		it("returns defaults when config is empty object", () => {
			const result = resolveAutopilotConfig({}, makeQuota(0, "green"));
			expect(result.model).toBe(DEFAULTS.model);
			expect(result.maxTurns).toBe(DEFAULTS.maxTurns);
		});

		it("returns defaults when quota is null", () => {
			const result = resolveAutopilotConfig(makeConfig(), null);
			expect(result.model).toBe("claude-opus-4-6");
			expect(result.maxTurns).toBe(300); // tier 0 from maxTurnsPerTier
		});

		it("returns defaults when both config and quota are null", () => {
			const result = resolveAutopilotConfig(null, null);
			expect(result.model).toBe(DEFAULTS.model);
			expect(result.maxTurns).toBe(DEFAULTS.maxTurns);
			expect(result.allowedTools).toBe(DEFAULTS.allowedTools);
		});
	});

	describe("safety — invalid values", () => {
		it("rejects invalid model names and uses default", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ model: "gpt-4o" }),
				makeQuota(0, "green"),
			);
			expect(result.model).toBe(DEFAULTS.model);
		});

		it("rejects invalid quota model and falls back to config model", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ model: "claude-sonnet-4-6" }),
				makeQuota(1, "moderate", "invalid-model"),
			);
			expect(result.model).toBe("claude-sonnet-4-6");
		});

		it("caps maxTurns at 1000", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ maxTurns: 5000, maxTurnsPerTier: [5000] }),
				makeQuota(0, "green"),
			);
			expect(result.maxTurns).toBe(1000);
		});

		it("handles negative maxTurns by clamping to 0", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ maxTurns: -10, maxTurnsPerTier: [-10] }),
				makeQuota(0, "green"),
			);
			expect(result.maxTurns).toBe(0);
		});

		it("handles non-numeric maxTurns in config", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ maxTurns: "lots", maxTurnsPerTier: null }),
				makeQuota(0, "green"),
			);
			expect(result.maxTurns).toBe(DEFAULTS.maxTurns);
		});

		it("handles empty allowedTools by using default", () => {
			const result = resolveAutopilotConfig(
				makeConfig({ allowedTools: "" }),
				makeQuota(0, "green"),
			);
			expect(result.allowedTools).toBe(DEFAULTS.allowedTools);
		});
	});

	describe("edge cases — maxTurnsPerTier", () => {
		it("falls back to config.maxTurns when maxTurnsPerTier is shorter than tier", () => {
			const config = makeConfig({ maxTurns: 150, maxTurnsPerTier: [300] });
			// Tier 2 is beyond the array length
			const result = resolveAutopilotConfig(config, makeQuota(2, "high"));
			expect(result.maxTurns).toBe(150);
		});

		it("falls back to config.maxTurns when maxTurnsPerTier is not an array", () => {
			const config = makeConfig({ maxTurns: 250, maxTurnsPerTier: "not-an-array" });
			const result = resolveAutopilotConfig(config, makeQuota(1, "moderate"));
			expect(result.maxTurns).toBe(250);
		});

		it("handles non-numeric values in maxTurnsPerTier array", () => {
			const config = makeConfig({ maxTurns: 200, maxTurnsPerTier: [300, "bad", 100] });
			const result = resolveAutopilotConfig(config, makeQuota(1, "moderate"));
			// "bad" at index 1 is not a number, falls back to config.maxTurns
			expect(result.maxTurns).toBe(200);
		});
	});

	describe("DEFAULTS and VALID_MODELS exports", () => {
		it("exports DEFAULTS with expected fields", () => {
			expect(DEFAULTS).toHaveProperty("model");
			expect(DEFAULTS).toHaveProperty("maxTurns");
			expect(DEFAULTS).toHaveProperty("allowedTools");
		});

		it("exports VALID_MODELS as a non-empty array of strings", () => {
			expect(Array.isArray(VALID_MODELS)).toBe(true);
			expect(VALID_MODELS.length).toBeGreaterThan(0);
			for (const m of VALID_MODELS) {
				expect(typeof m).toBe("string");
			}
		});

		it("DEFAULTS.model is in VALID_MODELS", () => {
			expect(VALID_MODELS).toContain(DEFAULTS.model);
		});
	});
});
