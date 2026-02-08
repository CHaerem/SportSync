# OpenClaw-Orchestrated Autonomy Architecture (v1)

Date: 2026-02-08  
Status: Draft  
Related:

1. `docs/AUTONOMY_LOOP_BLUEPRINT.md`
2. `docs/PROJECT_BLUEPRINT.md`

## 1) Intent

Define a concrete architecture where OpenClaw is the orchestration and agent runtime layer for:

1. Product runtime intelligence loops (live summaries, prioritization, Q&A orchestration).
2. Engineering autonomy loops (detect issue -> propose fix -> patch -> verify -> PR).
3. Source expansion loops (discover and onboard new data providers safely).

This architecture is provider-agnostic and service-agnostic.

## 2) Architectural Positioning

OpenClaw is responsible for:

1. Agent session lifecycle.
2. Triggering and scheduling (`cron` and `webhook` entry points).
3. Routing model/tool calls through configured providers.
4. Coordinating multi-step agent workflows.

OpenClaw is not the source of truth for:

1. Raw sports/event data.
2. Code validation results.
3. Merge/deploy governance.

Those remain deterministic systems.

## 3) High-Level Topology

```text
                           +---------------------------+
                           |       OpenClaw Core       |
                           |  Sessions / Queue / Tools |
                           +------------+--------------+
                                        |
                      +-----------------+------------------+------------------+
                      |                                    |                  |
          +-----------v----------+              +----------v-----------+ +----v----------------+
          | Product Runtime Loop |              | Engineering Loop     | | Source Expansion     |
          | (Live Ops Agents)    |              | (Coding Autopilot)   | | Loop                |
          +-----------+----------+              +----------+-----------+ +----+----------------+
                      |                                    |                  |
      +---------------+--------------+          +----------+------------+     |
      |                              |          |                       |     |
+-----v--------+             +-------v------+   +-----v------+   +------v------+ +-------------------+
| Data Workers |             | UI Artifacts |   | CI/Gates   |   | Git Provider | | Source Registry   |
| Fetch/Norm   |             | live-feed    |   | Tests/Perf |   | PR Workflow   | | + Trial Sandboxes |
+--------------+             +--------------+   +------------+   +-------------+ +-------------------+
```

## 4) Runtime Planes

### 4.1 Product Runtime Plane

Goal:

1. Keep user-facing context fresh, minimal, and prioritized.

Loop cadence:

1. Trigger every 1-5 minutes depending on sport/source.

Steps:

1. Collector retrieves normalized current state from deterministic data store.
2. Prioritizer ranks events using deterministic + LLM signals.
3. Narrator generates one-sentence top summary and "why now" annotations.
4. QA checker validates schema, confidence, and source references.
5. Publisher writes `live-feed.json` and event detail artifacts.

### 4.2 Engineering Autonomy Plane

Goal:

1. Continuously improve codebase via safe, bounded autonomous runs.

Loop cadence:

1. Daily baseline run.
2. Optional event-triggered runs on incidents/regressions.

Steps:

1. Observer gathers telemetry, errors, and backlog candidates.
2. Planner picks one bounded task with measurable objective.
3. Coder creates branch, patch, tests, and PR draft.
4. CI verifies deterministic gates.
5. Review/Release logic determines reject/manual/auto (by policy).

### 4.3 Source Expansion Plane

Goal:

1. Continuously expand and improve data coverage without degrading quality.

Loop cadence:

1. Weekly discovery run.
2. Event-triggered run when coverage gaps are detected.

Steps:

1. Scout identifies candidate data sources for missing events/sports/stats.
2. Evaluator scores candidates by reliability, freshness, coverage, legal constraints, and integration effort.
3. Integrator creates trial connector in sandbox and runs historical replay tests.
4. QA gate compares trial output quality vs baseline sources.
5. Promoter proposes PR to add source config/adapter only if acceptance thresholds pass.

## 5) Component Boundaries

OpenClaw components:

1. Orchestration workflows.
2. Agent role prompts and tool wiring.
3. Model provider routing and fallback policies.
4. Job scheduling and webhook entrypoints.
5. Source discovery and qualification workflows.

External deterministic components:

1. Data fetchers and normalizers.
2. Schema validators and contract checks.
3. Test runners and performance checks.
4. Version control + PR + branch protection.
5. Deployment and rollback pipeline.
6. Source registry and source quality store.

## 6) Tooling Contract for Agents

Agents should only use bounded tools.

