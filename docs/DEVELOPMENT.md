# SportSync Development Guide

## Overview

SportSync is a **static sports dashboard** with a fully autonomous data pipeline and multi-agent autopilot. The architecture is designed for simplicity, robustness, and autonomous extensibility — the autopilot can add new data sources, pipeline steps, and UI features without human intervention.

## System Architecture

```
Pipeline Runner (every 2h)
  reads pipeline-manifest.json
  executes 9 phases, 21 steps
  ├── fetch (ESPN, PGA Tour, fotball.no, HLTV, RSS)
  ├── prepare (streaming enrichment, config sync)
  ├── discover (Claude CLI + WebSearch for new events)
  ├── build (merge sport JSONs + curated configs → events.json)
  ├── generate (AI enrichment, featured content, watch plan)
  ├── validate (data integrity, schedule verification)
  ├── monitor (health report, quality regression, coverage gaps)
  ├── personalize (preference evolution from engagement data)
  └── finalize (capabilities registry, autonomy scorecard)

Multi-Agent Autopilot (nightly)
  orchestrator → delegates to 4 subagents in parallel
  ├── data-agent (APIs, configs, streaming, verification)
  ├── content-agent (enrichment, featured, quality gates)
  ├── code-agent (tests, bugs, refactoring, pipeline)
  └── ux-agent (HTML/CSS, visual design, accessibility)

GitHub Pages → Static dashboard with live ESPN polling
```

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no framework)
- **Backend**: None (static site)
- **Data Pipeline**: Node.js scripts orchestrated by `run-pipeline.js`
- **Hosting**: GitHub Pages
- **CI/CD**: GitHub Actions
- **AI**: Claude Code Max (enrichment, discovery, featured content, autopilot)
- **APIs**: ESPN, PGA Tour, fotball.no, HLTV, 11 RSS feeds

## Development Setup

### Prerequisites

- Node.js 20+
- Git
- Python 3 (for local server)

### Local Development

```bash
git clone https://github.com/chaerem/SportSync.git
cd SportSync
npm install
npm run dev          # http://localhost:8000
```

## Project Structure

```
SportSync/
├── docs/                 # GitHub Pages root (frontend)
│   ├── index.html       # Dashboard (HTML + embedded CSS, 480px max-width)
│   ├── js/
│   │   ├── dashboard.js          # Dashboard controller (~1650 lines)
│   │   ├── asset-maps.js         # Team logos + golfer headshot URLs
│   │   ├── sport-config.js       # Sport metadata (9 sports incl. Olympics, biathlon, nordic)
│   │   └── preferences-manager.js # Favorites + engagement tracking (localStorage)
│   ├── data/            # Auto-generated JSON data
│   └── sw.js            # Service worker
│
├── scripts/             # Data pipeline + agents
│   ├── config/          # Auto-discovered curated event configs
│   ├── lib/             # Core libraries (helpers, validators, LLM, streaming)
│   ├── fetch/           # Sport-specific fetchers (7 sports + fotball.no)
│   ├── agents/          # Multi-agent orchestration (definitions, router, prompt)
│   ├── pipeline-manifest.json    # Declarative pipeline steps (autopilot-editable)
│   ├── run-pipeline.js           # Pipeline runner
│   └── ...              # Build, enrich, generate, monitor scripts
│
├── .claude/
│   ├── agents/          # Subagent definitions (data, content, code, ux)
│   └── agent-memory/    # Persistent agent memory across runs
│
├── tests/               # 1882 tests across 65 files (vitest)
├── .github/workflows/   # GitHub Actions (data pipeline + multi-agent autopilot)
└── AUTOPILOT_ROADMAP.md # Self-curated task queue
```

## Data Flow

### 1. Automated Pipeline (GitHub Actions, every 2h)

1. `run-pipeline.js` reads `pipeline-manifest.json` and orchestrates all phases
2. Fetchers call ESPN, PGA Tour, fotball.no, HLTV APIs in parallel
3. Standings (PL, La Liga, golf, F1, tennis), RSS (11 feeds), results (7-day history) fetched
4. `sync-configs.js` prunes expired events, archives old configs, flags for research
5. `discover-events.js` invokes Claude CLI + WebSearch for flagged configs
6. `verify-schedules.js` runs 5-stage verification chain
7. `build-events.js` auto-discovers sport JSONs + curated configs → `events.json`
8. `enrich-events.js` adds importance (1-5), summaries, tags via LLM
9. `generate-featured.js` creates editorial content via Claude CLI
10. Health checks, quality gates, coverage gap detection, autonomy scorecard
11. Commits updated JSON files, GitHub Pages deploys automatically

### 2. Client-Side Loading

1. `dashboard.js` loads `events.json`, `featured.json`, `standings.json`, `recent-results.json`
2. Renders AI-generated editorial brief and featured sections
3. Events grouped by sport with color-coded borders
4. Click-to-expand shows venue, logos, inline standings, streaming, favorites
5. Live polling: ESPN football scores + golf leaderboard every 60s
6. Day navigator: browse past recaps and future previews
7. Service worker caches static assets

