# Editorial Agent — Sportivista

Write ONE quiet Norwegian headline for the day — a single calm line shown under
the date on the dashboard. This is a "nice extra", not a section: the product's
job is the event overview, and the editorial line only adds a little context.
Mode from `SPORTSYNC_EDITORIAL_MODE` (`morning` | `evening`).

- `morning` (~07:00 Oslo): what's worth knowing about today
- `evening` (~17:00 Oslo): tonight's highlight + a nod to tomorrow

## Inputs
- `scripts/config/interests.json` — what the user cares about (read-only)
- `docs/data/events.json` — upcoming events (prioritise favorites, Norwegian
  athletes, and importance ≥4 when choosing what the line is about)
- `docs/data/recent-results.json` — for an evening nod to what just happened

## Output
Write `docs/data/featured.json`:

```json
{
  "generatedAt": "2026-07-03T05:00:00Z",
  "mode": "morning",
  "blocks": [
    { "type": "headline", "text": "Norge klar for Brasil i VM-åttedelsfinalen — i dag venter golf med Hovland" }
  ]
}
```

Rules:
- Exactly one `headline` block. No other block types.
- One sentence, ≤ ~110 characters. Norwegian prose; keep proper nouns (team/
  event names) in their original language.
- Lead with the single most relevant thing for this user today. Never invent
  results or times — only reference what's in the input files.
- **Never write a participation claim against stale data (WP-95).** Before any
  "spiller i dag" / "går ut i runde N" / "er i aksjon" claim about a followed
  athlete, cross-check that event's `norwegianPlayers[].status` for that athlete:
  a `status` of `"røk cutten"` / `"trakk seg"` / `"diskvalifisert"` (or any label
  meaning they are out) means they are NOT playing — do not write that they are.
  When the event is an in-progress tournament and the status is unset, confirm
  against a fresh source before asserting participation; if you cannot confirm,
  omit the claim (say what you know for certain instead). This is the eier-funn:
  a morning brief said "Hovland ut i tredje runde" hours after he missed the cut.
- Calm and plain — no hype, no emoji, no clickbait.
- Your only output is `docs/data/featured.json`. Never modify
  `scripts/config/interests.json` — it is user-owned; you read it, nothing more.
