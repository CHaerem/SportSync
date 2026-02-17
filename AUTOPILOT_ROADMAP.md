# Autopilot Roadmap

Self-curated task queue for the Claude autopilot workflow. The autopilot discovers tasks via creative scouting, picks the first `[PENDING]` task, executes it, and opens a PR. It loops through multiple tasks per run. Reorder tasks to change priority.

## Task Format

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed
- `[BLOCKED]` reason — Cannot proceed until unblocked

### Task Tiers

Each `[PENDING]` task may have a tier tag. If no tier is specified, `[MAINTENANCE]` is the default.

| Tier | Tag | Files | Lines | Behavior |
|------|-----|-------|-------|----------|
| Maintenance | `[MAINTENANCE]` | 8 | 300 | Single PR, auto-merge (default) |
| Feature | `[FEATURE]` | 12 | 500 | Single PR, auto-merge — for new capabilities |
| Explore | `[EXPLORE]` | 0 | 0 | Read-only investigation — no code changes, no PRs |

**`[EXPLORE]` tasks** are for strategic investigation. The autopilot reads code, data, and APIs, writes a findings summary in the roadmap, and creates concrete `[PENDING]` tasks from findings. No branches, no PRs.

**Example:** `- [EXPLORE] Investigate handball data sources — Check if free APIs exist, evaluate coverage quality, determine if a fetcher is feasible`

---

## Change Principles Gate

Before creating or executing ANY task, verify it passes the Change Principles from `CLAUDE.md`:

1. **Vision alignment** — Which autonomy pillar does this serve? (data, code, capabilities, personalization, quality)
2. **Close the loop** — Does this add detection so the system catches similar issues autonomously in the future?
3. **Zero infrastructure** — Does this stay within GitHub Actions + Claude Code Max + GitHub Pages?
4. **Autonomous by default** — Does this work without ongoing human intervention?
5. **Measurable impact** — How will we know this change is working? (metrics, health checks, quality scores)
6. **Compound learning** — Does this run leave the system smarter, not just better? Record what works.
7. **Tier limits** — Does this task fit within its tier's file/line limits? (see Task Tiers above)

If a scouted improvement fails any principle, either redesign it to pass or skip it. A code cleanup that doesn't close the loop (add a test, health check, or detection) is incomplete.

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
- **Read `health-report.json` issues with code prefix `editorial_*`** — These are automated detections of editorial quality issues (unsorted events, missing personalization, content duplication, no narrative). Each issue has a specific fix path.
- **Take a screenshot** (`node scripts/screenshot.js --full-page`) and read it with the Read tool. Look for visual issues: misaligned sections, awkward spacing, missing visual hierarchy, data that appears but has no visual distinction from surrounding content.

**Action:** Create tasks for specific visual or interaction improvements. Each task should describe WHAT changes, WHERE in the code, and WHY it improves the experience. Keep tasks small (≤300 lines) and independently shippable.

**Examples:**
- "Standings data exists but only appears in editorial brief text — add collapsible inline PL table widget to football section"
- "Must-watch events use subtle accent background but could have a more prominent visual treatment — add a ★ badge or border style"
- "Recent results band is collapsed by default — experiment with showing the most recent favorite-team result prominently"
- "health-report shows `editorial_unsorted_events` — fix `generateFallbackThisWeek()` to sort picked events by date"
- "health-report shows `editorial_missing_personalization` — add Norwegian flag indicators to Olympics section items"

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

### J. Upstream Issue Resolution Detection

Monitor external dependencies documented in "Known Limitations" below. When an upstream issue is resolved, the system should detect it and create a task to remove workarounds.

**How to check:**

1. Read `docs/data/health-report.json` — check `quotaApiHealth.transitioned`. If `true` and `available` is `true`, the quota API scope issue is resolved. Create a `[PENDING]` task to validate the data and clean up workaround code.

2. Read `docs/data/usage-tracking.json` — check `quotaApiStatus.available`. If it has been `true` for 3+ consecutive runs, the fix is stable.

