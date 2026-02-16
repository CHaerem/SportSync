# Autopilot Roadmap

Self-curated task queue for the Claude autopilot workflow. The autopilot discovers tasks via creative scouting, picks the first `[PENDING]` task, executes it, and opens a PR. It loops through multiple tasks per run. Reorder tasks to change priority.

## Task Format

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed
- `[BLOCKED]` reason — Cannot proceed until unblocked

---

## Scouting Heuristics

When scouting for improvement opportunities, apply these detection patterns in addition to the standard checks (dead code, TODO comments, missing tests):

### A. Dead Field Detection

Scan `scripts/build-events.js` event schema for fields that are always empty or default in `docs/data/events.json`. For each dead field, check if the data source (fetcher in `scripts/fetch/`) already has the data to populate it.

**How to check:** Load `events.json`, iterate events, find fields that are always `[]`, `null`, `""`, or `0` across all entries. Cross-reference with the fetcher output to see if the data exists upstream but isn't being mapped.

**Example:** `featuredGroups` is always `[]` on golf events, but `scripts/fetch/golf.js` already scrapes PGA Tour tee times for all field players — grouping by tee time + starting hole gives us pairings for free.

### B. Data-to-UI Gap Detection

Compare fields loaded in `docs/js/dashboard.js` vs what's actually rendered. Fields that are loaded or destructured but never appear in any `render*()` method are dead UI paths.

**How to check:** Search for field names in dashboard.js data loading (e.g., `featured.json` parse, `events.json` parse) and verify each field has a corresponding render path that produces visible DOM output.

**Example:** `featuredGroups` is loaded but no render code references it — the data flows through the pipeline but is invisible to users.

### C. Fetcher Data Waste Detection

Check if API fetchers extract data that's discarded or only partially used. Fetchers may parse rich API responses but only store a subset of the available fields.

**How to check:** Read each fetcher's API response handling and compare the fields extracted vs the fields written to the output JSON. Flag cases where useful data (names, times, scores, stats) is available but dropped.

**Example:** PGA Tour scraper gets tee times for 150+ players but only stores Norwegian players' times on events — groupmate names are available in the same API response but discarded.

### D. Data Quality Scouting (Sanity Report)

Read `docs/data/sanity-report.json` — look for findings with `"actionable": true`. These are LLM-detected data quality issues from the pipeline's AI sanity check (`scripts/ai-sanity-check.js`).

For each actionable finding, investigate the root cause in the code and create a `[PENDING]` task with a specific fix description. The finding's `message` field contains detail about which field is wrong, what the expected value would be, and what component likely caused it (fetcher, enrichment, config).

**How to check:** Read `sanity-report.json`, filter findings for `actionable: true`, and cross-reference with the relevant fetcher or script. If the issue is transient (API downtime), skip it. If it's a code bug or missing data path, create a task.

**Example:** Finding says "golf event with 80 totalPlayers but all norwegianPlayers have null teeTime during in-progress tournament — likely fetcher issue in scripts/fetch/golf.js". Investigate the tee-time scraping logic and create a task to fix the data path.

### E. Pattern Report Analysis

Read `docs/data/pattern-report.json` (generated every 2h by `scripts/analyze-patterns.js`). For each high-severity pattern, create a `[PENDING]` task:

- **`hint_fatigue`** — The hint-based correction isn't working. Don't add more hints — investigate the underlying code or data issue that prevents the metric from improving. Example: if `mustWatchCoverage` hint has fired 15+ times, the problem is in how featured content selects events, not in the prompt.
- **`stagnant_loop`** — A feedback loop score is stuck below 1.0 across many runs. Check what's needed to close it (missing script, missing data, broken wiring). The `suggestion` field describes the specific loop.
- **`quality_decline`** — A quality metric is trending downward. Investigate recent changes to prompts, data pipeline, or enrichment logic that may have caused the regression.
- **`recurring_health_warning`** — The same health issue keeps firing every pipeline run. Fix the root cause (broken API, stale data source, config issue) rather than letting it accumulate.
- **`autopilot_failure_pattern`** — Tasks are failing repeatedly. Mark them `[BLOCKED]` with a reason, or investigate the common failure mode.

**How to check:** Read `pattern-report.json`, filter for `severity: "high"`, and create one task per pattern. Use the `suggestion` field as the task description.

### F. Opportunity Detection (RSS + Coverage Gaps)

Identify new sports, events, or data sources the dashboard should cover based on what's trending in the news but missing from the data.

**How to check:** Read `docs/data/rss-digest.json` and `docs/data/coverage-gaps.json`. Look for:
- A sport or event mentioned repeatedly in RSS that has no fetcher or curated config
- Norwegian athletes in the news who aren't tracked in `user-context.json`
- A new league/tour season starting that needs a config (e.g., OBOS-ligaen spring season)