Minimum tool set:

1. `read_state_snapshot` (read-only runtime metrics/context).
2. `propose_task` (ranked bounded task candidates).
3. `apply_patch_in_branch` (scoped code edits only).
4. `run_checks` (invoke deterministic CI commands).
5. `create_pr` (structured PR output with risk metadata).
6. `publish_live_artifact` (schema-validated output publish).
7. `discover_candidate_sources` (read-only external source catalog/search).
8. `run_source_trial` (sandboxed connector replay + metrics).
9. `update_source_registry` (propose source status transitions).

No unrestricted shell tool should be exposed in production loops.

## 7) Data and Artifact Contracts

Required artifacts:

1. `state_snapshot.json`: canonical observation state.
2. `candidate_tasks.json`: ranked improvement opportunities.
3. `autonomy_run_report.json`: plan, changes, checks, decision.
4. `live-feed.json`: UI summary feed for pulse home.
5. `event/{id}.json`: drilldown detail payload.
6. `candidate_sources.json`: discovered and scored source candidates.
7. `source_trial_report.json`: trial metrics and promotion recommendation.

Every artifact should include:

1. `runId`
2. `timestamp`
3. `inputsVersion`
4. `modelProvider`
5. `confidence`

## 8) Governance and Policy Engine

Policy outcome enum:

1. `REJECT`
2. `REQUIRES_HUMAN_REVIEW`
3. `CANARY_ALLOWED`
4. `AUTO_MERGE_ALLOWED`

Policy inputs:

1. Changed files and diff size.
2. Risk category label.
3. CI pass/fail matrix.
4. Historical reliability score of agent/run type.
5. Runtime blast radius estimate.
6. Source trust score and legal/compliance classification.

## 9) Security Model

Execution security:

1. Ephemeral sandbox runtime per agent run.
2. Least-privilege credentials and short TTL tokens.
3. Explicit outbound network allowlist.
4. Filesystem allowlist and protected path denylist.

Operational security:

1. Mandatory audit logging for all tool calls.
2. Tamper-evident run reports.
3. Automatic secret scanning in CI.
4. Prompt-injection resistant tool design (no blind execution).

## 10) Model Provider Strategy

Provider abstraction:

1. OpenClaw calls a provider-neutral adapter interface.
2. Each agent role can have a default provider/model.
3. Fallback provider used on timeout/error/SLO violation.

Routing policy:

1. Fast and lower-cost model for triage/planning drafts.
2. Higher-capability model for coding/review when needed.
3. Hard per-run and per-day budget caps.

## 11) Failure Handling

Common failure classes:

1. Data unavailable or stale.
2. Model timeout or degraded quality.
3. Check failures or flaky tests.
4. Unsafe diff classification.
5. Low-quality or unstable new data source.

Handling strategy:

1. Retry within bounded attempts.
2. Fallback provider/model.
3. Degrade gracefully to deterministic summary.
4. Escalate to human review with structured failure report.
5. Keep new sources in trial state until quality SLOs pass.

## 12) Rollout Plan

Phase 1: Dry-run orchestration

1. OpenClaw runs full decision loop.
2. No code writes, no PR creation.
3. Validate outputs and decision quality.

Phase 2: PR-only autopilot (L2)

1. Agent can create bounded PRs.
2. Human approval required.
3. Strict policy and CI gates enforced.

Phase 3: Selective auto-merge (L3 subset)

1. Only low-risk categories eligible.
2. Canary and rollback mandatory.
3. Continuous metric audit.

Phase 4: Autonomous source expansion (guarded)

1. Agents can propose new sources and trial connectors automatically.
2. Promotion to production source list remains policy-gated.
3. Automatic demotion/disable on sustained quality regressions.

## 13) Initial ADR Decisions

1. OpenClaw is the orchestrator, not validator or deploy authority.
2. Deterministic systems own truth, tests, and merge decisions.
3. Start at autonomy level L2 before any L3 experiment.
4. One-task-per-run policy to control blast radius.
5. Provider abstraction is mandatory from day one.
6. New source onboarding is first-class in autonomy loop.

## 14) Open Questions

1. Which low-risk change categories are allowed in first L2 iteration?
2. What is the exact protected-file denylist?
3. What daily budget cap should block further runs?
4. Which metrics are mandatory for run quality scoring?
5. What escalation SLA is acceptable for failed autonomous runs?
6. What acceptance thresholds promote a trial source to production?
