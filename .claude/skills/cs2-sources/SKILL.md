---
name: cs2-sources
description: Where to find Counter-Strike 2 (CS2) match schedules and where to watch them in Norway — ground-truth sources, the late-announcement reality, and streaming. Use when researching or verifying esports events, especially 100 Thieves (rain / Håvard Nygaard) matches, including smaller tournaments.
---

# Playbook: CS2 schedules & streaming (esp. 100 Thieves)

The user follows **100 Thieves** in CS2 — specifically **rain (Håvard Nygaard)** — and
watches on **Twitch / Kick**. The hard part: 100 Thieves plays not just majors but
**smaller tournaments too**, and match times are often announced **late** (a day or
less ahead), sometimes first on the team's own X. Your job is to have the match on the
board with the right time and a real watch link **before** the user would otherwise
find out from an X post.

## Coverage split — know what already runs
- The **static pipeline** fetches `Liquipedia:Matches` hourly (`scripts/fetch/esports.js`)
  and keeps any match involving a focus team (100 Thieves) at **any tier**. So once a
  match has a scheduled time on Liquipedia, it appears automatically. **Do not** re-add
  what the fetcher already has.
- **Your job (research/verify)** is the gap the fetcher can't cover: a match announced
  **only on X / a tournament site** before Liquipedia lists it, the **exact stream
  channel**, and confirming times close to match day.

## Ground-truth sources, in order of trust
1. **Liquipedia** (`liquipedia.net/counterstrike/`) — the team page
   (`/counterstrike/100_Thieves`) and match pages list upcoming matches with exact
   timestamps. Most reliable, web-fetchable. Check the team page for what's scheduled.
2. **HLTV** (`hltv.org`) — team page `/team/.../100-thieves` → "Upcoming matches", and
   the event pages for brackets/times. Authoritative but Cloudflare-protected; prefer
   reading it via web search results / cached views if a direct fetch is blocked.
3. **The tournament's own site** (BLAST.tv, ESL/IEM, CCT, etc.) — canonical for that
   event's schedule and stream.
4. **Official X as an early lead**, via the `x-sources` skill: `@100Thieves`,
   `@Complexity`… and player accounts. A team X post is a *lead*, not evidence — confirm
   the time against Liquipedia/HLTV/the tournament before writing `confidence: high`.
   (X can't be fetched directly; reach it via web search — see `x-sources`.)

## Streaming — "hvor kan jeg se det"
CS2 is **free** on the tournament's official stream; no NRK/TV2/Viaplay. In Norway that
means, in order:
- The **tournament's official Twitch** (e.g. `twitch.tv/blastpremier`, `twitch.tv/ESLCS`)
  — prefer the specific channel when you can identify it.
- **Kick** — increasingly used; some events/streamers are Kick-first (`kick.com/...`).
- **YouTube** (the event's channel) and **BLAST.tv** for BLAST events.
Resolve to the *specific* channel when you can; if you can't, the honest generic
`Twitch` / `Kick` label the fetcher sets is fine — never invent a channel.

## Confidence & timing
- Match with a time confirmed on Liquipedia/HLTV/tournament site → `high` (2+ sources).
- Time only from an X lead → `medium`, note "tid ikke bekreftet", and let `verify`
  firm it up closer to the day.
- Tournament known but individual match times unpublished (common for a bracket a week
  out) → add the **tournament window** as one event and note that match times follow;
  the fetcher/verify will fill specific matches as they're scheduled.

## When you learn something durable
If you discover a stable fact (a tournament always streams on a specific Kick channel; a
source consistently lists 100T matches earliest), record it — here for where-to-find, or
in `source-quirks` if it's a structural failure mode of a source.
