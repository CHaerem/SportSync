# Verify Agent — SportSync

Read `docs/data/events.json`. For events in the next 7 days where
`source: "ai-research"` OR `confidence` is set OR `streaming` carries a
**tentative** channel (any `streaming` entry with `"tentative": true`, e.g. a
World Cup match still showing `NRK / TV 2`), verify each via 1–2 web-fetch calls
against authoritative sources. Update each event with:

- `verifiedAt`: ISO timestamp
- `verificationSources`: URLs you checked
- `verificationStatus`: `"confirmed"` | `"amended"` | `"removed"`
- Amend `time`, `venue`, `streaming` in place if sources contradict the original

**Verify streaming, not just time.** "Hvor kan jeg se det" must be right: check
the `streaming` field against the `norwegian-rights` skill
(`.claude/skills/norwegian-rights/SKILL.md`) and `docs/data/tv-listings.json`
(football ground truth). If a verified event contradicts the rights map, fix the
event AND update the skill in the same commit.

**Resolve tentative channels to the real one.** A `streaming` entry marked
`"tentative": true` (e.g. World Cup `NRK / TV 2`) means we know the rights are
shared but not which broadcaster carries THIS match. Find the confirmed channel
(NRK and TV 2 publish full tournament schedules) and replace it with a single
concrete entry, dropping the `tentative` flag, e.g.
`[{ "platform": "NRK", "url": "https://tv.nrk.no" }]`. This confirmed value then
survives future rebuilds (build-events never downgrades a confirmed channel back
to a guess). If you genuinely cannot confirm which, leave the tentative label as
is — an honest guess beats a wrong certainty.

**Feed the calibration ledger.** For every source you consult, append one line
to `docs/data/calibration-ledger.jsonl` (create if missing):
`{ "checkedAt": ISO, "sport": "...", "source": "domain.tld", "field": "time"|"streaming"|"existence", "agreed": true|false, "note": "..." }`
`agreed` = did the source match what we had? These records aggregate mechanically
into `calibration.json`, which teaches the research agent who to trust.

If `verificationStatus` is `removed` (the event demonstrably does not exist or
was cancelled), drop the event from events.json entirely.

For `source: "espn"` / static-pipeline events, only verify if `time` is more
than 14 days out (APIs are reliable near-term; long-range schedules drift).

## Output contract
1. Updated `docs/data/events.json`
2. Appended `docs/data/calibration-ledger.jsonl` (one line per source check)
3. `docs/data/verify-log.json`: `{ "runAt": ISO, "checked": n, "confirmed": n, "amended": n, "removed": n, "notes": ["..."] }`

After writing files, run `node scripts/validate-events.js` and fix any errors it reports.

## Constraints
- Never verify by inventing — if you cannot find a source, mark nothing and note it in verify-log
- X/Twitter-derived claims: apply the trust rules in the `x-sources` skill
  (`.claude/skills/x-sources/SKILL.md`) — official-account announcements count as
  one authoritative source; anything else needs independent corroboration before
  an event keeps `high` confidence
- Never modify `scripts/config/interests.json`
- Stop after ~10 minutes
