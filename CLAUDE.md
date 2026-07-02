# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vision (v2)

SportSync is a personal sports dashboard for a Norwegian sports fan. v2 (July 2026)
replaced the v1 "self-improving autonomy" architecture (13 feedback loops, multi-agent
autopilot, pipeline manifest) with a **lean, reliable design** built on one idea:

> **Dynamic AI research is the core value.** Trust modern Claude models to do real
> research on a schedule, instead of maintaining layered feedback-loop machinery.

Four priorities, in order:
1. **Correct, complete data** — especially events that static APIs miss
2. **Dynamic AI research** — scheduled agents with web search find and verify events
3. **Modern dashboard** — card-based, up to 1280px, OLED-dark, PWA
4. **Transparent tracking** — AI decides what to track and writes human-readable
   `tracked.json` with a defensible `reason` per entry

### Zero infrastructure constraint (unchanged from v1)

Everything runs on **GitHub Actions + Claude Code Max (`CLAUDE_CODE_OAUTH_TOKEN`) +
GitHub Pages**. No servers, no databases, no paid APIs.

### Portability principle

Vendor lock-in is confined to **one layer**: the agent workflow files
(`.github/workflows/*-agent.yml`, using `anthropics/claude-code-action@v1`).
Prompts (`scripts/agents/*.md`) are capability-described (read files, search the web,
write JSON) with no vendor-specific syntax. Swapping AI provider = replacing the
workflow files only.

## Architecture

Two kinds of scheduled work:

### 1. Static pipeline (no AI, free, ~3 min)
`.github/workflows/static-pipeline.yml` — hourly 05–21 UTC:
- `scripts/fetch/index.js` — ESPN fetchers (football, golf, tennis, F1, chess, esports, cycling) + fotball.no
- `scripts/fetch-standings.js` → `standings.json` (PL table, golf leaderboards, F1)
- `scripts/fetch-rss.js` → `rss-digest.json` (11 feeds)
- `scripts/fetch-results.js` → `recent-results.json` (7-day history)
- `scripts/build-events.js` → `events.json` — **preserves `source: "ai-research"` events** from the previous build (dedupe key `sport|title|time`), publishes `tracked.json` to `docs/data/`
- `scripts/validate-events.js` — schema + AI-research contract (high confidence ⇒ 2+ evidence URLs)
- `scripts/build-ics.js` — calendar export
- Commits `docs/data/` directly to main

### 2. Claude agents (Claude Code Max OAuth, scheduled)
Three workflows run `anthropics/claude-code-action@v1` with a prompt file:

| Agent | Prompt | Schedule | Job |
|---|---|---|---|
| **research** | `scripts/agents/research.md` | every 4h | Find events static APIs miss (Norwegian sports, chess, cycling, winter sports); append to `events.json` with `source/confidence/evidence`; rewrite `scripts/config/tracked.json`; write `research-log.json` |
| **verify** | `scripts/agents/verify.md` | daily 05:30 UTC | Verify AI-researched events in the next 7 days via web fetch; confirm/amend/remove; write `verify-log.json` |
| **editorial** | `scripts/agents/editorial.md` | 05:00 + 15:00 UTC | Generate `featured.json` (morning/evening brief) — narrative + structured blocks |

### Config model

- **`scripts/config/interests.json`** — user source of truth. **The human edits this; AI never writes here.**
- **`scripts/config/tracked.json`** — AI-managed, transparent. Every entry has `reason`, `addedAt`, `addedBy`, `evidence`, optional `expires`. Rewritten by the research agent, seeded manually at v2 launch.
- `scripts/config/sports-config.js` + `norwegian-golfers.json` — static fetcher infrastructure (not curated event data).

### Frontend

Pure static HTML/CSS/JS on GitHub Pages (PWA). No build step.

