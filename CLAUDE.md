# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vision (v2)

Zenji (formerly SportSync) is a personal sports dashboard for a Norwegian sports fan. v2 (July 2026)
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
- `scripts/fetch/index.js` — ESPN fetchers (football, golf, tennis, F1, chess, cycling) + fotball.no + **Liquipedia CS2 matches** (`esports.js`: hourly `Liquipedia:Matches`, keeps focus-team (100 Thieves) matches at any tier; the `APIClient` sends `Accept-Encoding: gzip` + decompresses, which Liquipedia requires)
- `scripts/fetch-standings.js` → `standings.json` (PL table, golf leaderboards, F1)
- `scripts/fetch-rss.js` → `rss-digest.json` (11 feeds)
- `scripts/fetch-results.js` → `recent-results.json` (7-day history)
- `scripts/fetch-tvkampen.js` → `tv-listings.json` — Norwegian TV/streaming **ground truth** for football (tvkampen.com, today+2 days; lib: `scripts/lib/tvkampen-scraper.js`)
- `scripts/build-events.js` → `events.json` — **preserves `source: "ai-research"` events** from the previous build (dedupe key `sport|title|time`), publishes `tracked.json` to `docs/data/`
- `scripts/validate-events.js` — schema + AI-research contract (high confidence ⇒ 2+ evidence URLs; warns on near-term events missing streaming)
- `scripts/detect-coverage-gaps.js` → `coverage-gaps.json` — recall watch (mechanical, recall-biased; agents triage + cross-check the web). Three signals: **entity gaps** (tracked entity in RSS headlines with no upcoming event, or one only far out while the news says imminent — "i dag"/"denne helgen"), **sport gaps** (a followed sport is imminent in the news but absent from the board soon — the ESPN-blind-spot catcher, e.g. F1 weekends ESPN mis-dates to Friday), and **source anomalies** (a fetcher's own file is missing/empty/dropping events *and the board lacks that sport* — coverage-first, so AI-research-filled sports like chess/cycling don't false-flag)
- `scripts/aggregate-calibration.js` → `calibration.json` — mechanical per-source trust stats from `calibration-ledger.jsonl` (180-day window, reliability withheld under 5 checks)
- `scripts/build-ics.js` — calendar export
- Commits `docs/data/` directly to main, then — only when data changed — **auto-publishes** by calling `preview-deploy.yml` via `workflow_call`. (A `GITHUB_TOKEN` push can't *trigger* a workflow, so the pipeline invokes the deploy directly instead of relying on `preview-deploy`'s `push` trigger; no PAT needed. `preview-deploy` keeps `concurrency: pages-deploy`, which `workflow_call` honors, so a called deploy still serialises with merge-triggered ones — never two Pages deploys at once.)

### 2. Claude agents (Claude Code Max OAuth, scheduled)
Nine workflows run `anthropics/claude-code-action@v1` with a prompt file:

| Agent | Prompt | Model | Schedule | Job |
|---|---|---|---|---|
| **research** | `scripts/agents/research.md` | **tiered** — `standard` (default, every 4h) = `claude-opus-4-8`; `deep` = `claude-fable-5` → Opus 4.8 fallback. Deep runs on escalations (scout / coverage-critic pass `-f tier=deep`) and one weekly sweep (Mon 04:xx UTC). Fable 5 is ~2× Opus's price and reserved for the heavy runs; Opus is the workhorse | every 4h (+ escalations) | Find events static APIs miss (Norwegian sports, chess, cycling, winter sports) — fans out parallel scout subagents per in-season sport via the Task tool; append to `events.json` with `source/confidence/evidence`; rewrite `scripts/config/tracked.json`; write `research-log.json`. Prioritizes `coverage-audit.json` high-severity gaps |
| **verify** | `scripts/agents/verify.md` | `claude-opus-4-8` | daily 05:30 UTC | Verify AI-researched + near-term tentative-channel events in the next 7 days via web fetch; confirm/amend/remove; resolve tentative `NRK / TV 2` labels; write `verify-log.json` (Opus 4.8 — this is the correctness gate) |
| **editorial** | `scripts/agents/editorial.md` | `claude-opus-4-8` | 05:00 + 15:00 UTC | Generate `featured.json` (morning/evening brief) — narrative + structured blocks |
| **scout** | `scripts/agents/scout.md` | `claude-haiku-4-5` | hourly 05–21 UTC | The Watchtower: triage RSS + coverage gaps; escalate to research via `gh workflow run` (max 2/day); log to `scout-log.json` |
| **coverage-critic** | `scripts/agents/coverage-critic.md` | `claude-opus-4-8` | daily 04:00 UTC | Recall audit that **trusts no single source**: an imminent pass (is what's happening this weekend actually on the board? verify each in-season followed sport against the web — F1 especially) + a ~4-week horizon pass; corroborates high-severity gaps across ≥2 independent sources, weights by `calibration.json`, records upstream unreliability in `sourceIssues`; write `coverage-audit.json`; escalate high-severity gaps to research (max 1/day) |
| **visual-qa** | `scripts/agents/visual-qa.md` | `claude-sonnet-5` | daily 08:00 UTC | Vision QA: screenshot the dashboard at 375/393/900px, LOOK at the images, flag truncation/overflow/foreign-channel/calm-design issues; write `visual-qa-log.json` |
| **ui-fix** | `scripts/agents/ui-fix.md` | `claude-opus-4-8` | daily 09:00 UTC | Self-heal: read visual-qa findings, fix the frontend ON A BRANCH, re-screenshot to prove the fix + no regressions, `npm test`, open a PR. The workflow then **re-runs the tests as a hard gate and auto-merges + deploys** it (fully hands-off). Fix ships only if it verifies twice; a test failure leaves the PR open + fails loudly. Closes the visual-qa loop |
| **self-repair** | `scripts/agents/self-repair.md` | `claude-opus-4-8` | daily 06:30 UTC | The mechanic: detect real breakage (failed runs, failing tests, validation errors, broken fetchers), fix ON A BRANCH, prove it, open a PR. Workflow re-gates tests and **auto-merges + deploys** — EXCEPT the three protected paths below, which are left open for review. Ignores quota/transient failures |
| **improve** | `scripts/agents/improve.md` | `claude-opus-4-8` | weekly Mon 07:00 UTC | Evolution: mine the logs for ONE evidenced improvement (source/skill/prompt/threshold/fetcher tuning), open a PR. Workflow re-gates tests and **auto-merges** it (except protected paths). Biased toward sharpening what exists over adding machinery (the v1 lesson) |

### Autonomy model (what ships unattended)

The self-fixing loops (ui-fix, self-repair, improve) each fix on a branch, open a
PR, and the **workflow re-runs `npm test` as a hard gate and then auto-merges +
deploys** — fully hands-off. The ONLY exception is five **protected paths** that
are never auto-merged (a change touching them is left open, labelled
`needs-review`; enforced in one place, `scripts/merge-gate.js`):

- `.github/workflows/**` — the automation's own definitions and gates; auto-merging
  a broken change here could disable the test-gate or break the fixer itself.
- `.github/actions/**` — composite actions the workflows invoke.
- `scripts/hooks/**` — the safety hooks (interests protection, post-write validate).
- `scripts/config/interests.json` — user-owned; "AI never writes here" (also hook-enforced).
- `.claude/settings.json` — wires the safety hooks into the harness.

Everything else — fetchers, libs, agent prompts, skills, other config, docs, tests,
`package.json` — auto-merges once tests pass. Every auto-merge is a revertable
commit; a test failure leaves the PR open and fails the run loudly.

### Quota governor (self-throttling on real Max usage)

Claude Code Max quota is finite and shared with interactive use. Two mechanisms keep the agents from silently dying when it runs low:

- **Tiered model + deep-tier fallback** — the 4-hourly workhorse runs on `claude-opus-4-8` (`standard` tier): Opus is always available on this OAuth tier, so the action's exit status is trustworthy and there is **no commit-detection heuristic** — a quiet run that finds nothing new is a legitimate no-op, not a failure. The `deep` tier (escalations + weekly sweep) prefers `claude-fable-5`, detects if it produced no commit (unavailable / weekly-quota exhausted — Fable error-reports as job success), and re-runs on `claude-opus-4-8`. Quota exhaustion is handled by `usage-gate.js` (below), **not** by failing on no-commit — so the deep tier does not fail loudly on a quiet run either. (History: an earlier design tried Fable 5 on every run and failed loudly on no-commit; that produced a ~50% false-failure rate — a no-op was misread as quota death. Fable 5 is in fact available on this tier when weekly quota is not exhausted.)
- **`usage-monitor.yml`** (hourly, no prompt) — runs `scripts/check-usage.js`, which reads REAL account-wide quota. There is no supported quota API for a Max OAuth token, but a **minimal `/v1/messages` call with `CLAUDE_CODE_OAUTH_TOKEN` returns the `anthropic-ratelimit-unified-*` headers** (5h + 7d utilization, reset epochs, allowed/allowed_warning/rejected). It writes `usage-state.json` (green/amber/red + skipAll/skipNiceToHave), **appends the reading to `usage-history.jsonl`** (append-only, trimmed to ~100 days), and rolls that into **`usage-summary.json`** (latest + 24h trend + 7d/30d peak/avg week utilization + hours spent conserving). It then runs `scripts/update-readme-status.js`, which regenerates the **AI-budsjett block in `README.md`** (between `<!-- STATUS:START/END -->` markers) — budget/ops lives in the repo README, not on the calm dashboard. NB: the headers are **account-wide** (shared with interactive use) — this is total quota pressure, not per-agent attribution. The `improve` agent mines `usage-summary.json` (+ `gh run list` for per-agent frequency) to tune schedules/thresholds to the budget.
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
  relevant, not stuffed into prompts): `x-sources` (X/Twitter as an indirect source —
  account list + trust rules), `norwegian-rights` (NRK/TV2/Viaplay priors),
  `cs2-sources` (CS2 schedules + streaming — Liquipedia/HLTV/official-X ground truth
  for 100 Thieves / rain matches incl. smaller tournaments, Twitch/Kick viewing; the
  fetcher covers scheduled matches, research/verify cover the late/X-only ones), and
  `source-quirks` (**the qualitative learning loop**: structural failure modes of
  specific sources + how to compensate, e.g. ESPN mis-dating F1 weekends — read by
  research/verify/coverage-critic, appended by `verify` when a repeated, mechanistic
  quirk is confirmed. This is where a source's failure mode is learned *once* instead
  of rediscovered weekly; distinct from `calibration.json`, which is the quantitative
  "how much to trust" side). Agents update their own skills when they learn something
  durable; tests enforce frontmatter and that prompt references point at existing skills.

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
- `docs/js/shared-constants.js` — shared utilities (time windows, escaping, name matching), mirrors of the server helpers
- The editorial agent produces a single `headline` block shown as one quiet line under the date (a "nice extra"), nothing more. AI-research events carry a small ⓘ that opens a source modal on tap.