3. For GitHub issue tracking: run `gh issue view 11985 --repo anthropics/claude-code --json state -q '.state'`. If the state is `CLOSED`, the upstream fix may be available. Cross-reference with the `quotaApiStatus` data.

**Action:** When an upstream limitation is confirmed resolved:
- Create a `[PENDING]` task to validate the fix (e.g., verify real utilization data is flowing)
- Create a follow-up task to remove any workaround code or "unavailable" UI messages
- Update the "Known Limitations" section to mark the issue as resolved

**Example:** If the quota API starts returning real utilization data, create a task: "Quota API scope fixed — validate real utilization data and update status page to remove unavailable message."

### K. Vision-Guided Exploration

Strategic scouting that reasons about the autonomy vision rather than pattern-matching. This heuristic enables the autopilot to think beyond code health and propose capability expansions.

**How to check:**
1. Read `docs/data/capabilities.json` — what gaps exist in sports coverage, live scores, standings, results?
2. Read `docs/data/preference-evolution.json` — what sports does the user engage with most?
3. Read `CLAUDE.md` "What's Missing" table — what's the next step toward full autonomy?
4. Read `docs/data/rss-digest.json` — what's trending that we don't cover?
5. Read `scripts/pipeline-manifest.json` — what pipeline steps could be added for value?

**Ask:** "What single change would most advance the autonomy vision while serving the user?"

**Action:** Create `[EXPLORE]` tasks for strategic investigations, or `[FEATURE]` tasks for concrete capabilities. Always link back to which vision pillar (data/code/capabilities/personalization/quality) this serves.

**Examples:**
- `[EXPLORE]` "Investigate cycling data sources for Tour de France coverage" — the user's RSS shows cycling interest but we have no cycling fetcher (capabilities pillar)
- `[FEATURE]` "Add handball fetcher using free API" — user-context.json shows Norwegian focus, handball is a major Norwegian sport (data + personalization pillars)
- `[EXPLORE]` "Evaluate client-side feedback mechanisms beyond localStorage" — the preference evolution loop is working but limited to click counts (quality pillar)

### L. Visual Density Detection

Monitor the dashboard for visual clutter — too many competing card styles, borders, and decorative elements reduce readability.

**How to check:**
1. Take a screenshot via `scripts/screenshot.js`
2. Read the CSS in `docs/index.html` and count distinct visual treatments (backgrounds, borders, cards, pills, badges)
3. Read `docs/js/dashboard.js` render methods — count how many different card/container styles coexist on the "today" page

**Flag when:** More than 4 different card/container styles (e.g., featured-section cards, insight cards, watch-plan picks, event rows, standings tables) all use different visual treatments (borders, backgrounds, shadows, colored accents).

**Action:** Create a `[MAINTENANCE]` task to consolidate visual treatments. The dashboard should have at most 3 distinct container styles: (1) editorial/featured sections, (2) event rows, (3) data tables. Everything else should be inline text or simple dividers.

**Example:** "Consolidate 5 separate standings widgets into one collapsible section" — reduces visual noise by moving from 5 independently-styled collapsible sections to one.

### M. Architectural Fitness

Evaluate whether the codebase structure is healthy — not too fragmented (many tiny scripts), not too monolithic, not too coupled. The system should develop architectural taste through experience.

**How to check:**
1. Read `docs/data/pattern-report.json` — look for patterns with type prefix `architecture_`
2. For each finding, evaluate the severity and the suggested consolidation targets
3. Read the `architectureBaseline` section — compare current metrics to the baseline to see which direction the codebase is trending

**Action rules:**
- `architecture_module_proliferation` (medium): Create `[MAINTENANCE]` task to consolidate the suggested module pairs. Each task should merge exactly 2-3 related modules, update imports, and run tests.
- `architecture_module_proliferation` (high): Create `[FEATURE]` task for a larger refactoring — reorganize the script directory structure.
- `architecture_small_module_ratio`: Identify modules under 30 lines that are imported by exactly one consumer → inline them.
- `architecture_pipeline_bloat`: Identify pipeline steps that always run together or have trivial logic → combine into single steps.
- `architecture_low_test_coverage`: Create `[MAINTENANCE]` tasks to add tests for untested modules.
- `architecture_orphan_scripts`: Verify if orphans are needed. If unused, delete. If needed, wire into pipeline or package.json.

