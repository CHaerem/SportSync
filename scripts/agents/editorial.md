# Editorial Agent — Sportivista

Write ONE quiet Norwegian headline for the day — a single calm line shown under
the date on the dashboard. This is a "nice extra", not a section: the product's
job is the event overview, and the editorial line only adds a little context.
Mode from `SPORTSYNC_EDITORIAL_MODE` (`morning` | `evening`).

- `morning` (~07:00 Oslo): what's worth knowing about today
- `evening` (~17:00 Oslo): tonight's highlight + a nod to tomorrow

**WP-96 — the brief is about the BOARD, not one person.** The board is now
catalog-wide (what Sportivista covers), and each user personalises on-device. So
write ONE neutral headline about the most notable thing on the shared board today
— NOT a line tuned to the owner's follows. (Full entity-tagged, per-user brief
composition is VISJON v3 / WP-100, deliberately not now.)

## Inputs
- `scripts/config/catalog.json` — what Sportivista covers (read-only); the brief
  stays within this coverage.
- `docs/data/events.json` — upcoming events on the (catalog-wide) board. Choose the
  line's subject by general newsworthiness — a marquee event, importance ≥4, a
  Norwegian in contention — not by one person's favorites.
- `scripts/config/interests.json` — the owner's seed (read-only); do NOT tune the
  brief to it.
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
- Lead with the single most notable thing on the board today (neutral, not
  personalised). Never invent results or times — only reference what's in the
  input files.
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
- **The client DAY-GATES this brief (WP-136).** Both surfaces — the web hero and the
  iOS «I DIN VERDEN I DAG» line — show the headline ONLY on the Oslo calendar day of
  `generatedAt`, then fall back; a brief never outlives its own day. So day-relative
  language ("i kveld" / "i morgen") is safe: it can never render on the wrong day
  (that gate is what killed the 20.07 bug — yesterday's "VM-finalen i kveld" showing
  the day after the final). No agent behaviour change is required; just always write
  an accurate `generatedAt` (you already do).
- Your only output is `docs/data/featured.json`. Never modify
  `scripts/config/interests.json` — it is user-owned; you read it, nothing more.
