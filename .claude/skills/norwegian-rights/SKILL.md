---
name: norwegian-rights
description: Norwegian broadcast rights map — which broadcaster/streamer shows each sport/competition in Norway. Use whenever filling in or verifying the streaming field on an event ("hvor kan jeg se det"). Entries carry confidence; verify low-confidence entries per event and correct the map when rights move.
---

# Playbook: Norwegian broadcast rights (seeded 2026-07-03)

The single most important user-facing field after the start time is **where to
watch in Norway**. This map is the prior; `docs/data/tv-listings.json`
(tvkampen.com ground truth, football) and per-event verification override it.

Confidence key: `[solid]` = well-established, `[verify]` = check before relying on it.

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
- Wimbledon → **Viaplay** [verify]
- ATP/WTA tour events → [verify per event]

## Winter sports
- Biathlon (IBU World Cup/WCH) → **NRK** [solid]
- Cross-country, ski jumping, nordic combined (FIS World Cup) → **NRK** [solid]
- Alpine (FIS World Cup) → **Viaplay** [verify]

## Cycling
- Tour de France → **TV 2 Play** [solid]
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
