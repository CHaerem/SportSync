// System coherence: the agent prompts reference files that exist, and their
// output contracts stay in sync with what the pipeline and client expect.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (f) => fs.readFileSync(path.resolve(process.cwd(), "scripts", "agents", f), "utf-8");

describe("agent prompts", () => {
	it("all three prompt files exist", () => {
		for (const f of ["research.md", "verify.md", "editorial.md"]) {
			expect(fs.existsSync(path.resolve("scripts", "agents", f)), f).toBe(true);
		}
	});

	it("research prompt covers the full contract", () => {
		const p = read("research.md");
		expect(p).toContain("interests.json");
		expect(p).toContain("tracked.json");
		expect(p).toContain("events.json");
		expect(p).toContain("research-log.json");
		expect(p).toContain('"ai-research"');
		expect(p).toContain("validate-events.js");
		// Coverage & correctness package contracts
		expect(p).toContain("coverage-gaps.json");
		expect(p).toContain("calibration.json");
		expect(p).toContain("tv-listings.json");
		expect(p).toContain("norwegian-rights");
		expect(p).toContain("fact-check");
		expect(p).toContain("rubrics/research-rubric.md");
		expect(fs.existsSync(path.resolve("scripts", "agents", "rubrics", "research-rubric.md"))).toBe(true);
	});

	it("verify prompt covers the full contract", () => {
		const p = read("verify.md");
		expect(p).toContain("verificationStatus");
		expect(p).toContain("verify-log.json");
		expect(p).toContain("calibration-ledger.jsonl");
		expect(p).toContain("norwegian-rights");
	});

	it("scout prompt exists with escalation cap and log contract", () => {
		const p = read("scout.md");
		expect(p).toContain("scout-log.json");
		expect(p).toContain("max 2 escalations");
		expect(p).toContain("gh workflow run research-agent.yml");
	});

	it("editorial prompt only references block types the client can render", () => {
		const p = read("editorial.md");
		const clientRenderers = fs.readFileSync(path.resolve("docs", "js", "block-renderers.js"), "utf-8");
		const dashboardJs = fs.readFileSync(path.resolve("docs", "js", "dashboard.js"), "utf-8");
		const structuredTypes = ["match-result", "match-preview", "event-schedule", "golf-status"];
		for (const type of structuredTypes) {
			expect(p, `editorial.md should document ${type}`).toContain(type);
			expect(clientRenderers, `block-renderers.js should render ${type}`).toContain(`'${type}'`);
		}
		for (const type of ["headline", "narrative", "divider", "event-line"]) {
			expect(p).toContain(type);
			expect(dashboardJs, `dashboard.js should render ${type}`).toContain(`'${type}'`);
		}
	});

	it("prompts never permit editing interests.json", () => {
		for (const f of ["research.md", "verify.md"]) {
			expect(read(f).toLowerCase()).toContain("never modify");
		}
	});

	it("every skill referenced in a prompt exists, and x-sources is wired in", () => {
		for (const f of ["research.md", "verify.md", "editorial.md"]) {
			const refs = [...read(f).matchAll(/\.claude\/skills\/[\w-]+\/SKILL\.md/g)].map((m) => m[0]);
			for (const ref of refs) {
				expect(fs.existsSync(path.resolve(ref)), `${f} references missing ${ref}`).toBe(true);
			}
		}
		expect(read("research.md")).toContain(".claude/skills/x-sources/SKILL.md");
		expect(read("verify.md")).toContain(".claude/skills/x-sources/SKILL.md");
	});

	it("skills have valid frontmatter (name + description)", () => {
		const skillsDir = path.resolve(".claude", "skills");
		const dirs = fs
			.readdirSync(skillsDir, { withFileTypes: true })
			.filter((d) => d.isDirectory()) // ignore .DS_Store and stray files
			.map((d) => d.name);
		expect(dirs.length).toBeGreaterThan(0);
		for (const dir of dirs) {
			const skill = fs.readFileSync(path.join(skillsDir, dir, "SKILL.md"), "utf-8");
			expect(skill.startsWith("---"), `${dir}/SKILL.md missing frontmatter`).toBe(true);
			expect(skill).toMatch(/name:\s*\S+/);
			expect(skill).toMatch(/description:\s*\S+/);
		}
	});
});
