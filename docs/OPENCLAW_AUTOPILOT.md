# OpenClaw Autopilot Architecture

SportSync as a testbed for bounded autonomous coding with OpenClaw.

## Intent

SportSync is a well-structured static site with fetchers, tests, and a working
CI pipeline. It is an ideal candidate for exploring what a coding agent can
safely maintain on its own: fix flaky tests, patch stale data logic, improve
code quality, and keep docs current -- all without human hand-holding.

This document describes the single-session autopilot model that replaces the
earlier 8-doc draft architecture.

## Three-Phase Flow

Each autopilot run is **one OpenClaw session** executing three phases:

```
OBSERVE ──> PLAN ──> EXECUTE
   │           │         │
   │           │         └─ branch, patch, test, PR
   │           └─ pick ONE candidate, classify risk
   └─ run tests, check data, scan for improvements
```

The `observe` skill can also run standalone as a read-only health check.

## Safety Rules

| Rule               | Value                                              |
| ------------------ | -------------------------------------------------- |
| Protected paths    | `.github/workflows/**`, `package.json`, `.env*`    |
| Allowed paths      | `scripts/**`, `tests/**`, `docs/js/**`, `docs/*.md`|
| Max files changed  | 8                                                  |
| Max lines changed  | 300                                                |
| Branch prefix      | `autopilot/`                                       |
| Commit prefix      | `autopilot:`                                       |
| PR label           | `autopilot`                                        |

Full config: `.openclaw/autopilot-policy.json`

## Risk Classification

| Risk   | Action       | Examples                               |
| ------ | ------------ | -------------------------------------- |
| LOW    | Auto-PR      | Test fixes, dead code removal, docs    |
| MEDIUM | PR + review  | Frontend JS changes, script refactors  |
| HIGH   | Skip         | CI/CD, dependencies, generated data    |

## What Runs Where

| Concern            | Owner              | Trigger                    |
| ------------------ | ------------------ | -------------------------- |
| Data fetching      | GitHub Actions      | Every 6 hours (cron)      |
| Health observation | OpenClaw / Actions  | Weekly Monday 08:00 UTC   |
| Code improvements  | OpenClaw autopilot  | Weekly (after observation) |
| PR review + merge  | Human               | On PR creation             |
| Deployment         | GitHub Pages        | On push to main            |

## Rollout Phases

### Phase 1: DRY_RUN (current)

- Observe and plan only; no branches, commits, or PRs created.
- Validates that observation logic works and candidates are sensible.
- Output appears in GitHub Actions step summary.

### Phase 2: PR_ONLY

- Creates PRs for LOW-risk changes.
- MEDIUM-risk changes are reported but not actioned.
- Requires human merge for all PRs.

### Phase 3: SELECTIVE_AUTO

- LOW-risk PRs auto-merge after CI passes.
- MEDIUM-risk PRs require human review.
- HIGH-risk items are always skipped.

## File Layout

```
.openclaw/
├── autopilot-policy.json           # Safety config (modes, paths, limits)
└── skills/
    ├── autopilot/SKILL.md          # Full OBSERVE->PLAN->EXECUTE loop
    └── observe/SKILL.md            # Read-only health check

.github/workflows/
├── update-sports-data.yml          # Existing data pipeline (every 6h)
└── openclaw-autopilot.yml          # Weekly autopilot trigger

docs/
└── OPENCLAW_AUTOPILOT.md           # This document
```

## Self-Hosted Runner (Planned)

The long-term goal is to run OpenClaw on a dedicated Mac Mini at home,
replacing GitHub Actions-hosted runners for autopilot workloads.

**Target hardware**: Mac Mini M5 (expected spring/summer 2026)
- Apple M5 chip, 32GB unified memory, 10 Gigabit Ethernet
- Minimal SSD (storage expandable aftermarket)
- Always-on, low power (~7-15W typical)

**Why self-hosted**:
- No GitHub Actions minute limits for long-running agent sessions
- Persistent local state (caches, model context) between runs
- Also serves as: VS Code remote server, Tailscale exit node, Plex server,
  hobby project host

**Network**: 10GbE for fast LAN access (remote desktop, NAS streaming).
Internet-bound workloads (LLM API calls, git push) are bottlenecked by ISP,
not LAN.

**Resource budget** (estimated with all services running):

| Service              | RAM     | CPU        |
| -------------------- | ------- | ---------- |
| macOS baseline       | ~5 GB   | minimal    |
| OpenClaw agent       | ~1-2 GB | bursts     |
| VS Code Server       | ~1-2 GB | bursts     |
| Tailscale exit node  | ~100 MB | negligible |
| Plex (direct play)   | ~1 GB   | negligible |
| Hobby containers     | ~2-4 GB | varies     |
| **Total**            | ~10-14 GB | |

Leaves ~18 GB headroom on 32 GB. Plex transcoding is the only workload that
could cause contention -- optimize library for direct play to avoid this.

**Timeline**: Waiting for M5 Mac Mini release, then provision and migrate
the autopilot workflow from GitHub-hosted to self-hosted runner.

## Open Questions

1. **OpenClaw CI integration**: The workflow currently has a TODO placeholder
   for `openclaw agent run`. The exact CLI invocation depends on OpenClaw's
   CI runner, which is not yet available.

2. **Auto-merge safety**: Phase 3 requires a GitHub branch protection rule
   that enforces CI passing before merge. This needs to be configured
   manually before enabling SELECTIVE_AUTO mode.

3. **Observation frequency**: Weekly may be too infrequent for active
   development periods. Consider adding `workflow_dispatch` triggers
   from other workflows (e.g., after data updates find issues).

4. **Multi-candidate batching**: Currently one candidate per run. If
   observation consistently finds 3+ LOW-risk candidates, consider
   batching into a single PR.

5. **Self-hosted runner setup**: Once the Mac Mini is provisioned, need to
   configure GitHub Actions self-hosted runner, Tailscale for remote access,
   and persistent OpenClaw agent scheduling (launchd or cron).
