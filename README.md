# SportSync

> A self-maintaining sports dashboard with AI editorial content, autonomous event discovery, and zero manual intervention.

[![Deploy](https://github.com/CHaerem/SportSync/workflows/Update%20Sports%20Data/badge.svg)](https://github.com/CHaerem/SportSync/actions)
[![Live Site](https://img.shields.io/badge/Live-Dashboard-blue)](https://chaerem.github.io/SportSync/)

## What is SportSync?

A **static sports dashboard** that runs itself. New major events are auto-detected, researched, and populated without human intervention.

- **AI editorial brief** — Claude generates daily summaries, featured sections, and watch picks
- **Autonomous discovery** — detects events from RSS/news, researches schedules via web search, finds Norwegian athletes
- **Inline team logos** — football crests and golfer headshots in event rows
- **AI watch plan** — ranked "next 30/60/120 minutes" picks for quick decisions
- **Live scores** — client-side ESPN polling with pulsing LIVE dot
- **7 feedback loops** — self-correcting quality, coverage, content, and code health
- **480px reading column** — phone-width, OLED-ready dark mode
- **Fully automated** — fresh data every 2 hours, AI content via Claude, nightly code improvements

## Live Demo

**See it in action**: [chaerem.github.io/SportSync](https://chaerem.github.io/SportSync/)

## Sports Coverage

| Sport | Data Source | Coverage |
|-------|------------|---------|
| ⚽ **Football** | ESPN API + fotball.no | Premier League, La Liga, Eliteserien, OBOS-ligaen |
| ⛳ **Golf** | ESPN API + PGA Tour | PGA Tour, DP World Tour, Majors |
| 🎾 **Tennis** | ESPN API | ATP, WTA, Grand Slams |
| 🏎️ **Formula 1** | ESPN Racing API | Full race calendar + practice/qualifying |
| ♟️ **Chess** | Curated Data | Major tournaments, Norwegian focus |
| 🎮 **Esports** | PandaScore API | CS2 competitions |
| 🏅 **Olympics** | Auto-discovered | Schedules researched via web search when active |

## Architecture

SportSync has three automation layers:

```
┌─────────────────────────────────────────────────────┐
│  Data Pipeline (every 2 hours)                      │
│                                                     │
│  1. Fetch sports APIs (ESPN, PGA, PandaScore)       │
│  2. Fetch standings (PL, golf, F1) + RSS (11 feeds) │
│  3. Sync configs (prune expired, archive old)       │
│  4. Discover events (Claude CLI + WebSearch)         │
│  5. Build unified events.json                       │
│  6. Enrich with AI (importance, tags, summaries)    │
│  7. Generate editorial + watch plan via Claude       │
│  8. Validate → health check → quality gates         │
│  9. Coverage gap detection (RSS vs events)          │
│  10. Commit → deploy to GitHub Pages                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Autonomous Discovery (every pipeline run)           │
│                                                     │
│  1. sync-configs.js — prune, archive, flag empty    │
│  2. discover-events.js — research flagged configs:  │
│     • Look up real schedules via web search         │
│     • Find Norwegian athletes competing             │
│     • Verify streaming info (NRK, TV2, Eurosport)   │
│  3. Refresh athlete rosters every 7 days            │
│  4. Auto-discover Norwegian athletes per sport      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Autopilot (nightly at 03:00 UTC)                   │
│                                                     │
│  1. Reads AUTOPILOT_ROADMAP.md task queue           │
│  2. Branch → implement → test → PR → merge          │
│  3. Scouts codebase for new improvements            │
│  4. 27+ PRs completed autonomously                  │
└─────────────────────────────────────────────────────┘
```

### 7 Self-Correcting Feedback Loops

| # | Loop | What it does |
|---|------|-------------|
| 1 | Featured Quality | Quality history → adaptive hints → better editorial output |
| 2 | Enrichment Quality | AI quality scores → corrective prompts → better tags/summaries |
| 3 | Coverage Gaps | RSS headlines vs events → detect blind spots → create configs |
| 4 | Pipeline Health | Monitor freshness/coverage → auto-repair when things break |
| 5 | Watch Plan | Score events → rank picks → explain reasoning |
| 6 | Code Health | Scout codebase → roadmap → autopilot PRs |
| 7 | Event Discovery | Flag empty configs → web research → populate real schedules |

### The Featured Content System

Every 2 hours, `generate-featured.js` calls Claude to analyze events, standings, and news — then generates editorial blocks:

```json
{
  "blocks": [
    { "type": "headline", "text": "All eyes on the Bernabéu" },
    { "type": "event-line", "text": "⚽ Real Madrid vs Liverpool, 21:00" },
    { "type": "narrative", "text": "Holders Liverpool arrive three points clear." },
    { "type": "divider", "text": "This Week" },
    { "type": "event-line", "text": "⛳ Hovland at Pebble Beach, tee time 19:03" }
  ]
}
```

The dashboard is a generic renderer — the intelligence lives in the build step. It adapts to whatever is happening (Olympics, World Cup, Champions League) without frontend changes.

### Autonomous Event Discovery

When a coverage gap is detected (e.g. RSS mentions "Champions League" but no config exists):

1. `resolve-coverage-gaps.js` creates a skeleton config with `autoGenerated: true, events: []`
2. `sync-configs.js` flags it as `needsResearch: true`
3. `discover-events.js` invokes Claude CLI with WebSearch to research the real schedule
4. Config gets populated with dates, venues, Norwegian athletes, and streaming info
5. `build-events.js` picks it up on the next run — events appear on the dashboard

No human needed at any step.

## Claude Workflows

### Required Secrets

| Secret | Used by | Purpose |
|--------|---------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Both workflows | Claude Max subscription for AI generation, discovery, and autopilot |
| `OPENAI_API_KEY` | Data pipeline | Event enrichment fallback |
| `PANDASCORE_API_KEY` | Data pipeline | Esports data |

### Auth Priority

1. `CLAUDE_CODE_OAUTH_TOKEN` — Claude CLI (Max subscription)
2. `ANTHROPIC_API_KEY` — direct Anthropic API
3. `OPENAI_API_KEY` — OpenAI fallback
4. Template-based fallback (no AI)

## File Structure

```
docs/                               # GitHub Pages root
├── index.html                      # Dashboard (HTML + embedded CSS, 480px max-width)
├── js/
│   ├── dashboard.js                # Dashboard controller (~860 lines)
│   ├── asset-maps.js               # Team logos + golfer headshot URLs
│   ├── sport-config.js             # Sport metadata (7 sports)
│   └── preferences-manager.js      # Favorites + theme (localStorage)
├── data/                           # Auto-generated by GitHub Actions
│   ├── events.json                 # Unified events feed (with AI enrichment)
│   ├── featured.json               # AI-generated editorial blocks
│   ├── watch-plan.json             # AI-ranked watch recommendations
│   ├── standings.json              # ESPN standings (PL, golf, F1)
│   ├── rss-digest.json             # RSS news digest (11 feeds)
│   ├── ai-quality.json             # AI quality-gate metrics
│   ├── health-report.json          # Pipeline health report
│   ├── coverage-gaps.json          # RSS vs events gap detection
│   ├── discovery-log.json          # Event discovery actions log
│   ├── config-sync-log.json        # Config maintenance log
│   ├── autonomy-report.json        # Autonomy scorecard (7 loops)
│   └── events.ics                  # Calendar export
└── sw.js                           # Service worker

scripts/
├── fetch/                          # Modular API fetchers (one per sport)
├── config/                         # Auto-discovered curated event configs
│   ├── archive/                    # Expired configs (auto-archived)
│   ├── olympics-2026.json          # Winter Olympics schedule
│   ├── user-context.json           # User preferences + dynamic athletes
│   └── ...                         # Chess, golfer rosters, etc.
├── lib/                            # Shared libraries
│   ├── llm-client.js               # Anthropic + OpenAI API client
│   ├── helpers.js                  # Utilities, time constants
│   ├── ai-quality-gates.js         # Quality gates + adaptive hints
│   └── ...                         # Normalizer, validator, filters, etc.
├── sync-configs.js                 # Config maintenance (prune, archive, flag)
├── discover-events.js              # LLM discovery (Claude CLI + WebSearch)
├── build-events.js                 # Merges sport JSONs + curated configs
├── enrich-events.js                # AI enrichment (importance, tags, summaries)
├── generate-featured.js            # Claude CLI → featured.json
├── autonomy-scorecard.js           # 7-loop autonomy evaluation
├── pipeline-health.js              # Pipeline health report
├── detect-coverage-gaps.js         # RSS vs events blind spot detection
├── resolve-coverage-gaps.js        # Auto-creates skeleton configs for gaps
└── ...                             # Standings, RSS, calendar, validation

tests/                              # 554 tests across 29 files (vitest)

.github/workflows/
├── update-sports-data.yml          # Data pipeline (every 2 hours)
└── claude-autopilot.yml            # Autonomous improvement agent (nightly)
```

## Development

### Quick Start

```bash
git clone https://github.com/CHaerem/SportSync.git
cd SportSync
npm install
npm run dev          # http://localhost:8000
```

### Commands

```bash
npm run dev              # Local dev server
npm test                 # Run all tests (554 tests, vitest)
npm run build:events     # Generate events.json from sport files
npm run generate:featured # Generate featured.json (needs API key or Claude CLI)
npm run validate:data    # Check data integrity
npm run build:calendar   # Create .ics calendar export
```

### Adding a Curated Event

Create a JSON file in `scripts/config/`:

```json
{
  "name": "Event Name",
  "location": "City, Country",
  "startDate": "2026-06-10",
  "endDate": "2026-06-20",
  "context": "event-id",
  "norwegianAthletes": ["Athlete Name"],
  "events": [
    {
      "title": "Event Title",
      "time": "2026-06-15T21:00:00+02:00",
      "venue": "Venue Name",
      "norwegian": true,
      "norwegianPlayers": [{"name": "Athlete Name"}],
      "streaming": [{"platform": "NRK", "type": "tv"}]
    }
  ]
}
```

Or just create an empty config with `autoGenerated: true` — the discovery pipeline will research and populate it automatically.

## Calendar Integration

SportSync generates a standard `.ics` file at `/docs/data/events.ics`:

- Subscribe in any calendar app (Google Calendar, Apple Calendar, Outlook)
- Auto-updates every 2 hours
- Norwegian timezone for accurate local times

## License

MIT License
