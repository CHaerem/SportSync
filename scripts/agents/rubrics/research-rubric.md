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
6. **Self-contradiction between `summary` and `streaming`** — an event whose `summary`
   prose names a broadcaster/streamer (e.g. "vises på HBO Max", "sendes på TV 2 Play")
   that is NOT the platform in the event's `streaming[]` array. This check stands on the
   event's own two fields — it needs no rights-skill lookup and no web access, so it can
   never be excused as "a note, not scored". A viewer reading "HBO Max" in the blurb while
   the channel chip says "Viaplay" is shown two answers to "hvor kan jeg se det"; that is
   the exact Corales failure that survived 52 green grader runs. Compare case-insensitively
   and allow known aliases (e.g. "TV 2 Play" ≈ "TV 2"); a genuine mismatch is a hard fail.
7. **Participation claim against contradicting status (WP-95)** — an event whose `summary`
   prose says a named athlete is still playing/competing (e.g. "Hovland går ut i tredje
   runde", "spiller i dag") while that same athlete's `norwegianPlayers[].status` on the
   event marks them out (`"røk cutten"`, `"trakk seg"`, `"diskvalifisert"`, or equivalent).
   Like check 6 this stands on the event's own two fields — no web access needed — so it
   can never be excused as "a note, not scored". This is the eier-funn (a brief written
   hours after Hovland missed the cut); a genuine contradiction is a hard fail.

## Scored criteria (deduct points, note in failures)
- Events in the next 7 days missing `streaming` info without a research-log note
  explaining why (−10 each, max −40)
- Coverage-gaps entries that were neither resolved nor explicitly dismissed in
  research-log notes (−5 each, max −20)
- Evidence URLs that are search-result pages rather than actual sources (−5 each)
- tracked.json entries whose `expires` is in the past (−5 each)
- **Repeated unaddressed recommendations** (−10 each, max −30). Read the last few
  `research-log.json` and `verify-log.json` entries (they are arrays / carry `notes`).
  If the SAME recommendation or flagged problem appears in **≥3 runs** and is still
  unresolved this run (e.g. "resolve tentative NRK/TV 2 for match X", "Corales channel
  still Viaplay", "F1 quali missing"), the loop is spinning on a known issue — deduct and
  name it. A recurring note that everyone copies forward but nobody fixes is worse than a
  new miss, because it has been seen and tolerated.
- **Evidence-domain monoculture across an event family** (−5 each family, max −15).
  When a whole family of related events (e.g. every Tour de France stage, every round of a
  chess tournament) cites only the **same ≤2 evidence domains** across all its members,
  flag it: a single-source family has no independent corroboration and inherits that
  source's blind spots wholesale. Note the family and the domain(s) it leans on.

## Output
Return exactly:
```json
{ "pass": true|false, "score": 0-100, "failures": ["specific, actionable descriptions"] }
```
Score 100 = flawless. Below 70 with no hard failures = pass but flag in failures.
