// System coherence: the four v2 workflows exist and wire up the right prompts,
// auth, and scripts. Catches drift between workflow files and the repo.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const wf = (f) => fs.readFileSync(path.resolve(process.cwd(), ".github", "workflows", f), "utf-8");

describe("v2 workflows", () => {
	it("exactly the expected agent workflows exist (old autopilot removed)", () => {
		const dir = fs.readdirSync(path.resolve(".github", "workflows"));
		for (const f of ["static-pipeline.yml", "research-agent.yml", "verify-agent.yml", "editorial-agent.yml", "scout-agent.yml"]) {
			expect(dir, f).toContain(f);
		}
		for (const f of ["claude-autopilot.yml", "update-sports-data.yml", "claude-maintenance.yml"]) {
			expect(dir, `${f} should be deleted`).not.toContain(f);
		}
	});

	it("static pipeline runs only scripts that exist", () => {
		const content = wf("static-pipeline.yml");
		const scripts = [...content.matchAll(/node (scripts\/[\w\-/]+\.js)/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(3);
		for (const script of scripts) {
			expect(fs.existsSync(path.resolve(script)), script).toBe(true);
		}
	});

	it("agent workflows use OAuth token and reference existing prompt files", () => {
		for (const [file, prompt] of [
			["research-agent.yml", "scripts/agents/research.md"],
			["verify-agent.yml", "scripts/agents/verify.md"],
			["editorial-agent.yml", "scripts/agents/editorial.md"],
			["scout-agent.yml", "scripts/agents/scout.md"],
		]) {
			const content = wf(file);
			expect(content).toContain("CLAUDE_CODE_OAUTH_TOKEN");
			expect(content).toContain(prompt.replace("scripts/agents/", "scripts/agents/"));
			expect(fs.existsSync(path.resolve(prompt)), prompt).toBe(true);
		}
	});

	it("agent workflows have concurrency guards", () => {
		for (const f of ["research-agent.yml", "verify-agent.yml", "editorial-agent.yml", "static-pipeline.yml", "scout-agent.yml"]) {
			expect(wf(f), f).toContain("concurrency:");
		}
	});
});
