# Screen catalog (WP-98)

Input material for Claude Design: a full set of real, rendered Sportivista
iOS screens, both system appearances. iOS screens cannot be produced from web
captures (SwiftUI renders nothing a browser can screenshot) — this is the only
way to hand Claude Design the actual shipped UI rather than a description of
it.

## Generating

```bash
design/screens/generate.sh [output-dir]     # default output-dir: /tmp/sportivista-screens/
```

Requires Xcode + a booted-capable "iPhone 17" simulator (or set
`SPORTIVISTA_SCREENS_SIMULATOR` to another available simulator name). The
script builds the `Sportivista` scheme (Debug — the screenshot harness is
`#if DEBUG`-only), boots the simulator, installs a fresh copy of the app
(uninstalling any existing install first, so the icon/state is clean), and
loops every deterministic `SPORTIVISTA_DEMO` mode across both themes
(`xcrun simctl ui appearance dark|light`), settling ~6s per screen before
capturing.

## What gets captured

One PNG per `(mode, theme)` pair — 18 modes × 2 themes = 36 screenshots,
named `<mode>-<theme>.png`:

| Mode | Screen |
|---|---|
| `uitest` | The XCUITest harness's deterministic seeded agenda (real board content, no network) |
| `lens` | Agenda through a seeded interest lens (athlete-centred rows) |
| `filter` | Agenda with an active presentation filter ("VISER: GOLF") |
| `share` | Profile share sheet (QR + link) with a seeded non-empty profile |
| `deg` | The Deg (Profile/Settings) screen with a seeded profile + memory |
| `memory` | "Hva jeg vet om deg" (What I know about you) page |
| `spoiler` | A spoiler-masked event detail sheet |
| `onboarding-welcome` | Onboarding: welcome step |
| `onboarding-converse` | Onboarding: converse step, with a pending follow-diff (FORSLAG block) |
| `onboarding-quickpicks` | Onboarding: quick-picks step (a starter pack toggled on) |
| `onboarding-landing` | Onboarding: landing step, overlay still up |
| `onboarding-landed` | Post-onboarding: overlay dismissed, the real filled agenda underneath |
| `reset-entry` | Deg screen with a seeded profile (entry point toward Nullstill) |
| `reset-confirm` | Same Deg entry point — the env-only harness doesn't drive the extra tap into the nested Nullstill confirmation row, so this mode is currently indistinguishable from `reset-entry` in a screenshot (see `ContentView.swift`'s `mode.hasPrefix("reset")` branch: both cases just `showDeg = true`) |
| `reset-onboarding` | The real reset flow re-raising onboarding |
| `diff` | Assistant conversation sheet: a grounded follow proposal (diff) in the thread |
| `answer` | Assistant conversation sheet: an answer with agenda rows in the thread |
| `assistant-sheet` | The conversation sheet in its OPENED state (WP-104): one hjelpesetning + the three tappable example rows |

The complete, authoritative mode list lives in
`ios/Sportivista/ContentView.swift`'s `.task` demo-seeding switch,
`onboardingInitialStep`, and `ios/Sportivista/Demo/*.swift` — re-derive it
from there if the app grows new modes; do not extend this list independently.

## Screenshots are never checked in

The PNGs are throwaway working material for a design review — regenerate
them whenever the review needs fresh screens, hand the output directory to
Claude Design, then discard it. Nothing under `/tmp/sportivista-screens/` (or
whatever `output-dir` you pass) is part of the repo, and this directory has no
`.gitignore` entry for images because none should ever land here to begin
with.

## Verifying a run

Look at a handful of screenshots across different modes and both themes
before trusting a batch:

- Right screen for the mode (e.g. `deg-dark.png` actually shows the Deg
  screen, not a stale agenda).
- Right theme (dark = near-black system background, light = grouped light).
- No home-screen/springboard captures (a mistimed launch can catch the icon
  grid instead of the app — the ~6s settle + terminate-before-launch guards
  against this, but a slow Mac under parallel load can still catch it).

**Known artifact (app bug, not a script bug — logged for follow-up, not fixed
here):** `onboarding-landing`/`onboarding-landed` reproducibly show the
multi-day golf rows ("The Open", "Corales Puntacana Championship") with their
date range and title text overlapping in the `I DAG` group, in both themes,
even at a much longer (12s) settle — so it is a genuine `AgendaView` row-height
layout issue with this seeded state, not a screenshot-timing flake. Worth a
follow-up (visual-qa/ui-fix territory), out of scope for the brand-
harmonisation + catalog-tooling work this script was built for.