**Action:** Create a task to add the data source. For API-backed sports, this means writing a new fetcher in `scripts/fetch/` that outputs `{ tournaments: [...] }` — it auto-flows into events.json. For event-based sports, create a curated config in `scripts/config/`.

**Example:** RSS shows multiple cycling headlines about Tour of Norway with a Norwegian stage winner → create task to add cycling fetcher using a public cycling API or curated config.

### G. Dashboard UX Improvement

Read the dashboard code (`docs/index.html`, `docs/js/dashboard.js`) and reason about the user experience. The dashboard is the entire product — visual improvements directly impact value.

**How to check:**
- Read the HTML structure and CSS. Is the visual hierarchy clear? Are must-watch events visually distinct from minor ones?
- Read the `render*()` methods in dashboard.js. Is data being presented in the most useful format?
- Check what data exists in `events.json`, `standings.json`, `watch-plan.json`, `recent-results.json` but isn't rendered or is underutilized.
- Look at the mobile experience (480px max-width constraint). Does the layout work well at that width?

**Action:** Create tasks for specific visual or interaction improvements. Each task should describe WHAT changes, WHERE in the code, and WHY it improves the experience. Keep tasks small (≤300 lines) and independently shippable.

**Examples:**
- "Standings data exists but only appears in editorial brief text — add collapsible inline PL table widget to football section"
- "Must-watch events use subtle accent background but could have a more prominent visual treatment — add a ★ badge or border style"
- "Recent results band is collapsed by default — experiment with showing the most recent favorite-team result prominently"

### H. New Capability Seeding

Look for small additions that enable larger future capabilities. The best autonomous improvements are ones that create stepping stones.

**How to check:** Read `CLAUDE.md` Phase 1-4 roadmap and the blocked tasks below. Ask: is there a small, shippable change (≤300 lines) that partially unblocks something larger?

**Action:** Create tasks that are independently valuable AND unlock future work. Clearly note in the task description what larger capability this enables.

**Examples:**
- "Add a lightweight event-click counter in dashboard.js (localStorage) — enables future preference evolution by tracking which sports/events the user actually engages with" (stepping stone for Phase 2)
- "Write a `scripts/export-engagement.js` that reads localStorage engagement data on next page load and writes to a data file — bridges client-side signals to the server-side pipeline" (stepping stone for feedback loop)
- "Add configurable dashboard sections order in user-context.json — enables future personalization of which sports appear first"

### I. User Feedback Processing

Check for GitHub Issues with the `user-feedback` label created by the repo owner (`CHaerem`). These contain structured feedback from the dashboard's feedback system.

**How to check:** Run `gh issue list --label user-feedback --state open --author CHaerem`. For each issue, parse the JSON block in the issue body.

**Processing rules:**

1. **Favorites** (`favorites` object): Contains `favoriteTeams`, `favoritePlayers`, and `engagement` (click counts per sport). Compare against current `user-context.json` — if the user has starred new teams/players not in the config, add them. If engagement data shows heavy usage of a sport, increase its weight in `sportPreferences`. Look for patterns across multiple submissions before making changes.

2. **Reports** (`reports` array): Misinformation or data issues. For each report, investigate the root cause (wrong API data, stale config, enrichment error). Create a `[PENDING]` fix task if it's a code issue, or note it as transient if it's API-side.

3. **Suggestions** (`suggestions` array): New sports, events, features. Create new curated configs for event/sport requests. Add feature requests as `[PENDING]` tasks in the roadmap. Update `user-context.json` for preference changes (new favorite teams, players).

**After processing:** Close the issue with a comment summarizing actions taken. If changes were made to `user-context.json` or configs, include them in the next autopilot PR.

---

## EXPERIENCE Lane (User Impact)

Keep this section near the top so the autopilot continuously improves user-facing outcomes, not just code hygiene.

### Active KPIs

- `watch_plan_engagement` — % of sessions that expand at least one suggested watch item
- `enrichment_coverage` — % of events with importance, summary, tags, and Norwegian relevance
- `featured_quality_score` — quality gate score from `docs/data/ai-quality.json`

### Current Tasks

