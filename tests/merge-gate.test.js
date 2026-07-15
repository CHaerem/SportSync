// merge-gate.js — the ONE shared enforcement of "protected paths are never
// auto-merged" for the three self-fixing loops (ui-fix, self-repair, improve).
import { describe, it, expect } from "vitest";
import { PROTECTED_PATHS, findProtectedPaths, pickLatestPr, runMergeGate } from "../scripts/merge-gate.js";

// A fake io that records every side effect the gate takes.
function fakeIo({ prs = [], files = [] } = {}) {
	const calls = { labels: [], runs: [], merged: [], checkedOut: [], outputs: {} };
	return {
		calls,
		log: () => {},
		listOpenPrs: () => prs,
		prFiles: () => files,
		addLabel: (n, label) => calls.labels.push([n, label]),
		checkoutPr: (n) => calls.checkedOut.push(n),
		run: (cmd, args) => calls.runs.push([cmd, ...args].join(" ")),
		merge: (n) => calls.merged.push(n),
		setOutput: (k, v) => (calls.outputs[k] = v),
	};
}

describe("findProtectedPaths", () => {
	it("blocks all five protected paths", () => {
		const blocked = [
			".github/workflows/static-pipeline.yml",
			".github/actions/setup/action.yml",
			"scripts/hooks/protect-interests.js",
			"scripts/config/interests.json",
			".claude/settings.json",
		];
		expect(findProtectedPaths(blocked)).toEqual(blocked);
		expect(PROTECTED_PATHS.length).toBe(5);
	});

	it("does not block safe paths, including near-misses", () => {
		expect(
			findProtectedPaths([
				"docs/css/cards.css",
				"scripts/fetch/golf.js",
				"scripts/agents/research.md",
				"scripts/config/tracked.json", // AI-managed, not interests
				".claude/skills/norwegian-rights/SKILL.md", // skills are agent-editable
				"tests/interests-schema.test.js",
				"package.json",
			]),
		).toEqual([]);
	});
});

describe("pickLatestPr", () => {
	it("picks the newest PR matching the branch prefix", () => {
		const prs = [
			{ number: 3, headRefName: "ui-autofix/20260701-0900" },
			{ number: 9, headRefName: "self-repair/20260713-0630" },
			{ number: 7, headRefName: "ui-autofix/20260713-0900" },
		];
		expect(pickLatestPr(prs, "ui-autofix/").number).toBe(7);
		expect(pickLatestPr(prs, "improve/")).toBeNull();
		expect(pickLatestPr([], "ui-autofix/")).toBeNull();
	});
});

describe("runMergeGate", () => {
	const pr = [{ number: 42, headRefName: "self-repair/20260714-0630" }];

	it("no matching PR → merged=false, nothing touched", () => {
		const io = fakeIo({ prs: [] });
		const res = runMergeGate({ prefix: "ui-autofix/" }, io);
		expect(res).toMatchObject({ merged: false, reason: "no-pr" });
		expect(io.calls.outputs.merged).toBe("false");
		expect(io.calls.merged).toEqual([]);
		expect(io.calls.runs).toEqual([]);
	});

	it("a PR touching a protected path stays OPEN with needs-review (never merged)", () => {
		const io = fakeIo({ prs: pr, files: ["scripts/lib/helpers.js", ".github/workflows/scout-agent.yml"] });
		const res = runMergeGate({ prefix: "self-repair/" }, io);
		expect(res.merged).toBe(false);
		expect(res.reason).toBe("protected-path");
		expect(res.blocked).toEqual([".github/workflows/scout-agent.yml"]);
		expect(io.calls.labels).toEqual([[42, "needs-review"]]);
		expect(io.calls.merged).toEqual([]);
		expect(io.calls.runs).toEqual([]); // not even test-gated — it simply waits for a human
		expect(io.calls.outputs.merged).toBe("false");
	});

	it("a safe PR is re-gated (npm ci + npm test) and auto-merged", () => {
		const io = fakeIo({ prs: pr, files: ["scripts/fetch/golf.js", "docs/css/cards.css"] });
		const res = runMergeGate({ prefix: "self-repair/" }, io);
		expect(res.merged).toBe(true);
		expect(io.calls.checkedOut).toEqual([42]);
		expect(io.calls.runs).toEqual(["npm ci", "npm test"]);
		expect(io.calls.merged).toEqual([42]);
		expect(io.calls.labels).toEqual([]);
		expect(io.calls.outputs.merged).toBe("true");
	});

	it("--validate-events adds the events contract to the gate", () => {
		const io = fakeIo({ prs: pr, files: ["scripts/build-events.js"] });
		runMergeGate({ prefix: "self-repair/", validateEvents: true }, io);
		expect(io.calls.runs).toEqual(["npm ci", "npm test", "node scripts/validate-events.js"]);
	});

	it("a failing gate command propagates (PR stays open, no merge)", () => {
		const io = fakeIo({ prs: pr, files: ["scripts/fetch/golf.js"] });
		io.run = (cmd, args) => {
			if (args[0] === "test") throw new Error("tests failed");
		};
		expect(() => runMergeGate({ prefix: "self-repair/" }, io)).toThrow("tests failed");
		expect(io.calls.merged).toEqual([]);
		expect(io.calls.outputs.merged).toBeUndefined(); // step fails loudly instead
	});
});
