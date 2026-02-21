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

The dashboard is personalized based on user interests defined in `scripts/config/user-context.json`. Sport weights evolve automatically from engagement data — `evolve-preferences.js` reads click patterns and adjusts preferences. Favorite teams and players sync from client-side exports. Watch-plan picks have thumbs-up/down feedback controls that flow back into scoring. The entire personalization loop is closed: observe engagement → adjust preferences → adapt content → measure impact.

### Self-Improving Codebase

Beyond data and content autonomy, the underlying code structure is itself a target for autonomous improvement. The nightly autopilot (`claude-autopilot.yml`) uses a **multi-agent architecture**: an orchestrator agent coordinates 4 specialized subagents (data, content, code, UX) that work in parallel. Each subagent has domain-specific knowledge, persistent memory across runs, and focused responsibilities. The orchestrator reads system state, routes tasks, and synthesizes cross-agent learnings. 82+ PRs merged autonomously.

### Acceleration Thesis

The system doesn't just improve the product — it improves at improving. Three forces create compounding returns:

1. **Better models over time** — More capable AI = more ambitious autonomous tasks. What requires careful planning today becomes routine tomorrow.
2. **Accumulated knowledge** — Each run records what works. After 100 runs, the system knows which task types are fast, which heuristics find value, and which approaches fail.
3. **Richer architecture** — Each new feedback loop, pipeline step, or detection mechanism creates more surface area for autonomous improvement.

The practical implication: early runs should prioritize **velocity** (many small improvements, rapid learning). As the system matures, shift toward **depth** (harder problems, self-discovered features). Eventually, the system reaches **refinement** (optimization, personalization fine-tuning).

### Human-in-the-Loop

Lightweight user feedback is implemented: thumbs-up/down on watch-plan picks (stored in localStorage), per-sport click tracking via `PreferencesManager.trackEngagement()`, and engagement data export to the pipeline via GitHub Issues. This feedback flows through `evolve-preferences.js` to adjust sport weights and through `computeFeedbackAdjustments()` to tune watch-plan scoring. The remaining opportunity is richer signal — e.g., tracking which editorial blocks resonate, which events the user actually watches.

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

SportSync covers football, golf, tennis, Formula 1, chess, esports, and Olympics with a Norwegian perspective. Twelve closed feedback loops ensure the system self-corrects quality, coverage, content accuracy, code health, streaming data, and personalization. Hosted on GitHub Pages, updated every 2 hours via GitHub Actions, with client-side live score polling from ESPN.

## Architecture

This is a hybrid static/dynamic application:
- **Static Frontend**: Pure HTML/CSS/JS hosted on GitHub Pages
- **Automated Data Fetching**: GitHub Actions fetch fresh API data every 2 hours
- **AI Enrichment**: LLM adds importance scores, summaries, and tags to each event
- **AI Featured Content**: Claude CLI generates editorial briefs using narrative + component blocks each build
- **Component Template System**: Structured blocks (match-result, match-preview, event-schedule, golf-status) reference live data; client renders with logos, scores, times from pre-loaded JSON
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
12. **`generate-featured.js`** calls Claude CLI with events + standings + RSS + recent results + curated configs → generates `featured.json` (narrative + component blocks). Component blocks (`match-result`, `match-preview`, `event-schedule`, `golf-status`) reference structured data; client renders with logos/scores/times. Fallback produces components with `_fallbackText` for graceful degradation. Supports date-specific modes via `SPORTSYNC_FEATURED_DATE` + `SPORTSYNC_FEATURED_MODE` (live/recap/preview)
13. **`generate-multi-day.js`** orchestrates yesterday's recap and tomorrow's preview as `featured-{YYYY-MM-DD}.json`. Idempotent (skips existing recaps, regenerates stale previews). Cleans up briefings >7 days old
14. **`pipeline-health.js`** checks sport coverage (auto-discovered), data freshness, critical output freshness (featured.json, ai-quality.json), RSS/standings/results health → generates `health-report.json`
15. **`check-quality-regression.js`** compares AI quality scores against previous commit → alerts on regressions
16. **`detect-coverage-gaps.js`** cross-references RSS headlines against events → generates `coverage-gaps.json`
17. **Client-side** loads `events.json` + `featured.json` + `standings.json` + `recent-results.json`, renders editorial dashboard with collapsible results band. **Component blocks** (`match-result`, `match-preview`, `event-schedule`, `golf-status`) resolve against pre-loaded data for logos, scores, times, and standings — falling back to `_fallbackText` when data is unavailable. **Day navigator** lets users browse past/future days, async-loads `featured-{date}.json` for date-specific briefings
18. **Live polling** fetches ESPN football scores and golf leaderboard every 60s, updates DOM inline

## Development Commands

