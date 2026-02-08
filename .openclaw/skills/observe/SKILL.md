---
name: sportsync-observe
description: Read-only health check and improvement scanner for SportSync
requires:
  - git
  - node
  - gh
readOnly: true
---

# SportSync Observe Skill

Run a read-only health check on the SportSync repository. Identify improvement
candidates without modifying any files, branches, or remote state.

## Instructions

You are a read-only observer. You MUST NOT create branches, modify files, commit,
push, or open PRs. Your only output is a structured report.

### Step 1: Run Tests

```bash
npm test
```

Record the exit code and capture any failing test names.

### Step 2: Validate Data Freshness

Check `docs/data/meta.json` for `lastUpdate`. If it is more than 24 hours old,
flag `DATA_STALE`. If the file is missing, flag `DATA_MISSING`.

```bash
node -e "
  const fs = require('fs');
  try {
    const meta = JSON.parse(fs.readFileSync('docs/data/meta.json', 'utf8'));
    const age = Date.now() - new Date(meta.lastUpdate).getTime();
    const hours = Math.round(age / 3600000);
    console.log(JSON.stringify({ lastUpdate: meta.lastUpdate, ageHours: hours, stale: hours > 24 }));
  } catch (e) {
    console.log(JSON.stringify({ error: 'META_MISSING' }));
  }
"
```

### Step 3: Check for Merge Conflicts

Scan tracked files for conflict markers:

```bash
git diff --check HEAD || true
git grep -l '<<<<<<< ' -- '*.js' '*.html' '*.json' '*.md' || echo 'NO_CONFLICTS'
```

### Step 4: Repo State

```bash
git status --short
git log --oneline -5
```

### Step 5: Check Open Issues

```bash
gh issue list --limit 10 --state open --json number,title,labels 2>/dev/null || echo '[]'
```

### Step 6: Scan for Improvement Candidates

Look for common issues:

1. **Dead code**: exported functions with zero call sites in `docs/js/`
2. **Missing tests**: scripts in `scripts/` without corresponding test files in `tests/`
3. **Hardcoded values**: magic numbers or URLs that should be constants
4. **Stale dependencies**: packages with known vulnerabilities (check `npm audit --json`)

### Output Format

Print your final report as a fenced JSON block:

```json
{
  "timestamp": "ISO-8601",
  "testsPass": true,
  "testsFailing": [],
  "dataFreshness": { "lastUpdate": "ISO-8601", "ageHours": 6, "stale": false },
  "mergeConflicts": [],
  "openIssues": [],
  "candidates": [
    {
      "id": "short-slug",
      "title": "Human-readable title",
      "files": ["path/to/file.js"],
      "risk": "LOW",
      "effort": "small",
      "description": "What to fix and why"
    }
  ]
}
```

Only include candidates where the fix is clearly bounded (< 300 lines changed,
< 8 files). Do not include speculative refactors or feature requests.
