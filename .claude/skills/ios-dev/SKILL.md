---
name: ios-dev
description: Hvordan bygge, teste, evaluere og enhets-installere iOS-appen (Zenji) effektivt — kommandoer, harness-moduser og fallgruvene som faktisk har bitt. Bruk ved ALT arbeid under ios/ (bygg, test, FM-eval, skjermbilder, installering på fysisk iPhone).
---

# Playbook: iOS-utvikling (Zenji)

`ios/README.md` er subsystem-kartet (les den for arkitektur); dette er den
operasjonelle hurtigreferansen for å JOBBE i treet uten å gå i kjente feller.

## Grunnsyklus

```bash
cd ios
xcodegen generate            # ALLTID etter endring i project.yml eller nye/slettede filer
xcodebuild test -scheme Zenji -destination 'platform=iOS Simulator,name=iPhone 17'
```

- **Schemes:** `Zenji` (app + hele unit-suiten, hostless), `ZenjiUITests`
  (UI-flytene, egen scheme så unit-kjøringen holder seg rask),
  `ZenjiDeviceDev` (fysisk enhet, gratis-team), `ZenjiWidgetExtension`.
- Full verifisering før PR: unit-suiten + alle fire schemes bygger + (ved
  UI-nære endringer) UI-suiten én gang.
- De 13 gylne feed-vektorene (`FeedVectorTests`) skal ALLTID være bit-like —
  de er dommeren for all kompilerings-/matching-semantikk.

## FM-eval (assistent-kvalitet mot EKTE modell)

Foundation Models kjører i Simulator på denne Macen (Apple Intelligence på
verts-Macen). CI/mock ser aldri disse feilene — evalen er eneste fasit.

```bash
# Full eval (~25 min, 55+ cases) — opt-in, aldri i vanlige suite-kjøringer:
TEST_RUNNER_ZENJI_REALFM_EVAL=1 xcodebuild test -scheme Zenji \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:ZenjiTests/RealFMEvalTests
# Billig iterasjon: filtrer på kategori eller enkelt-case:
#   TEST_RUNNER_ZENJI_EVAL_CATEGORY=canon,command …
#   TEST_RUNNER_ZENJI_EVAL_CASE=<case-id> …
```

- Rapport-JSON printes mellom `REALFM-EVAL-REPORT-`markørene i loggen.
- Terskler i `RealFMEvalTests` = «målt minus margin»; modellen er
  ikke-deterministisk mellom kjøringer (±10-15 %) — aldri stram terskel til
  siste måling.
- ALDRI to eval-kjøringer i parallell (én simulator; sekvensiell modell).
- **Prompt-budsjettet er hellig** (4096-token on-device-vindu): instruksjoner
  + verktøybeskrivelser + skjema deler det. Vakt-testen på tegn-budsjett skal
  aldri «bare økes» — WP-71-lærdommen er at tre pakker som hver for seg var
  fine, samlet kollapset evalen fra 50 % til 18 % via kontekst-overflow.
  Arkitekturen er to-stegs (liten intent-klassifikator → fokusert per-arm-økt
  med kun armens skjema/verktøy) — bevar den formen.
- Hver endring i assistent-atferd SKAL ha cases i eval-korpuset
  (`ios/ZenjiTests/Fixtures/eval-corpus.json`) + mock-tester i samme PR.

## Skjermbilder / demo-harness

`ZENJI_DEMO`-miljøvariabelen (DEBUG) gir deterministiske tilstander for
skjermbilder og UI-tester: `lens`, `filter`, `uitest` (+ `ZENJI_UITEST_STATE`).
Bevis-policy: maks ~4 skjermbilder per flate, erstattede slettes i samme PR
(PLAN.md regel 8).

## Fysisk iPhone (gratis-team)

```bash
xcrun devicectl list devices                       # CoreDevice-UUID + state
xcodebuild -project Zenji.xcodeproj -scheme ZenjiDeviceDev \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=<team> build
xcrun devicectl device install app --device <CoreDevice-UUID> <path/til/.app>
xcrun devicectl device process launch --device <CoreDevice-UUID> app.zenji.ios
```

- **Kabel slår wifi:** `tunnelState: unavailable` i `devicectl device info
  details` betyr at trådløs-tunnelen ikke står — plugg kabel i stedet for å
  feilsøke nettet. (`device info details` kan vise CACHEDE data og se «ok» ut
  selv når enheten er utilgjengelig — sjekk `tunnelState`/`lastConnectionDate`.)
- Bygg mot `generic/platform=iOS` når xcodebuild ikke ser enheten som
  destinasjon; installer med devicectl (når den).
- Førstegangs launch krever manuell utvikler-trust på enheten (Innstillinger
  → Generelt → VPN og enhetsadministrering).

## Fallgruver som faktisk har bitt

- **Flere DerivedData-kataloger:** hver xcodegen-regenerering kan gi ny
  prosjekt-hash → `ls DerivedData/Zenji-*/…` plukker gjerne et GAMMELT
  produkt. Bruk `-derivedDataPath build/DerivedData` eller verifiser
  mtime/innhold (f.eks. `ZenjiBuildStamp` i Info.plist) før installering.
- **Target-medlemskap er eksplisitt:** widget-targetet lister Sync-filer
  enkeltvis, test-targetet lister mapper — en ny fil i Sync/ som DataStore
  refererer MÅ inn i widgetens liste, ellers brekker widget-bygget. project.yml
  har per-linje-begrunnelser; hold stilen.
- **Memberwise-init-rekkefølge:** nye view-properties må deklareres i samme
  rekkefølge som kallstedene sender argumentene.
- **XCUITest:** `typeText` med æøå er flaky (bruk ASCII-alias-ytringer);
  `.accessibilityIdentifier` på en container klemmer barnas identifiers —
  sett dem på løvnoder.
- **Parallell xcodebuild-last** (flere agenter på samme Mac) gir trege bygg og
  sporadiske simulator-feil («Busy»/timeouts) — re-kjør før du konkluderer
  med reell feil; maks ~4 samtidige xcodebuild-agenter.
- Versjonsstempel: post-build-scriptet i project.yml skriver `ZenjiBuildStamp`
  (siste ios/-commit, `-dirty` ved uskrevne endringer) — appen sammenligner
  mot publisert `docs/data/app-version.json` og viser «SISTE / NYERE FINNES»
  i assistent-foten. Endrer du appen: commit FØR du bygger til enhet, ellers
  stemples bygget `-dirty`.
