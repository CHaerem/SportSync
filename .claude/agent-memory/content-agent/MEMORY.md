# Content Agent Memory

## mustWatchCoverage Metric — Key Design Rules

### How it works (ai-quality-gates.js, `mustWatchCoverage()`)
- Filters events to today-only window (midnight to midnight, local time)
- Returns 1.0 when zero importance≥4 events today (zero-denominator guard)
- Checks coverage via three mechanisms:
  1. `coveredSports` from `event-schedule` blocks (filter.sport) AND `golf-status` blocks (always adds "golf")
  2. `coveredTeams` from `match-result` / `match-preview` blocks (homeTeam, awayTeam)
  3. Text search through block text/label/items/_fallbackText

### Pitfall: golf-status blocks were invisible
`golf-status` component blocks have a `tournament` field (e.g., "pga") but NOT a `text` field.
Before the fix (Run 9), `mustWatchCoverage` did not collect `tournament` into `allText` and did
not add "golf" to `coveredSports`. Result: golf must-watch events showed 0% coverage even with
a golf-status block present. Fix: add `if (blocks.some(b => b.type === "golf-status")) coveredSports.add("golf")`.

### Adaptive hint fatigue for mustWatchCoverage
If `mustWatchCoverage` is stuck at 0 despite `golf-status` blocks being present, check:
1. Is the metric using today-only scope? (filterTodayOnlyEvents, not filterFeaturedWindowEvents)
2. Does today actually have importance≥4 events in the today window?
3. Does the golf-status block type coverage map correctly?

## Component Block Coverage in mustWatchCoverage
- `match-result` / `match-preview` → covers football events by homeTeam/awayTeam
- `golf-status` → covers ALL golf events (added in Run 9 fix)
- `event-schedule` with filter.sport → covers events of that sport
- Text blocks → text search fallback for titles/team names

## Quality Metric Architecture
- `evaluateEditorialQuality()` → editorial score, mustWatchCoverage, sportDiversity, etc.
- `filterTodayOnlyEvents()` → scope for mustWatchCoverage (today only)
- `filterFeaturedWindowEvents()` → scope for sportDiversity (3-day window)
- `buildAdaptiveHints()` → fires hints when rolling avg of a metric < threshold (5-entry window)
- Hint fatigue: if hint fires 5+ times with 0 effectiveness, check if metric definition is wrong

## Testing Patterns
- Always test the "zero must-watch" case: `if (mustWatch.length === 0) return 1`
- Test each component block type's coverage contribution separately
- Use `now` option in `evaluateEditorialQuality(featured, events, { now })` for deterministic dates
