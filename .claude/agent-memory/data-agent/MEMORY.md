# Data Agent Memory

## Key Patterns

- **matchRssHeadline() three-tier matching**: Primary (full name), secondary (FC-stripped), tertiary (short-form aliases + last-word fallback with word-boundary regex). Tertiary added 2026-02-23. Norwegian RSS sources use shortened names.
- **TEAM_SHORT_FORMS map location**: In `scripts/fetch-results.js`, covers PL and La Liga teams. When new league teams need short forms, add entries there.
- **Word-boundary regex for team matching**: Use `(?<![a-zA-ZÀ-ÖØ-öø-ÿ])term(?![a-zA-ZÀ-ÖØ-öø-ÿ])` — includes Nordic chars in the negative lookbehind/ahead to avoid false positives.
- **Direct-to-main is safe for fetch-results.js changes**: Verified multiple times. Low-risk, full test coverage.

## EventNormalizer endTime Bug (fixed 2026-03-11)
- `EventNormalizer.normalize()` was NOT preserving `endTime` at the top level — it went into `additional`
- This caused: (1) `validateEvent()` to reject ongoing tournaments (start date >6h old), (2) `isEventInWindow()` to treat multi-day events as single-point events
- Fix: add `endTime` to `knownFields` array + explicitly include it in normalized output + update `validateEvent` to accept events whose `endTime` is still in the future
- Files: `scripts/lib/event-normalizer.js`, `tests/event-normalizer.test.js`

## F1 Staleness — KNOWN EXPECTED BEHAVIOR
- ESPN F1 scoreboard returns empty between race weekends (e.g. after Australian GP, before Chinese GP)
- `_retained` warnings for F1 in health-report.json during inter-race gaps are false positives, not bugs
- The 30-day timeRange filter is correct; the issue is the ESPN API, not the fetcher

## Esports Staleness — DATA GAP
- ESL Pro League S22 bracket has groups with `teams` arrays but no `matches` arrays
- `_extractBracketMatches()` in esports.js only processes `round.matches`, so groups without match arrays yield 0 events
- Fix requires discovery loop to populate per-match scheduling in the bracket via Liquipedia

## Test Counts (as of 2026-03-11)
- 2463 tests / 79 files
- event-normalizer.test.js: 20 tests (was 16 before endTime fixes)
