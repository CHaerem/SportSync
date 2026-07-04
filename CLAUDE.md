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
3. **Calm dashboard** — one quiet single-column agenda (max 640px), near-black dark default, PWA
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
- `scripts/fetch-tvkampen.js` → `tv-listings.json` — Norwegian TV/streaming **ground truth** for football (tvkampen.com, today+2 days; lib: `scripts/lib/tvkampen-scraper.js`)
- `scripts/build-events.js` → `events.json` — **preserves `source: "ai-research"` events** from the previous build (dedupe key `sport|title|time`), publishes `tracked.json` to `docs/data/`
- `scripts/validate-events.js` — schema + AI-research contract (high confidence ⇒ 2+ evidence URLs; warns on near-term events missing streaming)
- `scripts/detect-coverage-gaps.js` → `coverage-gaps.json` — recall watch: tracked entities in RSS headlines with no upcoming event (mechanical, recall-biased; research agent triages)
- `scripts/aggregate-calibration.js` → `calibration.json` — mechanical per-source trust stats from `calibration-ledger.jsonl` (180-day window, reliability withheld under 5 checks)
- `scripts/build-ics.js` — calendar export
- Commits `docs/data/` directly to main, then — only when data changed — **auto-publishes** by calling `preview-deploy.yml` via `workflow_call`. (A `GITHUB_TOKEN` push can't *trigger* a workflow, so the pipeline invokes the deploy directly instead of relying on `preview-deploy`'s `push` trigger; no PAT needed. `preview-deploy` keeps `concurrency: pages-deploy`, which `workflow_call` honors, so a called deploy still serialises with merge-triggered ones — never two Pages deploys at once.)

### 2. Claude agents (Claude Code Max OAuth, scheduled)
Seven workflows run `anthropics/claude-code-action@v1` with a prompt file:

| Agent | Prompt | Model | Schedule | Job |
|---|---|---|---|---|
| **research** | `scripts/agents/research.md` | `claude-fable-5` → **auto-fallback** `claude-opus-4-8` (workflow tries Fable 5; if it produced no commit — quota/unavailable — it re-runs on Opus 4.8, and fails loudly only if BOTH produce nothing) | every 4h | Find events static APIs miss (Norwegian sports, chess, cycling, winter sports) — fans out parallel scout subagents per in-season sport via the Task tool; append to `events.json` with `source/confidence/evidence`; rewrite `scripts/config/tracked.json`; write `research-log.json`. Prioritizes `coverage-audit.json` high-severity gaps |
| **verify** | `scripts/agents/verify.md` | `claude-opus-4-8` | daily 05:30 UTC | Verify AI-researched + near-term tentative-channel events in the next 7 days via web fetch; confirm/amend/remove; resolve tentative `NRK / TV 2` labels; write `verify-log.json` (Opus 4.8 — this is the correctness gate) |
| **editorial** | `scripts/agents/editorial.md` | `claude-opus-4-8` | 05:00 + 15:00 UTC | Generate `featured.json` (morning/evening brief) — narrative + structured blocks |
| **scout** | `scripts/agents/scout.md` | `claude-haiku-4-5` | hourly 05–21 UTC | The Watchtower: triage RSS + coverage gaps; escalate to research via `gh workflow run` (max 2/day); log to `scout-log.json` |
| **coverage-critic** | `scripts/agents/coverage-critic.md` | `claude-opus-4-8` | daily 04:00 UTC | Recall audit: reason adversarially about important events we're MISSING over a ~4-week horizon; write `coverage-audit.json`; escalate high-severity gaps to research (max 1/day) |
| **visual-qa** | `scripts/agents/visual-qa.md` | `claude-sonnet-5` | daily 08:00 UTC | Vision QA: screenshot the dashboard at 375/393/900px, LOOK at the images, flag truncation/overflow/foreign-channel/calm-design issues; write `visual-qa-log.json` |
| **ui-fix** | `scripts/agents/ui-fix.md` | `claude-opus-4-8` | daily 09:00 UTC | Self-heal: read visual-qa findings, fix the frontend ON A BRANCH, re-screenshot to prove the fix + no regressions, `npm test`, open a PR. The workflow then **re-runs the tests as a hard gate and auto-merges + deploys** it (fully hands-off). Fix ships only if it verifies twice; a test failure leaves the PR open + fails loudly. Closes the visual-qa loop |

### Quota governor (self-throttling on real Max usage)

Claude Code Max quota is finite and shared with interactive use. Two mechanisms keep the agents from silently dying when it runs low:

