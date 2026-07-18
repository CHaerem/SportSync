---
name: ios-dev
description: Hvordan bygge, teste, evaluere og enhets-installere iOS-appen (Sportivista) effektivt — kommandoer, harness-moduser og fallgruvene som faktisk har bitt. Bruk ved ALT arbeid under ios/ (bygg, test, FM-eval, skjermbilder, installering på fysisk iPhone).
---

# Playbook: iOS-utvikling (Sportivista)

`ios/README.md` er subsystem-kartet (les den for arkitektur); dette er den
operasjonelle hurtigreferansen for å JOBBE i treet uten å gå i kjente feller.

## Grunnsyklus

```bash
cd ios
xcodegen generate            # ALLTID etter endring i project.yml eller nye/slettede filer
xcodebuild test -scheme Sportivista -destination 'platform=iOS Simulator,name=iPhone 17'
```

- **Schemes:** `Sportivista` (app + hele unit-suiten, hostless), `SportivistaUITests`
  (UI-flytene, egen scheme så unit-kjøringen holder seg rask),
  `SportivistaDeviceDev` (fysisk enhet, gratis-team), `SportivistaWidgetExtension`.
- Full verifisering før PR: unit-suiten + alle fire schemes bygger + (ved
  UI-nære endringer) UI-suiten én gang.
- De 13 gylne feed-vektorene (`FeedVectorTests`) skal ALLTID være bit-like —
  de er dommeren for all kompilerings-/matching-semantikk.

## FM-eval (assistent-kvalitet mot EKTE modell)

Foundation Models kjører i Simulator på denne Macen (Apple Intelligence på
verts-Macen). CI/mock ser aldri disse feilene — evalen er eneste fasit.

```bash
# Full eval (~25 min, 55+ cases) — opt-in, aldri i vanlige suite-kjøringer:
TEST_RUNNER_SPORTIVISTA_REALFM_EVAL=1 xcodebuild test -scheme Sportivista \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:SportivistaTests/RealFMEvalTests
# Billig iterasjon: filtrer på kategori eller enkelt-case:
#   TEST_RUNNER_SPORTIVISTA_EVAL_CATEGORY=canon,command …
#   TEST_RUNNER_SPORTIVISTA_EVAL_CASE=<case-id> …
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
  (`ios/SportivistaTests/Fixtures/eval-corpus.json`) + mock-tester i samme PR.

## Skjermbilder / demo-harness

`SPORTIVISTA_DEMO`-miljøvariabelen (DEBUG) gir deterministiske tilstander for
skjermbilder og UI-tester: `lens`, `filter`, `uitest` (+ `SPORTIVISTA_UITEST_STATE`).
Bevis-policy: maks ~4 skjermbilder per flate, erstattede slettes i samme PR
(PLAN.md regel 8).

## Fysisk iPhone (betalt team siden WP-17, 18.07.2026)

Teamet `9LVCB72DT8` er BETALT (Individual-enrollment konverterte gratis-teamet
in place — samme ID). Device-bygget signerer nå med fulle entitlements (App
Group + CloudKit via `-D SPORTIVISTA_CLOUDKIT`) og embedder widgeten; signering
ligger på target-nivå i project.yml, så CLI-overrides trengs ikke lenger:

```bash
xcrun devicectl list devices                       # CoreDevice-UUID + state
xcodebuild -project Sportivista.xcodeproj -scheme SportivistaDeviceDev \
  -destination 'generic/platform=iOS' -derivedDataPath <DD> \
  -allowProvisioningUpdates build
xcrun devicectl device install app --device <CoreDevice-UUID> <path/til/.app>
xcrun devicectl device process launch --device <CoreDevice-UUID> app.sportivista.ios
```

- **«No Accounts» fra xcodebuild** betyr at Xcode-GUI-sesjonen er utløpt (skjer
  gjentatte ganger): be eieren logge inn i Xcode → Settings → Accounts. Merk at
  innloggingen kan ta noen sekunder å flushe til disk — retry før du feilsøker
  mer. Robust alternativ når ASC API-nøkkel finnes: `-authenticationKeyPath/-ID/
  -IssuerID` på xcodebuild (trenger ingen GUI-sesjon).

## TestFlight-opplasting (WP-17, virket 18.07.2026)

ASC API-nøkkel: `NHMW747CLA` i `~/.appstoreconnect/private_keys/`, issuer
`5bd032fd-ad09-468e-b168-1accd8f70326`, rolle App Manager. App-id `6792373768`.

```bash
xcodebuild -project Sportivista.xcodeproj -scheme SportivistaDeviceDev \
  -destination 'generic/platform=iOS' -archivePath <path>.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath <path>.xcarchive \
  -exportOptionsPlist <plist> -allowProvisioningUpdates   # method app-store-connect, destination upload
```

- **App Manager-nøkkelen kan IKKE cloud-signere** («Cloud signing permission
  error») — kjør exportArchive UTEN auth-flaggene så Xcode-kontosesjonen
  signerer distribusjonen; nøkkelen brukes til API-kall (grupper/testere/
  byggstatus — se JWT-mønsteret: ES256 + dsaEncoding ieee-p1363 i node).
- **TARGETED_DEVICE_FAMILY må stå per target** — XcodeGen setter "1,2" på
  target-nivå som overstyrer prosjekt-settings; "1,2" trigger iPad-
  multitasking-kravet om alle fire orienteringer i App Store-valideringen.
- `ITSAppUsesNonExemptEncryption: false` ligger i begge app-Info.plists så
  bygg slipper compliance-spørsmålet og blir tilgjengelige umiddelbart.
- **Opplastings-ritualet (rekkefølgen er kontrakten):** (1) bump
  `CURRENT_PROJECT_VERSION` i project.yml (hver opplasting trenger nytt
  byggnummer — NB: `CFBundleVersion`/`CFBundleShortVersionString` i
  info.properties MÅ referere `$(CURRENT_PROJECT_VERSION)`/`$(MARKETING_VERSION)`;
  XcodeGen baker ellers bokstavelig «1» og opplastingen avvises som duplikat),
  (2) commit så ios/-treet er RENT (dirty tre gir `-dirty`-stempel som aldri
  matcher), (3) arkiver + last opp, (4) `node scripts/record-testflight.js
  <bygg> <versjon>` + commit — skriver scripts/config/testflight.json (utenfor
  ios/ med vilje), som build-events folder inn i app-version.json slik at
  TestFlight-bygg dømmes mot siste OPPLASTING, ikke siste commit («SISTE»-
  logikken i AppVersionCheck godtar begge).

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
  prosjekt-hash → `ls DerivedData/Sportivista-*/…` plukker gjerne et GAMMELT
  produkt. Bruk `-derivedDataPath build/DerivedData` eller verifiser
  mtime/innhold (f.eks. `SportivistaBuildStamp` i Info.plist) før installering.
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
- Versjonsstempel: post-build-scriptet i project.yml skriver `SportivistaBuildStamp`
  (siste ios/-commit, `-dirty` ved uskrevne endringer) — appen sammenligner
  mot publisert `docs/data/app-version.json` og viser «SISTE / NYERE FINNES»
  i assistent-foten. Endrer du appen: commit FØR du bygger til enhet, ellers
  stemples bygget `-dirty`.
