// System coherence: the four v2 workflows exist and wire up the right prompts,
// auth, and scripts. Catches drift between workflow files and the repo.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const wf = (f) => fs.readFileSync(path.resolve(process.cwd(), ".github", "workflows", f), "utf-8");

// The Claude models named on REAL `--model <model>` CLI lines, comments stripped —
// so a model name that only appears in a comment can't satisfy a tier pin.
const modelsOf = (f) =>
	wf(f)
		.split("\n")
		.filter((l) => !l.trim().startsWith("#"))
		.flatMap((l) => [...l.matchAll(/--model\s+(claude-[\w.-]+)/g)].map((m) => m[1]));

describe("v2 workflows", () => {
	it("exactly the expected agent workflows exist (old autopilot removed)", () => {
		const dir = fs.readdirSync(path.resolve(".github", "workflows"));
		for (const f of ["static-pipeline.yml", "research-agent.yml", "verify-agent.yml", "editorial-agent.yml", "scout-agent.yml", "coverage-critic-agent.yml", "visual-qa-agent.yml", "usage-monitor.yml", "ui-fix-agent.yml", "self-repair-agent.yml", "improve-agent.yml", "follow-request.yml"]) {
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
			["coverage-critic-agent.yml", "scripts/agents/coverage-critic.md"],
			["visual-qa-agent.yml", "scripts/agents/visual-qa.md"],
			["ui-fix-agent.yml", "scripts/agents/ui-fix.md"],
			["self-repair-agent.yml", "scripts/agents/self-repair.md"],
			["improve-agent.yml", "scripts/agents/improve.md"],
		]) {
			const content = wf(file);
			expect(content).toContain("CLAUDE_CODE_OAUTH_TOKEN");
			expect(content).toContain(prompt.replace("scripts/agents/", "scripts/agents/"));
			expect(fs.existsSync(path.resolve(prompt)), prompt).toBe(true);
		}
	});

	it("every agent gates on the usage governor, and the monitor feeds it", () => {
		for (const f of ["research-agent.yml", "verify-agent.yml", "editorial-agent.yml", "scout-agent.yml", "coverage-critic-agent.yml", "visual-qa-agent.yml", "ui-fix-agent.yml", "self-repair-agent.yml", "improve-agent.yml"]) {
			expect(wf(f), `${f} must run the usage gate`).toContain("scripts/usage-gate.js");
			expect(wf(f), `${f} must condition the agent on the gate`).toContain("steps.usage.outputs.run == 'true'");
		}
		expect(wf("usage-monitor.yml"), "monitor must write the gauge").toContain("scripts/check-usage.js");
		for (const s of ["scripts/usage-gate.js", "scripts/check-usage.js"]) {
			expect(fs.existsSync(path.resolve(s)), s).toBe(true);
		}
	});

	it("agent workflows have concurrency guards", () => {
		for (const f of ["research-agent.yml", "verify-agent.yml", "editorial-agent.yml", "static-pipeline.yml", "scout-agent.yml", "coverage-critic-agent.yml", "visual-qa-agent.yml", "ui-fix-agent.yml", "self-repair-agent.yml", "improve-agent.yml"]) {
			expect(wf(f), f).toContain("concurrency:");
		}
	});

	it("all three self-fixing loops use the ONE shared merge gate and commit their run log", () => {
		expect(fs.existsSync(path.resolve("scripts", "merge-gate.js")), "scripts/merge-gate.js").toBe(true);
		for (const [file, prefix, log] of [
			["ui-fix-agent.yml", "ui-autofix/", "docs/data/ui-fix-log.json"],
			["self-repair-agent.yml", "self-repair/", "docs/data/self-repair-log.json"],
			["improve-agent.yml", "improve/", "docs/data/improve-log.json"],
		]) {
			const content = wf(file);
			expect(content, `${file} must call the shared gate`).toContain(`node scripts/merge-gate.js ${prefix}`);
			expect(content, `${file} must not keep an inline protected-path check`).not.toMatch(/BLOCK=/);
			expect(content, `${file} must not merge inline`).not.toContain("gh pr merge");
			expect(content, `${file} must persist its run log to main`).toContain(log);
		}
		// self-repair additionally gates on the events contract, as before the extraction
		expect(wf("self-repair-agent.yml")).toContain("--validate-events");
	});

	it("the CI, iOS-test, release and Pages-deploy workflows exist and reference only files that exist", () => {
		const files = ["ci.yml", "ios-tests.yml", "ios-release.yml", "preview-deploy.yml"];
		const dir = fs.readdirSync(path.resolve(".github", "workflows"));
		for (const f of files) {
			expect(dir, f).toContain(f);
		}
		// every `node scripts/*.js` invoked across the four must exist on disk
		for (const f of files) {
			const scripts = [...wf(f).matchAll(/node (scripts\/[\w\-/]+\.js)/g)].map((m) => m[1]);
			for (const s of scripts) {
				expect(fs.existsSync(path.resolve(s)), `${f} → ${s}`).toBe(true);
			}
		}
		// the release lane records builds via the two TestFlight scripts and kicks the pipeline
		const release = wf("ios-release.yml");
		for (const s of ["scripts/next-testflight-build.js", "scripts/record-testflight.js"]) {
			expect(release, `ios-release.yml must run ${s}`).toContain(`node ${s}`);
			expect(fs.existsSync(path.resolve(s)), s).toBe(true);
		}
		expect(release, "release lane kicks the static pipeline").toContain("static-pipeline.yml");
		expect(dir, "the kicked workflow exists").toContain("static-pipeline.yml");
		// the two PR gates run the suites branch protection requires
		expect(wf("ci.yml"), "ci runs the web test suite").toMatch(/npm (ci|test)/);
		expect(wf("ios-tests.yml"), "ios-tests builds the Sportivista scheme").toContain("Sportivista");
		// preview-deploy serialises Pages deploys and is invocable by the pipeline
		const preview = wf("preview-deploy.yml");
		expect(preview, "preview-deploy serialises on the pages group").toContain("pages-deploy");
		expect(preview, "preview-deploy is callable by the static pipeline").toContain("workflow_call");
	});

	it("the two PR gates keep their required-check job names (a rename silently breaks the gate)", () => {
		// merge-gate.js's `gh pr checks --watch` and any branch-protection ruleset
		// key off these exact job/check names. Match the job declaration line (2-space
		// indent under `jobs:`), never a comment or a `group:`/path reference.
		expect(wf("ci.yml"), "ci.yml must define a job named web-tests").toMatch(/^ {2}web-tests:/m);
		expect(wf("ios-tests.yml"), "ios-tests.yml must define a job named ios-tests").toMatch(/^ {2}ios-tests:/m);
	});

	it("agent model tiers are pinned (quota-drift guard on real --model lines)", () => {
		// scout is the cheap hourly watchtower; visual-qa needs vision; everything
		// else is the Opus workhorse, with research additionally reaching for Fable 5
		// on the deep tier. A silent downgrade/upgrade here changes the budget.
		expect(modelsOf("scout-agent.yml"), "scout runs on Haiku").toContain("claude-haiku-4-5");
		expect(modelsOf("visual-qa-agent.yml"), "visual-qa runs on Sonnet").toContain("claude-sonnet-5");
		const research = modelsOf("research-agent.yml");
		expect(research, "research standard/fallback tier is Opus").toContain("claude-opus-4-8");
		expect(research, "research deep tier reaches for Fable 5").toContain("claude-fable-5");
		for (const f of ["editorial-agent.yml", "verify-agent.yml", "coverage-critic-agent.yml", "ui-fix-agent.yml", "self-repair-agent.yml", "improve-agent.yml"]) {
			expect(modelsOf(f), `${f} runs on Opus`).toContain("claude-opus-4-8");
		}
	});
});
