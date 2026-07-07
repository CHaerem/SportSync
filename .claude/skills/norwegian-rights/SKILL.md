---
name: norwegian-rights
description: Norwegian broadcast rights map — which broadcaster/streamer shows each sport/competition in Norway. Use whenever filling in or verifying the streaming field on an event ("hvor kan jeg se det"). Entries carry confidence; verify low-confidence entries per event and correct the map when rights move.
---

# Playbook: Norwegian broadcast rights (seeded 2026-07-03)

The single most important user-facing field after the start time is **where to
watch in Norway**. This map is the prior; `docs/data/tv-listings.json`
(tvkampen.com ground truth, football) and per-event verification override it.

Confidence key: `[solid]` = well-established, `[verify]` = check before relying on it.

## Streaming URL (the tappable deep link in `streaming[].url`)
The dashboard makes each streaming option's `url` tappable — "open where to watch"
(on mobile it opens the broadcaster's app). Fill it with the most specific *safe* URL:
- **Football:** `docs/data/tv-listings.json` now carries a per-match `url` (the
  tvkampen match page listing every Norwegian broadcaster for THAT match). When an
  event matches a listing (by team names), set `streaming[].url` to that match `url`.
  It's the best "where to watch this match" link — and the ONLY good link for
  **shared/tentative** rights (e.g. WC "NRK / TV 2"), where pointing at one
  broadcaster would mislead.
- **Everything else:** use the service landing URL from the map below (it opens the
  app). Do NOT invent per-match broadcaster paths (`play.tv2.no/…/<match>`) — they 404.

## Football
- Premier League → **TV 2 Play / TV 2 Sport Premium** [solid]
- La Liga → **TV 2 Play** [verify]
- Champions League / Europa League → **TV 2 Play** [solid]
- OBOS-ligaen + Eliteserien → **TV 2 Play** [solid]
- FIFA World Cup 2026 → **NRK + TV 2** (shared, per-match split) [verify per match]
- Cross-check every football entry against `docs/data/tv-listings.json` when present.

## Golf
- PGA Tour, DP World Tour, Masters, PGA Championship, The Open, US Open, Ryder Cup → **Viaplay** [solid]
- Some overlap with **Discovery+/Eurosport** for majors [verify]

## Motorsport
- Formula 1 (all sessions) → **Viaplay** [solid]

## Tennis
- Roland-Garros → **Discovery+/Eurosport** [solid]
- Australian Open → **Discovery+/Eurosport** [solid]
- Wimbledon → **Max (WBD/Eurosport)** [verify] (changed from Viaplay 2026-07-03: tvkampen.com rights page lists Discovery Networks, tvtilbud.no says Max Sport carries all Grand Slams incl. Wimbledon 2026; no 2026-specific press release found)
- ATP/WTA tour events → [verify per event]

## Winter sports
- Biathlon (IBU World Cup/WCH) → **NRK** [solid]
- Cross-country, ski jumping, nordic combined (FIS World Cup) → **NRK** [solid] through 2025/26; from season 2026/27 **TV 2 + Viaplay** share FIS World Cup rights [verify] (NTB press release Dec 2025, kommunikasjon.ntb.no/pressemelding/18377092; noted 2026-07-03)
- Alpine (FIS World Cup) → **Viaplay** [verify]

## Cycling
- Tour de France → **TV 2 Play** [solid] (TV 2 deal covers 2026–2030 per NTB press release; hjelp.tv2.no confirms TV 2 Direkte + TV 2 Play; Eurosport Norge reportedly shares 2026 rights per cyclingweekly.com [verify]; confirmed 2026-07-03)
- Other UCI races → [verify per event]

## Chess
- Norway Chess, Carlsen events → often **NRK** or **TV 2**, plus free official streams (chess24/chess.com/YouTube) [verify per event]

## Esports (CS2)
- Official tournament streams (Twitch/YouTube) — free [solid]

## Maintenance
Rights move between seasons. When a verified event contradicts this map, or a
rights change is announced (X/broadcaster accounts are usually first — see the
`x-sources` skill), update the relevant line **in the same commit** and
date-stamp the change. Never leave a known-wrong entry standing.
