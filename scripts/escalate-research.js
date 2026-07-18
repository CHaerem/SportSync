#!/usr/bin/env node
// Performs the research-agent escalation that scout / coverage-critic REQUEST.
//
// Why this exists (WP-91): the agents run inside `anthropics/claude-code-action`,
// which swaps GITHUB_TOKEN for an OIDC-exchanged Claude GitHub App installation
// token ("Using GITHUB_TOKEN from OIDC" in the run logs). That app token does NOT
// carry `actions: write`, so a `gh workflow run research-agent.yml` issued FROM
// INSIDE the agent is rejected with HTTP 403 "Resource not accessible by
// integration" — regardless of the workflow's `permissions: actions: write` block,
// which only governs the default token the action discarded. Every escalation
// since 2026-07-04 died this way, silently, in a coverage-audit notes field.
//
// The fix decouples the DECISION (the agent's) from the DISPATCH (ours): the agent
// writes an `escalate.request` sentinel (its tier on one line) and this script —
// invoked as a plain workflow step with the job's real GITHUB_TOKEN — performs the
// dispatch. If the dispatch fails, it raises/updates a GitHub issue labelled
// `escalation-failed` so the next regression is LOUD, never a silent notes field.

import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";

const agent = process.argv[2] || "agent";
const REQUEST = process.env.ESCALATE_REQUEST_FILE || "escalate.request";
const LABEL = "escalation-failed";
const WORKFLOW = "research-agent.yml";

const gh = (args) => spawnSync("gh", args, { encoding: "utf-8" });

if (!existsSync(REQUEST)) {
	console.log(`No ${REQUEST} — ${agent} did not request an escalation. Nothing to do.`);
	process.exit(0);
}

let tier = readFileSync(REQUEST, "utf-8").trim().split(/\s+/)[0] || "deep";
if (tier !== "deep" && tier !== "standard") tier = "deep";

console.log(`${agent} requested escalation → dispatching ${WORKFLOW} (tier=${tier})`);
const run = gh(["workflow", "run", WORKFLOW, "-f", `tier=${tier}`]);

if (run.status === 0) {
	console.log(`Escalation dispatched. ${(run.stdout || "").trim()}`);
	// Fast lane works again — resolve any open alarm so it doesn't linger.
	const open = gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number", "--jq", ".[].number"]);
	for (const n of (open.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean)) {
		gh(["issue", "close", n, "-c", `Escalation succeeded from \`${agent}\` — fast lane restored.`]);
	}
	process.exit(0);
}

// Dispatch failed — make it loud instead of burying it in a notes field.
const err = `${(run.stderr || "").trim()}\n${(run.stdout || "").trim()}`.trim();
console.error(`Escalation dispatch FAILED for ${agent}:\n${err}`);

const title = `Escalation to research is failing (${WORKFLOW} dispatch)`;
const body = [
	`\`${agent}\` tried to escalate to the research agent but the \`gh workflow run ${WORKFLOW}\` dispatch failed.`,
	"",
	"```",
	err || "(no output)",
	"```",
	"",
	"Likely causes: the job's GITHUB_TOKEN lacks `actions: write`, or the repo",
	"setting *Actions → General → Workflow permissions* is Read-only and caps the",
	"per-workflow grant. The workflow already declares `permissions: actions: write`;",
	"if it still fails, flip the repo default to Read/Write **or** add a fine-grained",
	"PAT secret with `actions: write` and pass it as `GH_TOKEN` to the escalate step.",
	"See WP-91.",
	"",
	`_Raised automatically by scripts/escalate-research.js on ${new Date().toISOString()}._`,
].join("\n");

// Reuse a single open alarm instead of spamming a new issue per failed run.
const existing = gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number", "--jq", ".[0].number"]);
const num = (existing.stdout || "").trim();
if (num) {
	gh(["issue", "comment", num, "-b", body]);
	console.error(`Updated existing alarm #${num} (${LABEL}).`);
} else {
	// Ensure the label exists (--force = create-or-update, tolerates "already exists").
	gh(["label", "create", LABEL, "--color", "B60205", "--description", "A scout/coverage-critic escalation dispatch failed", "--force"]);
	const created = gh(["issue", "create", "--title", title, "--body", body, "--label", LABEL]);
	console.error(`Opened alarm issue: ${(created.stdout || "").trim()}`);
}

// Don't fail the whole job: the audit/log the agent produced is still valuable, and
// the labelled issue already carries the alarm. Failing here would only re-bury the
// signal under a red run the way the push-auth bug did.
process.exit(0);
