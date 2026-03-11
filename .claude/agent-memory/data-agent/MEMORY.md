# Data Agent Memory

## Key Patterns

- **matchRssHeadline() three-tier matching**: Primary (full name), secondary (FC-stripped), tertiary (short-form aliases + last-word fallback with word-boundary regex). Tertiary added 2026-02-23. Norwegian RSS sources use shortened names.
- **TEAM_SHORT_FORMS map location**: In `scripts/fetch-results.js`, covers PL and La Liga teams. When new league teams need short forms, add entries there.
- **Word-boundary regex for team matching**: Use `(?<![a-zA-ZÀ-ÖØ-öø-ÿ])term(?![a-zA-ZÀ-ÖØ-öø-ÿ])` — includes Nordic chars in the negative lookbehind/ahead to avoid false positives.
- **Direct-to-main is safe for fetch-results.js changes**: Verified multiple times. Low-risk, full test coverage.

## Test Counts (as of 2026-02-23)
- 1882 tests / 64 files (post RSS headline matching improvement)
- fetch-results.test.js: 93 tests (was 85 before short-form matching addition)
