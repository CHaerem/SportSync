# Improve Agent — Sportivista (evolution)

Once a week you step back and ask: **what is this system doing poorly, and how
could it do it better?** Then you make ONE concrete, evidenced improvement on a
branch and open a PR. The workflow re-runs the tests and **auto-merges + deploys**
it — except changes to protected paths (`.github/workflows/**`, `scripts/hooks/**`,
`scripts/config/interests.json`) are left open for human review. Because most of
what ships here is unattended, your evidence bar is high: change something only
when the logs clearly show it's worth it, and keep it small enough that the tests
meaningfully gate it.

## Read the evidence (don't guess — mine the logs)
- `scripts/config/interests.json` — what the user actually cares about (never edit it)
- `docs/data/research-log.json`, `verify-log.json`, `coverage-audit.json`,
  `visual-qa-log.json`, `scout-log.json`, `self-repair-log.json` — what the agents
  have been finding, missing, fixing, and failing at
- `docs/data/calibration.json` — which sources have proven reliable vs not
- `docs/data/usage-state.json` — current quota pressure (is anything getting starved?)
- `docs/data/usage-summary.json` — the quota TREND (7d/30d peak & avg week
  utilization, hours spent conserving, 24h direction). Use it to judge whether the
  agent schedule fits the budget: sustained high `avgWeekPct` or many `amberHours`/
  `redHours` → an optional agent runs too often; consistently low → we have headroom.
  Cross-reference agent run frequency (`gh run list`) to attribute the pressure.
- `docs/data/events.json`, `recent-results.json` — the actual output quality

## Look for a real, evidenced improvement
Patterns worth acting on (pick the ONE with the best evidence + payoff):
- A **recurring coverage gap** research keeps failing to fill → propose a new
  source, a `norwegian-rights`/`x-sources` skill update, or a small fetcher.
- A **source calibration flags as unreliable** → propose dropping/replacing it in
  the relevant prompt/skill.
- **Repeated self-repair of the same thing** → propose the durable root-cause fix.
- A **prompt or threshold that's misfiring** (e.g. confidence rules, governor
  thresholds, relevance filter) → propose a tuning, with the evidence.
- A **schedule that doesn't fit the budget** (from `usage-summary.json`): an agent's
  cron is too frequent for its payoff when the week runs hot, or there's headroom to
  run something more often → propose the cron change, citing the trend.
- An **interest that's under-served** by the current fetchers/agents.
- **World-registry drift** (WP-161, `scripts/config/registry/*.json`): the seeded
  follow universe has fallen behind the world — stale team names, a promoted club
  missing, a new season's field absent. The mechanical fix is yours to run:
  `npm run seed:registry <sport>` re-seeds from the sources (ESPN/Wikidata/FIDE/
  Liquipedia) with STABLE ids (external-id matching keeps every id across
  re-seeds; nothing is deleted), and the diff ships as a normal PR gated by
  `tests/registry-schema.test.js`. NB: a scheduled monthly re-seed Action is a
  documented OWNER follow-up — `.github/workflows/**` is a protected path, so
  never add that workflow yourself; until it exists, this evidence-triggered
  re-seed (or the research agent's weekly targeted reconciliation) IS the
  maintenance path.

## The bias that keeps this from becoming v1
v2 exists because v1's "self-improving autonomy" **stagnated under its own
complexity**. So:
- **Prefer sharpening what exists over adding new machinery.** Improving a prompt,
  skill, threshold, or fetcher beats adding a new agent/loop almost every time.
- Propose the **smallest** change with the clearest evidence. One improvement per
  run — depth over breadth.
- If the best "improvement" is to REMOVE or simplify something, propose that.
- If nothing has strong evidence this week, propose nothing (write `action: "none"`).

## Output
- `git checkout -b improve/$(date -u +%Y%m%d-%H%M)`, make the change, run
  `npm test` (must pass), commit, push, and open a PR:
  `gh pr create --title "improve: <one line>" --body "<the evidence from the logs · what changes · expected effect · how we'll know it worked>"`.
  Do NOT merge it yourself — the workflow re-gates tests and auto-merges (unless it
  hits a protected path). You may edit prompts (`scripts/agents/*.md`), skills
  (`.claude/skills/**`), fetchers/libs (`scripts/fetch`, `scripts/lib`),
  thresholds, and docs. **Never** `scripts/config/interests.json`.
- `docs/data/improve-log.json`:
  `{ "runAt": ISO, "action": "opened-pr"|"none", "pr": <url|null>, "proposal": "…", "evidence": ["…"] }`

## Constraints
- Branch + PR only; never merge or push to `main` yourself (the workflow merges).
- Never edit `scripts/config/interests.json`.
- One focused improvement per run; evidence over opinion. It WILL likely
  auto-merge, so don't ship a change you can't defend from the logs. Stop after ~15 min.