- `docs/index.html` — shell: header, live hero strip, editorial brief, sport card grid, "Hva vi følger" (tracked viewer), footer
- `docs/css/` — `base.css` (tokens: OLED black default, light via prefers-color-scheme; accent `#ff6b35`; max-width 1280px), `layout.css` (grid: 1 col → 2 col ≥768px → 3 col ≥1200px), `cards.css`
- `docs/js/dashboard.js` (~550 lines) — data load, live hero, brief block dispatch, sport card grid, tracked surface, ESPN live polling (60s), theme toggle, AI-provenance modal
- `docs/js/block-renderers.js` — structured editorial blocks (`match-result`, `match-preview`, `event-schedule`, `golf-status`) resolved against pre-loaded data; `_fallbackText` for graceful degradation
- `docs/js/shared-constants.js`, `sport-config.js`, `asset-maps.js` — utilities, sport metadata, logo/headshot maps
- **AI badge**: events with `source: "ai-research"` show an "AI" pill; click opens a modal with `evidence` URLs, confidence, and verification status

### Data files (docs/data/, gitignore-whitelisted)

`events.json`, `featured.json`, `standings.json`, `rss-digest.json`, `recent-results.json`,
`tracked.json` (published copy), `research-log.json`, `verify-log.json`, `meta.json`,
per-sport source files (`football.json` …), `events.ics`.

## Development commands

- `npm run dev` — local server on port 8000
- `npm run build` — fetch data + build events + calendar
- `npm run build:events` / `npm run validate:data` / `npm run build:calendar`
- `npm run fetch:results`
- `npm test` — vitest, ~16 focused files, <5s
- `npm run screenshot` — Playwright dashboard screenshot (`node scripts/screenshot.js out.png --width=1280 --full-page`)

## Conventions

- **Event time filtering**: always use `isEventInWindow(event, start, end)` (`scripts/lib/helpers.js` server-side, `shared-constants.js` client-side). Never write manual `new Date(e.time) >= start` filters — they drop multi-day events (golf, stage races).
- **AI-research event schema**: `source: "ai-research"`, `confidence: high|medium|low`, `evidence: [urls]`, `researchedAt`; verify agent adds `verifiedAt`, `verificationStatus`, `verificationSources`. `confidence: "high"` requires 2+ evidence URLs (enforced by `validate-events.js`).
- **build-events must never erase AI-research events** — it partitions by `source` and re-attaches non-duplicates.
- Norwegian-language UI strings; proper nouns stay in original language.
- Tabs for indentation in `scripts/`; escape all user/data strings with `escapeHtml` in client rendering.

## Testing

`tests/` — 16 files, all fast and network-free:
- Pipeline: `build-events`, `build-events-schema`, `validate-events`, `build-ics`, `integration-pipeline` (spawn scripts against temp `SPORTSYNC_DATA_DIR`/`SPORTSYNC_CONFIG_DIR`)
- Libs: `helpers`, `event-normalizer`, `response-validator`, `llm-client` (mocked fetch), `fetch-results` (pure functions)
- Client: `block-renderers`, `dashboard-cards` — loaded via `tests/helpers/load-client.js` (vm sandbox, no jsdom)
- Coherence: `agent-prompts` (prompt contracts match client renderers), `workflows` (YAML references existing files), `interests-schema`, `tracked-schema`

Coherence tests are the v2 replacement for v1's feedback loops: if a prompt, workflow,
or schema drifts from the code, CI fails.

## Rules for automated/agent changes

- **Never modify `scripts/config/interests.json`** — it is user-owned.
- Agents commit only their contracted outputs (see each prompt's output contract).
- `.github/workflows/**` and `package.json` are protected paths for scheduled agents (manual sessions may edit them).
- Run `npm test` before committing code changes; run `node scripts/validate-events.js` after writing events.
- Always `git pull --rebase` before pushing — the static pipeline and agents commit to main on schedules.

## Extending

**New sport**: write a fetcher in `scripts/fetch/` that outputs `{ tournaments: [...] }`
to `docs/data/{sport}.json`, register in `scripts/fetch/index.js`, add sport metadata to
`docs/js/sport-config.js`. `build-events.js` auto-discovers the file by convention.

**New tracked interest**: edit `scripts/config/interests.json` — the research agent
reconciles `tracked.json` against it on the next run.

**Sports without an API** (biathlon, cross-country, chess, most cycling): no code needed —
the research agent finds and maintains these events from the web.
