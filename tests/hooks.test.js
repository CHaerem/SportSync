// Claude Code hooks: interests.json protection + post-write validation.
// These enforce contracts at the harness level — the tests exercise the hook
// scripts exactly as Claude Code invokes them (JSON on stdin, exit codes out).
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

function runHook(script, input, env = {}) {
	return spawnSync("node", [script], {
		input: JSON.stringify(input),
		encoding: "utf-8",
		env: { ...process.env, ...env },
	});
}

describe("protect-interests hook (CI-gated: blocks autonomous agents, allows local operator)", () => {
	const hook = "scripts/hooks/protect-interests.js";
	const CI = { GITHUB_ACTIONS: "true" }; // simulate the claude-code-action environment

	it("blocks Write to interests.json in CI with exit 2", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "/repo/scripts/config/interests.json", content: "{}" },
		}, CI);
		expect(r.status).toBe(2);
		expect(r.stderr).toContain("user-owned");
	});

	it("blocks Bash redirect into interests.json in CI", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: "echo '{}' > scripts/config/interests.json" },
		}, CI);
		expect(r.status).toBe(2);
	});

	it("ALLOWS a local operator (no CI) to edit interests.json", () => {
		// spawnSync inherits process.env; ensure CI markers are absent for this case.
		const r = spawnSync("node", [hook], {
			input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/repo/scripts/config/interests.json", content: "{}" } }),
			encoding: "utf-8",
			env: { ...process.env, GITHUB_ACTIONS: "", CI: "" },
		});
		expect(r.status).toBe(0);
	});

	it("allows Bash reads of interests.json (even in CI)", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: "grep -n teams scripts/config/interests.json" },
		}, CI);
		expect(r.status).toBe(0);
	});

	it("allows commands that merely mention interests.json (commit messages, 2>&1)", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: 'git commit -m "docs: explain interests.json contract" 2>&1 | tail -2' },
		}, CI);
		expect(r.status).toBe(0);
	});

	it("still blocks sed -i and mv targeting interests.json in CI", () => {
		for (const command of [
			"sed -i '' 's/a/b/' scripts/config/interests.json",
			"mv /tmp/new.json scripts/config/interests.json",
		]) {
			expect(runHook(hook, { tool_name: "Bash", tool_input: { command } }, CI).status, command).toBe(2);
		}
	});

	it("allows writes to other files", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "/repo/scripts/config/tracked.json", content: "{}" },
		}, CI);
		expect(r.status).toBe(0);
	});

	it("blocks bare relative paths in CI (review finding)", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "interests.json", content: "{}" },
		}, CI);
		expect(r.status).toBe(2);
	});

	it("blocks node -e writeFileSync targeting interests.json in CI (review finding)", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: `node -e "fs.writeFileSync('scripts/config/interests.json','{}')"` },
		}, CI);
		expect(r.status).toBe(2);
	});

	it("survives malformed input without blocking", () => {
		const r = spawnSync("node", [hook], { input: "not json", encoding: "utf-8", env: { ...process.env, GITHUB_ACTIONS: "true" } });
		expect(r.status).toBe(0);
	});
});

