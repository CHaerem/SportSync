---
name: ESPN scoreboard endpoints silently return 1 event without `dates` param
description: ESPN racing scoreboards (F1, likely other motorsports) return only the single most-recent event when `?dates=<YYYY>` is omitted — triggers chronic stale-data warnings
type: project
---

ESPN's racing scoreboard endpoints (e.g. `https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard`) silently return **only the single most-recent past race** when the `dates` query parameter is omitted. This is not an outage — the API returns HTTP 200 with a valid `events` array of length 1 — but the event quickly becomes stale and triggers `invisible_events`, `stale_data`, and `chronic_data_retention` health warnings.

**Fix:** append `?dates=<currentYear>` — e.g. `?dates=2026` returns the full 24-race F1 season.

**Why:** Root-caused on 2026-04-12 after 25 consecutive pipeline runs returned stale F1 data. Fixed in `scripts/fetch/f1.js` by overriding `fetchFromSource` to inject the year dynamically (no annual config churn).

**How to apply:**
- If you add new motorsport/racing fetchers (MotoGP, NASCAR, IndyCar, WEC, WRC, Formula E, etc.) that use ESPN scoreboard endpoints without per-league/per-day date iteration, append `?dates=<currentYear>` by default.
- The base ESPN adapter's `fetchScoreboardWithLeagues()` path already iterates dates, so soccer/other-league fetchers are unaffected. The issue is specifically the `fetchSingleEndpoint()` path (sources with a bare `url` field).
- Pattern: override `fetchFromSource()` in the sport-specific fetcher and inject `dates=<year>` before delegating to `super.fetchFromSource()`. Keeps the config file clean and the year auto-current.
- Detection gap noted 2026-04-12: `pipeline-health.js` catches stale data and "invisible events" but doesn't explicitly flag "fetcher returned only 1 event for many runs" as a first-class signal. If a similar issue recurs for another sport, consider adding that heuristic.
