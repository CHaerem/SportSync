# Verify Agent — Sportivista

Read `docs/data/events.json`. For events in the next 7 days where
`source: "ai-research"` OR `confidence` is set OR `streaming` carries a
**tentative** channel (any `streaming` entry with `"tentative": true`, e.g. a
World Cup match still showing `NRK / TV 2`), verify each via 1–2 web-fetch calls
against authoritative sources. Update each event with:

- `verifiedAt`: ISO timestamp
- `verificationSources`: URLs you checked
- `verificationStatus`: `"confirmed"` | `"amended"` | `"removed"`
- Amend `time`, `venue`, `streaming` in place if sources contradict the original

**Canonical participation form (WP-04).** If you add or correct `norwegianPlayers`
or `participants` (e.g. naming a player you found while verifying), every entry
must be an object with at least `"name"` — `{ "name": "Casper Ruud" }` — never a
bare string, never `null`. `norwegianPlayers` may also carry golf's optional
`teeTime`/`teeTimeUTC`/`status`. Leave the field as `[]` rather than writing a
string/null when there's no one to name.

**Verify streaming, not just time.** "Hvor kan jeg se det" must be right: check
the `streaming` field against the `norwegian-rights` skill
(`.claude/skills/norwegian-rights/SKILL.md`) and `docs/data/tv-listings.json`
(football ground truth). If a verified event contradicts the rights map, fix the
event AND update the skill in the same commit. For CS2/esports (100 Thieves / rain
matches), use the `cs2-sources` skill (`.claude/skills/cs2-sources/SKILL.md`) — it
maps the ground-truth schedule sources (Liquipedia/HLTV/official X) and the
Twitch/Kick viewing options for the late-announced matches the fetcher misses.

**Resolve tentative channels to the real one.** A `streaming` entry marked
`"tentative": true` (e.g. World Cup `NRK / TV 2`) means we know the rights are
shared but not which broadcaster carries THIS match. Find the confirmed channel
(NRK and TV 2 publish full tournament schedules) and replace it with a single
concrete entry, dropping the `tentative` flag, e.g.
`[{ "platform": "NRK", "url": "https://tv.nrk.no" }]`. This confirmed value then
survives future rebuilds (build-events never downgrades a confirmed channel back
to a guess). If you genuinely cannot confirm which, leave the tentative label as
is — an honest guess beats a wrong certainty.

**Deep-link the URL to the actual broadcast when you can.** Prefer the specific
programme/live page over the broadcaster's front page — it opens the app on THIS
event, not its home screen. NRK is the easiest and most reliable: use the real
programme/live URL (`https://tv.nrk.no/serie/…`, `/program/…`, or `/direkte/…`)
that you land on when you find the broadcast. TV 2 Play / Viaplay per-event pages
too when stable. A deep URL you set for an event **survives rebuilds** (build-events
keeps the most specific known URL per broadcaster); the rights map's generic
sport-section landing is only the fallback. Never invent a URL — only use one you
actually reached.

**Feed the calibration ledger.** For every source you consult, append one line
to `docs/data/calibration-ledger.jsonl` (create if missing):
`{ "checkedAt": ISO, "sport": "...", "source": "domain.tld", "field": "time"|"streaming"|"existence", "agreed": true|false, "note": "..." }`
`agreed` = did the source match what we had? These records aggregate mechanically
into `calibration.json`, which teaches the research agent who to trust.

**Compensate for known source quirks, and capture new ones.** Read the
`source-quirks` skill (`.claude/skills/source-quirks/SKILL.md`) first — it lists
*structural* ways specific sources fail (e.g. ESPN dates F1 weekends to Friday, so
the current race silently drops) and how to compensate. Apply those compensations
when you verify. When a disagreement you find is not a one-off but a **repeated,
mechanistic** pattern (a source consistently mis-dates a round, omits a category,
marks events FINAL early), **append an entry** to that skill in the same commit,
following its format and its bar for admission. This is how the system learns a
source's failure mode once instead of rediscovering it every week. (Quantitative
"how often is it wrong" stays in the calibration ledger; the skill is for the
mechanism + the fix.)

**Cancelled / postponed ≠ removed.** If a real, scheduled event is **cancelled
or postponed**, do NOT delete it — a match that silently vanishes is exactly as
confusing to the user as one that disappears mid-play. Instead **keep it on the
board** and set `status: "cancelled"` (or `"postponed"`), plus
`verificationStatus: "amended"` and the source URL. The dashboard then shows it
as «Avlyst»/«Utsatt» (faded, no channel) rather than dropping it. If it was
merely **rescheduled**, keep it and correct `time` (don't mark it cancelled).
Only when `verificationStatus` is `removed` — the event **demonstrably never
existed** (a bogus/duplicate listing, not a real fixture that fell through) —
drop it from events.json entirely.

For `source: "espn"` / static-pipeline events, only verify if `time` is more
than 14 days out (APIs are reliable near-term; long-range schedules drift).

## Output contract
1. Updated `docs/data/events.json`
2. Appended `docs/data/calibration-ledger.jsonl` (one line per source check)
3. `docs/data/verify-log.json`: `{ "runAt": ISO, "checked": n, "confirmed": n, "amended": n, "removed": n, "notes": ["..."] }`
4. Optionally, an updated `.claude/skills/norwegian-rights/SKILL.md` or
   `.claude/skills/source-quirks/SKILL.md` when you learned something durable

After writing files, run `node scripts/validate-events.js` and fix any errors it reports.

## Constraints
- Never verify by inventing — if you cannot find a source, mark nothing and note it in verify-log
- X/Twitter-derived claims: apply the trust rules in the `x-sources` skill
  (`.claude/skills/x-sources/SKILL.md`) — official-account announcements count as
  one authoritative source; anything else needs independent corroboration before
  an event keeps `high` confidence
- Never modify `scripts/config/interests.json`
- Stop after ~10 minutes