## Adding New Features

### Adding a New Sport

1. Write a fetcher in `scripts/fetch/` extending `BaseFetcher` or `ESPNAdapter`
2. Output `{ tournaments: [...] }` format to `docs/data/{sport}.json`
3. Register it in `scripts/fetch/index.js`
4. Add sport config to `docs/js/sport-config.js` (emoji, color, aliases)
5. Everything auto-flows: `build-events.js` discovers the file, `pipeline-health.js` monitors freshness, `dashboard.js` renders events

Example fetcher:

```javascript
import { ESPNAdapter } from '../lib/adapters/espn-adapter.js';

class BasketballFetcher extends ESPNAdapter {
  constructor() {
    super({
      sport: 'basketball',
      sources: [{
        api: 'espn',
        type: 'scoreboard',
        url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
      }]
    });
  }
}

export async function fetchBasketball() {
  return new BasketballFetcher().fetch();
}
```

### Adding a Curated Event (no API needed)

Create a JSON config in `scripts/config/`. Or create an empty config with `autoGenerated: true` — the discovery pipeline will research and populate it automatically.

### User Preferences

Preferences managed by `docs/js/preferences-manager.js` (localStorage):
- Favorite teams and players (by sport)
- Individual event favorites
- Theme preference (dark/light/auto)
- Per-sport engagement tracking (click counts)
- Watch-plan feedback (thumbs-up/down)

Engagement data flows to the server-side pipeline via GitHub Issues, where `evolve-preferences.js` updates sport weights and favorite lists in `user-context.json`.

## API Integration

### ESPN APIs (Public, no key needed)

- **Football**: `/apis/site/v2/sports/soccer/{league}/scoreboard`
- **Tennis**: `/apis/site/v2/sports/tennis/{tour}/scoreboard`
- **Golf**: `/apis/site/v2/sports/golf/{tour}/scoreboard`
- **F1**: `/apis/site/v2/sports/racing/f1/scoreboard`
- **Standings**: Same pattern with `/standings` endpoint

### Custom Integrations

- **Chess**: Curated configs + Lichess API
- **Esports**: HLTV community API + curated CS2 configs
- **Golf (enhanced)**: PGA Tour tee times (scraped from pgatour.com)
- **Norwegian Football**: fotball.no API (ICS format)
- **Streaming**: tvkampen.com scraping + fuzzy team matching

### Rate Limiting

- 150ms delay between requests to same API
- 2 retries with exponential backoff
- Per-request timeout support (configurable in `fetchJson()`)

## Testing

```bash
# Run all tests (1882 tests across 65 files)
npm test

# Validate data structure
node scripts/validate-events.js

# Run pipeline health check locally
node scripts/pipeline-health.js

# Check quality regression
node scripts/check-quality-regression.js
```

Test coverage includes: fetchers, response validation, pipeline health, quality regression, coverage gaps, dashboard structure, event normalization, enrichment, build-events, standings, RSS, results, helpers, filters, preferences, streaming, watch-plan, agent infrastructure, UX evaluation, and AI quality gates.

## Debugging

### Check GitHub Actions Logs

```bash
gh run list --workflow=update-sports-data.yml --limit 5
gh run view <run-id> --log
```

### Inspect Generated Data

```bash
# Check event counts
node -e "const d=require('./docs/data/events.json'); console.log(d.length, 'events')"

# Check pipeline health
node scripts/pipeline-health.js

# Check autonomy score
cat docs/data/autonomy-report.json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).loopsClosed+'/'+JSON.parse(d).loopsTotal))"
```

## Feature Status

### Completed
- Ultra-minimal editorial dashboard (480px, system-ui, newspaper aesthetic)
- AI editorial blocks (headline, event-line, narrative, component blocks) via Claude CLI
- Component template system (match-result, match-preview, event-schedule, golf-status)
- Multi-day briefings — yesterday recap + tomorrow preview with day navigator
- AI event enrichment (importance 1-5, summaries, tags, Norwegian relevance)
- AI watch plan with thumbs-up/down feedback controls
- Live score polling (ESPN football + golf leaderboard every 60s)
- Inline standings widgets (PL, La Liga, golf, F1, tennis)
- Autonomous curated configs (Olympics, biathlon, nordic skiing, chess, CS2)
- 12/12 feedback loops closed (100% autonomy score)
- Multi-agent autopilot (orchestrator + 4 specialized subagents)
- Preference evolution from engagement data (sport weights + favorites)
- 5-stage schedule verification
- Streaming enrichment (tvkampen scraping + fuzzy matching)
- User preferences, favorites, dark mode (localStorage)
- 82+ PRs merged autonomously
- 1882 tests across 65 files
