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

### Pre-existing flaky test
`tests/generate-multi-day.test.js` line 128 — "exports buildRecapSystemPrompt..." times out at 5000ms. This is a pre-existing issue, not caused by code agent changes.

### Stash caution
Git stash + pop can fail if the pipeline has modified `docs/data/` files concurrently. Prefer `git diff scripts/ tests/` to verify changes rather than stashing. Changes to `docs/data/` are expected during pipeline runs.