describe("protect-automation hook (CI-gated: blocks agents from mutating protected automation paths)", () => {
	const hook = "scripts/hooks/protect-automation.js";
	const CI = { GITHUB_ACTIONS: "true" }; // simulate the claude-code-action environment

	// One case per protected path class, incl. absolute AND bare-relative rooting.
	const protectedFiles = [
		["workflow (absolute)", "/repo/.github/workflows/research-agent.yml"],
		["workflow (bare-relative)", ".github/workflows/research-agent.yml"],
		["composite action (bare-relative)", ".github/actions/setup/action.yml"],
		["safety hook (absolute)", "/repo/scripts/hooks/protect-interests.js"],
		["safety hook (bare-relative)", "scripts/hooks/validate-after-write.js"],
		["harness settings (absolute)", "/repo/.claude/settings.json"],
		["harness settings (bare-relative)", ".claude/settings.json"],
	];
	for (const [label, file_path] of protectedFiles) {
		it(`blocks Write to ${label} in CI with exit 2`, () => {
			const r = runHook(hook, { tool_name: "Write", tool_input: { file_path, content: "x" } }, CI);
			expect(r.status, file_path).toBe(2);
			expect(r.stderr).toContain("protected automation path");
		});
		it(`blocks Edit to ${label} in CI`, () => {
			const r = runHook(hook, { tool_name: "Edit", tool_input: { file_path, old_string: "a", new_string: "b" } }, CI);
			expect(r.status, file_path).toBe(2);
		});
	}

	it("blocks Bash redirect into a workflow file in CI", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: "echo 'x' > .github/workflows/research-agent.yml" },
		}, CI);
		expect(r.status).toBe(2);
	});

	it("blocks Bash tee into settings.json in CI", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: "echo '{}' | tee .claude/settings.json" },
		}, CI);
		expect(r.status).toBe(2);
	});

	it("blocks sed -i / mv targeting a safety hook or composite action in CI", () => {
		for (const command of [
			"sed -i '' 's/2/0/' scripts/hooks/protect-interests.js",
			"mv /tmp/evil.yml .github/actions/setup/action.yml",
		]) {
			expect(runHook(hook, { tool_name: "Bash", tool_input: { command } }, CI).status, command).toBe(2);
		}
	});

	it("blocks node -e writeFileSync targeting a workflow in CI", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: `node -e "fs.writeFileSync('.github/workflows/x.yml','')"` },
		}, CI);
		expect(r.status).toBe(2);
	});

	it("ALLOWS a local operator (no CI) to edit a protected automation file", () => {
		const r = spawnSync("node", [hook], {
			input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/repo/.github/workflows/research-agent.yml", content: "x" } }),
			encoding: "utf-8",
			env: { ...process.env, GITHUB_ACTIONS: "", CI: "" },
		});
		expect(r.status).toBe(0);
	});

	it("allows Bash reads of protected paths (even in CI)", () => {
		for (const command of [
			"cat .github/workflows/research-agent.yml",
			"grep -rn matcher .claude/settings.json",
			"ls scripts/hooks/",
		]) {
			expect(runHook(hook, { tool_name: "Bash", tool_input: { command } }, CI).status, command).toBe(0);
		}
	});

	it("allows writes to non-protected files in CI (agents' contracted outputs)", () => {
		for (const file_path of [
			"/repo/docs/data/events.json",
			"scripts/config/tracked.json",
			"scripts/config/catalog.json",
			"scripts/fetch/index.js",
			"scripts/agents/research.md",
			".claude/skills/norwegian-rights/SKILL.md",
		]) {
			expect(runHook(hook, { tool_name: "Write", tool_input: { file_path, content: "{}" } }, CI).status, file_path).toBe(0);
		}
	});

	it("does not block a settings.json outside .claude/ in CI (only the harness one is protected)", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "docs/settings.json", content: "{}" },
		}, CI);
		expect(r.status).toBe(0);
	});

	it("survives malformed input without blocking", () => {
		const r = spawnSync("node", [hook], { input: "not json", encoding: "utf-8", env: { ...process.env, GITHUB_ACTIONS: "true" } });
		expect(r.status).toBe(0);
	});
});

describe("validate-after-write hook", () => {
	const hook = "scripts/hooks/validate-after-write.js";

	it("ignores writes to unrelated files", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "/repo/docs/data/standings.json" },
		});
		expect(r.status).toBe(0);
	});

	// The hook validates the directory that was actually written (derived from
	// file_path), so tests must place events.json at a real docs/data path.
	function makeDataDir(events) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "ss-hook-"));
		const dataDir = path.join(root, "docs", "data");
		fs.mkdirSync(dataDir, { recursive: true });
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(events));
		return { root, filePath: path.join(dataDir, "events.json") };
	}

	it("passes when events.json is valid", () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const { root, filePath } = makeDataDir([{ sport: "golf", title: "Open", time: future }]);
		const r = runHook(
			hook,
			{ tool_name: "Write", tool_input: { file_path: filePath } },
			{ CLAUDE_PROJECT_DIR: process.cwd() }
		);
		expect(r.status).toBe(0);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("exits 2 with feedback when events.json is invalid", () => {
		const { root, filePath } = makeDataDir([{ sport: "golf", title: "Missing time" }]);
		const r = runHook(
			hook,
			{ tool_name: "Write", tool_input: { file_path: filePath } },
			{ CLAUDE_PROJECT_DIR: process.cwd() }
		);
		expect(r.status).toBe(2);
		expect(r.stderr).toContain("failed validation");
		fs.rmSync(root, { recursive: true, force: true });
	});
});
