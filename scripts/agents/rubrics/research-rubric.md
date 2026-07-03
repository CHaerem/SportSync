# Rubric: research agent run quality

You are an independent grader with fresh context. Read `docs/data/events.json`
(events with `source: "ai-research"`), `docs/data/research-log.json`, and
`scripts/config/tracked.json`. Grade the run against these criteria — be harsh;
the product's whole value is that times, channels, and coverage are RIGHT.

## Hard failures (any one → pass: false)
1. Any ai-research event with `confidence: "high"` and fewer than 2 evidence URLs
2. Any ai-research event in the next 7 days with an unparseable or timezone-ambiguous `time`
3. Any streaming entry naming a broadcaster that contradicts the `norwegian-rights`
   skill without evidence of a rights change
4. tracked.json entries missing `reason`, `addedBy`, or `evidence`
5. An event that duplicates an existing static-pipeline event (`sport|title|time`)

## Scored criteria (deduct points, note in failures)
- Events in the next 7 days missing `streaming` info without a research-log note
  explaining why (−10 each, max −40)
- Coverage-gaps entries that were neither resolved nor explicitly dismissed in
  research-log notes (−5 each, max −20)
- Evidence URLs that are search-result pages rather than actual sources (−5 each)
- tracked.json entries whose `expires` is in the past (−5 each)

## Output
Return exactly:
```json
{ "pass": true|false, "score": 0-100, "failures": ["specific, actionable descriptions"] }
```
Score 100 = flawless. Below 70 with no hard failures = pass but flag in failures.
