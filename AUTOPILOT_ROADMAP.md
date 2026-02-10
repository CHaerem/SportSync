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

- [DONE] (PR #15) Remove dead code in `docs/js/sports-api.js` — Removed unreachable TheSportsDB fallback block, four unused format methods, and unused apiKeys property. 93 lines removed.

- [DONE] (PR #16) Fix memory leak in `docs/js/simple-dashboard.js` — Stored setInterval return value in `this.refreshInterval` for proper cleanup.

- [DONE] (PR #17) Add `rel="noopener noreferrer"` to streaming links — Added missing security attribute to streaming badge links in simple-dashboard.js.

### MEDIUM Priority

- [DONE] (PR #18) Add `prefers-reduced-motion` support — Added media query to disable all transitions and animations for users with motion sensitivity preferences.

- [DONE] (PR #19) Remove unused CSS rules — Removed `.view-toggle` and `.view-btn` styles (~39 lines) that had no corresponding HTML elements. Kept `@keyframes spin` which is actively used by the loading spinner.

- [DONE] (PR #20) Add `dashboard-helpers.js` to service worker cache — Added to SW install cache list and bumped cache version to v11-helpers.

- [DONE] (PR #21) Add unit tests for `preferences-manager.js` — Added 29 tests covering load/save, sport/team/player CRUD, fuzzy matching, multi-criteria event favorite detection, view/theme preferences, exportForBackend, and reset.

- [DONE] (PR #22) Add unit tests for `sports-api.js` formatters — Added 17 tests covering formatTournamentData, formatDateTime, and groupEventsByDay.

### LOW Priority

- [DONE] (PR #23) Add meta description and theme-color tags — Added SEO description and #667eea theme-color for mobile browsers.

- [DONE] (PR #24) Fix duplicate emoji mappings — Extracted sport emoji/name mapping into shared `docs/js/sport-config.js` constant, replacing duplicates in `simple-dashboard.js`, `settings-ui.js`, and `dashboard-helpers.js`.

- [DONE] (PR #25) Add input validation to preferences-manager — Added null/empty/whitespace guards to `addFavoriteTeam()` and `addFavoritePlayer()`, plus return values and 6 tests.

---

## Scouted Tasks (2026-02-10, run 2)

### HIGH Priority

- [DONE] (obsolete — files deleted in ultra-minimal redesign) Add aria-labels to icon-only buttons — `ai-assistant.js` and `settings-ui.js` were removed.

- [DONE] (obsolete — file deleted in ultra-minimal redesign) Add image error handling for team logos and golfer headshots — `simple-dashboard.js` was replaced by `dashboard.js`.

### MEDIUM Priority

- [PENDING] Remove unused mock tournament methods from sports-api.js — `docs/js/sports-api.js` lines 255-640 contain 6 unused `getMock*Tournaments()` methods (~385 lines of dead code). Only `getMockWeeklyEvents()` is used. Touches 1 file.

- [DONE] (obsolete — file deleted in ultra-minimal redesign) Add cleanup for setInterval on page unload — `simple-dashboard.js` was replaced by `dashboard.js`.

- [DONE] (resolved in ultra-minimal redesign) Replace hardcoded colors with CSS variables in loading spinner — New `index.html` uses CSS variables throughout.

### LOW Priority

- [DONE] (obsolete — file deleted in ultra-minimal redesign) Validate streaming URLs before rendering as links — `simple-dashboard.js` was replaced by `dashboard.js`.

- [DONE] (obsolete — file deleted in ultra-minimal redesign) Deduplicate passesFilter() logic — `simple-dashboard.js` was removed entirely.

---

## Intelligent Content System

The dashboard uses a **featured content system** that works in two layers:

1. **`scripts/generate-featured.js`** — runs during each build, calls Claude API to generate `docs/data/featured.json`
2. **`scripts/config/*.json`** — curated event configs that the autopilot creates autonomously

### How It Works

```
Autopilot detects major event → creates scripts/config/{event}.json
                                        ↓
Build pipeline auto-discovers config → merges events into events.json
                                        ↓
generate-featured.js reads events.json + curated configs → calls Claude API
                                        ↓
Claude generates featured.json (brief, sections, radar)
                                        ↓
Dashboard renders featured.json flexibly — no frontend changes needed
```

**`featured.json` schema:**
- **brief**: 2-3 editorial lines summarizing the day
- **sections**: dynamic featured content blocks (types: "stat", "event", "text")
- **radar**: 2-3 "on the radar" sentences about upcoming events

### Autonomous Autopilot Directive

The autopilot should **proactively and autonomously** monitor the sports calendar and create content when major events approach or begin. **No human intervention required.** The autopilot:

1. **Detects** major events by analyzing `docs/data/events.json` for tournament names, context tags, and upcoming schedules
2. **Creates** curated config files in `scripts/config/` with event schedules, Norwegian athletes, and streaming info
3. **The pipeline handles the rest** — `build-events.js` auto-discovers configs, `generate-featured.js` feeds them to the LLM

#### Curated Config Format (`scripts/config/*.json`)

```json
{
  "name": "Event Name",
  "location": "City, Country",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "context": "event-id",
  "norwegianAthletes": ["Athlete Name", ...],
  "events": [
    {
      "title": "Event Title",
      "time": "ISO 8601 datetime",
      "venue": "Venue Name",
      "norwegian": true,
      "norwegianPlayers": [{"name": "Athlete Name"}],
      "streaming": [{"platform": "NRK", "type": "tv"}]
    }
  ]
}
```

#### When to Create Curated Configs

- **Olympics** (Winter or Summer): Norwegian athlete schedules, medal events, daily highlights
- **FIFA World Cup**: Group matches with Norway interest, knockout stages, match schedules
- **Champions League knockout stages**: Bracket fixtures, Norwegian club/player involvement
- **Grand Slams** (tennis): Draw brackets, Ruud/Norwegian player matchups
- **Major golf tournaments**: Hovland tee times, leaderboard tracking, cut-line info
- **Any new major event** the autopilot detects approaching in the event data

#### Rules for Autonomous Content

- One curated config per major event (e.g., `olympics-2026.json`, `world-cup-2026.json`)
- Config file name should be descriptive: `{event}-{year}.json`
- Always focus on Norwegian athletes and Norwegian interest
- Include streaming info (NRK, Eurosport, TV2, etc.) when known
- Delete or archive configs after events end (move to `scripts/config/archive/`)
- The `context` field must match between config and generated events for proper grouping

### Pending Content Tasks

- [PENDING] Remove unused mock tournament methods from sports-api.js — `docs/js/sports-api.js` contains unused `getMock*Tournaments()` methods (~385 lines of dead code). Only `getMockWeeklyEvents()` is used.

- [PENDING] Add workflow step for generate-featured.js — Add `node scripts/generate-featured.js` step to `.github/workflows/update-sports-data.yml` after enrichment. Requires `ANTHROPIC_API_KEY` secret. (Protected path — needs manual approval.)

- [PENDING] Increase data update frequency — Change cron in `.github/workflows/update-sports-data.yml` from `0 */6 * * *` to `0 */2 * * *`. (Protected path — needs manual approval.)
