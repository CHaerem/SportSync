---
name: wp-flow
description: Den operasjonelle arbeidspakke-flyten — planlegge bølger uten filkollisjoner, delegere WP-er til parallelle agenter, merge PR-ene (inkl. konfliktoppskriftene) og verifisere samlet. Bruk når du planlegger/delegerer/merger PLAN.md-arbeidspakker eller kjører flere agenter i parallell på dette repoet.
---

# Playbook: arbeidspakke-flyten (WP-er, bølger, merge)

Reglene står i PLAN.md («Regler for alle agenter») — dette er DRIFTEN av dem:
det som faktisk fungerte gjennom FASE 0D/0E (24+ pakker, ~25 PR-er).

## Planlegge en fase

- Én WP = én branch = én PR; skjær pakkene så parallelle agenter IKKE deler
  filer — avhengigheter i statusraden er også kollisjonsstyring.
- Bølge-plan i fase-introen: bølge 1 = uavhengige, senere bølger = avhengige.
  Maks ~4 samtidige agenter når pakkene bygger med xcodebuild (delt Mac).
- Hver pakke: Mål / Innhold m/fil:linje-ankere / Ikke-mål (BINDENDE) / Aksept.
  Fase-intro lister menneskebeslutninger eksplisitt (beskyttede stier,
  slettinger, kostnader).
- Assistent-pakker SKAL levere eval-cases + mock-tester i samme PR (0E-regel).

## Delegere

- Worktree-agent per pakke (`isolation: worktree`), Opus som arbeidshest
  (Fable har ukeskvote; session-limit → relansér etter reset, agenten dør
  uten å ha committet noe halvveis-farlig).
- Standard-instruks til agenten: branch-navn `wp-XX-slug`, statusrad
  ⬜→🔬 i samme PR, commit-trailer, `git pull --rebase origin main` før push,
  `gh pr create`, **ALDRI merge selv**. Ved parallelle naboer: nevn hvilke
  filer naboen eier + «union ved rebase-konflikt».
- Advar agenten om kjent miljøstøy: spawn-tunge vitest-filer viser
  5s-timeouts under last (`npx vitest run --maxWorkers=1` er porten);
  xcodebuild/simulator er treg under parallell last.

## Merge (hovedsesjonens jobb)

1. `gh pr diff <n> --name-only` — fillisten skal matche pakkens scope, ellers
   tilbake til agenten.
2. Merge i avhengighets-/overlapp-rekkefølge. Ved «merge conflicts» fra GitHub:
   ```bash
   git fetch origin && git checkout -B tmp-wpXX origin/<branch>
   git rebase origin/main      # løs → git add → GIT_EDITOR=true git rebase --continue
   git push --force-with-lease origin tmp-wpXX:<branch>
   sleep 10 && gh pr merge <n> --merge     # mergeability beregnes asynkront — retry ved falsk konflikt
   ```
3. **Konfliktoppskrifter:** PLAN.md-statusrader = union (behold begge
   oppdaterte rader — nabolinjer konflikter alltid). eval-corpus.json =
   union av cases, version = maks, beskrivelse = supersett. Semantisk
   Swift-konflikt (to pakker i samme fil) = løs + **byggsjekk før merge**;
   ved tvil full testkjøring på den rebasede branchen.
4. Etter hver bølge: flipp radene 🔬→✅ i én commit på main, og kjør SAMLET
   verifisering (JS + iOS + ev. eval) — enkelt-PR-er grønne hver for seg
   beviser ikke kombinasjonen (WP-71-lærdommen).
5. Beskyttede stier (se CLAUDE.md-listen): PR-en blir stående til MENNESKET
   merger — permission-laget håndhever dette mot hovedsesjonen også; ikke
   forsøk omveier, be eieren klikke.

## Verifiseringsmatrise (hva «grønt» betyr per flate)

| Flate | Port |
|---|---|
| Pipeline/scripts | `npx vitest run --maxWorkers=1` + `node scripts/build-events.js && node scripts/validate-events.js` |
| Web | vitest + `npm run screenshot` begge temaer (visuelt likt ved refaktor) |
| iOS | full unit-suite + alle 4 schemes bygger + gylne vektorer bit-like (+ UI-suite ved UI-endring) |
| Assistent | mock-suite (CI) **og** ekte-FM-eval (se ios-dev-skillen) — mock alene beviser ingenting om ekte modell |

## Kvote-taktikk

- Opus = arbeidshest; Fable til dype/harde enkeltpakker når ukeskvoten tåler
  det. Ved «session limit»-død: agenten har typisk ikke committet — relansér
  fra ren main etter reset (sjekk `gh pr list` + worktree-status først).
- FM-eval-kjøringer koster vegg-tid (ikke tokens) — kjør dem i bakgrunnen
  og fortsett annet arbeid.
