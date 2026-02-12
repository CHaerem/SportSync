# Autopilot Roadmap

Prioritized task queue for the Claude autopilot workflow. The autopilot picks the first `[PENDING]` task, executes it, and opens a PR. Reorder tasks to change priority. One task per run, one open PR at a time.

## Task Format

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed
- `[BLOCKED]` reason — Cannot proceed until unblocked

---

## EXPERIENCE Lane (User Impact)

Keep this section near the top so the autopilot continuously improves user-facing outcomes, not just code hygiene.

### Active KPIs

- `watch_plan_engagement` — % of sessions that expand at least one suggested watch item
- `enrichment_coverage` — % of events with importance, summary, tags, and Norwegian relevance
- `featured_quality_score` — quality gate score from `docs/data/ai-quality.json`

### Current Tasks

- [DONE] (PR #47) Add watch-plan feedback loop — Added thumbs-up/down controls to watch-plan items in dashboard.js, feedback persisted in localStorage via PreferencesManager, with aggregate count API. **Phase 1, Step 2 of vision roadmap.**

- [PENDING] Track recommendation conversion signals — Add lightweight client-side telemetry counters for `watch-plan` item clicks and streaming-link opens, then surface weekly totals in `docs/data/ai-quality.json` so autopilot can optimize ranking logic.

- [DONE] (already implemented server-side) Personalize watch-plan ranking with favorites export — `scoreEventForWatchPlan()` in `scripts/lib/watch-plan.js` already boosts +18 for favorite teams/players and +12 for favorite esports orgs. `exportForBackend()` outputs in the exact format consumed by `userContext`.

---

## HIGH Priority

- [DONE] (PR #4) Fix service worker stale file references — `docs/sw.js` lines 25,27 cache `personalized-dashboard.js` and `event-filter.js` which do not exist. Remove these entries from the cache list to prevent SW installation failures.

- [DONE] (PR #5) Implement `updateFilterCount()` stub in `docs/js/simple-dashboard.js` — Called on lines 60 and 80 but the method body (lines 95-98) is empty. Add a visible count indicator showing how many events match the active filter.

- [DONE] (manual session) Remove legacy fetch scripts — Deleted 5 legacy fetchers, `migration-helper.js`, and `test-refactored.js`. Renamed `-refactored` versions to clean names via `git mv`. Simplified `scripts/fetch/index.js` to call fetchers directly. ~1,000 lines removed.

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

- [DONE] (obsolete — file deleted in ultra-minimal redesign) Remove unused mock tournament methods from sports-api.js — `docs/js/sports-api.js` was removed from the runtime dashboard path.

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

### Coverage Gap Detection

The pipeline generates `docs/data/coverage-gaps.json` every 2 hours via `scripts/detect-coverage-gaps.js`.
During nightly runs, the autopilot should:

1. Read `docs/data/coverage-gaps.json`
2. For each gap with `classification: "actionable"` and `confidence: "high"`:
   - If the suggested config does not exist in `scripts/config/`, create it
   - Research the event schedule using available data and web search
   - Follow the curated config format (see above)
3. For `confidence: "medium"` actionable gaps:
   - Create a GitHub issue suggesting the coverage gap for human review
4. For `confidence: "low"` or `classification: "informational"`:
   - Skip (transient news, not worth acting on)
5. Log all gap processing in `docs/data/autopilot-log.json`

### Pipeline Health Monitoring

The pipeline generates `docs/data/health-report.json` every 2 hours via `scripts/pipeline-health.js`.
During nightly runs, the autopilot should:

1. Read `docs/data/health-report.json`
2. If `status: "critical"`, prioritize repair tasks over roadmap tasks
3. Common repair actions:
   - `sport_dropped` → investigate the fetcher for that sport, check API changes
   - `stale_data` → check if the API endpoint has moved or requires new auth
   - `rss_low` → verify RSS feed URLs are still valid
4. If `status: "warning"`, note issues but continue with roadmap tasks

### Pending Content Tasks

- [DONE] (obsolete — file deleted in ultra-minimal redesign) Remove unused mock tournament methods from sports-api.js — `docs/js/sports-api.js` was removed from the runtime dashboard path.

- [DONE] (already in workflow) Add workflow step for generate-featured.js — Step exists in `.github/workflows/update-sports-data.yml` and now also generates `watch-plan.json` + `ai-quality.json`.

- [DONE] (already in workflow) Increase data update frequency — Cron is already `0 */2 * * *` in `.github/workflows/update-sports-data.yml`.

---

## Scouted Tasks (2026-02-11)

### HIGH Priority

- [DONE] (PR #39) Add curated config schedule verification script — Created `scripts/verify-schedules.js` with ESPN cross-referencing, static date validation, auto-correction for high-confidence drift, and health-report integration. 37 tests in `tests/verify-schedules.test.js`.

- [DONE] (PR #26) Improve dashboard quality — Added alt attributes to inline row images, aria-expanded to band toggles, event delegation for event rows (fixing listener accumulation), removed dead `updateLiveDOM()` method, added `rss-digest.json` and `ai-quality.json` to SW cache, bumped cache to v18.

### MEDIUM Priority

- [DONE] (PR #27) Add unit tests for `scripts/lib/filters.js` — 44 tests covering all 10 static methods on `EventFilters`: time range, current week, teams, players, leagues, Norwegian, sport, sort, limit, deduplication, merge, and combined filters.

- [DONE] (PR #28) Add unit tests for `scripts/lib/norwegian-streaming.js` — 25 tests covering `getNorwegianStreaming()`, `applyNorwegianStreaming()`, and `norwegianStreamingMap` data structure validation.

- [DONE] (PR #40) Add unit tests for `scripts/lib/api-client.js` — 22 tests covering constructor, buildURL, cache, retry, timeout, fetchWithDates, and error handling.

- [DONE] (PR #41) Add unit tests for `scripts/lib/base-fetcher.js` — 33 tests covering fetch pipeline, source iteration, error accumulation, filters, normalization, tournament grouping, and Norwegian interest detection.

### LOW Priority

- [DONE] (PR #42) Add `aria-expanded` to featured section expand buttons — Added `aria-expanded="false"` attribute and toggle in click handler, matching band toggle pattern.

- [DONE] (already implemented) Add render-once guard for watch-plan UI — `renderWatchPlan()` exists in `dashboard.js` lines 430-490 with full CSS styling. Loads `watch-plan.json`, renders top picks with time, reasons, streaming info, and click-to-scroll.

- [DONE] (PR #46) Improve sport iteration efficiency in `renderBand()` — Refactored to iterate only sport groups with events instead of all SPORT_CONFIG entries. Builds index map for ordered lookup.

---

## Autonomy Infrastructure (2026-02-12)

Closed-loop self-improvement system. Autonomy score: **100% (8/8 loops closed)**.

### Completed

- [DONE] (manual session) Adaptive prompt hints for featured generation — `buildAdaptiveHints()` in `ai-quality-gates.js` reads last 5 quality snapshots, generates corrective prompts when metrics underperform thresholds. Wired into `generate-featured.js`. 8 tests.

- [DONE] (manual session) Adaptive enrichment hints — `buildEnrichmentHints()` in `enrich-events.js` checks `ai-quality.json` for low tag/summary coverage or failed batches, injects corrections into enrichment prompt. 7 tests.

- [DONE] (manual session) Coverage gap auto-resolver — `scripts/resolve-coverage-gaps.js` reads `coverage-gaps.json` and creates skeleton curated configs for high/medium-confidence actionable gaps. Wired into `detect-coverage-gaps.js` to run automatically. 11 tests.

- [DONE] (manual session) Autonomy scorecard — `scripts/autonomy-scorecard.js` evaluates 8 feedback loops (featured quality, enrichment quality, coverage gaps, pipeline health, watch plan, code health, discovery, schedule verification). Wired into `pipeline-health.js`. Outputs `autonomy-report.json`.

- [DONE] (manual session) Discovery feedback loop (Loop 7) — `discover-events.js` + `sync-configs.js` auto-discover events, athletes, and schedules via Claude CLI + WebSearch. `autonomy-scorecard.js` tracks discovery health.

- [DONE] (manual session) Schedule verification feedback loop (Loop 8) — `scripts/lib/schedule-verifier.js` with 5 pluggable verifiers (static, ESPN, RSS, sport data, web re-check). Per-event confidence scoring. `buildVerificationHints()` injects accuracy corrections into discovery prompts. `verification-history.json` tracks last 50 runs. 68 tests.

- [DONE] (manual session) Centralize time constants — `MS_PER_MINUTE`, `MS_PER_HOUR`, `MS_PER_DAY` in `helpers.js`, replaced magic numbers across codebase.

- [DONE] (manual session) Reorder LLM provider priority — Anthropic checked before OpenAI in `llm-client.js`.

- [DONE] (manual session) Clean dead frontend code — Removed `renderRadar()`, `#radar` div, radar CSS. Trimmed SW cache from 14 to 6 data files.

- [DONE] (manual session) Fix gitignore whitelist — Added `health-report.json`, `coverage-gaps.json`, `quality-history.json`, `autonomy-report.json` to whitelist. Diagnostic data was being silently excluded from commits.

### Pending Autonomy Tasks

- [DONE] (already implemented) Add watch-plan rendering to dashboard — `renderWatchPlan()` in `dashboard.js` lines 430-490. Renders picks with time, emoji, reasons, streaming, and click-to-event navigation.

- [DONE] (PR #47) Add thumbs-up/down feedback to watch-plan items — Feedback controls added to watch-plan picks, persisted in localStorage, with aggregate count API via PreferencesManager.

- [PENDING] Surface engagement signals in pipeline — Read `localStorage` feedback data via a small client-side export mechanism. Feed into `watch-plan.js` scoring to boost/demote events matching user feedback patterns. ~80 lines across 2 files.

- [PENDING] Wire autonomy score into GitHub Actions summary — Add autonomy score to the workflow step summary output alongside pipeline health. Requires workflow file change (needs human approval).

- [DONE] (PR #48) Add trend tracking to autonomy scorecard — Added `trackTrend()` and `detectRegressions()` to track autonomy score over time in `autonomy-trend.json`. Wired into pipeline-health.js.

- [PENDING] Add preference evolution logic — Observe which events get expanded/clicked in the dashboard, which sports dominate engagement. Periodically update `user-context.json` sport weights to reflect actual interest patterns. ~100 lines, new script.

- [PENDING] Add opportunity detection to autopilot scouting — After completing roadmap tasks, analyze RSS trends + coverage gaps + engagement signals to identify new features or data sources worth adding. Propose as new roadmap tasks. ~60 lines added to autopilot prompt.

- [PENDING] Replace silent pipeline failures with structured error reporting — Audit all `|| echo "failed"` handlers in the pipeline. Replace with structured error objects in `health-report.json` that the autopilot can read and attempt to repair. ~120 lines across 3-4 files.