### Data files (docs/data/, gitignore-whitelisted)

`events.json`, `featured.json`, `standings.json`, `rss-digest.json`, `recent-results.json`,
`tracked.json` (published copy), `research-log.json`, `verify-log.json`, `meta.json`,
`coverage-gaps.json`, `coverage-audit.json` (coverage-critic), `visual-qa-log.json` (visual-qa),
`ui-fix-log.json` (ui-fix), `self-repair-log.json` (self-repair), `improve-log.json` (improve),
`usage-state.json` + `usage-history.jsonl` + `usage-summary.json` (quota governor: snapshot, append-only history, digest),
`scout-log.json`, `calibration.json` + `calibration-ledger.jsonl`, `tv-listings.json`,
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
- **Protected paths — never auto-merged** (self-fixing loops leave them as an open PR for review; enforced by `scripts/merge-gate.js`): `.github/workflows/**`, `.github/actions/**`, `scripts/hooks/**`, `scripts/config/interests.json`, `.claude/settings.json`. Everything else the loops touch auto-merges once tests pass (see Autonomy model).
- Run `npm test` before committing code changes; run `node scripts/validate-events.js` after writing events.
- Always `git pull --rebase` before pushing — the static pipeline and agents commit to main on schedules.

## Extending

**New sport**: write a fetcher in `scripts/fetch/` that outputs `{ tournaments: [...] }`
to `docs/data/{sport}.json` and register it in `scripts/fetch/index.js`.
`build-events.js` auto-discovers the file by convention.

**New tracked interest**: edit `scripts/config/interests.json` — the research agent
reconciles `tracked.json` against it on the next run.

**Sports without an API** (biathlon, cross-country, chess, most cycling): no code needed —
the research agent finds and maintains these events from the web.
