# Agent Role Charter (v1)

Date: 2026-02-08  
Status: Draft  
Related:

1. `docs/OPENCLAW_ORCHESTRATION_ARCHITECTURE.md`
2. `docs/AUTONOMY_LOOP_BLUEPRINT.md`
3. `docs/TASK_CONTRACTS.md`
4. `docs/AUTOPILOT_POLICY.md`

## 1) Purpose

Define clear responsibilities, boundaries, and handoff contracts for the multi-agent swarm.

## 2) Global Rules

1. One-task-per-run policy.
2. No direct push to protected branches.
3. Every recommendation and code change must reference evidence artifacts.
4. Agents may only use approved tools in policy.
5. Any ambiguous or high-risk task is escalated.

## 3) Role Definitions

## 3.1 OpenClaw Orchestrator

Mission:

1. Start, route, and sequence agent runs.

Inputs:

1. Schedules and webhooks.
2. Runtime mode (`DRY_RUN`, `PR_ONLY`, `AUTO_MERGE_ELIGIBLE`).

Outputs:

1. `autonomy_run_report.json` with full execution trace.

Constraints:

1. Cannot override policy outcomes from deterministic gatekeeper.

## 3.2 Sensing Agent

Mission:

1. Build normalized state snapshot from telemetry and system signals.

Outputs:

1. `state_snapshot.json`

Quality bar:

1. Snapshot completeness >= 95% required fields.

## 3.3 Triaging Agent

Mission:

1. Convert snapshot into ranked candidate opportunities.

Outputs:

1. `candidate_tasks.json`

Constraints:

1. Must include confidence score and expected measurable impact per candidate.

## 3.4 Planning Agent

Mission:

1. Select one bounded task and generate execution plan.

Outputs:

1. `task_contract.json`

Constraints:

1. Must include rollback and verification strategy.

## 3.5 Coding Agent

Mission:

1. Implement planned change in scoped branch with tests.

Outputs:

1. Branch diff.
2. Test updates.
3. PR draft metadata.

Constraints:

1. Must stay inside allowlisted files and diff budgets.

## 3.6 Review Agent

Mission:

1. Critique code change for defects, regressions, and policy violations.

Outputs:

1. `review_report.json`

Constraints:

1. Must classify risk severity and confidence.

## 3.7 Release Agent

Mission:

1. Convert verification results into release decision proposal.

Outputs:

1. Decision: `REJECT`, `REQUIRES_HUMAN_REVIEW`, `CANARY_ALLOWED`, `AUTO_MERGE_ALLOWED`.

Constraints:

1. Decision is invalid if any mandatory gate failed.

## 3.8 Audit Agent

Mission:

1. Maintain tamper-evident run ledger and compliance trace.

Outputs:

1. `audit_log.jsonl`

Constraints:

1. Every tool invocation must be logged with timestamp and actor.

## 3.9 Source Scout Agent

Mission:

1. Discover candidate external data sources and coverage gaps.

Outputs:

1. `candidate_sources.json`

Constraints:

1. Must include legal/compliance flags and source metadata provenance.

## 3.10 Source QA Agent

Mission:

1. Validate source trials against quality and reliability criteria.

Outputs:

1. `source_trial_report.json`

Constraints:

1. Cannot promote source directly; can only recommend.

## 3.11 Source Integrator Agent

Mission:

1. Build or update connector in trial mode and run replay tests.

Outputs:

1. Trial connector patch and trial metrics.

Constraints:

1. Production source list cannot be changed without policy pass.

## 3.12 Source Promoter Agent

Mission:

1. Submit source promotion PR only when thresholds pass.

Outputs:

1. Promotion PR metadata and evidence bundle.

Constraints:

1. Must include demotion plan and rollback switch.

## 4) Handoff Contract

Every role handoff must include:

1. `runId`
2. `taskId`
3. `role`
4. `inputArtifactRefs`
5. `outputArtifactRef`
6. `confidence`
7. `blockingIssues`
8. `nextRole`

## 5) Role Ownership by Runtime Plane

1. Product runtime loop: Sensing, Triaging, Planning, Narrator/Coding-like publish role, QA, Audit.
2. Engineering loop: Sensing, Triaging, Planning, Coding, Review, Release, Audit.
3. Source expansion loop: Source Scout, Source Integrator, Source QA, Source Promoter, Audit.

## 6) Escalation Rules

Escalate immediately when:

1. Risk score exceeds policy threshold.
2. Protected files are touched.
3. CI or security gates fail.
4. Source legal/compliance classification is uncertain.
5. Cost budget cap is reached.

## 7) Phase-Based Authority

Phase `DRY_RUN`:

1. Agents produce artifacts only; no code writes.

Phase `PR_ONLY`:

1. Agents can branch and open PR.
2. Human merge required.

Phase `SELECTIVE_AUTO`:

1. Low-risk categories only.
2. Canary and rollback mandatory.

