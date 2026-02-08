# Autonomous LLM Loop Blueprint (v1)

Date: 2026-02-08  
Status: Draft  
Related: `docs/OPENCLAW_ORCHESTRATION_ARCHITECTURE.md`

## 1) Purpose

Define a generic, service-agnostic autonomous LLM system that can:

1. Observe a running product.
2. Decide high-impact improvements.
3. Implement code changes.
4. Validate changes.
5. Deploy safely.
6. Learn from outcomes and iterate.
7. Expand and maintain external data source coverage.

SportSync is the first testbed, not the long-term limitation.

## 2) Core Thesis

A "fully autonomous" coding system is feasible only when autonomy is bounded by strict policy, deterministic checks, and rollback controls.

Autonomy should be viewed as:

1. High autonomy in execution.
2. Low autonomy in governance and safety boundaries.

## 3) Difficulty Assessment

Practical difficulty by scope:

1. Narrow and constrained autopilot: medium difficulty.
2. Cross-component product iteration: high difficulty.
3. Open-ended, ungated full autonomy: very high risk, not production-safe.

Main hard problems:

1. Reliable task selection (choosing what to improve).
2. Long-horizon consistency (multi-step architectural decisions).
3. Validation completeness (tests do not cover all regressions).
4. Reward hacking (agent optimizes metrics but hurts UX).
5. Safety in code + infrastructure + data access.
6. Source quality drift and legal/compliance constraints.

## 4) Autonomy Levels (L0-L5)

L0: Manual

1. Human writes and deploys all code.

L1: Assisted

1. Agent proposes patches.
2. Human always decides and merges.

L2: Guarded Autopilot

1. Agent opens PRs automatically.
2. Strict CI/policy gates.
3. Human approval required for merge.

L3: Conditional Auto-Merge

1. Low-risk PRs can merge automatically.
2. Risk-scored policy engine controls eligibility.
3. Automatic canary and rollback required.

L4: Domain Autonomous

1. Agent runs end-to-end within explicit domain boundaries.
2. Human intervenes only on escalations.

L5: Broad Fully Autonomous

1. Open-ended product/infra autonomy.
2. Not recommended for production with current reliability constraints.

Recommended target for this project: start at L2, then selective L3.

## 5) System Architecture

Control loop:

`Observe -> Diagnose -> Plan -> Execute -> Verify -> Deploy -> Learn`

### 5.1 Observe

Inputs:

1. Usage analytics.
2. Error logs and alerts.
3. Data freshness metrics.
4. Performance metrics.
5. User feedback text.

Output:

1. Structured state snapshot for decision making.

### 5.2 Diagnose

Agent identifies top issues/opportunities:

1. Reliability.
2. UX friction.
3. Performance bottlenecks.
4. Data quality gaps.
5. Feature opportunities.

Output:

1. Ranked candidate backlog with confidence score.

### 5.3 Plan

Planner generates:

1. One selected task.
2. Proposed change scope.
3. Expected measurable outcome.
4. Test strategy.
5. Rollback strategy.

### 5.4 Execute

Coder agent:

1. Creates branch.
2. Applies patch.
3. Adds/updates tests.
4. Runs local checks.
5. Opens PR with rationale and risk score.

### 5.5 Verify

Deterministic gates:

1. Unit/integration/e2e tests.
2. Lint and type checks.
3. Contract/schema validation.
4. Visual regression snapshots.
5. Performance budget checks.
6. Security and secrets scan.

### 5.6 Deploy

Policy engine chooses:

1. Reject.
2. Manual review required.
3. Canary deploy.
4. Safe auto-merge (only if low risk and all checks pass).

### 5.7 Learn

Post-deploy:

1. Compare expected vs actual impact.
2. Record success/failure patterns.
3. Update task-priority heuristics.

## 6) Agent Roles

1. Sensing Agent: builds unified state snapshot.
2. Triaging Agent: ranks opportunities.
3. Planning Agent: produces bounded execution plan.
4. Coding Agent: implements change and tests.
5. Review Agent: critiques diff and finds risk.
6. Release Agent: controls deploy path.
7. Audit Agent: logs every decision/action.
8. Source Scout Agent: discovers and proposes new data sources.
9. Source QA Agent: validates source reliability, freshness, and schema quality.

## 7) Safety and Policy Design

Hard policies:

1. No direct pushes to protected branches.
2. No modifications to secrets or credentials.
3. No workflow/deploy config edits without explicit allow.
4. Max changed files and max diff size per run.
5. Mandatory rollback recipe in every autonomous PR.

Runtime sandbox:

1. Ephemeral environment per run.
2. Least-privilege tokens.
3. Domain allowlist for outbound network.
4. Immutable base image and reproducible build.

## 8) Generic Provider Layer

The autonomy loop should not depend on one LLM vendor.

Use a provider-neutral interface:

```ts
interface AgentModelProvider {
  reason(task, context): Promise<ReasoningOutput>;
  code(task, repoContext): Promise<CodePatch>;
  review(diff, tests): Promise<ReviewReport>;
}
```

Provider adapters:

1. OpenAI
2. Anthropic
3. OpenClaw gateway (or other orchestrator)

Routing strategy:

1. Default provider per role.
2. Fallback on timeout/errors.
3. Cost cap and latency SLO guardrail.

## 9) Minimal Viable Autonomy Stack

To reach useful autonomy fast:

1. One repo.
2. One daily loop.
3. One change per run.
4. One measurable objective per change.
5. One safe deployment path.

This avoids false complexity while proving viability.

## 10) Evaluation Framework

### 10.1 Autonomy KPIs

1. Autonomous PRs created per week.
2. PR acceptance rate.
3. Post-merge regression rate.
4. Mean rollback frequency.
5. Time-to-detect and time-to-recover.

### 10.2 Product KPIs

1. User engagement lift.
2. Error reduction.
3. Performance improvements.
4. Task success outcomes.

### 10.3 Cost KPIs

1. Cost per successful autonomous change.
2. Cost per rejected PR.
3. Token use by agent role.

## 11) Failure Modes and Mitigations

1. Hallucinated assumptions
   - Mitigation: mandatory source references and strict tests.
2. Risky broad diffs
   - Mitigation: capped diff size and scope allowlist.
3. Metric gaming
   - Mitigation: multi-objective scorecard, not single metric.
4. Silent quality decay
   - Mitigation: baseline snapshots and periodic human audits.
5. Cost runaway
   - Mitigation: per-run and per-day budget hard limits.

## 12) Phased Adoption Plan

Phase A (2-4 weeks): L2 foundation

1. Autonomous PR generation only.
2. Human merge always required.
3. Full policy and audit in place.

Phase B (4-8 weeks): selective L3

1. Auto-merge only for low-risk categories.
2. Canary + rollback automation enabled.

Phase C (ongoing): domain L4 trial

1. Expand low-risk domain boundaries gradually.
2. Keep explicit "never-touch" zones and escalation paths.
3. Include guarded autonomous source onboarding and demotion.

## 13) What "Fully Autonomous" Means Here

Operational definition:

1. System independently detects opportunities.
2. System ships safe improvements within approved policy.
3. Human is mostly governor, not operator.

Non-goal:

1. Unbounded autonomy without policy constraints.
2. Automatic source promotion without quality and compliance gates.

## 14) Immediate Next Steps

1. Approve target autonomy level for first implementation (recommended: L2).
2. Define low-risk change categories for autopilot (UI copy, small UX, telemetry, tests, docs).
3. Define protected zones (deploy, secrets, infra, auth).
4. Define first 5 KPIs and baseline values.
5. Build first daily loop in dry-run mode before real PR mode.
