# Autopilot Roadmap

Prioritized task queue for the Claude autopilot workflow. The autopilot picks the first `[PENDING]` task, executes it, and opens a PR. Reorder tasks to change priority. One task per run, one open PR at a time.

## Task Format

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed
- `[BLOCKED]` reason — Cannot proceed until unblocked

---

## HIGH Priority

- [DONE] (PR #4) Fix service worker stale file references — `docs/sw.js` lines 25,27 cache `personalized-dashboard.js` and `event-filter.js` which do not exist. Remove these entries from the cache list to prevent SW installation failures.

- [DONE] (PR #5) Implement `updateFilterCount()` stub in `docs/js/simple-dashboard.js` — Called on lines 60 and 80 but the method body (lines 95-98) is empty. Add a visible count indicator showing how many events match the active filter.

- [BLOCKED] exceeds automation limits — Remove legacy fetch scripts — `scripts/fetch/` contains duplicate pairs (e.g. `football.js` + `football-refactored.js`). The refactored versions are active via `MigrationHelper.parallelFetch()`. Remove the legacy files and simplify `scripts/fetch/index.js` to use refactored versions directly. ~1,000 lines of dead code.

## MEDIUM Priority

- [DONE] (PR #6) Add dashboard filter tests — Extract pure functions into `docs/js/dashboard-helpers.js` and add 52 unit tests for filter logic, time formatting, sport display, HTML escaping, team abbreviation, favorites detection, and combined filtering.

- [DONE] (PR #7) Add data freshness warning UI — When `docs/data/meta.json` shows data older than 24 hours, display a subtle banner on the dashboard informing users that data may be stale. Currently only checked in the maintenance workflow.

- [DONE] (PR #8) Remove failed open-data fallback attempts — `docs/js/sports-api.js` tries to fetch `-open.json` variants (lines 18, 145, 180, 220) that don't exist, causing unnecessary 404s. Remove these dead fallback paths.

- [DONE] (PR #9) Add accessibility improvements — Dashboard lacks ARIA attributes: add `role="navigation"` to filter section, `aria-pressed` to filter buttons, `aria-label` to icon-only buttons (theme toggle, settings), `role="list"`/`role="listitem"` to event cards, and `aria-live="polite"` to the events container.

- [DONE] (PR #10) Add image lazy loading — Event card images (team logos, tournament badges) loaded by `simple-dashboard.js` should use `loading="lazy"` attribute for better performance on slow connections.

## LOW Priority

- [DONE] (PR #11) Clean up console.log statements — Removed 32 debug-level console.log calls across `docs/sw.js`, `docs/js/sports-api.js`, `docs/js/simple-dashboard.js`, and `docs/index.html`. Retained console.error calls for genuine errors.

- [DONE] (PR #12) Add CSS class for `event-time-exact` — Added missing CSS definition for the `event-time-exact` class: smaller font, muted color, reduced opacity, tabular-nums for digit alignment.

- [DONE] (PR #13) Add keyboard navigation for sport filters — Added `:focus-visible` outline styles to `.filter-btn` and `.sport-filter` elements. Buttons are native `<button>` elements so Enter/Space already works natively.

- [DONE] (clarified) Clarify `scripts/fetch/fotball-no.js` — Already integrated: imported by both `football.js` and `football-refactored.js` to fetch OBOS-ligaen Lyn matches. No changes needed.

- [DONE] (already resolved) Add `ai-assistant.js` to service worker cache list — File was already present in SW cache at `docs/sw.js` line 25. No changes needed.

---

## Scouted Tasks (2026-02-10)

### HIGH Priority

- [PENDING] Remove dead code in `docs/js/sports-api.js` — Lines 30-64: unreachable second try-catch block in `fetchFootballEvents()` (first block always returns). Lines 185-232: four unused format methods (`formatFootballEvents`, `formatGolfEvents`, `formatTennisEvents`, `formatF1Events`) replaced by `formatTournamentData()`. Lines 4-9: unused `apiKeys` property. ~100 lines of dead code.

- [PENDING] Fix memory leak in `docs/js/simple-dashboard.js` — Line 40-43: `setInterval()` called without storing the interval ID, making cleanup impossible. Store the interval ID in `this.refreshInterval` for proper lifecycle management.

- [PENDING] Add `rel="noopener noreferrer"` to streaming links — `docs/js/simple-dashboard.js` line ~1320: streaming badge links with `target="_blank"` are missing `rel="noopener noreferrer"`, allowing external sites to access `window.opener`. Security fix.

### MEDIUM Priority

- [PENDING] Add `prefers-reduced-motion` support — `docs/index.html` CSS uses transitions (0.15s–1s) and a spinner animation without a `@media (prefers-reduced-motion: reduce)` override. Add a media query block to disable transitions and animations for users with vestibular disorders. ~15 lines of CSS.

- [PENDING] Remove unused CSS rules — `docs/index.html`: `.view-toggle` and `.view-btn` styles (lines ~223-251) have no corresponding HTML elements. `@keyframes spin` animation (lines ~640-647) is defined but its loading spinner is immediately replaced. ~30 lines of dead CSS.

- [PENDING] Add `dashboard-helpers.js` to service worker cache — `docs/js/dashboard-helpers.js` exists and is loaded but is missing from the SW install cache list in `docs/sw.js`. Add it alongside other JS files for offline resilience.

- [PENDING] Add unit tests for `preferences-manager.js` — `docs/js/preferences-manager.js` has no tests. Key untested logic: `isEventFavorite()` multi-criteria matching, `isTeamFavorite()`/`isPlayerFavorite()` fuzzy matching, localStorage error handling, empty-string guard on add methods. Target: ~20 tests in `tests/preferences-manager.test.js`.

- [PENDING] Add unit tests for `sports-api.js` formatters — `docs/js/sports-api.js` `formatTournamentData()` and `getAllEventsForWeek()` have no test coverage. Test data shape transformations, date formatting, and mock data generators. Target: ~15 tests in `tests/sports-api.test.js`.

### LOW Priority

- [PENDING] Add meta description and theme-color tags — `docs/index.html` is missing `<meta name="description">` and `<meta name="theme-color">` tags. Add them for improved SEO and consistent OS-level theming. ~2 lines.

- [PENDING] Fix duplicate emoji mappings — `docs/js/simple-dashboard.js` `sportDisplayName()` duplicates the emoji/name mapping also found in `docs/js/dashboard-helpers.js` and `docs/js/settings-ui.js`. Extract into a shared constant to avoid drift. Touches 3 files.

- [PENDING] Add input validation to preferences-manager — `docs/js/preferences-manager.js` `addFavoriteTeam()` and `addFavoritePlayer()` accept empty strings and null values without validation. Add `if (!name?.trim()) return false` guards. ~10 lines.