- [DONE] (PR #49) Populate golf `featuredGroups` in fetcher — Added `buildFeaturedGroups()` to `scripts/fetch/golf.js` that groups PGA Tour field players by teeTime + startingHole and stores groupmates for each Norwegian player.

- [DONE] (PR #50) Render golf `featuredGroups` in dashboard — Added "Playing with: X, Y" display under each Norwegian player's tee time in expanded golf event view. CSS class `.exp-playing-with` added to `index.html`.

- [BLOCKED] reverted — user prefers manual user-context.json | Add watch-plan feedback loop — PR #47 was reverted. Thumbs-up/down controls are not wanted at this time.

- [BLOCKED] reverted — depends on feedback UI | Track recommendation conversion signals — Add lightweight client-side telemetry counters for `watch-plan` item clicks and streaming-link opens.

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
Claude generates featured.json (block-based editorial content)
                                        ↓
Dashboard renders featured.json flexibly — no frontend changes needed
```

**`featured.json` schema:**
- **blocks**: array of editorial blocks (types: "headline", "event-line", "event-group", "narrative", "section", "divider")
- Date-specific briefings: `featured-{YYYY-MM-DD}.json` with `_meta.date` and `_meta.mode` (recap/preview)

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

- [BLOCKED] reverted — user prefers manual user-context.json | Add thumbs-up/down feedback to watch-plan items — PR #47 was reverted.

- [BLOCKED] reverted — depends on feedback UI | Surface engagement signals in pipeline — Read `localStorage` feedback data via a small client-side export mechanism. Feed into `watch-plan.js` scoring to boost/demote events matching user feedback patterns. ~80 lines across 2 files.

- [BLOCKED] protected path — requires `.github/workflows/` modification | Wire autonomy score into GitHub Actions summary — Add autonomy score to the workflow step summary output alongside pipeline health.

- [DONE] (PR #48) Add trend tracking to autonomy scorecard — Added `trackTrend()` and `detectRegressions()` to track autonomy score over time in `autonomy-trend.json`. Wired into pipeline-health.js.

- [DONE] (PR #51) Add client-side engagement tracking — Added `trackEngagement()` to `preferences-manager.js` that records per-sport click counts and timestamps in localStorage. Wired into dashboard expand handler.

- [BLOCKED] depends on engagement tracking + data export | Add preference evolution pipeline script — New script to read engagement data and update `user-context.json` sport weights. Requires a mechanism to get client-side localStorage data back to the pipeline.

- [DONE] (manual session) Add opportunity detection to autopilot scouting — Expanded Step 2 scouting prompt with creative scouting (2b): reads RSS, coverage gaps, quality history, standings, and dashboard code to propose features, UX improvements, and new capabilities. Added heuristics F (opportunity detection), G (dashboard UX), H (capability seeding) to roadmap.

- [BLOCKED] protected path — all `|| echo "failed"` handlers are in `.github/workflows/update-sports-data.yml` | Replace silent pipeline failures with structured error reporting — Requires workflow file modification which is a protected path.

---

## Scouted Tasks (2026-02-12, run 2)

### HIGH Priority

- [DONE] (PR #53) Add keyboard accessibility to event rows — Added `role="button"`, `tabindex="0"`, `aria-expanded` to event row divs and delegated keydown handler for Enter/Space expand toggle.

### MEDIUM Priority

- [DONE] (PR #54) Render chess/tennis participants in expanded view — Added "Players: X, Y" display in expanded event view for chess/tennis events. Handles both string and object participant formats.

- [DONE] (PR #55) Add unit tests for `scripts/fetch/golf.js` — 30 tests covering playerNameMatches, parseTeeTimeToUTC, tournamentNameMatches, filterNorwegiansAgainstField, and buildFeaturedGroups.

### LOW Priority

- [DONE] (already resolved) Remove unused `meta` field from dashboard event loading — `ev.meta` is not loaded in the event mapping. The `meta` references in dashboard.js are for `this.meta` (loaded from `meta.json`), which is actively used for freshness display. No change needed.

---

## Scouted Tasks (2026-02-12, run 3)

### HIGH Priority

- [DONE] (PR #56) Add keyboard accessibility to band toggles — Added keydown handler for Enter/Space on band toggle labels. News toggle already uses native `<button>` with built-in keyboard support.

### MEDIUM Priority

- [DONE] (PR #58) Add unit tests for `scripts/fetch/football.js` — 28 tests covering checkFavorite, transformToEvents, applyCustomFilters, fetchFotballNo, and fetchFromSource.

- [DONE] (PR #57) Clamp inline style values in dashboard rendering — Parsed shots/onTarget stats as integers via `parseInt()` instead of raw strings.

### LOW Priority

- [DONE] (PR #57) Add structured logging to live polling catch blocks — Replaced silent catch blocks with `console.debug` logging for development diagnostics.

---

## Scouted Tasks (2026-02-13)

### HIGH Priority

- [DONE] (PR #59) Add `aria-expanded` to news toggle button — Added attribute to button HTML and toggle in click handler.

- [DONE] (PR #59) Remove dead `summaryLine()` export — Removed unused function from helpers.js.

- [DONE] (PR #59) Remove unused `golf-refactored.js` — Deleted file never imported by any module.

### MEDIUM Priority

- [DONE] (PR #60) Add unit tests for `scripts/fetch/tennis.js` — 11 tests covering transformESPNEvent, participant extraction, Norwegian player detection, and filter modes.

- [DONE] (PR #61) Add unit tests for `scripts/fetch/chess.js` — 21 tests covering findNorwegianPlayers, Lichess broadcast processing, curated tournaments, and event normalization.

- [DONE] (PR #62) Add unit tests for `scripts/fetch/esports.js` — 21 tests covering extractTeamName, HLTV staleness detection, major event patterns, and focus team filtering.

- [DONE] (PR #67) Add unit tests for `scripts/fetch/fotball-no.js` — 19 tests covering extractIcsField, parseIcsDateTime (date-only, CET, CEST), and parseIcsForLynMatches (Lyn extraction, TZID handling, edge cases).

### LOW Priority

- [DONE] (PR #68) Add descriptive alt text to brief-line images — Added team/player name as alt text on brief-line logo and headshot images for screen reader accessibility.

---

## Scouted Tasks (2026-02-14)

### HIGH Priority

- [DONE] (PR #73) Add `aria-label` to favorite buttons in expanded view — Added aria-label showing add/remove state for screen readers.

- [DONE] (PR #73) Add keyboard accessibility to watch-plan picks — Added role="button", tabindex="0", and Enter/Space keydown handler.

### MEDIUM Priority

- [DONE] (PR #73) Add `aria-label` to streaming badge links — Added aria-label with "Watch on {platform}" text.

- [DONE] (PR #74) Add validation and helper tests for `scripts/fetch-results.js` — Exported formatDate, isFavoriteTeam, isFavoritePlayer. Added 31 tests for validation and helper functions.

- [DONE] (already resolved) Add unit tests for `scripts/fetch-rss.js` — Test file already exists with 17 tests covering parseRssItems, isNorwegianRelevant, filterRecent, buildRssContext, and schema.

### LOW Priority

- [DONE] (already resolved) Add alt text to expanded view team logos — Expanded view logos already have descriptive alt text. Brief-line logo alt text fixed in PR #73.

### Data Quality (Not Code Fixable)

- [BLOCKED] data availability — Tennis zero events: ESPN API returns matches but all filtered out by exclusive Norwegian filter (no Casper Ruud matches currently scheduled). Will resolve when tennis season resumes.

- [BLOCKED] stale upstream API — Esports zero events: HLTV API returns data older than 30 days, rejected by staleness check. Needs fresh data source or curated config expansion.

---

## Scouted Tasks (2026-02-15)

### HIGH Priority

- [DONE] (PR #75) Hide F1 standings when all drivers have zero points — Added guard to `renderF1Standings()` to skip rendering when all driver points are zero (pre-season/stale data).

- [DONE] (PR #77) Add Norwegian relevance badge to event rows — Added 🇳🇴 flag indicator next to events with Norwegian interest (norwegian flag, norwegianPlayers, or norwegianRelevance >= 4).

### MEDIUM Priority

- [DONE] (PR #78) Render recap headlines in recent results band — Added italic `recapHeadline` text under result score lines. Flows from `recent-results.json` through result pseudo-events to the UI.

- [DONE] (PR #79) Add live status indicator to watch-plan picks — Added LIVE (pulsing dot) and FT badges to watch-plan picks using live score polling and time-based inference.

### LOW Priority

- [DONE] (PR #80) Visualize watch-plan pick confidence scores — Added thin accent-colored confidence bar under each pick, width proportional to match score (normalized to 150).

### Data Quality (Not Code Fixable)

- [BLOCKED] data availability — RSS recap headline matching (0% rate): RSS feeds are dominated by Winter Olympics content. The `matchRssHeadline()` function works correctly but RSS simply lacks football match recap headlines during Olympics period. Will self-resolve as Olympics end.

---

## Known Limitations (Do Not Attempt to Fix)

### Usage API scope limitation

`scripts/track-usage.js` calls the Anthropic usage API (`GET api.anthropic.com/api/oauth/usage`) to get real utilization %. This currently returns a permission error in CI because `claude setup-token` only grants `user:inference` scope, while the usage endpoint requires `user:profile`. This is a known upstream bug: [anthropics/claude-code#11985](https://github.com/anthropics/claude-code/issues/11985).

**Do NOT attempt to fix this** — no code change on our side can resolve it. The run-count and duration tracking in `usage-tracking.json` works correctly as a fallback. Once Anthropic ships a fix (adding `user:profile` to `setup-token`), real utilization data will flow automatically without any code changes.

The `docs/status.html` quota card already handles both states: it shows utilization bars when API data is available, and falls back to run-count / duration display when it's not.
