# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vision

SportSync is a **proof of concept** demonstrating how fully autonomous software systems can work without human intervention. The sports dashboard is the vehicle, but the real experiment is the autonomy architecture itself.

### Core Thesis

A system built on nothing but GitHub Actions, a Claude Code Max subscription, and GitHub Pages can autonomously:
1. **Maintain its own data** — fetch, enrich, verify, and correct sports information
2. **Maintain its own code** — detect bugs, shortcomings, and improvement opportunities, then fix them via PRs
3. **Expand its own capabilities** — recognize when new features or data sources would improve the experience, and implement them
4. **Personalize its output** — adapt content to user interests that evolve over time
5. **Self-correct quality** — closed feedback loops observe outcomes, decide on corrective actions, and act

### Zero Infrastructure Constraint

The entire system runs on exactly three services:
- **GitHub Actions** — compute (every 2h data pipeline + nightly autopilot)
- **Claude Code Max** — AI backbone (CLAUDE_CODE_OAUTH_TOKEN for discovery, enrichment, featured content, and autonomous code changes)
- **GitHub Pages** — hosting (static files, zero backend)

No databases, no servers, no paid APIs, no deployment infrastructure. This constraint is deliberate — it proves that meaningful autonomy is possible with minimal infrastructure.

### Personalization

The dashboard is personalized based on user interests defined in `scripts/config/user-context.json`. Currently this is semi-manually configured (favorite teams, players, sport preferences, Norwegian focus). The vision is that user preferences evolve over time — informed by usage patterns, feedback signals, and the discovery loop's observations about what content resonates.

### Self-Improving Codebase

Beyond data and content autonomy, the underlying code structure is itself a target for autonomous improvement. The nightly autopilot (`claude-autopilot.yml`) reads `AUTOPILOT_ROADMAP.md`, picks tasks, creates PRs, runs tests, and merges — then scouts the codebase for new improvement opportunities. Errors and shortcomings should be autonomously identified and fixed without human involvement.

### Acceleration Thesis

The system doesn't just improve the product — it improves at improving. Three forces create compounding returns:

1. **Better models over time** — More capable AI = more ambitious autonomous tasks. What requires careful planning today becomes routine tomorrow.
2. **Accumulated knowledge** — Each run records what works. After 100 runs, the system knows which task types are fast, which heuristics find value, and which approaches fail.
3. **Richer architecture** — Each new feedback loop, pipeline step, or detection mechanism creates more surface area for autonomous improvement.

The practical implication: early runs should prioritize **velocity** (many small improvements, rapid learning). As the system matures, shift toward **depth** (harder problems, self-discovered features). Eventually, the system reaches **refinement** (optimization, personalization fine-tuning).

### Human-in-the-Loop (Future)

Some form of lightweight user feedback would complete the vision — allowing the system to learn which recommendations land, which content formats work, and which sports coverage matters most. This could be as simple as thumbs-up/down on watch-plan picks surfaced via `localStorage` feedback signals.

## Change Principles

Every change — whether made in a manual Claude session, by the nightly autopilot, or in a PR review — must pass these checks. These are not guidelines; they are hard rules.

### 1. Vision Alignment

Before implementing, ask: **"Does this change advance the autonomy thesis?"**

The five pillars of the vision are: self-maintaining data, self-maintaining code, self-expanding capabilities, personalized output, and self-correcting quality. Every change should serve at least one pillar. A bug fix that only fixes the bug is incomplete — it should also make the system capable of detecting similar issues autonomously (via tests, health checks, or feedback loops).

**Test:** Can you point to which pillar(s) this change serves? If not, reconsider.

### 2. Close the Loop

Ask: **"How would the system have found this problem on its own?"**

If the answer is "it couldn't", the change is incomplete. Add detection: a test that catches regressions, a health check that surfaces the issue, a quality gate that blocks bad output, or a scouting heuristic that spots the pattern. The goal is that every class of problem is found exactly once by a human and forever after by the system.

Also ask: **"Does this change leave the system coherent?"** Every change should leave the system in a consistent state — code, tests, documentation, and configuration should all agree. If you add a new capability, the system's self-description should reflect it. If you change data flow, anything that describes the data flow should update too. This isn't a checklist of specific files — it's a principle: the system should understand itself accurately.

### 3. Zero Infrastructure Constraint

