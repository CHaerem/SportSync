# Task Contracts (v1)

Date: 2026-02-08  
Status: Draft  
Related:

1. `docs/AGENT_ROLE_CHARTER.md`
2. `docs/AUTOPILOT_POLICY.md`
3. `docs/OPENCLAW_ORCHESTRATION_ARCHITECTURE.md`

## 1) Purpose

Define strict machine-readable contracts for autonomous tasks so all agents operate with consistent scope, evidence, and acceptance criteria.

## 2) Contract Lifecycle

1. `PROPOSED`
2. `APPROVED_FOR_RUN`
3. `IN_PROGRESS`
4. `VERIFYING`
5. `COMPLETED`
6. `FAILED`
7. `ESCALATED`

## 3) Task Types

1. `code_improvement`
2. `reliability_fix`
3. `performance_optimization`
4. `test_hardening`
5. `documentation_update`
6. `source_discovery`
7. `source_trial`
8. `source_promotion`
9. `source_demotion`

## 4) Canonical Task Contract Schema

```json
{
  "taskId": "task_YYYYMMDD_xxx",
  "runId": "run_YYYYMMDD_xxx",
  "taskType": "code_improvement",
  "status": "APPROVED_FOR_RUN",
  "title": "Short imperative title",
  "objective": "Measurable expected outcome",
  "businessRationale": "Why this matters",
  "scope": {
    "allowedPaths": ["docs/**", "scripts/**"],
    "blockedPaths": [".github/workflows/**", ".env*"],
    "maxFilesChanged": 8,
    "maxLinesChanged": 400
  },
  "risk": {
    "level": "low|medium|high|critical",
    "category": "ux|data|infra|security|source",
    "blastRadius": "small|medium|large"
  },
  "verificationPlan": {
    "requiredChecks": ["unit", "integration", "schema", "security_scan"],
    "acceptanceCriteria": ["criterion1", "criterion2"],
    "nonRegressionFocus": ["risk area 1"]
  },
  "rollbackPlan": {
    "strategy": "revert_pr",
    "maxRollbackTimeMinutes": 15
  },
  "evidenceInputs": ["artifact://state_snapshot.json"],
  "assumptions": ["explicit assumptions"],
  "ownerRole": "PlanningAgent",
  "nextRole": "CodingAgent"
}
```

## 5) Required Fields by Type

`source_trial` must include:

1. `trialDurationDays`
2. `coverageTargets`
3. `qualityThresholds`
4. `complianceAssessmentRef`

`source_promotion` must include:

1. `sourceTrialReportRef`
2. `promotionThresholdsPassed`
3. `fallbackSource`

`code_improvement` and `reliability_fix` must include:

1. `expectedMetricDelta`
2. `testStrategyRef`

## 6) Risk Scoring Contract

```json
{
  "riskScore": 0,
  "riskInputs": {
    "filesTouchedWeight": 0,
    "sensitivePathWeight": 0,
    "runtimeImpactWeight": 0,
    "testCoverageWeight": 0,
    "historicalFailureWeight": 0
  },
  "policyOutcome": "REQUIRES_HUMAN_REVIEW"
}
```

## 7) Evidence Contract

Every task must attach evidence:

1. Baseline metric snapshot.
2. Source references for claims.
3. Test and check output references.
4. Before/after diff summary.

Minimum evidence object:

```json
{
  "evidenceId": "evid_xxx",
  "taskId": "task_xxx",
  "kind": "metric|test|source|diff",
  "uri": "artifact://...",
  "summary": "one-line explanation",
  "timestamp": "ISO-8601"
}
```

## 8) PR Contract

PR metadata must include:

1. `taskId`
2. `riskLevel`
3. `checksPassed`
4. `policyOutcome`
5. `rollbackPlan`
6. `expectedImpact`
7. `evidenceRefs`

## 9) Source Trial Contract

Required metrics:

1. Freshness lag.
2. Event coverage rate.
3. Schema validity rate.
4. Conflict rate vs baseline sources.
5. Availability over trial window.

Promotion requires:

1. All mandatory quality thresholds pass.
2. Compliance classification approved.
3. Fallback source exists.

## 10) Rejection Contract

If rejected, output:

1. `rejectionReasonCode`
2. `failedGate`
3. `recommendedRemediation`
4. `canRetry` boolean
5. `retryAfter` timestamp (if applicable)

## 11) Contract Storage

Recommended artifact locations:

1. `artifacts/runs/<runId>/task_contract.json`
2. `artifacts/runs/<runId>/review_report.json`
3. `artifacts/runs/<runId>/autonomy_run_report.json`
4. `artifacts/runs/<runId>/source_trial_report.json`

