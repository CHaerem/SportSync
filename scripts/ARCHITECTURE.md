# SportSync Architecture

## Overview

SportSync uses a **modular, configuration-driven architecture** for fetching sports data from various APIs. The system is designed for robustness, extensibility, and autonomous operation — the multi-agent autopilot can add new fetchers, pipeline steps, and data sources without human intervention.

## Core Principles

1. **Configuration-Driven**: Sport-specific settings live in curated configs (`scripts/config/*.json`)
2. **Inheritance-Based**: Common functionality shared through base classes (`BaseFetcher` → `ESPNAdapter`)
3. **Robust Error Handling**: Multiple layers of fallbacks, retries, and validation
4. **Auto-Discovery**: New sport files and configs are automatically picked up by the build pipeline
5. **Autonomous Operation**: Multi-agent autopilot maintains data, code, and content quality

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   Pipeline Runner                         │
│          (run-pipeline.js reads pipeline-manifest.json)   │
│                                                          │
│  9 phases, 21 steps — declarative, autopilot-editable    │
│  fetch → prepare → discover → build → generate →         │
│  validate → monitor → personalize → finalize             │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                    Fetch Layer                             │
│  football.js | golf.js | tennis.js | f1.js | chess.js    │
│  esports.js | fotball-no.js                              │
│  All extend BaseFetcher → ESPNAdapter (where applicable) │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│               Validation & Utilities                      │
│  ResponseValidator | APIClient | EventNormalizer          │
│  Filters | Helpers | LLMClient                           │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                   Build & Enrich                          │
│  build-events.js (auto-discovers sport JSONs + configs)  │
│  enrich-events.js (LLM importance, summaries, tags)      │
│  generate-featured.js (Claude CLI editorial content)     │
│  enrich-streaming.js (tvkampen matching)                 │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                   Monitoring Layer                         │
│  pipeline-health.js | check-quality-regression.js        │
│  detect-coverage-gaps.js | analyze-patterns.js           │
│  autonomy-scorecard.js | evaluate-ux.js                  │
└──────────────────────────────────────────────────────────┘
```

## Directory Structure

```
scripts/
├── config/                     # Auto-discovered curated event configs
│   ├── user-context.json       # User preferences (sport weights, favorites)
│   ├── olympics-2026.json      # Winter Olympics schedule
│   ├── biathlon-wch-2026.json  # Biathlon World Championships
│   ├── nordic-ski-wch-2026.json # FIS Nordic Championships
│   ├── chess-tournaments.json  # Chess tournament schedule
│   └── archive/                # Expired configs (auto-archived)
│
├── lib/
│   ├── base-fetcher.js         # Abstract base class for all fetchers
│   ├── adapters/
│   │   └── espn-adapter.js     # ESPN API adapter (football, tennis, golf, F1)
│   ├── api-client.js           # HTTP client with retry & caching
│   ├── event-normalizer.js     # Consistent event structure
│   ├── response-validator.js   # ESPN response schema validation
│   ├── ai-quality-gates.js     # AI quality gates, component registry
│   ├── filters.js              # Reusable filtering functions
│   ├── helpers.js              # Shared utilities (fetchJson, isEventInWindow, time constants)
│   ├── llm-client.js           # LLM abstraction (Anthropic preferred, OpenAI fallback)
│   ├── schedule-verifier.js    # 5-stage schedule verification engine
│   ├── tvkampen-scraper.js     # tvkampen.com streaming scraper
│   ├── streaming-matcher.js    # Fuzzy team/time matching for streaming
│   ├── broadcaster-urls.js     # Broadcaster name→URL/type mapping
│   ├── watch-plan.js           # Watch-plan scoring and feedback adjustments
│   ├── fact-checker.js         # LLM claim verification
│   ├── ux-heuristics.js        # File-based UX evaluation heuristics
│   └── enrichment-prompts.js   # Prompts for AI event enrichment
│
├── fetch/
│   ├── index.js                # Orchestrates all fetchers via Promise.allSettled
│   ├── football.js             # ESPN Premier League + La Liga
│   ├── golf.js                 # ESPN + PGA Tour tee times/featured groups
│   ├── tennis.js               # ESPN ATP/WTA
│   ├── f1.js                   # ESPN Racing F1
│   ├── chess.js                # Curated + Lichess
│   ├── esports.js              # HLTV + curated CS2
│   └── fotball-no.js           # Norwegian OBOS-ligaen (Lyn Oslo)
│
├── agents/
│   ├── orchestrator-prompt.md  # Orchestrator system prompt
│   ├── agent-definitions.json  # Agent specs, ownership, contention rules
│   └── task-router.js          # Deterministic task → agent routing
│
├── pipeline-manifest.json      # Declarative pipeline step definitions
├── autopilot-strategy.json     # Process strategy (ship modes, turn budgets)
├── run-pipeline.js             # Pipeline runner (reads manifest, orchestrates)
├── build-events.js             # Auto-discovers sport JSONs + configs → events.json
├── enrich-events.js            # LLM enrichment with adaptive hints
├── generate-featured.js        # Claude CLI editorial content generation
├── generate-multi-day.js       # Yesterday recap + tomorrow preview
├── fetch-standings.js          # ESPN standings (PL, La Liga, golf, F1, tennis)
├── fetch-rss.js                # RSS digest (11 feeds)
├── fetch-results.js            # ESPN recent results (7-day history)
├── enrich-streaming.js         # tvkampen streaming enrichment
├── verify-schedules.js         # Schedule verification orchestrator
├── evolve-preferences.js       # Engagement → preference evolution
├── generate-capabilities.js    # Capability registry generator
├── pipeline-health.js          # Health report + autonomy scorecard
├── analyze-patterns.js         # Recurring issue pattern detection
├── evaluate-ux.js              # UX quality evaluation (browser + file-based)
└── screenshot.js               # Dashboard screenshot (Playwright)
```

## Core Components

### 1. Base Fetcher (`lib/base-fetcher.js`)

Abstract base class providing common functionality:
- **fetch()**: Main entry point
- **fetchFromAPIs()**: Orchestrates API calls
- **applyFilters()**: Applies configured filters
- **normalizeEvents()**: Ensures consistent structure
- **formatResponse()**: Creates `{ tournaments: [...] }` output

### 2. ESPN Adapter (`lib/adapters/espn-adapter.js`)

Extends BaseFetcher for ESPN-based sports (football, tennis, golf, F1):
- Handles ESPN scoreboard and schedule endpoints
- Norwegian player/team detection
- Tournament-level event creation for sports with empty competition arrays

### 3. API Client (`lib/api-client.js`)

Robust HTTP client with:
- Automatic retries with exponential backoff
- Response caching to reduce API calls
- Timeout handling (per-request configurable)
- Error recovery with stale cache fallback

### 4. Pipeline Runner (`run-pipeline.js`)

Reads `pipeline-manifest.json` and executes all steps phase by phase:
- 9 phases: fetch, prepare, discover, build, generate, validate, monitor, personalize, finalize
- Each step has an error policy (continue/required), env requirements, and timing
- Writes `pipeline-result.json` with per-step outcomes for observability
- The autopilot can add/remove/reorder steps by editing the manifest

## Data Flow

1. **Pipeline runner** reads manifest and orchestrates all phases
2. **Fetchers** call ESPN, PGA Tour, fotball.no, HLTV APIs in parallel
3. **Sport JSON files** written to `docs/data/` (`football.json`, `golf.json`, etc.)
4. **Standings, RSS, results** fetched from ESPN + RSS feeds
5. **sync-configs.js** prunes expired events, archives old configs, flags empty ones for research
6. **discover-events.js** invokes Claude CLI + WebSearch to populate flagged configs
7. **verify-schedules.js** runs 5-stage verification (static → ESPN → RSS → sport data → web)
8. **build-events.js** auto-discovers sport files + curated configs → merged `events.json`
9. **enrich-events.js** adds importance (1-5), summaries, tags via LLM
10. **generate-featured.js** creates editorial content via Claude CLI (narrative + component blocks)
11. **Pipeline health** checks coverage, freshness, quality; writes health-report.json
12. **Client-side** loads JSON files, renders dashboard with live ESPN polling every 60s

## Multi-Agent Autopilot

The nightly autopilot uses `.claude/agents/` subagents:

| Agent | Domain | Owned Files |
|-------|--------|-------------|
| **data-agent** | Data pipeline | `scripts/fetch/**`, `scripts/config/**`, streaming/verification scripts |
| **content-agent** | AI content | Enrichment, featured, watch-plan, quality history |
| **code-agent** | Code health | `scripts/lib/**`, `tests/**`, pipeline manifest |
| **ux-agent** | Dashboard UX | `docs/index.html`, `docs/js/**`, `docs/sw.js` |

The orchestrator reads system state, routes tasks via `task-router.js`, delegates to subagents in parallel, and handles quality gates + meta-learning. Each subagent has persistent memory in `.claude/agent-memory/`.

## Error Handling Strategy

### Multiple Layers of Resilience

1. **Response Validation** (`response-validator.js`): Schema checks for ESPN responses, filters invalid items rather than rejecting entire response
2. **API Level**: Retry failed requests (2 retries, exponential backoff), per-request timeout support
3. **Pipeline Level**: Continue even if individual sports fail (error policy per step), retain last good data
4. **Monitoring** (post-build): pipeline-health.js, check-quality-regression.js, detect-coverage-gaps.js, analyze-patterns.js
5. **Self-Repair**: Autopilot reads health reports and pattern analyses to fix recurring issues

## Adding a New Sport

1. Write a fetcher in `scripts/fetch/` that outputs `{ tournaments: [...] }` to `docs/data/{sport}.json`
2. Register it in `scripts/fetch/index.js`
3. Add sport config to `docs/js/sport-config.js` (emoji, color, aliases)
4. `build-events.js` auto-discovers the sport file — no further registration needed
5. `pipeline-health.js` auto-monitors freshness
6. Events auto-display in `dashboard.js`

Or for events without an API: create a JSON config in `scripts/config/`. The discovery pipeline will research and populate it automatically.

## Testing

1882 tests across 65 files (vitest):

```bash
npm test
```

Key test areas: fetchers, response validation, pipeline health, quality regression, coverage gaps, dashboard structure, event normalization, enrichment, build-events, standings, RSS, results, helpers, filters, preferences, streaming, agent infrastructure, and AI quality gates.