Ask: **"Does this stay within GitHub Actions + Claude Code Max + GitHub Pages?"**

No new services, no databases, no paid APIs, no deployment infrastructure. If a feature seems to need external infrastructure, find a way to do it within the constraint — that's the point of the experiment.

### 4. Autonomous by Default

Ask: **"Does this work without human intervention after deployment?"**

Changes should not create ongoing manual maintenance obligations. If a feature requires periodic human attention (manual config updates, data refreshes, monitoring), it's not done — add the automation that closes the gap. Static configs should have refresh loops. External dependencies should have availability monitoring. Edge cases should have fallback paths.

### 5. Measurable Impact

Ask: **"How will we know this change is working?"**

Every non-trivial change should be observable through existing metrics (autonomy scorecard, quality history, health report) or should add its own measurement. If a change can't be measured, it can't be improved autonomously.

### 6. Compound Learning

Ask: **"Does this run leave the system smarter, not just better?"**

Every autopilot run should deposit knowledge — what works, what fails, which approaches are efficient, which heuristics find value. This knowledge accumulates in the "Lessons & Effectiveness" section of the roadmap and in the enhanced autopilot log.

The system has three acceleration vectors:
- **Model improvement** — as underlying AI models improve, the system can take on more complex tasks, generate better content, and make more nuanced decisions. Task ambition should scale with model capability.
- **Knowledge accumulation** — patterns learned from hundreds of runs compound. What takes 8 turns today should take 3 turns after the system has seen similar tasks.
- **Architecture maturity** — each new feedback loop, pipeline step, or detection mechanism makes the system more capable of self-improvement.

**Test:** After this run, is there something recorded that will make the next run more effective?

## Project Overview

SportSync covers football, golf, tennis, Formula 1, chess, esports, and Olympics with a Norwegian perspective. Eleven closed feedback loops ensure the system self-corrects quality, coverage, content accuracy, code health, and personalization. Hosted on GitHub Pages, updated every 2 hours via GitHub Actions, with client-side live score polling from ESPN.

## Architecture

This is a hybrid static/dynamic application:
- **Static Frontend**: Pure HTML/CSS/JS hosted on GitHub Pages
- **Automated Data Fetching**: GitHub Actions fetch fresh API data every 2 hours
- **AI Enrichment**: LLM adds importance scores, summaries, and tags to each event
- **AI Featured Content**: Claude CLI generates editorial briefs and featured sections each build
- **Standings & RSS**: ESPN standings and RSS news digests feed into the editorial pipeline
- **Recent Results**: ESPN scoreboard history (7 days) for narrative continuity in editorial briefs
- **Live Score Polling**: Client-side ESPN polling every 60s for football scores and golf leaderboards
- **Curated Event Configs**: `scripts/config/*.json` files auto-discovered by build pipeline
- **Autonomous Discovery**: Config maintenance (prune, archive) + LLM-powered event/athlete discovery via Claude CLI + WebSearch
- **Pipeline Manifest**: Declarative `scripts/pipeline-manifest.json` defines all pipeline steps — the autopilot can add/remove/reorder steps without touching the workflow file
- **Capability Registry**: `scripts/generate-capabilities.js` auto-generates `docs/data/capabilities.json` — the autopilot reads this to identify system gaps
- **No Backend**: Serverless architecture using only GitHub infrastructure

### Key Components

