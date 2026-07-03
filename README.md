# SportSync

> A personal sports dashboard for a Norwegian sports fan — where **scheduled AI research
> agents** find, verify, and editorialize the events that static APIs miss.

[![Static pipeline](https://github.com/CHaerem/SportSync/workflows/Static%20data%20pipeline/badge.svg)](https://github.com/CHaerem/SportSync/actions)
[![Live Site](https://img.shields.io/badge/Live-Dashboard-blue)](https://chaerem.github.io/SportSync/)

**See it live**: [chaerem.github.io/SportSync](https://chaerem.github.io/SportSync/)

## The idea

Sports APIs cover the big leagues. They miss most of what a Norwegian fan cares about:
biathlon world cups, Norway Chess, cross-country skiing, cycling stage races, Norwegian
Cup football, last-minute schedule changes. v1 of this project tried to close that gap
with an elaborate self-improving autonomy architecture (13 feedback loops, a nightly
multi-agent autopilot, 2000+ tests). It proved the concept — and produced stagnating
quality at high complexity.

**v2 bets on the model instead of the machinery**: three scheduled Claude agents with
web search do real research, write transparent JSON, and explain their reasoning.

## Architecture

Everything runs on **GitHub Actions + Claude Code Max + GitHub Pages**. No servers,
no databases, no paid APIs.

```
┌────────────────────────────────────────────────────────────┐
│ STATIC PIPELINE (hourly, no AI, ~3 min)                    │
│ ESPN + fotball.no fetchers → standings, RSS, results       │
│ → build-events.js → events.json (+ preserves AI events)    │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ RESEARCH AGENT (every 4h, Claude + web search)             │
│ Reads interests.json → finds events APIs miss →            │
│ appends to events.json with confidence + evidence URLs →   │
│ rewrites tracked.json with a reason per entry              │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ VERIFY AGENT (daily)                                       │
│ Re-checks AI-researched events against the web →           │
│ confirms / amends / removes                                │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ EDITORIAL AGENT (07:00 + 17:00 Oslo)                       │
│ Writes the morning/evening brief: narrative + structured   │
│ blocks the client resolves against live data               │
└────────────────────────────────────────────────────────────┘
```

### Transparent tracking

- **`scripts/config/interests.json`** — the human's source of truth. AI never touches it.
- **`scripts/config/tracked.json`** — what the AI currently tracks. Every entry carries
  `reason`, `addedBy`, `evidence`, and an optional `expires` — inspectable on the
  dashboard under *"Hva vi følger"*.
- Every AI-researched event carries `confidence` (high requires 2+ source URLs) and an
  **AI badge** in the UI that opens the evidence.

### Portability

Vendor lock-in is confined to the three agent workflow files
(`anthropics/claude-code-action@v1`). The prompts in `scripts/agents/*.md` are
capability-described — swap the AI provider by replacing workflow YAML only.

## Frontend

Static PWA, no build step. Card-based layout up to 1280px (1→2→3 columns), OLED-dark
default with light mode, live ESPN score polling (60s), editorial brief on top,
installable on iOS/Android.

## Development

```bash
npm ci
npm run build      # fetch data + build events + calendar
npm run dev        # localhost:8000
npm test           # 16 focused test files, <5s
npm run screenshot # Playwright visual check
```

See [CLAUDE.md](CLAUDE.md) for the full architecture reference.

## License

MIT License
