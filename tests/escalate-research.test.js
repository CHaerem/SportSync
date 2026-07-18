// escalate-research.js — the decoupled dispatch that scout/coverage-critic REQUEST
// via an `escalate.request` sentinel (WP-91). Network-free: we only exercise the
// no-op path, which never shells out to `gh`.
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const script = path.resolve(process.cwd(), "scripts", "escalate-research.js");

function run(cwd, env = {}) {
	return spawnSync("node", [script, "coverage-critic"], {
		cwd,
		encoding: "utf-8",
		env: { ...process.env, ...env },
	});
}

describe("escalate-research.js", () => {
	it("no-ops (exit 0, never touches gh) when no escalate.request exists", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "escalate-"));
		const r = run(dir, { ESCALATE_REQUEST_FILE: path.join(dir, "escalate.request") });
		expect(r.status).toBe(0);
		expect(r.stdout).toContain("did not request an escalation");
	});

	it("the script file exists and is referenced by the escalating workflows", () => {
		expect(fs.existsSync(script)).toBe(true);
		for (const f of ["scout-agent.yml", "coverage-critic-agent.yml"]) {
			const wf = fs.readFileSync(path.resolve(".github", "workflows", f), "utf-8");
			expect(wf, `${f} must invoke the decoupled escalate step`).toContain("node scripts/escalate-research.js");
			expect(wf, `${f} must grant issues:write for the alarm`).toContain("issues: write");
		}
	});
});
