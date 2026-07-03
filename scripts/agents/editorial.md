# Editorial Agent — SportSync

Generate the editorial brief shown at the top of the dashboard. The mode comes
from the environment variable `SPORTSYNC_EDITORIAL_MODE` (`morning` | `evening`).

- `morning` (~07:00 Oslo time): today's preview + last night's recap if relevant
- `evening` (~17:00 Oslo time): tonight's live picks + tomorrow preview

## Inputs (read these files)
- `scripts/config/interests.json` — what the user cares about
- `scripts/config/tracked.json` — currently tracked entities with reasons
- `docs/data/events.json` — upcoming + recent events
- `docs/data/recent-results.json` — completed matches, golf positions
- `docs/data/standings.json` — PL table, golf leaderboards, F1 drivers
- `docs/data/rss-digest.json` — news headlines for narrative color

## Output
Write `docs/data/featured.json`:

```json
{
  "generatedAt": "2026-07-02T05:00:00Z",
  "mode": "morning",
  "blocks": [
    { "type": "headline", "text": "..." },
    { "type": "narrative", "text": "..." },
    { "type": "match-result", "homeTeam": "...", "awayTeam": "...", "_fallbackText": "..." },
    { "type": "match-preview", "homeTeam": "...", "awayTeam": "...", "showStandings": true, "_fallbackText": "..." },
    { "type": "event-schedule", "filter": { "sport": "golf", "window": "today" }, "label": "...", "maxItems": 6, "_fallbackText": "..." },
    { "type": "golf-status", "tournament": "pga", "_fallbackText": "..." },
    { "type": "divider", "text": "Denne uka" },
    { "type": "event-line", "text": "..." }
  ]
}
```

Block semantics — the client resolves structured blocks against pre-loaded data
(logos, scores, times, standings), so reference teams/events by the exact names
used in `events.json` / `recent-results.json` / `standings.json`:

- `headline` — one strong sentence, Norwegian
- `narrative` — 2–4 sentences of editorial prose, Norwegian
- `match-result` — a completed match to highlight (must exist in recent-results.json)
- `match-preview` — an upcoming match (must exist in events.json); `showStandings: true` adds table positions
- `event-schedule` — events for one sport in a window; `filter.sport` is required, `filter.window` is `"today"` (default), `"tomorrow"` or `"week"`
- `golf-status` — active golf leaderboard focus; `tournament` is `"pga"` or `"dpWorld"`
- `divider` — small section separator with a label
- `event-line` — one-liner about a single upcoming event (uses the `text` field)

Every structured block (`match-result`, `match-preview`, `event-schedule`, `golf-status`)
MUST include a `_fallbackText` string — the client renders it when the referenced
data can't be resolved.

Rules:
- Keep blocks ≤ 8
- Norwegian prose; keep proper nouns (team/event names) in their original language
- Prioritize by interests.json: Norwegian athletes first, then favorite teams, then general
- Never invent scores or times — only reference data present in the input files
