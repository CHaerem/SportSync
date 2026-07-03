---
name: x-sources
description: How to use X/Twitter as an indirect sports source — account list, search patterns, and trust rules for confidence levels. Use when researching schedule changes, broadcaster/streaming announcements, start lists, or athlete withdrawals.
---

# Playbook: X/Twitter as a source

X is often first with schedule changes, broadcaster announcements, withdrawals and
start lists — but x.com blocks unauthenticated fetching and the API is paid.
**Never try to fetch x.com or nitter directly** (verified dead/blocked 2026-07-03).
Reach X content **indirectly via web search**: search engines index posts, and
Norwegian sports media quote relevant posts within minutes to hours.

## How to search
- `"<account name>" <topic>` e.g. `"NRK Sport" skiskyting sendeplan`
- `site:x.com <athlete/event>` for indexed posts
- `<athlete name> twitter <event>` to surface media coverage of a post

## Trust rules (feed into confidence levels)
- Post from an **official federation/broadcaster/club account** (see list) reported
  consistently by 1+ index/media source → counts as one authoritative source.
- Journalist or insider account → `medium` confidence at best; corroborate before `high`.
- Fan/unverified account → lead only; never evidence on its own.
- Always record the *indirect* URL you actually read (news article / search result),
  not a bare x.com link you could not fetch.

## Accounts that matter (update when you learn of better ones)
Broadcasters (streaming/rights announcements — key for "hvor kan jeg se det"):
- @NRK_sport (NRK), @TV2Sporten (TV 2), @ViaplaySportNO (Viaplay), @discoveryplusNO / @Eurosport_NO

Federations & tours (schedule changes, start lists):
- @IBU_WC (biathlon), @FIS_skiing / @fisalpine / @FISCrossCountry (ski), @pgatour, @DPWorldTour,
  @ATPtour / @WTA, @F1, @FIDE_chess, @letour (Tour de France), @UCI_cycling

Clubs & teams (lineups, fixture changes):
- @LFC (Liverpool), @FCBarcelona, @LynFotball (Lyn Oslo), @100Thieves (CS2), @UnoXteam (cycling)

Athletes (participation, withdrawals):
- Viktor Hovland (no active account — follow via golf media), @CasperRuud98 (Casper Ruud),
  @MagnusCarlsen (Magnus Carlsen)

## Maintenance
When a search reveals an account name here is wrong or a better official account
exists, update this file in the same commit as your other outputs. Date-stamp
non-obvious claims. This playbook was seeded 2026-07-03.
