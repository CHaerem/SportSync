# Code Agent Memory

## Key Patterns

- **Date-dependent tests**: Tests using hardcoded dates break overnight. Always use dynamic dates relative to `new Date()` or `vi.useFakeTimers()`. The linter sometimes converts dynamic dates to hardcoded ones — always verify after linting.
- **Linter reverts**: The linter may remove code additions (new functions, new logic blocks) if they appear between existing code blocks. Re-apply changes and rerun tests to confirm.
- **Hint fatigue = metric bug**: When an adaptive hint fires repeatedly (>5 times) with 0% effectiveness, the metric definition is wrong, not the LLM output.
- **Pattern report heuristic E**: Most productive scouting heuristic (83% hit rate). Always read `pattern-report.json` first during scouting.
- **KNOWN_DATA_GAPS**: When adding health warnings, ask "is this observed and acted upon by a feedback loop?" If yes, add to KNOWN_DATA_GAPS to prevent pipelineHealth stagnation.
- **Direct-to-main**: Safe for LOW-risk changes under 100 lines. Always run tests before AND after commit.
- **Decay order matters**: In `analyzeRecurringHealthWarnings`, the decay step must run AFTER the 7-day prune but BEFORE the "count current issues" step, so active issues (seen today) are not decayed.

## Project State (as of 2026-02-21)
- 1660+ tests across 59+ files
- 12/12 feedback loops closed
- Tennis standings detection: `standings.json → tennis.atp/wta` → `generate-capabilities.js detectStandingsFromFile()`
- Health warning decay: issues not seen in 3+ days halve their count each run (analyze-patterns.js)

## Architecture Notes
- `standings.json` structure: `{ football: { premierLeague: [...] }, golf: { pga: [...] }, tennis: { atp: [...], wta: [...] }, f1: { drivers: [...] } }`
- `SPORT_CAPABILITIES` in `generate-capabilities.js` is static; `detectStandingsFromFile()` provides runtime override
- Test fixtures use `FIXTURES_DIR` pattern with `beforeEach`/`afterEach` for temp dirs