- `npm run dev` - Start local development server (Python HTTP server on port 8000)
- `npm run build` - Fetch data, build events, build calendar
- `npm run build:events` - Aggregate sport data + curated configs into events.json
- `npm run enrich` - AI enrichment of events (needs OPENAI_API_KEY or ANTHROPIC_API_KEY)
- `npm run fetch:results` - Fetch recent match results from ESPN (football + golf)
- `npm run generate:featured` - Generate featured.json with Claude CLI (needs CLAUDE_CODE_OAUTH_TOKEN, or ANTHROPIC_API_KEY, or OPENAI_API_KEY)
- `npm run generate:multiday` - Generate yesterday recap + tomorrow preview briefings
- `npm test` - Run all tests (vitest, 1882 tests across 65 files)
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
    ├── featured.json       # AI-generated editorial content (narrative + component blocks)
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
    ├── streaming-enrichment.json # Streaming enrichment log (tvkampen match rate, enriched events)
    ├── streaming-verification-history.json # Streaming verification history (match rate trends, alias suggestions)
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
│   ├── tvkampen-scraper.js  # tvkampen.com scraper (listings, channels, broadcasters)
│   ├── streaming-matcher.js # Fuzzy team/time matching for tvkampen→events, alias mining, hints
│   ├── broadcaster-urls.js  # Broadcaster name→URL/type mapping
│   └── filters.js          # Event filtering utilities
├── fetch-standings.js      # ESPN standings → standings.json
├── fetch-rss.js            # RSS digest → rss-digest.json
├── fetch-results.js        # ESPN recent results → recent-results.json (7-day history)
├── sync-configs.js         # Config maintenance: prune, archive, flag needsResearch
├── discover-events.js      # LLM-powered event/athlete discovery (Claude CLI + WebSearch)
├── build-events.js         # Aggregates sport JSONs + curated configs → events.json
├── enrich-events.js        # LLM enrichment (importance, tags, summaries)
├── generate-featured.js    # Claude CLI → featured.json (narrative + component blocks, supports date modes)
├── generate-multi-day.js   # Orchestrates recap (yesterday) + preview (tomorrow) briefings
├── pipeline-health.js      # Pipeline health report → health-report.json
├── check-quality-regression.js # AI quality regression detection
├── detect-coverage-gaps.js # RSS vs events coverage gap detection
├── merge-open-data.js      # Merges open source + primary data
├── verify-schedules.js     # Schedule verification orchestrator → verification-history.json
├── evolve-preferences.js   # Preference evolution engine → preference-evolution.json
├── enrich-streaming.js     # tvkampen streaming enrichment → streaming-enrichment.json + verification history
├── run-pipeline.js         # Pipeline runner — reads manifest, orchestrates all phases
├── generate-capabilities.js # Capability registry generator → capabilities.json
├── pipeline-manifest.json  # Declarative pipeline step definitions (autopilot-editable)
├── autopilot-strategy.json # Autopilot process strategy (ship modes, turn budgets — autopilot-editable)
├── validate-events.js      # Data integrity checks
├── build-ics.js            # Calendar export generator
└── screenshot.js           # Dashboard screenshot for visual validation (Playwright)

.github/workflows/
├── update-sports-data.yml  # Data pipeline (every 2 hours)
└── claude-autopilot.yml    # Multi-agent autopilot (nightly)

.claude/
├── agents/                 # Subagent definitions (auto-discovered by claude-code-action)
│   ├── data-agent.md       # Data pipeline specialist
│   ├── content-agent.md    # AI content specialist
│   ├── code-agent.md       # Code health specialist
│   └── ux-agent.md         # Dashboard UX specialist
└── agent-memory/           # Persistent agent memory (auto-curated across runs)

scripts/agents/
├── orchestrator-prompt.md  # Orchestrator system prompt
├── agent-definitions.json  # Agent specs (responsibilities, owned files, contention rules)
└── task-router.js          # Deterministic task → agent routing

tests/                      # 1882 tests across 65 files (vitest)
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
- **12th feedback loop**: `enrich-streaming.js` mines alias suggestions from unmatched tvkampen entries → `streaming-verification-history.json` tracks match rate trends → `buildStreamingHints()` feeds corrections back → `pipeline-health.js` surfaces declining rates and pending alias suggestions for autopilot repair
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
| **Streaming verification** | Autonomous | tvkampen match rate tracked, alias mining, trend analysis (Loop 12) |
| **Autonomy tracking** | Autonomous | 12/12 feedback loops closed, scored by autonomy-scorecard.js |

**Autonomy score: 100% (12/12 loops closed)**

### What's Missing (Gap to Vision)

