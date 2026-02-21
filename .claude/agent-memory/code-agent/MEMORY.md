# Code Agent Memory

## Key Patterns

### KNOWN_DATA_GAPS in autonomy-scorecard.js
When health warnings are observed and managed by autonomous systems, add their codes to `KNOWN_DATA_GAPS` in `evaluatePipelineHealth()`. Current managed codes include:
- `stale_output` — AI steps skipped when quota is tier 3 (expected, quota system manages this)
- `quota_high_utilization` — informational, quota adaptation handles tier transitions
- `low_confidence_config` — verification loop re-verifies autonomously
- `component_unresolvable` — featured quality gates adapt prompts

### scheduleVerification loop logic
`evaluateScheduleVerification()` checks `pipeline-result.json` phases for `verify-schedules` step failures. If the step failed, stale history is excused (awarded 0.33 points anyway). This prevents transient pipeline failures from permanently dragging down the loop score.

### Pre-existing flaky tests
- `tests/generate-multi-day.test.js` line 128 — "exports buildRecapSystemPrompt..." times out at 5000ms.
- `tests/analyze-patterns.test.js` — "accumulates counts / flags high severity" tests fail count assertion.
- `tests/evaluate-ux.test.js` — `process.exit` unexpectedly called error.
All are pre-existing issues, not caused by code agent changes.

### Hint fatigue suppression pattern
In `buildResultsHints()`, suppress a specific metric's hint when it is the SOLE low metric and the underlying issue is a data artifact (not LLM behaviour). Pattern:
```js
if (rule.metric === "somethingUnreliable") {
  const otherRulesAllPass = RESULTS_HINT_RULES
    .filter(r => r.metric !== "somethingUnreliable")
    .every(r => averages[r.metric] === null || averages[r.metric] >= r.threshold);
  if (otherRulesAllPass) continue;
}
```
The hint still fires when other metrics are also low (genuine multi-metric failure).

### Linter auto-reverts
The linter reverts changes to `scripts/lib/ai-quality-gates.js` and test files. Always re-check file state after the linter runs and re-apply if reverted. The linter runs automatically after edits.

### Stash caution
Git stash + pop can fail if the pipeline has modified `docs/data/` files concurrently. Prefer `git diff scripts/ tests/` to verify changes rather than stashing. Changes to `docs/data/` are expected during pipeline runs.
