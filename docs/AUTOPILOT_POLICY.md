# Autopilot Policy (v1)

Date: 2026-02-08  
Status: Draft  
Default mode: `PR_ONLY`  
Related:

1. `docs/AGENT_ROLE_CHARTER.md`
2. `docs/TASK_CONTRACTS.md`
3. `docs/OPENCLAW_ORCHESTRATION_ARCHITECTURE.md`

## 1) Policy Objective

Enable high-autonomy execution with low-autonomy governance.

## 2) Runtime Modes

1. `DRY_RUN`: no writes, no PRs.
2. `PR_ONLY`: branch + PR allowed, human merge required.
3. `SELECTIVE_AUTO`: low-risk auto-merge eligible only.

Initial required mode: `PR_ONLY`.

## 3) Hard Safety Rules

1. Never push directly to protected branches.
2. Never modify secrets or secret-handling config.
3. Never execute unrestricted shell in production loop.
4. Every run must include rollback strategy.
5. Any failed mandatory gate blocks release.

## 4) Allowed and Blocked Path Policy

Allowed by default (L2):

1. `docs/**`
2. `scripts/**`
3. `docs/js/**` (only if risk is low and tests pass)

Blocked by default:

1. `.env*`
2. `.git/**`
3. `.github/workflows/**`
4. `package-lock.json` (unless task explicitly allows dependency update)
5. Auth, billing, and deployment config paths unless explicitly approved

## 5) Diff Budget Policy

L2 default limits:

1. Max files changed: 8
2. Max added+removed lines: 400
3. Max new files: 5
4. Max delete operations: 0 unless task type explicitly allows

Exceeding limits forces `REQUIRES_HUMAN_REVIEW`.

## 6) Risk Categories

1. `LOW`: docs, test hardening, non-critical UI refinements.
2. `MEDIUM`: data logic changes, ranking adjustments.
3. `HIGH`: auth, deployment, infra, billing, schema-breaking changes.
4. `CRITICAL`: security-sensitive paths, destructive operations.

Default release mapping:

1. `LOW`: eligible for PR creation.
2. `MEDIUM`: PR creation + mandatory reviewer.
3. `HIGH` and `CRITICAL`: blocked unless explicitly approved pre-run.

## 7) Mandatory Checks

Every run must pass:

1. Relevant tests for changed area.
2. Schema/contract validation.
3. Lint/type checks where applicable.
4. Security scan.
5. Policy conformance check.

## 8) Source Expansion Policy

Source lifecycle states:

1. `CANDIDATE`
2. `TRIAL`
3. `PRODUCTION`
4. `DEGRADED`
5. `DISABLED`

Promotion rules:

1. Trial metrics meet thresholds for freshness, availability, and schema validity.
2. Compliance status is approved.
3. Baseline source fallback is configured.

Demotion rules:

1. Sustained threshold breach over configured observation window.
2. High conflict rate against trusted baseline.
3. Legal/compliance risk raised.

## 9) Budget and Cost Policy

1. Define per-run max cost cap.
2. Define daily total cost cap.
3. Stop new runs when cap reached.
4. Emit budget exhaustion alert with run summary.

## 10) Escalation Policy

Immediate escalation conditions:

1. Policy violation.
2. Critical gate failure.
3. Unexpected protected-file modification.
4. Source compliance uncertainty.
5. Repeated run failures beyond threshold.

Escalation outcome:

1. Set loop status to `PAUSED`.
2. Generate escalation report.
3. Require human resume action.

## 11) Auto-Merge Eligibility (Future L3)

Eligible only if all are true:

1. Risk level is `LOW`.
2. Diff budget within reduced auto-merge limit.
3. No blocked paths touched.
4. All checks pass.
5. Canary validation passes.

Otherwise default to `REQUIRES_HUMAN_REVIEW`.

## 12) Audit Requirements

Each run must record:

1. Who/what initiated run.
2. Tool calls and outputs.
3. Policy decisions and reasons.
4. Final disposition and timestamps.

Audit retention:

1. Minimum 90 days recommended.