| Gap | Description | Difficulty |
|-----|-------------|------------|
| **Self-expanding capabilities** | Pipeline manifest pattern works. First self-added pipeline step (insights) demonstrated. Missing: end-to-end "new sport from scratch" — system detects opportunity, creates fetcher, wires it in, serves data. | Medium |
| **Esports data** | HLTV API returns stale 2022 data. The discovery loop creates curated configs but the primary data source is dead. Needs a new data source or full reliance on curated configs. | Low |
| **Meta-learning correlation** | The autopilot accumulates knowledge and evolves `autopilot-strategy.json`. Missing: automated correlation between strategy changes and outcome improvements (e.g., "switching to direct-to-main saved X turns"). | Low |
| **Richer feedback signals** | Thumbs-up/down on watch-plan works. Missing: tracking which editorial blocks resonate, which events the user actually watches, post-event satisfaction. | Low |

### Roadmap (Prioritized Next Steps)

**Phase 1 — Close the User Feedback Loop** — DONE
- ~~Render watch-plan picks in dashboard~~ — DONE
- ~~Add thumbs-up/down controls on watch-plan items~~ — DONE (PR #47)
- ~~Surface feedback signals in pipeline~~ — DONE: engagement data flows via GitHub Issues + localStorage
- ~~Feed engagement data into watch-plan scoring~~ — DONE: `computeFeedbackAdjustments()` (PR #101)

**Phase 2 — Evolving Preferences** — DONE
- ~~Track engagement per sport~~ — DONE: `PreferencesManager.trackEngagement()`
- ~~Evolve sport weights from engagement~~ — DONE: `evolve-preferences.js`
- ~~Evolve favorite teams/players~~ — DONE: syncs from client exports (PR #99)

**Phase 3 — Self-Expanding Capabilities** — In Progress
- ~~Opportunity detection~~ — DONE: creative scouting (heuristics F/G/H)
- ~~First self-added pipeline step~~ — DONE: `generate-insights.js` (PR #100)
- Pending: end-to-end self-discovered sport (new fetcher from opportunity → serving data)
- Pending: auto-diagnose and repair failed pipeline steps

**Phase 4 — Full Autonomy Proof**
- End-to-end demonstration: system detects a new major event, creates config, discovers schedule, verifies accuracy, enriches, generates editorial content, serves personalized dashboard — all without human intervention
- Document the autonomy architecture as a reference implementation

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

The autopilot workflow (`claude-autopilot.yml`) autonomously improves the codebase using a **multi-agent architecture**. The roadmap is **self-curated** — the autopilot discovers its own tasks, not just executes human-written ones. All autopilot changes must satisfy the Change Principles above — especially vision alignment and closing the loop.

#### Multi-Agent Architecture

The autopilot uses an orchestrator + 4 specialized subagents defined in `.claude/agents/`:

| Agent | Domain | Key Responsibilities |
|-------|--------|---------------------|
| **data-agent** | Data pipeline | API fetchers, configs, streaming, verification, coverage gaps |
| **content-agent** | AI content | Enrichment, featured content, watch plans, quality gates |
| **code-agent** | Code health | Tests, bug fixes, refactoring, pipeline infrastructure |
| **ux-agent** | Dashboard UX | HTML/CSS, visual design, component rendering, accessibility |

The **orchestrator** (`scripts/agents/orchestrator-prompt.md`) reads system state, routes tasks via `scripts/agents/task-router.js`, delegates to subagents in parallel, and handles quality gates + wrap-up. Each subagent has `memory: project` — persistent memory in `.claude/agent-memory/` that accumulates domain-specific knowledge across runs.

File ownership rules prevent conflicts: `events.json` is sequential (data builds, content enriches), `user-context.json` is orchestrator-only, `scripts/config/*.json` is data-agent-only.

#### Configuration

- **Roadmap**: `AUTOPILOT_ROADMAP.md` is a self-curated task queue — the autopilot adds, prioritizes, and executes tasks
- **Strategy**: `scripts/autopilot-strategy.json` is the autopilot's process playbook — ship modes, turn budgets, and accumulated process knowledge. The autopilot reads it at startup and evolves it based on what it learns.
- **Agent definitions**: `scripts/agents/agent-definitions.json` defines all 5 agents with responsibilities, owned files, contention rules, and scouting heuristics
- **Cadence**: Runs nightly at 01:00 UTC
- **PR label**: `autopilot`
- **Ship modes**: The autopilot chooses per-task: `branch-pr` (full ceremony, safest), `direct-to-main` (LOW-risk only, fastest), or `batch` (groups compatible tasks)
- **Scouting**: Reads health-report.json, autonomy-report.json, pattern-report.json, RSS trends, coverage gaps. Each subagent scouts within its domain if turns allow.
- **Visual validation**: Takes screenshots of the dashboard via Playwright (`scripts/screenshot.js`) before/after UI changes
- **Safe stops**: If tests fail or a merge fails, the loop stops — no broken code gets pushed
- **Human control**: Reorder tasks in the roadmap to change priority. Mark tasks `[BLOCKED]` to skip them.
