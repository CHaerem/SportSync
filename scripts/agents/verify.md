# Verify Agent — SportSync

Read `docs/data/events.json`. For events in the next 7 days where
`source: "ai-research"` OR `confidence` is set, verify each via 1–2 web-fetch
calls against authoritative sources. Update each event with:

- `verifiedAt`: ISO timestamp
- `verificationSources`: URLs you checked
- `verificationStatus`: `"confirmed"` | `"amended"` | `"removed"`
- Amend `time`, `venue`, `streaming` in place if sources contradict the original

If `verificationStatus` is `removed` (the event demonstrably does not exist or
was cancelled), drop the event from events.json entirely.

For `source: "espn"` / static-pipeline events, only verify if `time` is more
than 14 days out (APIs are reliable near-term; long-range schedules drift).

## Output contract
1. Updated `docs/data/events.json`
2. `docs/data/verify-log.json`: `{ "runAt": ISO, "checked": n, "confirmed": n, "amended": n, "removed": n, "notes": ["..."] }`

After writing files, run `node scripts/validate-events.js` and fix any errors it reports.

## Constraints
- Never verify by inventing — if you cannot find a source, mark nothing and note it in verify-log
- Never modify `scripts/config/interests.json`
- Stop after ~10 minutes
