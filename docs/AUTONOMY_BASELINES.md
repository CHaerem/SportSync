# Autonomy Baselines (v1)

Date: 2026-02-08  
Status: Draft  
Related:

1. `docs/AUTONOMY_LOOP_BLUEPRINT.md`
2. `docs/OPENCLAW_ORCHESTRATION_ARCHITECTURE.md`
3. `docs/AUTOPILOT_POLICY.md`

## 1) Purpose

Define baseline metrics, formulas, data sources, and target ranges for evaluating autonomous loop quality, safety, and cost.

## 2) Baseline Capture Window

Recommended baseline period:

1. First 14 days in `DRY_RUN`.
2. First 14 days in `PR_ONLY`.

Comparisons should be mode-aware.

## 3) Safety Metrics

1. `policy_violation_rate`
   - Formula: violations / total runs
   - Baseline: `TBD`
   - Target: < 1%
2. `protected_path_touch_rate`
   - Formula: runs touching blocked paths / total runs
   - Baseline: `TBD`
   - Target: 0%
3. `critical_incident_count`
   - Formula: count per week
   - Baseline: `TBD`
   - Target: 0

## 4) Quality Metrics

1. `post_merge_regression_rate`
   - Formula: regressions / merged autonomous PRs
   - Baseline: `TBD`
   - Target: < 5%
2. `check_pass_rate`
   - Formula: runs with all required checks passing / total runs
   - Baseline: `TBD`
   - Target: > 90%
3. `rollback_frequency`
   - Formula: rollbacks / merged autonomous PRs
   - Baseline: `TBD`
   - Target: < 3%

## 5) Throughput Metrics

1. `autonomous_prs_per_week`
   - Baseline: `TBD`
   - Target: 3 to 10 in `PR_ONLY`
2. `pr_acceptance_rate`
   - Formula: merged autonomous PRs / opened autonomous PRs
   - Baseline: `TBD`
   - Target: > 60%
3. `median_time_to_pr`
   - Formula: median minutes from run start to PR created
   - Baseline: `TBD`
   - Target: mode-specific

## 6) Cost Metrics

1. `cost_per_run_usd`
   - Baseline: `TBD`
2. `cost_per_merged_change_usd`
   - Baseline: `TBD`
3. `daily_budget_utilization_pct`
   - Baseline: `TBD`
   - Target: <= 100%
4. `token_usage_by_role`
   - Baseline: `TBD` per role

## 7) Source Expansion Metrics

1. `source_trial_success_rate`
   - Formula: successful trials / total trials
   - Baseline: `TBD`
2. `source_promotion_rate`
   - Formula: promoted sources / completed trials
   - Baseline: `TBD`
3. `source_demotion_rate`
   - Formula: demoted sources / production sources
   - Baseline: `TBD`
4. `source_freshness_lag_minutes`
   - Baseline: `TBD`
5. `source_schema_validity_rate`
   - Baseline: `TBD`

## 8) Product Metrics (Testbed-Specific)

1. `time_to_overview_seconds`
   - Baseline: `TBD`
   - Target: < 15s
2. `live_card_engagement_rate`
   - Baseline: `TBD`
3. `copilot_usefulness_score`
   - Baseline: `TBD`
4. `multi_site_check_reduction`
   - Baseline: `TBD`

## 9) Data Collection Sources

1. Run artifacts and audit logs.
2. CI check outputs.
3. PR metadata and merge results.
4. Runtime telemetry and product analytics.
5. Source trial reports.

## 10) Reporting Cadence

1. Daily run summary.
2. Weekly governance review.
3. Monthly policy and threshold recalibration.

## 11) Baseline Table Template

```text
Metric                           Baseline   Current   Target   Status
policy_violation_rate            TBD        TBD       <1%      TBD
post_merge_regression_rate       TBD        TBD       <5%      TBD
cost_per_merged_change_usd       TBD        TBD       TBD      TBD
source_trial_success_rate        TBD        TBD       TBD      TBD
time_to_overview_seconds         TBD        TBD       <15      TBD
```

## 12) Promotion Readiness Gates

Before moving from `PR_ONLY` to `SELECTIVE_AUTO`, require:

1. Minimum 20 autonomous PRs in `PR_ONLY`.
2. No critical incidents in last 30 days.
3. Regression rate below threshold.
4. Budget stability demonstrated for 30 days.
5. Source trial governance functioning with audit trace.

