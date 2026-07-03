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

describe("protect-interests hook", () => {
	const hook = "scripts/hooks/protect-interests.js";

	it("blocks Write to interests.json with exit 2", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "/repo/scripts/config/interests.json", content: "{}" },
		});
		expect(r.status).toBe(2);
		expect(r.stderr).toContain("user-owned");
	});

	it("blocks Bash redirect into interests.json", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: "echo '{}' > scripts/config/interests.json" },
		});
		expect(r.status).toBe(2);
	});

	it("allows Bash reads of interests.json", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: "grep -n teams scripts/config/interests.json" },
		});
		expect(r.status).toBe(0);
	});

	it("allows commands that merely mention interests.json (commit messages, 2>&1)", () => {
		const r = runHook(hook, {
			tool_name: "Bash",
			tool_input: { command: 'git commit -m "docs: explain interests.json contract" 2>&1 | tail -2' },
		});
		expect(r.status).toBe(0);
	});

	it("still blocks sed -i and mv targeting interests.json", () => {
		for (const command of [
			"sed -i '' 's/a/b/' scripts/config/interests.json",
			"mv /tmp/new.json scripts/config/interests.json",
		]) {
			expect(runHook(hook, { tool_name: "Bash", tool_input: { command } }).status, command).toBe(2);
		}
	});

	it("allows writes to other files", () => {
		const r = runHook(hook, {
			tool_name: "Write",
			tool_input: { file_path: "/repo/scripts/config/tracked.json", content: "{}" },
		});
		expect(r.status).toBe(0);
	});

	it("survives malformed input without blocking", () => {
		const r = spawnSync("node", [hook], { input: "not json", encoding: "utf-8" });
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

	it("passes when events.json is valid", () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-hook-"));
		const future = new Date(Date.now() + 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([{ sport: "golf", title: "Open", time: future }])
		);
		const r = runHook(
			hook,
			{ tool_name: "Write", tool_input: { file_path: "/x/docs/data/events.json" } },
			{ SPORTSYNC_DATA_DIR: dataDir, CLAUDE_PROJECT_DIR: process.cwd() }
		);
		expect(r.status).toBe(0);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("exits 2 with feedback when events.json is invalid", () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-hook-bad-"));
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([{ sport: "golf", title: "Missing time" }])
		);
		const r = runHook(
			hook,
			{ tool_name: "Write", tool_input: { file_path: "/x/docs/data/events.json" } },
			{ SPORTSYNC_DATA_DIR: dataDir, CLAUDE_PROJECT_DIR: process.cwd() }
		);
		expect(r.status).toBe(2);
		expect(r.stderr).toContain("failed validation");
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});