**After completing a refactoring task:** Run the fitness detector again and compare to the `architectureBaseline`. Record the delta in the Lessons section — e.g., "Consolidated X+Y: module count -1, no test regressions, pipeline 2s faster." This feedback compounds into better thresholds over time.

**Example tasks:**
- `[MAINTENANCE]` "Consolidate track-prediction-accuracy.js into analyze-patterns.js as Detector 9"
- `[MAINTENANCE]` "Inline norwegian-streaming.js into its only consumer"
- `[MAINTENANCE]` "Add tests for 5 untested scripts in scripts/"

---

## Lessons & Effectiveness

*This section is maintained by the autopilot. It accumulates knowledge across runs.*

### Task Efficiency Patterns

- **Direct-to-main saves 5+ turns for LOW-risk changes**: Inline golf/F1 widgets took 4 turns direct vs ~12 for branch-pr. Safe when changes are contained to one file and follow existing patterns.
- **Pipeline scripts (generate-insights) take ~15 turns**: Main time cost is understanding data structures and writing comprehensive tests. Watch for falsy zero with `||` — use `??` for numeric map lookups.
- **Extending existing scripts (evolve-preferences) is efficient at ~10 turns**: Pattern is clear, tests are additive. Key: understand data flow before coding.
- **Caching improvements are high-leverage**: Event fingerprinting (6 turns) saves AI calls on every pipeline run. Compound returns.
- **Always verify existing implementations before starting**: Multiple tasks in early roadmap were already done but not marked. Check code first, then code.

### Heuristic Effectiveness

