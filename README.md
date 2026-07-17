# Sportivista

> A **calm, personal overview** of the sport, esport and tournaments you follow — one
> quiet place that answers *what's on · when · where to watch · what's live now* — where
> **scheduled AI research agents** find and **verify** the events static APIs miss.

[![Static pipeline](https://github.com/CHaerem/sportivista/workflows/Static%20data%20pipeline/badge.svg)](https://github.com/CHaerem/sportivista/actions)
[![Live Site](https://img.shields.io/badge/Live-Dashboard-blue)](https://sportivista.com/)

**See it live**: [sportivista.com](https://sportivista.com/)

<!-- STATUS:START -->
## AI-budsjett

Kvoten er **konto-bred** (delt med interaktiv Claude-bruk) — samlet kvote-trykk, ikke per-agent.

| Vindu | Brukt | Detaljer |
|---|---|---|
| Uke (7d) | **52%** 🟢 | ↑ +29pp siste 24t · nullstilles 2026-07-22 |
| Sesjon (5t) | 31% | nullstilles 23:30 UTC |
| Siste 7 dager | topp 100% · snitt 40% | 12t i sparemodus |

<sub>Oppdatert 2026-07-17 22:08 UTC av `usage-monitor` · kilde: `docs/data/usage-summary.json` · [Self-throttling on quota](#self-throttling-on-quota)</sub>
<!-- STATUS:END -->

## What it is

One calm place that gathers everything you follow — sport, esport, tournaments — and
answers only what matters: **what's on, when, where to watch, and what's live now.**
No noisy feed competing for your attention; one quiet, scannable overview.

The core promise is **trust**: times and where-to-watch are meant to be *correct and
dependable*, and the app should never miss what matters to you. That's why AI research
runs actively — searching broad static and live sources, finding events ordinary APIs
miss, and **verifying** when and where before anything reaches you.

You describe your interests in plain language — *"Cycling in summer, especially the
Tour de France, focused on the Norwegian riders and Uno-X"* — and an in-app assistant
lets you ask questions and reshape the overview anytime. What you follow lives on your
own device, never on a server.

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
changes (test-gated), stopping short only at five protected paths (workflows,
composite actions, hooks, hook wiring, your interests file). Every loop is narrow
and test-gated — the deliberate opposite of v1's sprawling autopilot.

## Architecture

Everything runs on **GitHub Actions + Claude Code Max + GitHub Pages**. No servers,
no databases, no paid APIs.

```mermaid
flowchart LR
    you(["👤 You<br/>interests.json"]):::human

    subgraph build["Build the board · scheduled"]
        direction TB
        pipe["Static pipeline · hourly<br/>ESPN, fotball.no, Liquipedia,<br/>tvkampen, RSS"]
        research["Research · every 4h<br/>finds what the APIs miss"]
        gaps["Scout + Coverage critic<br/>spot what's missing"]
        verify["Verify · daily<br/>correctness gate"]
    end

    board[("events.json<br/>the shared board")]:::store
    pages(["🖥️ Calm dashboard<br/>GitHub Pages"]):::out

    you --> research
    gaps -->|escalate| research
    pipe --> board
    research --> board
    verify -->|checks & amends| board
    board --> pages

    classDef human fill:#fff3bf,stroke:#f08c00,color:#111
    classDef store fill:#e7f5ff,stroke:#1c7ed6,color:#111
    classDef out fill:#ebfbee,stroke:#2f9e44,color:#111
```

**Reading it, left to right:** you own `interests.json`; the hourly static pipeline and
the every-4h research agent both write the shared board (`events.json`) — scout and the
coverage critic point research at what's missing, and verify corrects it — and the board
publishes to the calm dashboard. Two support systems aren't drawn here (they keep the
system healthy without touching this flow): the **self-maintenance loops** (visual-QA →
UI-fix, self-repair, improve) and the **quota governor** that gates every agent. All
eleven scheduled jobs, with their models, are in the table below.

### The scheduled jobs

| Job | When | Model | What it does |
|---|---|---|---|
| **Static pipeline** | hourly | — | Fetch ESPN · fotball.no · Liquipedia CS2 · tvkampen · RSS → `events.json`; auto-publish to Pages on change |
| **Research** | every 4h | Opus (deep runs: Fable 5) | Find events the APIs miss; append to `events.json`, rewrite `tracked.json` with a reason per entry |
| **Scout** | hourly | Haiku | Triage RSS + coverage gaps → escalate to research (max 2/day) |
| **Coverage critic** | daily | Opus | Audit what's missing — an imminent pass + a 4-week horizon, trusting no single source |
| **Verify** | daily | Opus | Re-check events against the web; log the calibration ledger + source-quirks |
| **Editorial** | 2×/day | Opus | Morning/evening brief → `featured.json` |
| **Visual QA** | daily | Sonnet | Screenshot the dashboard and *look* → flag truncation/overflow/calm-design |
| **UI-fix** | daily | Opus | Fix the frontend from QA findings → re-screenshot + test → auto-merge |
| **Self-repair** | daily | Opus | Fix broken runs/tests/fetchers → auto-merge |
| **Improve** | weekly | Opus | Mine the logs for one evidenced improvement → auto-merge |
| **Usage monitor** | hourly | — | Real account-wide quota gauge; gates every agent |

The self-fixing loops (UI-fix, self-repair, improve) auto-merge behind a re-run test
gate (one shared enforcement, `scripts/merge-gate.js`), stopping only at five
**protected paths** that always wait for review: `.github/workflows/**`,
`.github/actions/**`, `scripts/hooks/**`, `scripts/config/interests.json`, and
`.claude/settings.json`.

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
utilization + reset times) — writes `usage-state.json`, keeps an append-only
`usage-history.jsonl`, and rolls it into the trend shown in the **AI-budsjett**
block at the top of this README. Every agent gates on it: critical ones (research,
verify, scout) run unless the budget is nearly gone; nice-to-haves (editorial,
coverage-critic, visual-qa) step aside first when it runs low. Research runs on a
tiered model: the every-4h workhorse is Opus 4.8 (the `standard` tier), and only the
heavier `deep` runs — escalations and the weekly sweep — prefer Fable 5, auto-falling
back to Opus 4.8 if Fable is unavailable. The dashboard shows a quiet "AI-budsjett"
line too. Fail-open by design — the governor throttles only on fresh, confident quota
data.

### Transparent tracking

- **`scripts/config/interests.json`** — the human's source of truth. AI never touches it.
- **`scripts/config/tracked.json`** — what the AI currently tracks. Every entry carries
  `reason`, `addedBy`, `evidence`, and an optional `expires` — inspectable on the
  dashboard under *"Hva vi følger"*.
- Every AI-researched event carries `confidence` (high requires 2+ source URLs) and an
  **AI badge** in the UI that opens the evidence.

### Portability

Vendor lock-in is confined to the nine agent workflow files
(`.github/workflows/*-agent.yml`, using `anthropics/claude-code-action@v1`). The
prompts in `scripts/agents/*.md` are capability-described — swap the AI provider by
replacing workflow YAML only.

## Frontend

Static PWA, no build step. **Calm design** with a Tekst-TV (teletext) identity —
monospace type, amber as the single accent, a near-black page; no dashboard grid,
no competing panels, no logos or emoji. A single day-grouped agenda where every row
answers only **when · what · where to watch**, with always-Norwegian channels.
Must-see events (favorite / Norwegian / high importance) get
the gentlest possible accent; details (standings, results, AI sources) are a tap away,
never in your face. Near-black dark default with a warm-paper light mode that follows the
system theme, live ESPN score polling (60s), one quiet editorial headline on top, tuned
to fit iPhone widths, installable on iOS/Android.

## Development

```bash
npm ci
npm run build      # fetch data + build events + calendar
npm run dev        # localhost:8000
npm test           # 36 focused test files (~470 tests), a few seconds
npm run screenshot # Playwright visual check
```

See [CLAUDE.md](CLAUDE.md) for the full architecture reference.

## iOS app

`ios/` holds a native SwiftUI companion app (agenda + widget, on-device
Foundation Models assistant that edits your interests, answers questions and
runs app commands in Norwegian — all local, no accounts). It consumes the same
published data contract (`manifest.json`-driven sync) and is verified by its
own test suite (500+ unit tests, UI flows, and a versioned real-model eval
corpus). See [ios/README.md](ios/README.md).

## License

MIT License