- **docs/index.html** - Main dashboard with ultra-minimal embedded CSS (480px max-width)
- **docs/js/dashboard.js** - Dashboard controller (~1650 lines): blocks, events, recent results, standings, live polling, day navigator
- **docs/js/asset-maps.js** - Team logo and golfer headshot URL mappings
- **docs/js/sport-config.js** - Sport metadata (emoji, color, aliases for 7 sports)
- **docs/js/preferences-manager.js** - Favorites storage (localStorage)
- **docs/data/** - Pre-fetched JSON data files (auto-generated by GitHub Actions)
- **.github/workflows/update-sports-data.yml** - Automated data pipeline workflow

### Data Flow

0. **Pipeline runner** (`scripts/run-pipeline.js`) reads `scripts/pipeline-manifest.json` and orchestrates all steps phase by phase. Writes `docs/data/pipeline-result.json` with per-step outcomes, timing, and gate status.
1. **GitHub Actions** run every 2 hours, invoking the pipeline runner
2. **API calls** to ESPN and fotball.no
3. **JSON files** are generated and committed to `docs/data/`
4. **`fetch-standings.js`** fetches PL table, golf leaderboards, F1 driver standings from ESPN
5. **`fetch-rss.js`** fetches 11 RSS feeds (NRK, TV2, BBC, ESPN, Autosport, ChessBase, HLTV)
6. **`fetch-results.js`** fetches completed match scores (PL, La Liga) and golf leaderboard positions from ESPN, merges with existing history (7-day retention), tags favorites from `user-context.json`, matches RSS recap headlines → `recent-results.json`
7. **`sync-configs.js`** prunes expired events, archives old configs, flags empty auto-generated configs as `needsResearch`
8. **`discover-events.js`** uses Claude CLI + WebSearch to research and populate flagged configs with real schedules and Norwegian athletes
9. **`verify-schedules.js`** runs 5-stage verification (static → ESPN → RSS → sport data → web re-check), writes `verification-history.json`, injects accuracy hints back into discovery
10. **`build-events.js`** auto-discovers sport files from `docs/data/*.json` by convention (any file with `{ tournaments: [...] }`) and curated configs from `scripts/config/*.json`, merges all into `events.json`
11. **`enrich-events.js`** uses LLM to add importance (1-5), summaries, tags, and Norwegian relevance to each event
12. **`generate-featured.js`** calls Claude CLI with events + standings + RSS + recent results + curated configs → generates `featured.json` (block-based editorial). Supports date-specific modes via `SPORTSYNC_FEATURED_DATE` + `SPORTSYNC_FEATURED_MODE` (live/recap/preview)
13. **`generate-multi-day.js`** orchestrates yesterday's recap and tomorrow's preview as `featured-{YYYY-MM-DD}.json`. Idempotent (skips existing recaps, regenerates stale previews). Cleans up briefings >7 days old
14. **`pipeline-health.js`** checks sport coverage (auto-discovered), data freshness, critical output freshness (featured.json, ai-quality.json), RSS/standings/results health → generates `health-report.json`
15. **`check-quality-regression.js`** compares AI quality scores against previous commit → alerts on regressions
16. **`detect-coverage-gaps.js`** cross-references RSS headlines against events → generates `coverage-gaps.json`
17. **Client-side** loads `events.json` + `featured.json` + `standings.json` + `recent-results.json`, renders editorial dashboard with collapsible results band. **Day navigator** lets users browse past/future days, async-loads `featured-{date}.json` for date-specific briefings
18. **Live polling** fetches ESPN football scores and golf leaderboard every 60s, updates DOM inline

## Development Commands

- `npm run dev` - Start local development server (Python HTTP server on port 8000)
- `npm run build` - Fetch data, build events, build calendar
- `npm run build:events` - Aggregate sport data + curated configs into events.json
- `npm run enrich` - AI enrichment of events (needs OPENAI_API_KEY or ANTHROPIC_API_KEY)
- `npm run fetch:results` - Fetch recent match results from ESPN (football + golf)
- `npm run generate:featured` - Generate featured.json with Claude CLI (needs CLAUDE_CODE_OAUTH_TOKEN, or ANTHROPIC_API_KEY, or OPENAI_API_KEY)
- `npm run generate:multiday` - Generate yesterday recap + tomorrow preview briefings
- `npm test` - Run all tests (vitest, 1295 tests across 55 files)
- `npm run validate:data` - Check data integrity
- `npm run build:calendar` - Create .ics calendar export
- `npm run screenshot` - Take a screenshot of the dashboard (needs Playwright)

## GitHub Actions Workflow

The **update-sports-data.yml** workflow:
- **Trigger**: Every 2 hours + manual dispatch
- **Fetches**: Football, Golf, Tennis, F1, Chess, Esports data from APIs
- **Fetches**: Standings (ESPN PL/golf/F1), RSS news digest (11 feeds), and recent results (football + golf)
- **Builds**: events.json (with auto-discovered curated configs from `scripts/config/`)
- **Enriches**: AI adds importance, summaries, tags to events (OpenAI)
- **Generates**: featured.json via Claude CLI (CLAUDE_CODE_OAUTH_TOKEN)
- **Generates**: Multi-day briefings — yesterday recap + tomorrow preview as `featured-{date}.json`
- **Validates**: Data integrity checks
- **Monitors**: Pipeline health report, quality regression gate, coverage gap detection
- **Commits**: Updated JSON files to repository
- **Deploys**: Automatically via GitHub Pages

### Auth Priority for Featured Generation
1. `CLAUDE_CODE_OAUTH_TOKEN` — Claude CLI (Max subscription)
2. `ANTHROPIC_API_KEY` — direct Anthropic API
3. `OPENAI_API_KEY` — OpenAI fallback
4. Template-based fallback (no AI)

## API Integration Strategy

**APIs Used:**
- **ESPN Public API** - Football (Premier League, La Liga), Tennis, Golf (PGA/DP World), F1, Standings
- **PGA Tour** - Golf field verification and tee times (scraped from pgatour.com)
- **fotball.no** - Norwegian OBOS-ligaen matches (Lyn Oslo)
- **Curated Data** - Chess tournaments, Olympics schedules, CS2 esports (via discovery loop)

**Client-side live polling (no API key needed):**
- ESPN Soccer Scoreboard — live football scores
- ESPN Golf Scoreboard — live PGA leaderboard

## File Structure

```
docs/
├── index.html              # Dashboard (HTML + embedded CSS, 480px max-width)
├── sw.js                   # Service worker for caching
├── js/
│   ├── dashboard.js        # Dashboard controller (brief, sections, standings, live polling)
│   ├── asset-maps.js       # Team logos + golfer headshot URLs
│   ├── sport-config.js     # Sport metadata (7 sports incl. Olympics)
│   └── preferences-manager.js # Favorites storage (localStorage)
└── data/                   # Pre-fetched API data (auto-generated)
    ├── events.json         # Unified events feed (includes curated configs + enrichment)
    ├── featured.json       # AI-generated editorial content (block-based editorial content)
    ├── standings.json      # ESPN standings (PL table, golf leaderboards, F1 drivers)
    ├── rss-digest.json     # RSS news digest (11 feeds, Norwegian-filtered)
    ├── recent-results.json # Recent completed matches + golf positions (7-day history)
    ├── ai-quality.json     # AI quality-gate metrics (enrichment + featured)
    ├── health-report.json  # Pipeline health report (coverage, freshness, anomalies)
    ├── coverage-gaps.json  # RSS vs events coverage gap detection
    ├── discovery-log.json  # Event discovery actions log
    ├── config-sync-log.json # Config sync/maintenance log
    ├── verification-history.json # Schedule verification history (last 50 runs)
    ├── engagement-data.json # User engagement data (per-sport click counts, exported from client)
    ├── preference-evolution.json # Preference evolution history (sport weight adjustments)
    ├── events.ics          # Calendar export
    ├── football.json       # Per-sport source files
    ├── golf.json / tennis.json / f1.json / chess.json / esports.json
    ├── meta.json           # Update timestamps
    ├── capabilities.json   # System introspection: sports, gaps, pipeline steps (auto-generated)
    └── pipeline-result.json # Pipeline runner: per-step outcomes, timing, gate (auto-generated)

scripts/
├── fetch/                  # Modular API fetchers (one per sport)
├── config/                 # Auto-discovered curated event configs
│   ├── archive/            # Expired configs (auto-archived by sync-configs.js)
│   ├── olympics-2026.json  # Winter Olympics 2026 schedule
│   ├── user-context.json   # User preferences + dynamicAthletes config
│   ├── chess-tournaments.json
│   └── norwegian-chess-players.json
├── lib/
│   ├── llm-client.js       # LLM abstraction (Anthropic + OpenAI)
│   ├── helpers.js          # Shared utilities
│   ├── enrichment-prompts.js # Prompts for AI event enrichment
│   ├── event-normalizer.js # Event validation and normalization
│   ├── response-validator.js # API response validation (ESPN)
│   ├── ai-quality-gates.js # AI enrichment quality gates and fallbacks
│   ├── schedule-verifier.js # Schedule verification engine (5 verifiers, confidence scoring, hints)
│   ├── base-fetcher.js     # Base class for sport fetchers
│   ├── api-client.js       # HTTP client wrapper
│   ├── norwegian-streaming.js # Norwegian streaming info
│   └── filters.js          # Event filtering utilities
├── fetch-standings.js      # ESPN standings → standings.json
├── fetch-rss.js            # RSS digest → rss-digest.json
├── fetch-results.js        # ESPN recent results → recent-results.json (7-day history)
├── sync-configs.js         # Config maintenance: prune, archive, flag needsResearch
├── discover-events.js      # LLM-powered event/athlete discovery (Claude CLI + WebSearch)
├── build-events.js         # Aggregates sport JSONs + curated configs → events.json
├── enrich-events.js        # LLM enrichment (importance, tags, summaries)
├── generate-featured.js    # Claude CLI → featured.json (block-based editorial, supports date modes)
├── generate-multi-day.js   # Orchestrates recap (yesterday) + preview (tomorrow) briefings
├── pipeline-health.js      # Pipeline health report → health-report.json
├── check-quality-regression.js # AI quality regression detection
├── detect-coverage-gaps.js # RSS vs events coverage gap detection
├── merge-open-data.js      # Merges open source + primary data
├── verify-schedules.js     # Schedule verification orchestrator → verification-history.json
├── evolve-preferences.js   # Preference evolution engine → preference-evolution.json
├── run-pipeline.js         # Pipeline runner — reads manifest, orchestrates all phases
├── generate-capabilities.js # Capability registry generator → capabilities.json
├── pipeline-manifest.json  # Declarative pipeline step definitions (autopilot-editable)
├── validate-events.js      # Data integrity checks
├── build-ics.js            # Calendar export generator
└── screenshot.js           # Dashboard screenshot for visual validation (Playwright)

.github/workflows/
├── update-sports-data.yml  # Data pipeline (every 2 hours)
└── claude-autopilot.yml    # Autonomous improvement agent (nightly)

tests/                      # 1295 tests across 55 files (vitest)
AUTOPILOT_ROADMAP.md        # Prioritized task queue for autopilot
```

## Conventions

### Event time filtering — use `isEventInWindow()`
When filtering events by time, **always** use `isEventInWindow(event, windowStart, windowEnd)` from `scripts/lib/helpers.js` (server-side) or the global function in `dashboard.js` (client-side). This handles multi-day events (golf tournaments, Olympics sessions) that have an `endTime` spanning multiple days. Never write manual `new Date(e.time) >= start` filters — they silently drop multi-day events.

## Development Notes

- **No build process** - pure static files with embedded CSS
- **Modern JavaScript** - ES6+ features, async/await patterns
- **Norwegian focus** - Europe/Oslo timezone, Norwegian teams prioritized
- **Error resilience** - Multiple fallback layers for robust operation
- **GitHub Pages** - Automatic deployment on push to main branch
- **Ultra-minimal design** - 480px reading column, editorial newspaper aesthetic
- **Sport-organized** - Events grouped by sport with color-coded left borders
- **Click-to-expand** - Event rows expand to show venue, logos, standings, streaming, favorites
- **Must-watch emphasis** - AI enrichment marks importance 4-5 events with subtle accent styling
- **Live scores** - Client-side ESPN polling with pulsing LIVE dot, dynamic brief updates

## Extending the Dashboard

To add a new sport:
1. Write a fetcher in `scripts/fetch/` that outputs `{ tournaments: [...] }` format to `docs/data/{sport}.json`
2. Register it in `scripts/fetch/index.js`
3. Add sport config to `docs/js/sport-config.js` (emoji, color, aliases)
4. `build-events.js` auto-discovers the sport file by convention — no registration needed
5. `pipeline-health.js` auto-monitors freshness — no registration needed
6. Events auto-display via sport-organized layout in `dashboard.js`

To add a curated major event (Olympics, World Cup, etc.):
1. Create a JSON config in `scripts/config/{event}-{year}.json` (see `olympics-2026.json` for format)
2. Events auto-merge into `events.json` during build — no registration needed
3. `generate-featured.js` auto-detects the config and feeds it to Claude for featured content
4. The autopilot should create these configs autonomously (see `AUTOPILOT_ROADMAP.md`)

### Autonomous Discovery

SportSync aspires to zero manual configuration. The discovery pipeline:
- **`sync-configs.js`** runs every pipeline cycle: prunes expired events (>6h old), archives expired configs, flags empty auto-generated configs as `needsResearch: true`
- **`discover-events.js`** runs every pipeline cycle: finds configs needing research, invokes Claude CLI with WebSearch to look up real schedules, Norwegian athletes, and streaming info
- **Athlete refresh**: Configs with `norwegianAthletes` arrays are re-researched every 7 days to catch retirements, nationality changes, and rising stars
- **Dynamic athletes**: `user-context.json` has `dynamicAthletes` config for auto-discovering Norwegian athletes per sport
- **Safeguards**: Max 3 discovery tasks per run, JSON schema validation, `autoGenerated: true` on all machine-written configs
- **8th feedback loop**: `schedule-verifier.js` verifies discovered schedules against ESPN/RSS/sport data, injects accuracy hints into discovery prompts
- **9th feedback loop**: `fetch-results.js` fetches recent results → `pipeline-health.js` monitors freshness → health report surfaces issues
- **10th feedback loop**: `fact-checker.js` verifies featured content claims against source data → `fact-check-history.json`
- **11th feedback loop**: `evolve-preferences.js` reads engagement data (GitHub Issues + local file) → computes sport weights from click patterns → updates `user-context.json` → enrichment/featured/watch-plan adapt → `preference-evolution.json` tracks history
- **Autonomy scorecard**: `autonomy-scorecard.js` tracks feedback loops → `autonomy-report.json`

## Current State vs. Vision

### What Works (Autonomy Achieved)

| Layer | Status | Details |
|-------|--------|---------|
| **Data fetching** | Autonomous | 6 sport APIs + fotball.no, every 2h |
| **Event discovery** | Autonomous | Claude CLI + WebSearch finds events, athletes, schedules |
| **Schedule verification** | Autonomous | 5-stage verifier chain with accuracy feedback loop (Loop 8) |
| **AI enrichment** | Autonomous | Importance, summaries, tags with adaptive quality hints |
| **Featured content** | Autonomous | Editorial briefs + themed variants with quality feedback |
| **Coverage gaps** | Autonomous | RSS cross-ref detects missing events, auto-creates configs |
| **Pipeline health** | Autonomous | Self-monitoring with pre-commit gate |
| **Code improvements** | Autonomous | Nightly autopilot scouts + PRs + auto-merge |
| **Results health** | Autonomous | Recent results fetched, monitored for staleness (Loop 9) |
| **Fact verification** | Autonomous | LLM-powered claim verification against source data (Loop 10) |
| **Preference evolution** | Autonomous | Engagement signals flow back to pipeline, sport weights evolve (Loop 11) |
| **Autonomy tracking** | Autonomous | 11/11 feedback loops closed, scored by autonomy-scorecard.js |

**Autonomy score: 100% (11/11 loops closed)**

### What's Missing (Gap to Vision)

| Gap | Description | Difficulty |
|-----|-------------|------------|
| **User feedback loop** | Engagement tracking (click counts) flows from client to pipeline via GitHub Issues and `evolve-preferences.js`. Watch-plan picks render in the dashboard. Missing: explicit thumbs-up/down on watch-plan items for richer signal. | Low |
| **Evolving preferences** | `evolve-preferences.js` reads engagement data and updates `user-context.json` sport weights. Missing: evolving favorite teams/players (currently only sport-level weights evolve). | Low |
| **Self-expanding capabilities** | Pipeline manifest pattern enables the autopilot to add pipeline steps by editing `scripts/pipeline-manifest.json`. Capability registry (`capabilities.json`) + heuristic K guide strategic decisions. First end-to-end self-discovered feature still pending demonstration. | Medium |
| **Resilience hardening** | Pipeline manifest captures per-step outcomes in `pipeline-result.json`. Remaining gap: autopilot doesn't yet auto-diagnose and repair failed steps. | Low |
| **Esports data** | HLTV API returns stale 2022 data. The discovery loop creates curated configs but the primary data source is dead. Needs a new data source or full reliance on curated configs. | Low |
| **Watch-plan feedback** | Watch-plan picks render in the dashboard but there's no mechanism to capture user reactions (thumbs-up/down). Without this signal, personalization can't learn. | Low |
| **Meta-learning** | The system doesn't yet systematically track which improvements are most effective or accumulate structured knowledge about its own improvement process. | Low |

### Roadmap (Prioritized Next Steps)

**Phase 1 — Close the User Feedback Loop**
1. Render watch-plan picks in dashboard (prerequisite for everything else)
2. Add thumbs-up/down controls on watch-plan items (persist in localStorage)
3. Surface feedback signals in pipeline (export counts to `watch-feedback.json`)
4. Feed engagement data into watch-plan scoring and personalization

**Phase 2 — Evolving Preferences**
5. ~~Track which events the user expands/clicks in localStorage~~ — DONE: `PreferencesManager.trackEngagement()` records per-sport click counts
6. ~~Build preference evolution logic: observe engagement → adjust `user-context.json` sport weights~~ — DONE: `scripts/evolve-preferences.js` reads engagement from GitHub Issues + local file, computes relative share, updates `user-context.json`
7. Discovery loop reads updated preferences → adjusts research priorities

**Phase 3 — Self-Expanding Capabilities**
8. ~~Add "opportunity detection" to autopilot scouting~~ — DONE: creative scouting (heuristics F/G/H) reads RSS trends, coverage gaps, dashboard code, and quality data to propose features, UX improvements, and new capabilities
9. Let autopilot propose AND SHIP capability expansions (new sports, new data sources, new UI features) autonomously — validate with first end-to-end self-discovered feature
10. Resilience hardening: pipeline manifest captures structured errors — autopilot should auto-diagnose and repair failed steps

**Phase 4 — Full Autonomy Proof**
11. End-to-end demonstration: system detects a new major event, creates config, discovers schedule, verifies accuracy, enriches, generates editorial content, serves personalized dashboard — all without human intervention
12. Document the autonomy architecture as a reference implementation

## Automation Rules

These rules govern automated Claude Code operations via GitHub Actions (`claude-code-action`).

### Protected Paths (never modify automatically)
- `.github/workflows/**`
- `package.json`, `package-lock.json`
- `.env*`
- `.git/**`
- `node_modules/**`

### Allowed Paths
- `scripts/**`
- `tests/**`
- `docs/js/**`
- `docs/index.html`
- `docs/*.md`
- `docs/sw.js`
- `docs/css/**`
- `AUTOPILOT_ROADMAP.md`
- `docs/data/autopilot-log.json`

### Change Limits (Task Tiers)

| Tier | Files | Lines | Behavior |
|------|-------|-------|----------|
| `[MAINTENANCE]` (default) | 8 | 300 | Single PR, auto-merge |
| `[FEATURE]` | 12 | 500 | Single PR, auto-merge — for new capabilities |
| `[EXPLORE]` | 0 | 0 | Read-only investigation — no PRs, writes findings + tasks |

- One bounded fix per maintenance run

### Risk Classification
- **LOW** — typo fixes, comment updates, test additions → auto-PR
- **MEDIUM** — logic changes, dependency updates, config changes → PR + request review
- **HIGH** — workflow changes, auth changes, data schema changes → skip (create issue only)

### Testing
- Always run `npm test` before committing
- If tests fail, revert changes and report in the PR or issue

### Branch Naming
- All automated branches must use the prefix `claude/`
- Autopilot branches use the prefix `claude/improve-`

### Autopilot

The autopilot workflow (`claude-autopilot.yml`) autonomously improves the codebase. The roadmap is **self-curated** — the autopilot discovers its own tasks, not just executes human-written ones. All autopilot changes must satisfy the Change Principles above — especially vision alignment and closing the loop.

- **Roadmap**: `AUTOPILOT_ROADMAP.md` is a self-curated task queue — the autopilot adds, prioritizes, and executes tasks
- **Cadence**: Runs nightly at 01:00 UTC
- **PR label**: `autopilot`
- **Multi-task loop**: Works through PENDING tasks continuously until it runs out of turns, tasks, or hits an error
- **Auto-merge**: Each task is branched, PR'd, and merged immediately after tests pass
- **Maintenance scouting**: Reads health-report.json, autonomy-report.json, pattern-report.json, sanity-report.json to detect and repair pipeline issues
- **Creative scouting**: Reads RSS trends, coverage gaps, quality history, and standings data to propose new features, UX improvements, and capability expansions (heuristics F/G/H in roadmap)
- **Visual validation**: Takes screenshots of the dashboard via Playwright (`scripts/screenshot.js`) before/after UI changes, reads images to verify visual correctness
- **Self-improving heuristics**: The scouting heuristics section of the roadmap is updated by the autopilot itself when it discovers new detection patterns
- **Safe stops**: If tests fail or a merge fails, the loop stops — no broken code gets pushed
- **Human control**: Reorder tasks in the roadmap to change priority. Mark tasks `[BLOCKED]` to skip them.
