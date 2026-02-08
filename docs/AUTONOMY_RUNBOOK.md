# Autonomy Runbook (v1)

Date: 2026-02-08  
Status: Draft  
Related:

1. `docs/AUTOPILOT_POLICY.md`
2. `docs/TASK_CONTRACTS.md`
3. `docs/AGENT_ROLE_CHARTER.md`

## 1) Purpose

Operational runbook for running, monitoring, pausing, and recovering the autonomous agent system.

## 2) Operating Modes

1. `DRY_RUN`: validation mode, no repository writes.
2. `PR_ONLY`: autonomous branch and PR creation.
3. `SELECTIVE_AUTO`: limited auto-merge for approved low-risk tasks.

## 3) Preflight Checklist

Before enabling any run:

1. Policy files are present and current.
2. Required checks are green in CI.
3. Budget caps are configured.
4. Audit logging is active.
5. Protected path denylist is loaded.
6. Rollback mechanism is tested.

## 4) Standard Daily Run Procedure

1. Orchestrator starts run and creates `runId`.
2. Sensing Agent emits `state_snapshot.json`.
3. Triaging Agent emits `candidate_tasks.json`.
4. Planning Agent emits one approved `task_contract.json`.
5. Coding Agent executes task within scope.
6. Review Agent produces `review_report.json`.
7. Deterministic checks execute and persist outputs.
8. Release Agent assigns policy outcome.
9. Audit Agent records final run report.

## 5) Source Expansion Weekly Procedure

1. Scout discovers candidates and emits `candidate_sources.json`.
2. Planner selects one source trial task.
3. Integrator runs sandbox trial and replay checks.
4. Source QA emits `source_trial_report.json`.
5. Promotion decision follows policy gates.

## 6) Incident Response Matrix

## 6.1 Policy Violation

Action:

1. Pause all autonomous runs.
2. Mark current run as `ESCALATED`.
3. Open incident ticket with evidence bundle.

## 6.2 CI Gate Failure

Action:

1. Reject release outcome.
2. Attach failing check details to run report.
3. Queue remediation candidate for future run.

## 6.3 Suspected Regression After Merge

Action:

1. Trigger rollback plan.
2. Set runtime mode to `DRY_RUN`.
3. Require human review before resume.

## 6.4 Budget Exhaustion

Action:

1. Stop new runs.
2. Send budget alert report.
3. Resume only after cap update or next period reset.

## 7) Pause and Resume Procedure

Pause:

1. Set global autonomy status to `PAUSED`.
2. Cancel queued runs.
3. Preserve artifact and audit logs.

Resume:

1. Confirm root cause resolved.
2. Run one `DRY_RUN` smoke execution.
3. Resume `PR_ONLY` mode first.

## 8) Rollback Procedure

1. Execute rollback strategy from task contract.
2. Confirm baseline service health restored.
3. Tag incident with rollback duration and impact.
4. Create follow-up hardening task.

## 9) Required Alerts

1. Run failed.
2. Policy violation.
3. Protected path touched.
4. CI required check failed.
5. Budget threshold reached.
6. Source quality drop below threshold.

## 10) Post-Run Review

For each completed run, capture:

1. Objective achieved vs expected.
2. Risk score vs actual outcome.
3. Check stability and flakiness observations.
4. Cost per run and per successful change.
5. Any policy updates needed.

## 11) Weekly Governance Review

1. Review acceptance/rejection patterns.
2. Review regressions and rollback incidents.
3. Review source trial outcomes.
4. Adjust policy thresholds cautiously.

## 12) Post-Incident Template

1. Incident ID and timestamp.
2. Trigger condition.
3. Impact summary.
4. Root cause.
5. Immediate remediation.
6. Long-term prevention actions.
7. Owner and due date.

