---
name: sportsync-autopilot
description: Bounded autonomous improvement loop for SportSync
requires:
  - git
  - node
  - gh
readOnly: false
---

# SportSync Autopilot Skill

Run a single OBSERVE -> PLAN -> EXECUTE cycle to make one bounded improvement
to the SportSync codebase. Opens a PR for human review.

## Safety Constraints

Before doing anything, read `.openclaw/autopilot-policy.json` and enforce:

- **mode**: If `DRY_RUN`, stop after PLAN and output what you would have done.
- **allowedPaths / blockedPaths**: Never modify blocked paths. Only touch allowed paths.
- **maxFilesChanged / maxLinesChanged**: Abort if the planned change exceeds limits.
- **riskRules**: Classify the change risk. Skip anything above the mode's `maxRisk`.

## Phase 1: OBSERVE

Run the `sportsync-observe` skill logic (or read its output if already run):

1. Run `npm test` and record results.
2. Check `docs/data/meta.json` freshness.
3. Scan for merge conflicts via `git grep '<<<<<<< '`.
4. List open issues with `gh issue list`.
5. Scan for improvement candidates (dead code, missing tests, hardcoded values).

Compile the observation report.

## Phase 2: PLAN

From the observation report, pick **exactly ONE** improvement candidate:

- Prefer candidates that fix failing tests or resolve conflicts.
- Prefer LOW risk over MEDIUM risk.
- Prefer small effort over large effort.
- Never pick a HIGH-risk candidate.

For the chosen candidate:

1. List every file that will be modified.
2. Verify each file is in `allowedPaths` and not in `blockedPaths`.
3. Estimate lines changed. Abort if > `maxLinesChanged`.
4. Classify risk using `riskRules`.
5. If mode is `DRY_RUN`, output the plan and stop.

## Phase 3: EXECUTE

### 3a. Branch

```bash
git checkout -b autopilot/<candidate-id>
```

### 3b. Patch

Apply the planned changes. Follow existing code style. Do not introduce new
dependencies or modify `package.json`.

### 3c. Test

```bash
npm test
```

If tests fail after your changes:

```bash
git checkout main
git branch -D autopilot/<candidate-id>
```

Output `EXECUTION_FAILED` with the test error and stop.

### 3d. Commit

```bash
git add <changed-files>
git commit -m "autopilot: <short description>

Candidate: <candidate-id>
Risk: <LOW|MEDIUM>
Files changed: <count>
Lines changed: <count>"
```

### 3e. Push and PR

```bash
git push -u origin autopilot/<candidate-id>
gh pr create \
  --title "autopilot: <short description>" \
  --body "## Autopilot Change

**Candidate:** <candidate-id>
**Risk:** <LOW|MEDIUM>
**Files changed:** <count>
**Lines changed:** <count>

### What changed
<description of the change>

### Why
<observation that triggered this>

### Verification
- [ ] Tests pass
- [ ] Change is within policy limits
- [ ] No blocked paths modified

---
*Created by SportSync Autopilot in $(mode) mode*" \
  --label autopilot
```

## Output Format

Print a final summary as a fenced JSON block:

```json
{
  "timestamp": "ISO-8601",
  "mode": "DRY_RUN|PR_ONLY|SELECTIVE_AUTO",
  "phase": "OBSERVE|PLAN|EXECUTE",
  "status": "COMPLETED|DRY_RUN_COMPLETE|EXECUTION_FAILED|NO_CANDIDATES|POLICY_BLOCKED",
  "candidate": {
    "id": "short-slug",
    "title": "Human-readable title",
    "risk": "LOW|MEDIUM",
    "filesChanged": 0,
    "linesChanged": 0
  },
  "prUrl": "https://github.com/...",
  "notes": "Any additional context"
}
```
