# SportSync

> **Can a software system maintain itself, improve itself, and expand its own capabilities — with zero infrastructure beyond GitHub?**

[![Deploy](https://github.com/CHaerem/SportSync/workflows/Update%20Sports%20Data/badge.svg)](https://github.com/CHaerem/SportSync/actions)
[![Live Site](https://img.shields.io/badge/Live-Dashboard-blue)](https://chaerem.github.io/SportSync/)

## The Experiment

SportSync is a **proof of concept for fully autonomous software systems**. The sports dashboard is the vehicle — the real experiment is the autonomy architecture underneath.

The thesis: a system built on nothing but **GitHub Actions**, a **Claude Code Max subscription**, and **GitHub Pages** can autonomously:

1. **Maintain its own data** — fetch, enrich, verify, and correct sports information from 6 APIs
2. **Maintain its own code** — detect bugs and improvement opportunities, then ship fixes via PRs (50+ merged autonomously)
3. **Expand its own capabilities** — recognize when new features or data sources would help, and build them (pipeline steps are defined in an editable manifest the autopilot controls)
4. **Personalize its output** — adapt content to user interests that evolve over time based on engagement signals
5. **Self-correct quality** — 11 closed feedback loops observe outcomes, decide on corrective actions, and act

No databases. No servers. No paid APIs. No deployment infrastructure. This constraint is deliberate — it proves that meaningful autonomy is possible with minimal infrastructure.

**See it live**: [chaerem.github.io/SportSync](https://chaerem.github.io/SportSync/)

## How It Works

Three automation layers run continuously without human intervention:

```
┌──────────────────────────────────────────────────────────┐
│  DATA PIPELINE (every 2 hours)                           │
│                                                          │
│  Orchestrated by run-pipeline.js reading a declarative   │
│  manifest (pipeline-manifest.json) that the autopilot    │
│  can edit to add new steps — no workflow changes needed.  │
│                                                          │
│  9 phases, 21 steps:                                     │
│  fetch → prepare → discover → build → generate →         │
│  validate → monitor → personalize → finalize             │
│                                                          │
│  Each step has an error policy (continue/required),      │
│  env requirements, and timing. Results written to        │
│  pipeline-result.json for observability.                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  AUTONOMOUS DISCOVERY (every pipeline run)               │
│                                                          │
│  When a coverage gap is detected (RSS mentions an event  │
│  but no config exists), the system:                      │
│                                                          │
│  1. Creates a skeleton config                            │
│  2. Flags it for research                                │
│  3. Invokes Claude CLI + WebSearch to find real dates,   │
│     venues, Norwegian athletes, and streaming info       │
│  4. Verifies the schedule against ESPN/RSS/sport data    │
│  5. Events appear on the dashboard next cycle            │
│                                                          │
│  No human needed at any step.                            │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  AUTOPILOT (nightly at 01:00 UTC)                        │
│                                                          │
│  A Claude agent that reads the codebase, picks tasks     │
│  from a self-curated roadmap, and ships improvements:    │
│                                                          │
│  1. Self-repair: fixes broken tests before anything else │
│  2. Task loop: choose ship mode → implement → test →     │
│     ship (direct-to-main / PR / batch)                   │
│  3. Creative scouting: reads data signals, screenshots   │
│     the dashboard, reasons about gaps in the autonomy    │
│     vision, and creates new tasks                        │
│  4. Meta-learning: records what worked, evolves its own  │
│     process strategy for future runs                     │
│                                                          │
│  Controls its own process via autopilot-strategy.json:   │
│  ship modes, turn budgets, and accumulated process       │
│  knowledge — all self-evolving based on measured results. │
│                                                          │
│  80+ PRs completed autonomously.                         │
└──────────────────────────────────────────────────────────┘
```

## The Five Pillars

Every change to SportSync — whether by a human or the autopilot — must serve at least one pillar and pass all six change principles (vision alignment, close the loop, zero infrastructure, autonomous by default, measurable impact, compound learning):

### 1. Self-Maintaining Data

The pipeline fetches from ESPN, PGA Tour, fotball.no, HLTV, and 11 RSS feeds every 2 hours. AI enrichment adds importance scores, summaries, and Norwegian relevance tags. A 5-stage schedule verifier cross-references discovered events against ESPN, RSS, and sport data sources. Stale data is detected and surfaced in health reports.

### 2. Self-Maintaining Code

The nightly autopilot reads health reports, quality scores, autonomy metrics, and pattern analyses. It scouts for dead code, missing tests, data-to-UI gaps, and fetcher data waste. When it finds something, it creates a task, branches, implements the fix, runs 1295 tests, and merges — then moves to the next task. It learns from previous runs by analyzing the autopilot log for failure patterns.

### 3. Self-Expanding Capabilities

The data pipeline is defined in a declarative JSON manifest (`scripts/pipeline-manifest.json`). The autopilot can add new pipeline steps — a new fetcher, a new quality check, a new data export — by editing this file. No workflow modification needed. A capability registry (`capabilities.json`) auto-generates a map of what the system can do and what gaps remain, giving the autopilot strategic awareness of where to invest effort.

Task tiers allow the autopilot to take on larger work:
- `[MAINTENANCE]` — 8 files, 300 lines (bug fixes, tests, cleanups)
- `[FEATURE]` — 12 files, 500 lines (new capabilities)
- `[EXPLORE]` — read-only investigation that produces concrete tasks

### 4. Personalized Output

The dashboard adapts to user interests. Engagement tracking records which sports the user clicks on. `evolve-preferences.js` reads this data and adjusts sport weights in the user preference config. These weights flow through the entire pipeline — enrichment, featured content, watch-plan ranking, and discovery research priorities all respond to what the user actually cares about.

### 5. Self-Correcting Quality

11 closed feedback loops form a self-correcting system:

| # | Loop | Observe | Decide | Act |
|---|------|---------|--------|-----|
| 1 | Featured Quality | Quality history scores | Build adaptive hints | Inject corrections into next editorial prompt |
| 2 | Enrichment Quality | AI quality gate metrics | Detect low tag/summary coverage | Adjust enrichment prompts |
| 3 | Coverage Gaps | RSS headlines vs events | Find blind spots | Auto-create skeleton configs |
| 4 | Pipeline Health | Data freshness, sport coverage | Surface issues | Health report triggers autopilot repair |
| 5 | Watch Plan | Event scores and windows | Rank picks | Explain reasoning, boost favorites |
| 6 | Code Health | Codebase analysis | Scout improvements | Autopilot PRs |
| 7 | Event Discovery | Flagged empty configs | Research via web | Populate with real schedules |
| 8 | Schedule Verification | 5-stage verifier chain | Score confidence | Feed accuracy hints back into discovery |
| 9 | Results Health | Recent results staleness | Detect gaps | Surface in health report |
| 10 | Fact Verification | LLM claim checking | Verify against source data | Flag inaccuracies |
| 11 | Preference Evolution | Engagement click data | Compute sport weights | Update user-context.json |

Measured by `autonomy-scorecard.js` — currently 100% (11/11 loops closed).

## The Dashboard

The product is a 480px reading-column sports dashboard with a Norwegian perspective, covering 7 sports:

| Sport | Data Source | Features |
|-------|------------|----------|
| Football | ESPN + fotball.no | Live scores, standings, results, team logos |
| Golf | ESPN + PGA Tour | Live leaderboard, tee times, featured groups, headshots |
| Tennis | ESPN | ATP/WTA schedules, Grand Slams |
| Formula 1 | ESPN Racing | Full calendar, driver standings |
| Chess | Curated + Lichess | Major tournaments, Norwegian focus |
| Esports | HLTV + Discovery | CS2 competitions |
| Olympics | Auto-discovered | Schedules researched via web search when active |

Key features:
- **AI editorial brief** — Claude generates themed summaries, featured sections, and watch picks every 2 hours
- **AI watch plan** — ranked "what to watch in the next 30/60/120 minutes" picks
- **Live scores** — client-side ESPN polling with pulsing LIVE dot
- **Day navigator** — browse past recaps and future previews
- **OLED-ready dark mode** — phone-width, minimal design

The dashboard is a generic block renderer — the intelligence lives in the build step. It adapts to whatever is happening (Olympics, World Cup, Champions League) without frontend changes.

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
npm test                 # Run all tests (1295 tests, vitest)
npm run build:events     # Generate events.json from sport files
npm run generate:featured # Generate featured.json (needs API key or Claude CLI)
npm run validate:data    # Check data integrity
npm run build:calendar   # Create .ics calendar export
```

### Required Secrets

| Secret | Used by | Purpose |
|--------|---------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Both workflows | Claude Max subscription for AI generation, discovery, and autopilot |
| `OPENAI_API_KEY` | Data pipeline | Event enrichment fallback |

Auth priority: Claude CLI (Max) > Anthropic API > OpenAI > template fallback.

### Adding a Sport or Event

To add a new **sport**: write a fetcher in `scripts/fetch/` that outputs `{ tournaments: [...] }`. It auto-flows into `events.json` — no registration needed.

To add a **curated event**: create a JSON config in `scripts/config/`. Or just create an empty config with `autoGenerated: true` — the discovery pipeline will research and populate it automatically.

## Acceleration Thesis

The system doesn't just improve the product — it improves at improving. Three forces create compounding returns:

1. **Better models over time** — model names live in code (not external config). When a better model ships, updating 5 references is a single PR. The system's reasoning, code generation, and editorial quality all improve.
2. **Accumulated knowledge** — each autopilot run deposits lessons in a persistent "Lessons & Effectiveness" section of the roadmap and evolves its own process strategy (`autopilot-strategy.json`). After 100 runs, the system knows which task types are fast, which ship modes save turns, and which approaches fail.
3. **Richer architecture** — each new feedback loop, pipeline step, or detection mechanism creates more surface area for autonomous improvement.

Early runs prioritize **velocity** (25 seeded tasks, sprint mode). As the system matures, it shifts toward **depth** (self-discovered features). Eventually: **refinement** (optimization, personalization fine-tuning).

## What's Next

The system is autonomous at 11/11 feedback loops, but gaps remain toward the full vision:

- **User feedback loop** — engagement tracking flows, but explicit thumbs-up/down on watch-plan picks would give a richer signal
- **Evolving favorites** — sport-level weights evolve, but favorite teams and players are still manually configured
- **End-to-end self-expansion** — the autopilot can now add pipeline steps via the manifest, but hasn't yet demonstrated creating a new sport fetcher from a self-discovered opportunity start to finish
- **Meta-learning** — the system accumulates knowledge and evolves its own process strategy (ship modes, turn budgets), but needs time to compound

The goal: a system that detects a new major event, creates the config, discovers the schedule, verifies accuracy, enriches the data, generates editorial content, and serves a personalized dashboard — all without human intervention.

## License

MIT License
