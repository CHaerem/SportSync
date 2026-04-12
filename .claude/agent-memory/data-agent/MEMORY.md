# Data Agent Memory

## Key Patterns

- **matchRssHeadline() three-tier matching**: Primary (full name), secondary (FC-stripped), tertiary (short-form aliases + last-word fallback with word-boundary regex). Tertiary added 2026-02-23. Norwegian RSS sources use shortened names.
- **TEAM_SHORT_FORMS map location**: In `scripts/fetch-results.js`, covers PL and La Liga teams. When new league teams need short forms, add entries there.
- **Word-boundary regex for team matching**: Use `(?<![a-zA-ZÀ-ÖØ-öø-ÿ])term(?![a-zA-ZÀ-ÖØ-öø-ÿ])` — includes Nordic chars in the negative lookbehind/ahead to avoid false positives.
- **Direct-to-main is safe for fetch-results.js changes**: Verified multiple times. Low-risk, full test coverage.
- **Esports config archival pattern**: `sync-configs.js` archives any config whose `endDate` is in the past. When esports config is archived, fetcher gets zero curated matches. Always set esports config `endDate` at least 3+ months ahead.
- **Esports currentWeek filter issue**: `sports-config.js` had `currentWeek:true` for esports which drops all matches outside the current week — bad for multi-week tournaments. Fixed 2026-03-14 to use `timeRange:14`. If you see esports events mysteriously vanishing mid-tournament, check this filter.
- **ESL Pro League S22 historical note**: ESL Pro League S22 ended October 2025. 100 Thieves were NOT in S23 (March 2026). Any config referencing "100 Thieves in ESL Pro League S22" is hallucinated data.
- **100 Thieves CS2 roster (as of 2026-03)**: dev1ce, rain (Håvard Nygaard — Norwegian), Ag1l, sirah, poiii. Coach: gla1ve.

- **F1 calendar config pattern**: ESPN F1 scoreboard returns only the single most-recent race without `?dates=<year>` (see espn_scoreboard_dates_param.md — fixed 2026-04-12 in `scripts/fetch/f1.js`). Curated `scripts/config/f1-calendar-2026.json` with 24 races is still useful as a belt-and-braces fallback. Use `meta: { round, circuit, country }` for F1 events. No Norwegian drivers on F1 grid (as of 2026-04).
- **Viaplay = Norwegian F1 broadcaster**: Always include Viaplay as streaming platform for F1 events in curated configs.
- [ESPN scoreboard `dates=` param](espn_scoreboard_dates_param.md) — ESPN racing scoreboards silently return only 1 (most-recent) event without `?dates=<year>`; apply to any new motorsport fetcher using `fetchSingleEndpoint()`.

## Test Counts (as of 2026-04-03)
- 2575 tests / 81 files (up from 2467/79 at last update)
- fetch-results.test.js: 93 tests
