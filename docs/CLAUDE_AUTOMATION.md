# Claude Automation for SportSync

AI-assisted development using [claude-code-action](https://github.com/anthropics/claude-code-action) on GitHub Actions.

## Architecture

SportSync uses four Claude Code workflows that form a proactive improvement system:

| Workflow | Role | Trigger | Creates PRs? |
|----------|------|---------|-------------|
| **Autopilot** | Multi-agent autonomous improvement | Nightly 01:00 UTC | Yes |
| **Maintenance** | Read-only health check | Weekly Monday 06:00 UTC | No |
| **Interactive** | On-demand assistance | `@claude` mentions | Yes |
| **CI Fix** | Failure recovery | Data workflow fails | Yes |

## 1. Autopilot (`claude-autopilot.yml`) — Primary Workflow

The autopilot uses a **multi-agent architecture** to autonomously improve the codebase. The roadmap (`AUTOPILOT_ROADMAP.md`) is **self-curated** — the autopilot discovers its own tasks via creative scouting, not just executes human-written ones.

### Multi-Agent Architecture

The autopilot runs as a 2-job GitHub Actions workflow:

1. **Pre-flight** — shared setup, quota check, baseline tests
2. **Autopilot** — orchestrator agent with 4 specialized subagents

#### Subagents

Defined in `.claude/agents/` (auto-discovered by `claude-code-action`):

| Agent | Domain | Key Responsibilities |
|-------|--------|---------------------|
| **data-agent** | Data pipeline | API fetchers, configs, streaming, verification, coverage gaps |
| **content-agent** | AI content | Enrichment, featured content, watch plans, quality gates |
| **code-agent** | Code health | Tests, bug fixes, refactoring, pipeline infrastructure |
| **ux-agent** | Dashboard UX | HTML/CSS, visual design, component rendering, accessibility |

Each subagent has:
- **`model: sonnet`** — uses Sonnet for efficient task execution
- **`memory: project`** — persistent memory in `.claude/agent-memory/` that accumulates domain knowledge across runs
- **`maxTurns: 60`** — bounded execution per delegation
- **Focused tools** — only the tools relevant to their domain

#### Orchestrator

The orchestrator (`scripts/agents/orchestrator-prompt.md`) runs on Opus and:

1. **Assesses system state** — reads health-report.json, autonomy-report.json, pattern-report.json, autopilot-log.json
2. **Routes tasks** — uses `scripts/agents/task-router.js` to classify roadmap tasks by agent domain
3. **Delegates in parallel** — spawns subagents for independent tasks simultaneously
4. **Handles contention** — file ownership rules prevent conflicts (e.g., events.json is sequential: data builds, content enriches)
5. **Runs quality gates** — `npm test`, pipeline health, quality regression checks
6. **Meta-learning** — updates `autopilot-strategy.json` with per-agent performance metrics

#### File Ownership

| File | Owner (writes) | Readers |
|------|----------------|---------|
| `events.json` | Data Agent (build), Content Agent (enrich) | All |
| `user-context.json` | Orchestrator only | Data, Content |
| `scripts/config/*.json` | Data Agent only | Content |
| `AUTOPILOT_ROADMAP.md` | Orchestrator only | All |
| `autopilot-log.json` | Orchestrator only | All |

### How It Works

1. **Pre-flight**: Run tests, check quota, resolve config (model, maxTurns, allowedTools).
2. **Orchestrator startup**: Load orchestrator prompt, read system state.
3. **Task routing**: Classify pending tasks by agent domain.
4. **Parallel delegation**: Spawn subagents for independent tasks.
5. **Quality gates**: Run tests, pipeline health, quality regression after all work.
6. **Meta-learning**: Record lessons, evolve strategy, update roadmap.
7. **Commit and push**: All changes committed directly or via PR.

### The Roadmap

`AUTOPILOT_ROADMAP.md` is the prioritized task queue at the repo root. Tasks use these statuses:

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed with link to the PR
- `[BLOCKED]` reason — Cannot proceed

**Human control**: Reorder tasks to change what gets done next.

### Configuration

- **Schedule**: Nightly at 01:00 UTC + manual `workflow_dispatch`
- **Task override**: Manual runs accept a `task_override` input to execute a specific task
- **Domain focus**: Manual runs accept a `single_agent` input to focus on one domain
- **Timeout**: 120 minutes
- **Max turns**: 300
- **Branch prefix**: `claude/`
- **PR label**: `autopilot`

### Agent Infrastructure

- **Agent definitions**: `scripts/agents/agent-definitions.json` — all agent specs, responsibilities, owned files, contention rules
- **Task router**: `scripts/agents/task-router.js` — deterministic keyword/filepath scoring to classify tasks
- **Agent memory**: `.claude/agent-memory/` — persistent memory files auto-curated by Claude Code (200-line MEMORY.md per agent)
- **Strategy**: `scripts/autopilot-strategy.json` — process playbook with ship modes, turn budgets, per-agent performance data

## 2. Maintenance (`claude-maintenance.yml`) — Health Monitor

A read-only weekly health check. It does not modify files or create PRs. It creates GitHub issues when problems are found.

### Checks Performed

1. Run `npm test` — record pass/fail
2. Check data freshness (`meta.json`) — re-trigger pipeline if stale
3. Scan for merge conflict markers
4. Run `npm audit` for vulnerabilities
5. Scan for TODO/FIXME comments
6. Review open GitHub issues
7. Verify autopilot roadmap has PENDING tasks
8. Flag stale autopilot PRs (open > 3 days)

### Configuration

- **Schedule**: Monday 06:00 UTC + manual dispatch
- **Permissions**: Read-only for contents and PRs, write for issues and actions
- **Max turns**: 10

## 3. Interactive (`claude-interactive.yml`) — On-Demand

Responds to `@claude` mentions in PR/issue comments or when assigned to an issue. Handles code reviews, bug analysis, and small fixes in context.

- **Max turns**: 10

## 4. CI Fix (`claude-ci-fix.yml`) — Failure Recovery

Triggers when the "Update Sports Data" workflow fails. Reads failure logs, diagnoses the root cause, and attempts a bounded fix or files an issue.

- **Max turns**: 15

## How the Workflows Interrelate

```
Multi-Agent Autopilot (nightly)      Maintenance (weekly)
    │                                      │
    ├─ Orchestrator assesses state         ├─ Checks repo health
    ├─ Routes tasks to subagents           ├─ Flags stale data
    ├─ Subagents work in parallel          ├─ Verifies roadmap has tasks
    ├─ Quality gates + meta-learning       └─ Creates issues (no PRs)
    └─ 82+ PRs merged autonomously              │
                                                 ▼
Interactive (on mention)              CI Fix (on failure)
    │                                      │
    ├─ Reviews PRs                         ├─ Reads failure logs
    ├─ Answers questions                   ├─ Diagnoses issues
    └─ Small fixes                         └─ Attempts fix or files issue
```

The **autopilot** is the proactive engine with multi-agent parallelism. The **maintenance** workflow monitors health. **Interactive** and **CI fix** handle reactive needs.

### Self-Healing Pipeline Integration

The data pipeline (every 2 hours) generates monitoring artifacts that feed into the autopilot:

- **`health-report.json`** — sport coverage, data freshness, anomaly detection
- **`coverage-gaps.json`** — RSS vs events blind spot detection
- **`ai-quality.json`** — enrichment and featured content quality scores
- **`pattern-report.json`** — recurring issue detection with decay
- **`autonomy-report.json`** — 12/12 feedback loop scores

The autopilot reads these during nightly runs to prioritize repair tasks, create configs for coverage gaps, and evolve its own process strategy.

## Authentication

Uses a Claude Max subscription via OAuth token:

1. Run `claude setup-token` locally in the Claude Code CLI
2. Copy the generated token
3. Add it as a repository secret: `CLAUDE_CODE_OAUTH_TOKEN`

## Safety Model

### Change Limits (from CLAUDE.md)

| Tier | Files | Lines | Behavior |
|------|-------|-------|----------|
| `[MAINTENANCE]` | 8 | 300 | Single PR or direct-to-main, auto-merge |
| `[FEATURE]` | 12 | 500 | Single PR, auto-merge |
| `[EXPLORE]` | 0 | 0 | Read-only investigation |

- Protected paths never modified: `.github/workflows/**`, `package.json`, `.env*`
- All branches prefixed with `claude/`
- Tests must pass before and after every change

### Risk Classification

| Risk | Action | Example |
|------|--------|---------|
| LOW | Auto-PR or direct-to-main | Typo fix, test addition, config tweak |
| MEDIUM | PR + review request | Logic change, new pipeline step |
| HIGH | Skip (issue only) | Workflow change, auth change |

### Testing

Every automated change runs `npm test` (1882 tests) before committing. Failed tests = changes reverted or repaired before shipping.

## Setup Checklist

- [ ] Run `claude setup-token` and copy the OAuth token
- [ ] Add `CLAUDE_CODE_OAUTH_TOKEN` as a GitHub repository secret
- [ ] Verify `AUTOPILOT_ROADMAP.md` exists with PENDING tasks
- [ ] Verify workflows appear in the Actions tab
- [ ] Verify `.claude/agents/` subagent files exist (data, content, code, ux)
