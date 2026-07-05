# SportSync

> A personal sports dashboard for a Norwegian sports fan — where **scheduled AI research
> agents** find, verify, and editorialize the events that static APIs miss.

[![Static pipeline](https://github.com/CHaerem/SportSync/workflows/Static%20data%20pipeline/badge.svg)](https://github.com/CHaerem/SportSync/actions)
[![Live Site](https://img.shields.io/badge/Live-Dashboard-blue)](https://chaerem.github.io/SportSync/)

**See it live**: [chaerem.github.io/SportSync](https://chaerem.github.io/SportSync/)

<!-- STATUS:START -->
## AI-budsjett

Kvoten er **konto-bred** (delt med interaktiv Claude-bruk) — samlet kvote-trykk, ikke per-agent.

| Vindu | Brukt | Detaljer |
|---|---|---|
| Uke (7d) | **67%** 🟢 | nullstilles 2026-07-08 |
| Sesjon (5t) | 20% | nullstilles 14:20 UTC |

<sub>Oppdatert 2026-07-05 12:50 UTC av `usage-monitor` · kilde: `docs/data/usage-summary.json` · [Self-throttling on quota](#self-throttling-on-quota)</sub>
<!-- STATUS:END -->

## The idea

Sports APIs cover the big leagues. They miss most of what a Norwegian fan cares about:
biathlon world cups, Norway Chess, cross-country skiing, cycling stage races, Norwegian
Cup football, last-minute schedule changes. v1 of this project tried to close that gap
with an elaborate self-improving autonomy architecture (13 feedback loops, a nightly
multi-agent autopilot, 2000+ tests). It proved the concept — and produced stagnating
quality at high complexity.

**v2 bets on the model instead of the machinery**: nine scheduled Claude agents —
research, verify, editorial, scout, a coverage critic, a vision-based visual QA, a
UI-fix agent that self-heals rendering bugs (fix → verify → auto-merge), a
self-repair "mechanic" that fixes its own broken code/tests, and a weekly improve
agent that evolves its own behavior — do real research, write transparent JSON,
and explain their reasoning. The self-fixing loops auto-merge their own verified
changes (test-gated), stopping short only at three protected paths (workflows,
hooks, your interests file). Every loop is narrow and test-gated — the deliberate
opposite of v1's sprawling autopilot.

## Architecture

Everything runs on **GitHub Actions + Claude Code Max + GitHub Pages**. No servers,
no databases, no paid APIs.

```
┌────────────────────────────────────────────────────────────┐
│ STATIC PIPELINE (hourly, no AI, ~3 min)                    │
│ ESPN + fotball.no fetchers → standings, RSS, results,      │
│ tvkampen TV listings → build-events.js → events.json       │
│ (+ preserves AI events, resolves Norwegian channels)       │
│ → auto-publishes to Pages on change (workflow_call)        │
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
│ confirms / amends / removes; logs a calibration ledger     │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ EDITORIAL AGENT (07:00 + 17:00 Oslo)                       │
│ Writes the morning/evening brief: one quiet headline       │
│ line the client resolves against live data                 │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ SCOUT AGENT (hourly, Claude Haiku) — the Watchtower        │
│ Triages RSS + coverage gaps → escalates to research        │
│ (max 2/day) when something important looks uncovered       │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ COVERAGE CRITIC (daily, Claude Opus) — recall audit        │
│ Reasons about important events we are MISSING over a       │
│ ~4-week horizon → coverage-audit.json → escalates gaps     │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ VISUAL QA (daily, Claude Sonnet) — vision review           │
│ Screenshots the dashboard at phone+desktop widths and      │
│ LOOKS at them → flags truncation/overflow/calm-design      │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ UI FIX (daily, Claude Opus) — self-heal loop               │
│ Reads visual-qa findings → fixes frontend on a branch →    │
│ re-screenshots + tests → PR → tests re-gate → auto-merge   │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ SELF-REPAIR (daily, Claude Opus) — the mechanic            │
│ Detects failed runs / broken tests / fetchers → fixes on   │
│ a branch → re-gates tests → auto-merges (except workflows/ │
│ hooks/interests, which wait for review)                    │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ IMPROVE (weekly, Claude Opus) — evolution                  │
│ Mines the logs for one evidenced improvement → PR →        │
│ tests re-gate → auto-merges (except protected paths)       │
└────────────────────────────────────────────────────────────┘
```

### Correct "where to watch"

Getting the time and channel right is the whole point. Every followed event
resolves to a **Norwegian** channel (never FOX/ESPN): football matches match
against real [tvkampen.com](https://www.tvkampen.com) TV listings, with a
deterministic Norwegian-rights map (`scripts/lib/norwegian-rights.js`) as the
fallback. When the exact broadcaster isn't yet known (e.g. a World Cup match days
out), the UI shows one honest tentative `NRK / TV 2` label rather than guessing.

### Self-throttling on quota

Claude Code Max quota is finite and shared with interactive use, so the agents
watch it. A `usage-monitor` reads real account-wide usage — a minimal
`/v1/messages` call returns the `anthropic-ratelimit-unified-*` headers (5h + 7d
utilization + reset times) — and writes `usage-state.json`. Every agent gates on
it: critical ones (research, verify) run unless the budget is nearly gone;
nice-to-haves (editorial, coverage-critic, visual-qa) step aside first when it
runs low. Research also prefers Fable 5 and auto-falls back to Opus 4.8 if Fable
is unavailable. The dashboard shows a quiet "AI-budsjett" line. Fail-open by
design — the governor throttles only on fresh, confident quota data.

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

Static PWA, no build step. **Calm design**: one quiet, scannable column (max 640px) —
no dashboard grid, no competing panels. A single day-grouped agenda where every row
answers only **when · what · where to watch**, with club crests / national flags and
always-Norwegian channels. Must-see events (favorite / Norwegian / high importance) get
the gentlest possible accent; details (standings, results, AI sources) are a tap away,
never in your face. Near-black dark default with a warm-paper light mode that follows the
system theme, live ESPN score polling (60s), one quiet editorial headline on top, tuned
to fit iPhone widths, installable on iOS/Android.

## Development

```bash
npm ci
npm run build      # fetch data + build events + calendar
npm run dev        # localhost:8000
npm test           # ~20 focused test files (~160 tests), <5s
npm run screenshot # Playwright visual check
```

See [CLAUDE.md](CLAUDE.md) for the full architecture reference.

## License

MIT License
