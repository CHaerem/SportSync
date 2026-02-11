# SportSync

> A glanceable sports dashboard with AI-generated editorial content, inline team logos, and autonomous updates every 2 hours.

[![Deploy](https://github.com/CHaerem/SportSync/workflows/Update%20Sports%20Data/badge.svg)](https://github.com/CHaerem/SportSync/actions)
[![Live Site](https://img.shields.io/badge/Live-Dashboard-blue)](https://chaerem.github.io/SportSync/)

## What is SportSync?

A **static sports dashboard** built for quick scanning — logos, times, and short names at a glance.

- **Inline team logos** — football crests and golfer headshots right in the event rows
- **AI editorial brief** — Claude generates a daily summary, featured sections, and "on the radar" content
- **AI watch plan** — ranked "next 30/60/120 minutes" picks for fast decision-making
- **Temporal bands** — Today / Tomorrow / collapsed later
- **Click to expand** — tap any row for venue, streaming links, favorites
- **480px reading column** — phone-width, OLED-ready dark mode
- **Fully automated** — fresh data every 2 hours, AI content via Claude

## Live Demo

**See it in action**: [chaerem.github.io/SportSync](https://chaerem.github.io/SportSync/)

## Sports Coverage

| Sport | Data Source | Coverage |
|-------|------------|---------|
| ⚽ **Football** | ESPN API | Premier League, La Liga, Eliteserien, OBOS-ligaen |
| ⛳ **Golf** | ESPN API | PGA Tour, DP World Tour, Majors |
| 🎾 **Tennis** | ESPN API | ATP, WTA, Grand Slams |
| 🏎️ **Formula 1** | ESPN Racing API | Full race calendar + practice/qualifying |
| ♟️ **Chess** | Curated Data | Major tournaments, Norwegian focus |
| 🎮 **Esports** | PandaScore API | CS2 competitions |
| 🏅 **Olympics** | Curated Configs | Auto-generated when major events are active |

## Architecture

SportSync has two AI-powered automation layers running on GitHub Actions:

```
┌─────────────────────────────────────────────────┐
│  Data Pipeline (every 2 hours)                  │
│                                                 │
│  1. Fetch sports APIs → per-sport JSON files    │
│  2. Validate API responses (schema checks)      │
│  3. Auto-discover curated configs (scripts/     │
│     config/*.json) for major events             │
│  4. Merge into unified events.json              │
│  5. Enrich with AI (importance, tags)           │
│  6. Quality-gate enrichment fallback            │
│  7. Generate featured + watch-plan via Claude   │
│  8. Validate → health check → commit → deploy   │
│  9. Pipeline health report + quality regression  │
│  10. Coverage gap detection (RSS vs events)      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Autopilot (nightly at 03:00 UTC)               │
│                                                 │
│  1. Reads AUTOPILOT_ROADMAP.md task queue       │
│  2. Reads health-report.json + coverage-gaps    │
│  3. Picks first PENDING task (or repair task)   │
│  4. Branch → implement → test → PR → merge      │
│  5. Loops through tasks until done              │
│  6. Creates curated configs for coverage gaps   │
│  7. Scouts codebase for new improvements        │
└─────────────────────────────────────────────────┘
```

### The Featured Content System

The key architectural idea: the dashboard is a generic renderer, the intelligence lives in the build step.

Every 2 hours, `scripts/generate-featured.js` calls Claude to analyze current events and generate `featured.json`:

```json
{
  "brief": ["Norway leads medal count day 5.", "Biathlon relay today."],
  "sections": [{
    "id": "olympics-2026",
    "title": "Winter Olympics 2026",
    "style": "highlight",
    "items": [
      { "text": "09:00 — Men's 15km XC", "type": "event" },
      { "text": "14:30 — Mixed Relay Biathlon", "type": "event" }
    ]
  }],
  "radar": ["Klaebo aims for sprint gold Friday."]
}
```

This is powerful because Claude generates it fresh each build — it adapts to whatever is happening (Olympics, World Cup, Champions League) without any hard-coded sport logic in the frontend.

### Autonomous Content via Curated Configs

When major events are active (Olympics, World Cup, etc.), the autopilot creates curated config files in `scripts/config/`:

```json
{
  "name": "Winter Olympics 2026",
  "location": "Milano-Cortina, Italy",
  "startDate": "2026-02-06",
  "endDate": "2026-02-22",
  "context": "olympics-2026",
  "norwegianAthletes": ["Johannes Hoesflot Klaebo", "Therese Johaug"],
  "events": [...]
}
```

These are **auto-discovered** by `build-events.js` — any `*.json` file in `scripts/config/` is automatically merged into the events feed. No code changes needed.

## Claude Workflows

SportSync uses two GitHub Actions workflows powered by Claude:

### 1. Data Pipeline (`update-sports-data.yml`)

**Runs every 2 hours.** Fetches live sports data, generates AI editorial content, and deploys.

Key steps:
1. Fetch data from ESPN, PandaScore, and curated sources (with response validation)
2. `build-events.js` — merges sport JSONs + auto-discovers `scripts/config/*.json`
3. `enrich-events.js` — AI adds importance scores and tags (OpenAI)
4. `generate-featured.js` — Claude generates editorial brief, featured sections, and radar content
5. Validate data integrity
6. `pipeline-health.js` — checks sport coverage, data freshness, RSS/standings health
7. `check-quality-regression.js` — detects AI quality score drops vs previous commit
8. `detect-coverage-gaps.js` — cross-references RSS headlines against events to find blind spots
9. Build calendar, commit, deploy

The featured generation uses `CLAUDE_CODE_OAUTH_TOKEN` to call Claude via the Claude Code CLI (`npx @anthropic-ai/claude-code -p`). This allows using a Claude Max subscription instead of API keys.

**Auth priority for featured generation:**
1. `CLAUDE_CODE_OAUTH_TOKEN` — Claude CLI (Max subscription)
2. `ANTHROPIC_API_KEY` — direct Anthropic API
3. `OPENAI_API_KEY` — OpenAI fallback
4. Template-based fallback (no AI)

### 2. Autopilot (`claude-autopilot.yml`)

**Runs nightly at 03:00 UTC.** An autonomous agent that continuously improves the codebase.

How it works:
1. Reads `AUTOPILOT_ROADMAP.md` — a prioritized task queue
2. Picks the first `[PENDING]` task
3. Creates a branch (`claude/improve-*`), implements the fix, runs tests
4. Opens a PR with label `autopilot`, merges it immediately
5. Loops back for the next task (up to 75 turns per run)
6. After tasks are done, scouts the codebase for new improvements and appends them to the roadmap

Safety constraints:
- Protected paths (`.github/workflows/**`, `package.json`) are never modified
- Tests must pass before any commit — reverts on failure
- Max 8 files, 300 lines changed per task
- If anything breaks, the loop stops immediately

The autopilot has completed 25+ PRs autonomously — accessibility improvements, dead code removal, security fixes, performance optimizations, and test additions.

### Required Secrets

| Secret | Used by | Purpose |
|--------|---------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Both workflows | Claude Max subscription for AI generation and autopilot |
| `OPENAI_API_KEY` | Data pipeline | Event enrichment (importance, tags) |
| `LIVEGOLF_API_KEY` | Data pipeline | Live golf data |
| `PANDASCORE_API_KEY` | Data pipeline | Esports data |

## File Structure

```
docs/                               # GitHub Pages root
├── index.html                      # Dashboard (HTML + embedded CSS, 480px max-width)
├── js/
│   ├── dashboard.js                # Dashboard controller (~860 lines): brief, standings, live polling
│   ├── asset-maps.js               # Team logos + golfer headshot URLs
│   ├── sport-config.js             # Sport metadata (7 sports)
│   └── preferences-manager.js      # Favorites + theme (localStorage)
├── data/                           # Auto-generated by GitHub Actions
│   ├── events.json                 # Unified events feed (with AI enrichment)
│   ├── featured.json               # AI-generated editorial content
│   ├── watch-plan.json             # AI-ranked "what to watch next" windows
│   ├── standings.json              # ESPN standings (PL, golf, F1)
│   ├── rss-digest.json             # RSS news digest (11 feeds)
│   ├── ai-quality.json             # AI quality-gate metrics (enrichment + featured)
│   ├── health-report.json          # Pipeline health report (coverage, freshness, anomalies)
│   ├── coverage-gaps.json          # RSS vs events coverage gap detection
│   ├── events.ics                  # Calendar export
│   ├── football.json               # Per-sport source files
│   ├── golf.json / tennis.json / f1.json / chess.json / esports.json
│   ├── meta.json                   # Update timestamps
│   └── autopilot-log.json          # Autopilot run history
└── sw.js                           # Service worker for offline support

scripts/                            # Data fetching & processing
├── fetch/                          # Modular API fetchers (one per sport)
├── config/                         # Curated configs (auto-discovered)
│   ├── olympics-2026.json          # Winter Olympics schedule
│   └── user-context.json           # User preferences for enrichment
├── lib/
│   ├── llm-client.js               # OpenAI + Anthropic API client
│   ├── helpers.js                  # Shared utilities
│   ├── enrichment-prompts.js       # AI enrichment prompt templates
│   ├── event-normalizer.js         # Event validation
│   ├── response-validator.js       # API response schema validation
│   └── ai-quality-gates.js         # AI enrichment quality gates
├── fetch-standings.js              # ESPN standings → standings.json
├── fetch-rss.js                    # RSS digest → rss-digest.json
├── build-events.js                 # Merges sport JSONs + curated configs
├── enrich-events.js                # AI enrichment (importance, tags, summaries)
├── generate-featured.js            # Claude CLI → featured.json
├── pipeline-health.js              # Pipeline health report → health-report.json
├── check-quality-regression.js     # AI quality regression detection
├── detect-coverage-gaps.js         # RSS vs events blind spot detection
├── merge-open-data.js              # Merges open source + primary data
├── validate-events.js              # Data integrity checks
└── build-ics.js                    # Calendar export generator

.github/workflows/
├── update-sports-data.yml          # Data pipeline (every 2 hours)
└── claude-autopilot.yml            # Autonomous improvement agent (nightly)

AUTOPILOT_ROADMAP.md                # Prioritized task queue for autopilot
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
npm test                 # Run all tests (279 tests, vitest)
npm run build:events     # Generate events.json from sport files
npm run generate:featured # Generate featured.json (needs API key or Claude CLI)
npm run validate:data    # Check data integrity
npm run build:calendar   # Create .ics calendar export
npm run refresh          # Clean + full rebuild
```

### Adding a Curated Event

To add coverage for a major event (Olympics, World Cup, etc.), create a JSON file in `scripts/config/`:

```bash
scripts/config/my-event.json
```

It will be automatically discovered and merged into the events feed on the next build. See `scripts/config/olympics-2026.json` for the format.

## Calendar Integration

SportSync generates a standard `.ics` file at `/docs/data/events.ics`:

- Subscribe in any calendar app (Google Calendar, Apple Calendar, Outlook)
- Auto-updates every 2 hours
- Norwegian timezone for accurate local times

## License

MIT License