| Heuristic | Tasks Found | Tasks Completed | Hit Rate | Notes |
|-----------|-------------|-----------------|----------|-------|
| A. Dead Field | 1 | 1 | 100% | Golf featuredGroups (PR #49-50) |
| B. Data-to-UI Gap | 3 | 3 | 100% | Inline PL/golf/F1 standings, insights rendering |
| C. Fetcher Waste | 0 | 0 | - | Not yet applied systematically |
| D. Sanity Report | 2 | 0 | 0% | Findings are mostly data/API issues, not code bugs |
| E. Pattern Report | 3 | 2 | 67% | Health warning fix (PR #96), hint fatigue still data-driven |
| F. Opportunity | 2 | 0 | 0% | Winter sports + cycling identified, not yet implemented |
| G. Dashboard UX | 5 | 5 | 100% | a11y, PL table, watch-plan UI, insights cards |
| H. Capability Seed | 2 | 2 | 100% | generate-insights, event fingerprinting |
| I. User Feedback | 0 | 0 | - | No feedback issues submitted yet |
| J. Upstream Issues | 0 | 0 | - | Quota API still unavailable |
| K. Vision-Guided | 3 | 2 | 67% | Favorites evolution, insights pipeline |
| L. Visual Density | 0 | 0 | - | Not yet applied |
| M. Architectural Fitness | 0 | 0 | - | New — reads pattern-report architecture_* findings |

### Pillar Progress

| Pillar | Estimated Maturity | Last Advanced | Notes |
|--------|-------------------|---------------|-------|
| 1. Data | ~90% | 2026-02-17 | Tennis tournament-level events fixed, diagnostic files initialized, 6 APIs + tennis rankings |
| 2. Code | ~83% | 2026-02-17 | 104 PRs, 1450 tests |
| 3. Capabilities | ~68% | 2026-02-17 | Pipeline manifest, generate-insights, 5 inline standings widgets, For You block, component template system |
| 4. Personalization | ~58% | 2026-02-17 | For You editorial block, contextual empty-sport notes, watch-plan feedback loop, sport weights evolve |
| 5. Quality | ~90% | 2026-02-16 | 11 loops, hint fatigue demoted to info |

### Run History Insights

**Run 2026-02-17:** 4 tasks completed (2 direct-to-main, 2 branch-pr) + 2 explore tasks resolved + 6 new tasks scouted.
- Empty-sport notes with data reasons: 4 turns, direct-to-main. Quick UX win.
- Missing diagnostic files: 2 turns, direct-to-main. Trivial but necessary.
- Tennis tournament-level events (PR #103): 10 turns, branch-pr. Root cause was ESPN API structure (0 competitions = dropped).
- For You editorial block (PR #104): 8 turns, branch-pr. Deterministic personalization, no LLM dependency.
- Explore tasks (winter sports, cycling): Researched via subagent. No public APIs for IBU/FIS/cycling. Curated configs recommended.
- Scouting found 6 new tasks. Pattern report analysis revealed must-watch coverage decline and stale data patterns.
- **Key insight**: ESPN tennis API returns tournament-level entries, not match-level. The assumption "0 events = no data" was wrong — the data existed but was dropped by the base adapter.

**Run 2026-02-16 (Run 3):** 7 tasks completed (1 already done, 2 branch-pr, 4 direct-to-main). Most productive run yet:
- Watch-plan feedback scoring (PR #101): 8 turns, branch-pr. Closes personalization loop.
- Empty-sport notes: 4 turns, direct-to-main. Quick UI win.
- Tennis ATP/WTA rankings (PR #102): 10 turns, branch-pr. New data source + editorial context.
- Inline tennis widget: 4 turns, direct-to-main. Data→UI gap closed in same run.
- PipelineHealth loop fix: 5 turns, direct-to-main. Unblocks autonomy scoring.
- La Liga inline widget: 4 turns, direct-to-main. Fifth inline standings widget.
- Patterns: chaining data→UI tasks maximizes value. Direct-to-main is safe and efficient.
- 6 new tasks scouted. Total: ~40 turns for 7 tasks + scouting.

**Run 2026-02-16 (Run 2):** 4 tasks completed + 7 tasks scouted. First run using process strategy file. Key learnings:
- Direct-to-main mode works well for single-file UI changes (2 uses, 0 issues)
- Branch-pr mode used for multi-file logic changes (2 uses, 0 merge conflicts)
- First pipeline step added via manifest editing (generate-insights) — proves Pillar 3 capability
- Most pattern-report issues are data availability (Olympics, API timing), not code bugs
- Scouting found actionable UX + pipeline tasks. Heuristics B, G, H most productive.

---

## Sprint: Foundation

Seeded tasks for rapid early-stage improvement. Organized by pillar. The autopilot should work through these in sprint mode (85% execution, 10% scouting, 5% meta-learning).

### Pillar 1: Self-Maintaining Data

1. [DONE] (PR #103) **Fix tennis zero events** — ESPN returns tournament-level events with 0 competitions. Added tournament-level event handling in focused mode: creates events from tournament entries (name, dates, venue) when no match data exists. Completed tournaments filtered out. 5 new tests.

2. [DONE] (PR #85) **Fix hint fatigue: add RESULTS and SANITY to hintMetricMap** — Already fixed in PR #85. hintMetricMap now includes "results note"→resultsScore and "sanity"→sanityScore. Pattern report will reflect this on next pipeline run.

3. [DONE] (already implemented) **Add results tracking for tennis** — `fetchTennisResults()`, `validateTennisResult()`, and `mergeTennisResults()` already exist in `scripts/fetch-results.js` with full ATP/WTA support and Casper Ruud favorite tagging.

4. [DONE] (already implemented) **Add results tracking for F1** — `fetchF1Results()`, `validateF1Result()`, and `mergeF1Results()` already exist in `scripts/fetch-results.js` with race/sprint result tracking and 30-day retention.

5. [PENDING] [FEATURE] **Fix esports data staleness** — HLTV community API returns data from 2022. Options: (a) expand curated config `esports-cs2-2026.json` with current tournament data, (b) add HLTV web scraping as fallback, or (c) switch to Liquipedia API. Investigate and implement best option.

6. [DONE] (PR #96) **Resolve recurring health warnings** — Demoted `sport_zero_events` from `warning` to `info` when data is fresh. Only warns when data is also stale (>6h). Stops 88+ recurring false alarms for tennis/esports.

7. [DONE] (already implemented) **Add golf empty-competitor fallback** — Golf fetcher already handles empty competitors at line 631-710: includes events with `fieldPending: true` when ESPN returns empty arrays. `retainLastGood()` in helpers.js prevents stale golf.json by retaining previous data when new fetch has no events.

8. [DONE] (explored, run 2026-02-17) **Investigate new sport data sources** — Researched biathlon (IBU), cross-country skiing (FIS), and cycling APIs. Findings:
   - **IBU Biathlon**: No public REST API. ibu.org has real-time results pages but no documented API. Web scraping feasible but fragile. Norwegian athletes (J.T. Boe, Laegreid) well-covered.
   - **FIS Cross-country**: No public API. fis-ski.com renders data client-side. Data feeds exist but undocumented. Norwegian dominance (Klaebo, Johaug). Medium difficulty to build a scraper.
   - **Cycling**: ProCyclingStats has comprehensive data but no public API. firstcycling.com has some structured data. UCI doesn't offer public APIs. Norwegian cyclists (Hoelgaard) are minor presences.
   - **Recommendation**: Curated configs for major events (World Championships, Olympics) is the practical path. A dedicated fetcher for IBU/FIS would require web scraping and ongoing maintenance — better suited as a future `[FEATURE]` task once the scraping infrastructure is proven.

### Pillar 2: Self-Maintaining Code

9. [DONE] (already implemented) **Add tests for analyze-patterns.js** — 48 tests already exist in `tests/analyze-patterns.test.js` covering all 5 detectors + orchestrator. Added in PR #85.

10. [DONE] (already implemented) **Add tests for pipeline-health.js** — `tests/pipeline-health.test.js` already has 42 tests covering sport coverage, freshness checks, health report generation, snapshot health, quota API, results validation, and status summary.

11. [DONE] (already implemented) **Add tests for sync-configs.js** — `tests/sync-configs.test.js` already has 20 tests covering pruneExpiredEvents, shouldArchive, shouldResearch, syncConfigs orchestrator, roster syncing, and cleanupArchive.

12. [DONE] (resolved — no longer failing) **Fix pre-existing test failure in validate-events-extended** — The "fails on past events (beyond grace window)" test was reported as intermittently failing but passes consistently now. The test uses a 15-day-old fixture with a 14-day grace window, which is deterministic. Likely the original failure was transient.

13. [DONE] (PR #87) **Add error categorization to pipeline-result.json** — Added `categorizeError()` function and `errorCategory` field on failed steps (timeout|network|auth|validation|parse|command|unknown). 11 new tests.

### Pillar 3: Self-Expanding Capabilities

14. [DONE] (direct + PR #97) **Inline standings widgets** — PL mini-table (PR #97), golf leaderboard, and F1 driver standings widgets added as collapsible inline sections. All three use the exp-mini-table pattern with band toggle.

15. [DONE] (PR #97) **Add inline Premier League mini-table** — Collapsible top-5 + favorites PL standings table in the events section. Uses existing exp-mini-table styling and band toggle pattern.

16. [DONE] (PR #100) **Add generate-insights pipeline step** — Created `scripts/generate-insights.js` with football streaks, standings gaps, golf leaderboard, F1 championship, and high-scoring match analysis. Dashboard renders top 5 as accent cards. 22 tests.

17. [DONE] (explored, run 2026-02-17) **Investigate biathlon/cross-country data** — See task #8 findings. No public APIs available for IBU or FIS. Curated configs recommended for major events. Web scraping feasible but fragile — better as future `[FEATURE]` if scraping infrastructure exists.

18. [DONE] (direct) **Add day-specific editorial caching** — Preview briefings now use MD5 event fingerprints for change detection. Only regenerates when events for the preview date actually change, instead of fixed 24h timer. Falls back to time-based staleness for legacy files. 6 tests.

### Pillar 4: Personalized Output

19. [DONE] (PR #98) **Add thumbs-up/down on watch-plan picks** — Feedback buttons on watch-plan picks with toggle behavior, stored in localStorage via PreferencesManager. CSS with accent active state.

20. [DONE] (PR #99) **Evolve favorite teams from engagement data** — Extended `evolve-preferences.js` to sync favorite teams/players from client-side exports into `user-context.json`. Case-insensitive deduplication. Reads from GitHub Issues + local file. 14 new tests.

21. [DONE] (PR #86) **Add sport-section ordering by preference** — Added SPORT_WEIGHT fallback map in dashboard.js renderBand(). Events sort by engagement clicks + preference weight (high=3, medium=2, low=1), giving sensible ordering even for new users.

22. [DONE] (PR #104) **Add personalized "For You" editorial block** — Added `buildForYouBlock()` to generate-featured.js. Deterministic scoring: favorite teams (+10), players (+10), Norwegian (+3), high-pref sport (+2), must-watch (+2). Injected as highlight section in both LLM and fallback paths. 7 new tests.

### Pillar 5: Self-Correcting Quality

23. [DONE] (already implemented) **Add intervention effectiveness tracking** — `analyzeInterventionEffectiveness()` in `scripts/analyze-patterns.js` (Detector 6) already tracks per-hint-type effectiveness rates by comparing consecutive quality-history entries. Outputs to `pattern-report.json` as `interventionEffectiveness`. Hint fatigue also tracked by Detector 4.

24. [DONE] (PR #94) **Add cross-loop dependency detection** — `analyzeCrossLoopDependencies()` Detector 7 in `scripts/analyze-patterns.js`. Checks enrichment→editorial and results→editorial correlations. 6 new tests.

25. [DONE] (PR #95) **Add quality trend visualization data** — `computeRollingAverages()` in `ai-quality-gates.js`. Each quality-history snapshot now includes `rollingAverage` field with 7-entry moving averages. 4 new tests.

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
- **blocks**: array of editorial blocks in two categories:
  - **Narrative blocks** (LLM writes text): "headline", "event-line", "event-group", "narrative", "section", "divider"
  - **Component blocks** (LLM configures, client renders from data): "match-result", "match-preview", "event-schedule", "golf-status"
- Component blocks reference structured data (teams, tournaments) and the client renders them with logos, scores, times, and standings from pre-loaded JSON. Each component includes `_fallbackText` for graceful degradation.
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

Closed-loop self-improvement system. Autonomy score: **100% (12/12 loops closed)**.

### Completed

- [DONE] (manual session) Adaptive prompt hints for featured generation — `buildAdaptiveHints()` in `ai-quality-gates.js` reads last 5 quality snapshots, generates corrective prompts when metrics underperform thresholds. Wired into `generate-featured.js`. 8 tests.

- [DONE] (manual session) Adaptive enrichment hints — `buildEnrichmentHints()` in `enrich-events.js` checks `ai-quality.json` for low tag/summary coverage or failed batches, injects corrections into enrichment prompt. 7 tests.

- [DONE] (manual session) Coverage gap auto-resolver — `scripts/resolve-coverage-gaps.js` reads `coverage-gaps.json` and creates skeleton curated configs for high/medium-confidence actionable gaps. Wired into `detect-coverage-gaps.js` to run automatically. 11 tests.

- [DONE] (manual session) Autonomy scorecard — `scripts/autonomy-scorecard.js` evaluates 11 feedback loops (featured quality, enrichment quality, coverage gaps, pipeline health, watch plan, code health, discovery, schedule verification, results health, snapshot health, streaming verification). Wired into `pipeline-health.js`. Outputs `autonomy-report.json`.

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

- [DONE] (manual session) Add preference evolution pipeline script — Created `scripts/evolve-preferences.js` that reads engagement data from GitHub Issues + local `engagement-data.json`, computes relative click share with recency decay, and updates `user-context.json` sport weights. Writes history to `preference-evolution.json`. 33 tests in `tests/evolve-preferences.test.js`.

- [DONE] (manual session) Add opportunity detection to autopilot scouting — Expanded Step 2 scouting prompt with creative scouting (2b): reads RSS, coverage gaps, quality history, standings, and dashboard code to propose features, UX improvements, and new capabilities. Added heuristics F (opportunity detection), G (dashboard UX), H (capability seeding) to roadmap.

- [DONE] (manual session) Streaming verification feedback loop (Loop 12) — `enrich-streaming.js` self-monitors match rate, mines alias suggestions via `mineAliasSuggestions()`, builds trend hints via `buildStreamingHints()`. Writes `streaming-verification-history.json` (last 50 runs). `pipeline-health.js` reads history for enhanced diagnostics (trend, pending aliases, HTML structure change detection). `autonomy-scorecard.js` evaluates loop as `evaluateStreamingVerification()`. Fixed root cause bugs: wrong date for tomorrow's matches, missing CET timezone offset.

- [DONE] (manual session) Pipeline manifest — Created `scripts/pipeline-manifest.json` with declarative step definitions, `scripts/run-pipeline.js` runner, and `scripts/generate-capabilities.js` registry. The autopilot can now add/remove/reorder pipeline steps by editing the manifest (allowed path). Workflow rewritten to use single `node scripts/run-pipeline.js` call. Task tiers (`[MAINTENANCE]`/`[FEATURE]`/`[EXPLORE]`) and heuristic K (vision-guided exploration) added.

- [DONE] (resolved by pipeline manifest) Replace silent pipeline failures with structured error reporting — The pipeline runner (`scripts/run-pipeline.js`) captures per-step exit codes, timing, and errors in `docs/data/pipeline-result.json`. No more `|| echo "failed"` handlers — each step has an explicit `errorPolicy` ("continue" or "required").

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

## Scouted Tasks (2026-02-16)

### HIGH Priority

- [DONE] (direct) **Add empty-sport explanatory text in dashboard** — Added `renderEmptySportNotes()` to dashboard.js showing "No upcoming X events" for followed sports with zero events. CSS styled with muted text and left border.

- [DONE] (PR #101) **Export watch-plan feedback to pipeline** — Added `computeFeedbackAdjustments()` to watch-plan.js that parses sport from pick IDs, computes per-sport scoring adjustments. generate-featured.js reads engagement-data.json and passes adjustments to buildWatchPlan(). 8 new tests.

### MEDIUM Priority

- [DONE] (PR #102 + direct) **Add tennis ATP/WTA rankings to standings** — fetchTennisRankings() fetches top 20 ATP/WTA from ESPN. buildStandingsContext() includes ATP top 10 in editorial prompts. Inline ATP rankings widget added to dashboard with Ruud highlighting. 6 new tests.

- [DONE] (already implemented) **Add insights to service worker data cache** — insights.json and recent-results.json were already in DATA_FILES.

- [DONE] (merged with empty-sport task) **Add "no events" message for favorite sports** — Covered by renderEmptySportNotes() above.

### LOW Priority

- [PENDING] [EXPLORE] **Investigate cycling data sources** — RSS occasionally mentions cycling events. Check if CyclingArchives, UCI, or procyclingstats.com have free APIs or scrapable data. Norwegian cyclists (e.g., Markus Hoelgaard) could be tracked. Create `[FEATURE]` task if viable API found.

### Data Quality (Not Code Fixable)

- [BLOCKED] data availability — Stale golf/chess data: ESPN golf and chess endpoints sometimes return stale data (649-884 minutes old). This is an API timing issue, not a code bug. Pipeline-health.js monitors freshness and alerts.

- [BLOCKED] data availability — All football recapHeadlines are null: RSS feeds during Olympics period lack football match recap headlines. The `matchRssHeadline()` function works correctly. Will self-resolve as Olympics end (Feb 26).

---

## Scouted Tasks (2026-02-16, run 3)

### HIGH Priority

- [DONE] (direct) **Fix pipelineHealth loop stagnation** — `evaluatePipelineHealth()` in autonomy-scorecard.js now filters known data-availability patterns (sport_zero_events, quota_api_unavailable) and info-severity issues from the actionable count. Loop will score 1.0 when only known data gaps remain. 1 new test.

- [DONE] (direct) **Improve empty-sport notes with data reasons** — Dashboard now fetches health-report.json and shows contextual reasons: "no Norwegian player matches scheduled" (tennis), "data source unavailable" (esports), "data source stale", or "off-season". 27 lines changed in dashboard.js.

### MEDIUM Priority

- [DONE] (direct) **Add inline La Liga standings widget** — Collapsible La Liga mini-table following PL pattern, with Barcelona highlighting. Fifth inline standings widget.

- [DONE] (PR #103) **Add tennis Casper Ruud match tracking** — Root cause: ESPN returns tournament-level events with 0 competitions, which the base adapter dropped. Fixed by adding tournament-level event creation in focused mode. Events now show tournament schedules even without match data. 5 new tests.

- [DONE] (direct) **Create missing diagnostic files** — Initialized `fact-check-history.json` (empty array) and `preference-evolution.json` (`{ runs: [] }`) so pipeline scripts don't skip them on first run.

### LOW Priority

- [PENDING] [EXPLORE] **Investigate day snapshot empty content** — Pattern report shows 17 fires of `empty_day_snapshot`. Investigate which dates have no events/results and whether this is due to data gaps or snapshot generation timing. Check `generate-multi-day.js` logic.

---

## Scouted Tasks (2026-02-17)

### HIGH Priority

- [PENDING] [MAINTENANCE] **Fix must-watch coverage decline in featured content** — Pattern report shows must-watch coverage dropped 40% (72%→32%). Investigate enrichment importance scoring and generate-featured.js event selection. The prompt may be over-filtering high-importance events. Files: `scripts/generate-featured.js`, `scripts/lib/ai-quality-gates.js`.

- [PENDING] [FEATURE] **Add generic renderInlineStandings() function** — Five inline standings widgets (PL, La Liga, golf, F1, tennis) all follow identical structure. Extract into a reusable function to reduce ~200 lines of duplicated code and make adding new standings trivial. Files: `docs/js/dashboard.js` (~250 lines refactored).

### MEDIUM Priority

- [PENDING] [MAINTENANCE] **Investigate stale golf/chess data freshness** — Pattern report shows stale_data fired 26 times. Golf (649min) and chess (884min) data are consistently old. Check fetch retry logic, API rate limits, and caching behavior in `scripts/fetch/golf.js` and `scripts/fetch/chess.js`.

- [PENDING] [EXPLORE] **Investigate Bodø/Glimt Champions League coverage** — RSS shows Bodø/Glimt vs Inter Milan as a major Norwegian fixture. Check if this is already in events.json via football fetcher. If not, may need curated config or Champions League endpoint.

- [PENDING] [FEATURE] **Add biathlon/cross-country curated configs for World Championships** — No public APIs exist for IBU/FIS, but curated configs can cover major events. Create configs for upcoming Biathlon World Championships and FIS Nordic World Ski Championships with Norwegian athlete schedules. Files: `scripts/config/*.json`.

### LOW Priority

- [PENDING] [EXPLORE] **Investigate cycling data sources** — RSS occasionally mentions cycling events. ProCyclingStats and firstcycling.com have data but no public APIs. Norwegian cyclists are minor presences. Low priority unless user engagement data shows cycling interest.

---

## Known Limitations (Do Not Attempt to Fix)

### Usage API scope limitation

`scripts/track-usage.js` calls the Anthropic usage API (`GET api.anthropic.com/api/oauth/usage`) to get real utilization %. This currently returns a permission error in CI because `claude setup-token` only grants `user:inference` scope, while the usage endpoint requires `user:profile`. This is a known upstream bug: [anthropics/claude-code#11985](https://github.com/anthropics/claude-code/issues/11985).

**Do NOT attempt to fix this** — no code change on our side can resolve it. The run-count and duration tracking in `usage-tracking.json` works correctly as a fallback. Once Anthropic ships a fix (adding `user:profile` to `setup-token`), real utilization data will flow automatically without any code changes.

**Auto-detection:** The system monitors this issue automatically:
- `track-usage.js` records `quotaApiStatus` in `usage-tracking.json` every pipeline run (available/unavailable + since when + transition flag)
- `pipeline-health.js` surfaces `quotaApiHealth` in `health-report.json`, including a `quota_api_restored` info issue on state transitions
- Scouting heuristic J reads these signals and creates tasks when the fix is detected
- The `docs/status.html` quota card handles both states: utilization bars when API data is available, "unavailable" message when not
