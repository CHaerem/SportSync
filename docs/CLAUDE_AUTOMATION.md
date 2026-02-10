# Claude Automation for SportSync

AI-assisted development using [claude-code-action](https://github.com/anthropics/claude-code-action) on GitHub Actions.

## Architecture

SportSync uses four Claude Code workflows that form a proactive improvement system:

| Workflow | Role | Trigger | Creates PRs? |
|----------|------|---------|-------------|
| **Autopilot** | Proactive improvement | Nightly 03:00 UTC | Yes |
| **Maintenance** | Read-only health check | Weekly Monday 06:00 UTC | No |
| **Interactive** | On-demand assistance | `@claude` mentions | Yes |
| **CI Fix** | Failure recovery | Data workflow fails | Yes |

## 1. Autopilot (`claude-autopilot.yml`) — Primary Workflow

The autopilot is the main driver of continuous improvement. It reads a prioritized roadmap, picks a task, executes it, and opens a PR — one task per run, one open PR at a time.

### How It Works

1. **Check**: Are there any open `autopilot`-labeled PRs? If yes, skip this run.
2. **Pick**: Read `AUTOPILOT_ROADMAP.md`, find the first `[PENDING]` task.
3. **Validate**: Confirm the task fits automation constraints (8 files, 300 lines, allowed paths).
4. **Execute**: Create branch `claude/improve-*`, make changes, run `npm test`.
5. **Ship**: Open a PR with label `autopilot`, mark the task `[DONE]` in the roadmap.
6. **Scout**: Scan for new improvement opportunities and append them as `[PENDING]`.

### The Roadmap

`AUTOPILOT_ROADMAP.md` is the prioritized task queue at the repo root. Tasks use these statuses:

- `[PENDING]` — Ready to be picked up
- `[DONE]` (PR #N) — Completed with link to the PR
- `[BLOCKED]` reason — Cannot proceed

**Human control**: Reorder tasks to change what gets done next. The autopilot always picks the first `[PENDING]` task it finds.

**Experience-first lane**: Keep an `EXPERIENCE Lane` section near the top of `AUTOPILOT_ROADMAP.md` with user-facing tasks and KPIs (engagement, recommendation quality, enrichment coverage). This ensures autonomous work improves the product experience, not only internal code quality.

### Configuration

- **Schedule**: Nightly at 03:00 UTC + manual `workflow_dispatch`
- **Task override**: Manual runs accept a `task_override` input to execute a specific task
- **Timeout**: 20 minutes
- **Max turns**: 15
- **Branch prefix**: `claude/improve-`
- **PR label**: `autopilot`

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
Autopilot (nightly)          Maintenance (weekly)
    │                              │
    ├─ Picks task from roadmap     ├─ Checks repo health
    ├─ Makes changes               ├─ Flags stale data
    ├─ Opens PR                    ├─ Verifies roadmap has tasks
    └─ Scouts new tasks            └─ Creates issues (no PRs)
                                        │
                                        ▼
Interactive (on mention)       CI Fix (on failure)
    │                              │
    ├─ Reviews PRs                 ├─ Reads failure logs
    ├─ Answers questions           ├─ Diagnoses issues
    └─ Small fixes                 └─ Attempts fix or files issue
```

The **autopilot** is the proactive engine. The **maintenance** workflow monitors health and keeps the roadmap relevant. **Interactive** and **CI fix** handle reactive needs.

## Authentication

Uses a Claude Max subscription via OAuth token:

1. Run `claude setup-token` locally in the Claude Code CLI
2. Copy the generated token
3. Add it as a repository secret: `CLAUDE_CODE_OAUTH_TOKEN`

## Safety Model

### Change Limits (from CLAUDE.md)

- Max 8 files per PR
- Max 300 lines changed per PR
- Protected paths are never modified (workflows, package.json, .env, etc.)
- All branches prefixed with `claude/`

### One-PR-at-a-Time Rule

The autopilot checks for open `autopilot`-labeled PRs before starting. If one exists, the run is skipped entirely. This prevents pile-up and ensures human review happens before more changes land.

### Risk Classification

| Risk | Action | Example |
|------|--------|---------|
| LOW | Auto-PR | Typo fix, test addition |
| MEDIUM | PR + review request | Logic change, config update |
| HIGH | Skip (issue only) | Workflow change, auth change |

### Testing

Every automated change runs `npm test` before committing. Failed tests = reverted changes + issue filed.

## Setup Checklist

- [ ] Run `claude setup-token` and copy the OAuth token
- [ ] Add `CLAUDE_CODE_OAUTH_TOKEN` as a GitHub repository secret
- [ ] Verify `AUTOPILOT_ROADMAP.md` exists with PENDING tasks
- [ ] Verify all four workflows appear in the Actions tab after merge
- [ ] Optionally create a `claude` GitHub user for assignee triggers
