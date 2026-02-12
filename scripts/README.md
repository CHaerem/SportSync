# SportSync Scripts

Data pipeline, AI enrichment, and autonomous discovery for the SportSync dashboard.

## Pipeline Order

This is the order scripts run in the GitHub Actions workflow (every 2 hours):

```
1. fetch/index.js          — Fetch all sports APIs (ESPN, PGA, PandaScore, fotball.no)
2. fetch-standings.js      — ESPN standings (PL table, golf leaderboards, F1 drivers)
3. fetch-rss.js            — RSS digest (11 feeds: NRK, TV2, BBC, ESPN, etc.)
4. sync-configs.js         — Prune expired events, archive old configs, flag empty ones
5. discover-events.js      — Claude CLI + WebSearch to research flagged configs
6. build-events.js         — Aggregate sport JSONs + curated configs → events.json
7. enrich-events.js        — AI adds importance (1-5), summaries, tags
8. generate-featured.js    — Claude CLI → featured.json (editorial blocks + watch plan)
9. validate-events.js      — Data integrity checks
10. pipeline-health.js     — Coverage, freshness, anomaly detection → health-report.json
11. detect-coverage-gaps.js — RSS vs events → coverage-gaps.json + auto-resolve
12. build-ics.js           — Calendar export → events.ics
```

## Directory Structure

```
scripts/
├── fetch/                          # Sport-specific API fetchers
│   ├── index.js                    # Orchestrator (Promise.allSettled)
│   ├── football.js                 # ESPN + fotball.no
│   ├── golf.js                     # ESPN + PGA Tour tee times
│   ├── tennis.js                   # ESPN ATP/WTA
│   ├── f1.js                       # ESPN Racing
│   ├── chess.js                    # Curated config reader
│   └── esports.js                  # PandaScore CS2
├── config/                         # Auto-discovered curated event configs
│   ├── archive/                    # Expired configs (auto-archived by sync-configs)
│   ├── olympics-2026.json          # Winter Olympics schedule
│   ├── user-context.json           # User preferences + dynamicAthletes
│   ├── chess-tournaments.json      # Chess event data
│   ├── norwegian-chess-players.json
│   └── norwegian-golfers.json
├── lib/
│   ├── llm-client.js               # LLM abstraction (Anthropic preferred, OpenAI fallback)
│   ├── helpers.js                  # Utilities, time constants (MS_PER_DAY, etc.)
│   ├── ai-quality-gates.js         # Quality gates, adaptive hints, quality snapshots
│   ├── enrichment-prompts.js       # Prompts for AI event enrichment
│   ├── event-normalizer.js         # Event validation and normalization
│   ├── response-validator.js       # API response schema validation
│   ├── base-fetcher.js             # Base class for sport fetchers
│   ├── api-client.js               # HTTP client wrapper with retry/cache
│   ├── norwegian-streaming.js      # Norwegian streaming platform info
│   ├── filters.js                  # Event filtering utilities
│   └── watch-plan.js               # Watch plan scoring and generation
├── sync-configs.js                 # Config maintenance (prune, archive, flag)
├── discover-events.js              # LLM discovery (Claude CLI + WebSearch)
├── build-events.js                 # Aggregates sport JSONs + curated configs
├── enrich-events.js                # AI enrichment (importance, tags, summaries)
├── generate-featured.js            # Claude CLI → featured.json + watch-plan.json
├── autonomy-scorecard.js           # 7-loop autonomy evaluation
├── pipeline-health.js              # Pipeline health → health-report.json
├── check-quality-regression.js     # AI quality regression detection
├── detect-coverage-gaps.js         # RSS vs events + auto-resolve gaps
├── resolve-coverage-gaps.js        # Creates skeleton configs for gaps
├── merge-open-data.js              # Merges open source + primary data
├── validate-events.js              # Data integrity checks
├── verify-schedules.js             # ESPN cross-reference for curated configs
├── build-ics.js                    # Calendar export generator
├── pre-commit-gate.js              # Pre-commit validation gate
└── ai-sanity-check.js              # AI output sanity check
```

## Quick Start

```bash
# Fetch all sports data
node scripts/fetch/index.js

# Sync and discover (requires CLAUDE_CODE_OAUTH_TOKEN for discovery)
node scripts/sync-configs.js
node scripts/discover-events.js

# Build unified events file
node scripts/build-events.js

# AI enrichment (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
node scripts/enrich-events.js

# Generate featured content (requires CLAUDE_CODE_OAUTH_TOKEN)
node scripts/generate-featured.js

# Run all tests (554 tests across 29 files)
npm test
```

## Sports Supported

| Sport | Primary API | Fetcher | Norwegian Focus |
|-------|------------|---------|-----------------|
| Football | ESPN + fotball.no | `football.js` | FK Lyn Oslo, Barcelona, Liverpool |
| Tennis | ESPN | `tennis.js` | Casper Ruud |
| Golf | ESPN + PGA Tour | `golf.js` | Viktor Hovland |
| F1 | ESPN | `f1.js` | — |
| Chess | Curated configs | `chess.js` | Magnus Carlsen |
| Esports | PandaScore | `esports.js` | CS2 competitions |
| Olympics | Auto-discovered | via configs | All Norwegian athletes |

## Environment Variables

```bash
CLAUDE_CODE_OAUTH_TOKEN=...  # Claude Max subscription (featured, discovery, autopilot)
ANTHROPIC_API_KEY=...        # Direct Anthropic API (enrichment, featured fallback)
OPENAI_API_KEY=...           # OpenAI (enrichment fallback)
PANDASCORE_API_KEY=...       # Esports CS2 competitions
```

## Error Handling

- **Response validation** — schema checks filter invalid items without rejecting entire responses
- **API retries** with exponential backoff
- **Retain last good** data on total failure
- **Pipeline health monitoring** — detects sport drops, stale data, RSS/standings issues
- **Quality regression gate** — alerts when AI scores drop
- **Coverage gap detection** — finds blind spots by cross-referencing RSS vs events
- **Discovery safeguards** — max 3 tasks per run, JSON validation, autoGenerated flag
