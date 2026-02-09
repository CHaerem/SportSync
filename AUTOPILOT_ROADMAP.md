# Autopilot Roadmap

Prioritized task queue for the Claude autopilot workflow. The autopilot picks the first `[PENDING]` task, executes it, and opens a PR. Reorder tasks to change priority. One task per run, one open PR at a time.

## Task Format

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed
- `[BLOCKED]` reason — Cannot proceed until unblocked

---

## HIGH Priority

- [PENDING] Fix service worker stale file references — `docs/sw.js` lines 25,27 cache `personalized-dashboard.js` and `event-filter.js` which do not exist. Remove these entries from the cache list to prevent SW installation failures.

- [PENDING] Implement `updateFilterCount()` stub in `docs/js/simple-dashboard.js` — Called on lines 60 and 80 but the method body (lines 95-98) is empty. Add a visible count indicator showing how many events match the active filter.

- [PENDING] Remove legacy fetch scripts — `scripts/fetch/` contains duplicate pairs (e.g. `football.js` + `football-refactored.js`). The refactored versions are active via `MigrationHelper.parallelFetch()`. Remove the legacy files and simplify `scripts/fetch/index.js` to use refactored versions directly. ~1,000 lines of dead code.

## MEDIUM Priority

- [PENDING] Add dashboard filter tests — `docs/js/simple-dashboard.js` has 0% test coverage. Add unit tests for the filter logic, event rendering, and time formatting functions. Target the pure functions first.

- [PENDING] Add data freshness warning UI — When `docs/data/meta.json` shows data older than 24 hours, display a subtle banner on the dashboard informing users that data may be stale. Currently only checked in the maintenance workflow.

- [PENDING] Remove failed open-data fallback attempts — `docs/js/sports-api.js` tries to fetch `-open.json` variants (lines 18, 145, 180, 220) that don't exist, causing unnecessary 404s. Remove these dead fallback paths.

- [PENDING] Add accessibility improvements — Dashboard lacks ARIA attributes: add `role="navigation"` to filter section, `aria-pressed` to filter buttons, `aria-label` to icon-only buttons (theme toggle, settings), `role="list"`/`role="listitem"` to event cards, and `aria-live="polite"` to the events container.

- [PENDING] Add image lazy loading — Event card images (team logos, tournament badges) loaded by `simple-dashboard.js` should use `loading="lazy"` attribute for better performance on slow connections.

## LOW Priority

- [PENDING] Clean up console.log statements — Production code has ~50 console.log calls across `docs/sw.js` (9), `docs/js/sports-api.js` (33), `docs/js/simple-dashboard.js` (4), and `docs/index.html` (3). Replace with a debug-flag-gated logger or remove non-error statements.

- [PENDING] Add CSS class for `event-time-exact` — `simple-dashboard.js` line 409 generates elements with class `event-time-exact` but no CSS definition exists. Add styling to match the dashboard design.

- [PENDING] Add keyboard navigation for sport filters — Filter buttons are not keyboard-accessible. Add `tabindex`, focus styles, and Enter/Space key handlers so users can navigate filters without a mouse.

- [PENDING] Clarify or remove `scripts/fetch/fotball-no.js` — This file fetches OBOS-ligaen data from fotball.no but its integration status is unclear. Either wire it into the main fetch pipeline or remove it.