- **Model fallback** — `research-agent.yml` tries `claude-fable-5`, detects if it produced no commit (quota/unavailable), and re-runs on `claude-opus-4-8`; fails loudly only if both do nothing. (Fable 5 errors instantly on this OAuth tier, so this is load-bearing.)
- **`usage-monitor.yml`** (hourly, no prompt) — runs `scripts/check-usage.js`, which reads REAL account-wide quota. There is no supported quota API for a Max OAuth token, but a **minimal `/v1/messages` call with `CLAUDE_CODE_OAUTH_TOKEN` returns the `anthropic-ratelimit-unified-*` headers** (5h + 7d utilization, reset epochs, allowed/allowed_warning/rejected). It writes `usage-state.json` (green/amber/red + skipAll/skipNiceToHave).
- **Gate** — every agent runs `scripts/usage-gate.js <critical|optional>` as a pre-flight step and only proceeds `if: steps.usage.outputs.run == 'true'`. `critical` (research, verify, scout) skip only when `skipAll` (session near-exhausted / rejected); `optional` (editorial, coverage-critic, visual-qa) also skip when amber/red. **Fail-open**: missing/stale (>3h)/unparsed state ⇒ run. The dashboard shows a quiet "AI-budsjett" line from `usage-state.json`.

### Coverage & correctness loops (the core mission)

The product's primary goal is **correct when/where info and complete coverage**
(see interests.json owner priorities). Four loops enforce it:

1. **Streaming contract** — every AI-research event must carry Norwegian viewing
   options in `streaming` (or explicitly empty + noted). Priors live in the
   `norwegian-rights` skill; football ground truth in `tv-listings.json`.
2. **Write-time fact-check** — research spawns a fresh-context subagent that
   independently verifies time+streaming on candidate events *before* they are
   written; unverifiable events are demoted or dropped.
3. **Grader gate** — research runs end with an independent grader subagent
   scoring against `scripts/agents/rubrics/research-rubric.md` (one bounded
   revision pass, fail-open, result recorded in research-log `quality`).
4. **Calibration ledger** — verify appends one JSONL record per source check;
   `aggregate-calibration.js` turns them into per-source trust stats that steer
   the research agent's source choices.

### Harness-enforced contracts (hooks + skills)

- `.claude/settings.json` wires two hooks (shared by CI agents and local sessions):
  - **PreToolUse** `scripts/hooks/protect-interests.js` — blocks any Write/Edit/Bash
    mutation of `scripts/config/interests.json` (user-owned; enforcement, not convention)
  - **PostToolUse** `scripts/hooks/validate-after-write.js` — runs `validate-events.js`
    after every write to `docs/data/events.json` and feeds failures back to the agent
- `.claude/skills/` holds agent playbooks with progressive disclosure (loaded when
  relevant, not stuffed into prompts). First skill: `x-sources` (X/Twitter as an
  indirect source — account list + trust rules). Agents update their own skills
  when they learn something durable; tests enforce frontmatter and that prompt
  references point at existing skills.

### Config model

- **`scripts/config/interests.json`** — user source of truth. **The human edits this; AI never writes here.**
- **`scripts/config/tracked.json`** — AI-managed, transparent. Every entry has `reason`, `addedAt`, `addedBy`, `evidence`, optional `expires`. Rewritten by the research agent, seeded manually at v2 launch.
- `scripts/config/sports-config.js` + `norwegian-golfers.json` — static fetcher infrastructure (not curated event data).

### Frontend

Pure static HTML/CSS/JS on GitHub Pages (PWA). No build step. **Calm design** —
the whole page is one quiet, scannable overview of the events you follow;
no dashboard grid, no competing panels.

- `docs/index.html` — shell: header (wordmark · date · theme toggle), one quiet editorial headline line, live-now line (conditional), the agenda, "Hva vi følger" disclosure, footer
- `docs/css/` — `base.css` (calm tokens: near-black dark default, warm-paper light via prefers-color-scheme; one restrained accent; single typeface Schibsted Grotesk with tabular numerals; max-width 640px), `layout.css` (single centered column, all breakpoints), `cards.css` (agenda rows, day groups)
- `docs/js/dashboard.js` (~250 lines) — data load, one day-grouped agenda (`renderAgenda`/`eventRow`), `whereToWatch` channel helper, quiet live-now line, ESPN live polling (60s), theme toggle, AI-provenance modal (hidden until tapped)
- Each event row answers only: **when · what · where to watch**. Must-see (favorite / importance≥4 / Norwegian) gets a small accent dot — the gentlest possible emphasis, never a card. Channel shown quietly, with an honest faint "–" when unknown.
- `docs/js/shared-constants.js`, `sport-config.js`, `asset-maps.js` — utilities, sport metadata, logo/headshot maps
- The editorial agent produces a single `headline` block shown as one quiet line under the date (a "nice extra"), nothing more. AI-research events carry a small ⓘ that opens a source modal on tap.

### Data files (docs/data/, gitignore-whitelisted)

`events.json`, `featured.json`, `standings.json`, `rss-digest.json`, `recent-results.json`,
`tracked.json` (published copy), `research-log.json`, `verify-log.json`, `meta.json`,
`coverage-gaps.json`, `coverage-audit.json` (coverage-critic), `visual-qa-log.json` (visual-qa),
`ui-fix-log.json` (ui-fix), `usage-state.json` (quota governor), `scout-log.json`, `calibration.json`, `tv-listings.json`,
per-sport source files (`football.json` …), `events.ics`.

New data files must be whitelisted in `.gitignore` (which ignores `docs/data/*.json`
by default) or the agents' `git add` silently skips them.

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
- Client: `dashboard-cards` — loaded via `tests/helpers/load-client.js` (vm sandbox, no jsdom)
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
