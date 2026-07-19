# Sportivista designsystem — Apple-native baseline

Dette er den **levende designkontrakten**. iOS-appen og widgeten følger denne
Apple-native baselinen: systemfont, semantiske system-farger, SF Symbols, native
lister/sheets/navigasjon — med **amber som eneste aksent-token**. Web (`docs/`)
følger nå de samme baseline-tokenene (se § Cross-surface).

> **Om den senere rebrandingen:** Vi kommer sannsynligvis til å gjøre en full
> rebranding (nytt navn — «Zenji» oppleves for lite intuitivt — og en egen
> designprofil) på sikt. Dette dokumentet er DERFOR bevisst bygget som et tynt,
> byttbart token-lag oppå Apples plattform: rebrandingen skal bli en **re-skin**
> (nye token-verdier, font, ikoner, logo), ikke en ombygging. Alt merkevare-
> bærende er isolert i § Tokens. Kjernefunksjonaliteten og UX-en mot hovedmålet
> herdes FØRST, det kosmetiske byttes ETTERPÅ.

Normativ kontrakt for alle flater: web (docs/), iOS-app (ios/), widget, ikon.
Verifisering: HIG-sjekklista (§ HIG-samsvar) + skjermbilder i begge temaer og
ved forstørret Dynamic Type før merge. Eieren er siste smaksinstans.

---

## Grunnlov

1. **Ro i en skjerm full av støy** — hver flate er ett stille, skannbart svar på
   *når · hva · hvor ser jeg det*. Dette er ren Apple *deference* (innhold først).
2. **Native der det finnes** — bruk Apples egne kontroller, navigasjon, typografi
   og bevegelse. Vi etterligner dem aldri når vi kan bruke dem; da arver vi
   tilgjengelighet, kjennskap og samsvar gratis.
3. **Ærlig innhold** — ukjent kanal er «–», AI-funn bærer en `info`-markør med
   kilder, tomhet forklares. Aldri lat som.
4. **Skall er tokens** — alt merkevare-bærende (farge, font-rolle, ikon, bevegelse)
   er en token, aldri hardkodet i en komponent. Så en rebranding er et bytte.

## Visjon (fryst) vs. skall (byttbart)

| Fryst — visjon (overlever rebrand) | Byttbart — skall (tokens) |
|---|---|
| Rolig én-formåls agenda (når·hva·hvor) | Aksentfarge |
| Korrekt tid/streaming + dekning | Bakgrunn / flate / tekst-farger |
| Ambient, kontekstbevisst hjelper | Font-familie / rolle |
| Personvern på enheten, ærlighet | Ikon-sett |
| Følg / linser / spoilervern / varsler | Bevegelses-signatur, navn/logo |

## Tokens

Alle farger er **semantiske**, ikke rå hex i komponentene. Verdiene under er
Apple-system-farger + én amber-aksent. Ved rebrand endres KUN denne tabellen.

> **Maskinlesbar fasit:** [`design/tokens.json`](design/tokens.json) speiler denne
> tabellen (+ typografi/spacing/radius) i W3C design-tokens-format; koherens-testen
> `tests/design-tokens.test.js` håndhever takten mellom denne prosa-tabellen,
> `docs/css/base.css` og `ios/Sportivista/DesignTokens.swift` — drift på noen av de
> tre er en CI-feil, ikke en stille rettelse.

### Farge

| Token | Rolle | Mørk | Lys |
|---|---|---|---|
| `background` | sideflate | `#000000` | `#F2F2F7` |
| `groupedBackground` | bak grupperte lister | `#000000` | `#F2F2F7` |
| `cell` | liste-/kort-flate | `#1C1C1E` | `#FFFFFF` |
| `cell2` | nøstet/hevet flate | `#2C2C2E` | `#FFFFFF` |
| `label` | primærtekst | `#FFFFFF` | `#000000` |
| `secondaryLabel` | meta/kanal/dempet | `rgba(235,235,245,.6)` | `rgba(60,60,67,.6)` |
| `tertiaryLabel` | fainter, ett hakk under dempet | `rgba(235, 235, 245, 0.3)` | `rgba(60, 60, 67, 0.3)` |
| `separator` | hårlinje/skille | `rgba(84,84,88,.6)` | `#C6C6C8` |
| **`accent`** | **ENESTE aksent (amber)** | `#FFB000` | `#9A6800` |
| `live` / `good` | direkte / positiv (systemGreen) | `#30D158` | `#34C759` |
| `destructive` | slett/nullstill (systemRed) | `#FF453A` | `#FF3B30` |

- Foretrekk `Color(.systemBackground)`, `.secondaryLabel`, `.separator` osv.
  direkte der de finnes; `accent`/`live`/`destructive` er egne token-farger.
- **Amber brukes KUN til aksent:** valgt tilstand, tinting av bar-knapper,
  must-see-prikk, varsel-på, primær-knapp. Aldri brødtekst, aldri to i samme rad.
- Aldri ren svart/hvit-inversjon — bruk system-flatene (grouped/cell) for dybde.

### Typografi (BINDENDE — Dynamic Type)

- **Systemfont** (San Francisco) overalt, via SwiftUIs tekststiler — ALDRI faste
  `.system(size:)`-punkter. Hver rolle bindes til en tekststil så teksten
  skalerer med brukerens innstilling.
- **Tabular tall** (`.monospacedDigit()`) i tidskolonnen og alle steder sifre
  skal rette seg inn.
- Bryt aldri til trunkering når teksten vokser — omform kilden.

| Rolle | Tekststil (iOS) | Web |
|---|---|---|
| Ordmerke (masthead) | `.title` bold | `1.75rem` |
| Seksjonstittel | `.headline` | `1.0rem` semibold |
| Radtittel | `.body` | `1.0rem` |
| Tid (rad) | `.body` semibold + `monospacedDigit` | tabular |
| Meta / kanal | `.subheadline`, `secondaryLabel` | `.9rem` dempet |
| Gruppeoverskrift | `.footnote` uppercase, `secondaryLabel` | `.8rem` |
| Caption | `.caption` | `.75rem` |

### Rytme & layout

- 8pt-basisgrid (4pt for finjustering). Radhøyde ≥ 44pt.
- Inset-grupperte lister: kort med 12pt hjørne, skille innrykket til
  tekststart (ikke full bredde).
- Én lesekolonne, maks 640pt på store flater (iPad/web), sentrert.

### Ikoner

- **SF Symbols** for alle standard-handlinger — de skalerer med Dynamic Type,
  retter seg inn med tekst og har innebygd tilgjengelighet.

| Handling | Symbol | A11y-label (no) |
|---|---|---|
| Innstillinger / Deg | `gearshape` | «Innstillinger» |
| Varsel av/på | `bell` / `bell.fill` (amber når på) | «Varsel på/av» |
| AI-proveniens | `info.circle` | «Funnet av AI» |
| Se-lenke | `arrow.up.forward` | «Åpne <kanal>» |
| Følg | `plus.circle` | «Følg <navn>» |
| Demp/skjul | `eye.slash` | «Demp» |
| Del | `square.and.arrow.up` | «Del profil» |
| Nullstill/slett | `trash` | «Nullstill» |
| Diktering | `mic` | «Diktér» |
| Spoiler skjult | `eye.slash` | «Skjult — spoilervern på» |

- Egne (ikke-SF) glyfer kun der ingen SF Symbol passer OG a11y-label finnes.
  Dekorative glyfer: `accessibilityHidden`.

### Bevegelse & haptikk

- **Navigasjon:** Apples native push/sheet/tilbake-swipe. Ingen egendefinerte kurver.
- **Liquid Glass (iOS 26 — BINDENDE presisering):** plattformens kontroll-materiale
  er *native*, ikke dekor. Standard-komponenter arver det automatisk (bygg mot
  iOS 26-SDK, aldri `UIDesignRequiresCompatibility`-opt-out); appens egne
  kontroll-flater (kommandolinja) adopterer `glassEffect` og flyter over innholdet
  (`safeAreaInset`). Glass hører KUN til kontroll-laget — innhold (agenda-rader,
  detaljark-innhold) glasses ALDRI. Egenlaget blur/glassmorfisme er fortsatt
  forbudt; det historiske forbudet gjaldt DIY-dekor, ikke systemmaterialet.
- **Hjelperens resultat:** native `.sheet` med `.presentationDetents`
  (grabber, dra-ned) — ikke et egendefinert fade-lag.
- **Haptikk (sparsom):** `.sensoryFeedback(.success, …)` på Bekreft,
  `.selection` på toggle, lett `.impact` på «varsel satt». Aldri på scroll/hvert tapp.
- **Reduce Motion:** ingen spring; overganger blir kryss-fade; ingen haptikk.
- Ingen spinnere (bruk innhold/skjelett), ingen parallakse/konfetti.

> Note: den amber-tikkende klokka og «P-nummer»-arven fra v2 er FJERNET — de var
> skall, ikke visjon. Tid bor i raden + systemets statusbar.

## Navigasjon & informasjonsarkitektur

- **`NavigationStack` med agendaen som rot.** Ingen tab bar (én permanent
  fane-rad for en sjelden-brukt «Deg» er for tungt krom).
- **Rotens to sider (Claude Design-handoff 19.07.2026):** en segmented med ORD
  under headeren — **«Uka | Nyheter»**. Begge dekker hele uka; skillet er hva
  som *skjer* (agendaen) vs. hva som er *nytt* (§ Nyheter). Ord, aldri ikoner.
- **`gearshape` i nav-baren (trailing)** pusher **Deg**-skjermen (§ Deg).
- **Detaljer** vises som native `.sheet` (detents) eller push i agendaens stakk.
- **Ett navigasjonsmønster:** rad → detalj (push/sheet med ‹ tilbake); aldri
  gester som eneste vei.
- **Hjelperen** er en kapsel-KNAPP nederst på agenda/Nyheter som åpner
  samtalearket (§ Hjelperen) — ikke en fane, ikke et inline-felt. Bunnen
  tilhører hjelperen alene.

## Agendaen (rot-skjermen)

Native `List`, inset-gruppert per dag. Bindende semantikk (uendret fra v2):

1. **I DAG først**, så I MORGEN, så ukedag + dato, 7 dager frem. Aldri passerte dager.
2. **Pågående flerdagsevents bor under I DAG** med vindu i tidskolonnen.
3. **Serie-kollaps** (≥4 events samme turnering): én rad, ekspanderes ved tapp.
4. **Live nå:** egen stille seksjon/rad øverst (`live`-farge) når noe pågår, maks to.
5. **Presentasjonsfilter:** en stille linje over lista + ett-trykks nullstilling.

### Radens anatomi (native List-rad)

```
[• amber]  [tid]  [⛳︎] [tittel               ] [🔔] [›]
                       [turnering · runde · kanal]
```

- **Must-see:** liten amber-prikk (leading). Prikken er signalet — ingen emoji.
- **Sport-symbol (rev. 19.07, eier-funn):** ett stille SF-symbol per sport
  mellom tid og tittel (`tertiaryLabel`, aldri farget) — «hva slags event»
  lesbart på et blunk uten å lese metateksten. Én kanonisk sport→symbol-tabell
  (`soccerball`, `figure.outdoor.cycle`, `figure.golf`, `tennisball`, …,
  fallback `calendar`) delt av rad, detalj og Nyheter. Symbol, aldri emoji/logo.
- **Tid:** tabular, semibold, fast venstrekolonne. Flerdagsvindu i samme kolonne.
- **Tittel:** `.body`, inntil to linjer, ALDRI trunkert til «…».
- **Kanal:** `secondaryLabel` i meta-linjen; ukjent = «–». Krymper aldri tittelen.
- **Varsel:** `bell.fill` (amber) trailing KUN når raden armerer en påminnelse.
- **AI-funn:** `info.circle` trailing; tapp på raden åpner detalj med kilder.
- **Disclosure:** native chevron (`List` gir den) — trykkbarhet er tydelig,
  raden har pressed-state og button-rolle gratis.
- **Sveip-handlinger:** venstre → Følg / Demp / Påminn der det er meningsfullt.

### Event-detalj (native sheet, detents `[.medium, .large]`)

Seksjoner: Arena · Om · **Hvor ser jeg det** (lenker) · **Funnet av AI**
(confidence + kilder, kun AI-events) · **Varsel** (stille status) · **Resultat**
(spoiler-maskert bak tapp når spoilervern er på). Ingen kort-i-kortet.

## Hjelperen (ambient, kontekstbevisst)

Visjonens kjerne, bygd som native mønstre — ikke en bespoke kontroll.

Rev. 19.07.2026 (Claude Design-handoff «Intuitivt for alle»): inline-linja er
erstattet av kapsel-knapp + samtaleark. Full tilstandsspec i
`design/specs/assistent-nyheter-v0.md`.

- **Kapsel-knappen** nederst (flytende Liquid Glass-flate, `glassEffect` +
  `safeAreaInset`; agendaen scroller under): ledende assistent-symbol +
  «Spør, eller be om noe …» + `mic`, i EKTE `Capsule`-form. Hele flaten er én
  knapp (button-rolle, ≥44 pt) som åpner samtalearket; mic hopper rett i
  diktering. Ingen inline-skriving i roten. (Rev. 19.07 eier-funn: uten
  ledende symbol leses den grå teksten som et dødt tekstfelt — Maps-mønsteret
  krever ankersymbolet.)
- **Samtalearket** (native sheet, grabber/dra-ned/tapp-utenfor): én setning
  («Skriv eller snakk — helt vanlig norsk.») + tre TRYKKBARE eksempelrader
  (følg-et-lag → Legg til-søket · spørsmål · kommando) + felt nederst.
  Feltet vokser til ~4 linjer (Meldinger-mønsteret); send = amber primærknapp;
  retur gir linjeskift. Diktering: bølge erstatter feltet, transkripsjonen
  lander i feltet — du sender selv.
- **Svar i tråden:** svaret lander i SAMME ark — din melding som boble,
  diff (`+` grønn / `±` amber / `−` rød) med Bekreft/Avvis eller rolig svar
  som kort under; «Følg opp …» er ett felt unna. Forstår BÅDE profil-endringer
  OG spørsmål.
- **Snarvei, aldri eneste vei:** alt arket kan (følg, endre, varsler) finnes
  også som vanlige lister/knapper (§ Deg: Det du følger + Legg til; Følg-knapp
  i event-detaljen).
- **Kontekstbevisst:** agenda → følg/spør om tavla; detaljark → forhåndsscopet
  til eventet («Følg <lag>», «Påminn meg», «Hvorfor vises denne?»); Deg →
  innstillinger i naturlig språk.
- **Tenke-tilstand:** dempet «tenker …» + Avbryt, aldri en spinner.
- **Umiddelbar konsekvens:** Bekreft ⇒ arket lukkes ⇒ agendaen re-kompileres.
- **Ærlighet:** Apple Intelligence av ⇒ si det rett ut, aldri falsk degradering.

## Nyheter (rotens andre side)

Tavla fra Claude Design-handoffen (2b «For deg») — bygget mot VISJON v3/WP-100.
**Radens DNA = agendaens:** type-tag (når kjent) · én faktalinje · entitet ·
kilder ut (↗) · relativ tid. ALDRI innbakt artikkeltekst, aldri AI-sammendrag
av én enkelt kilde (DSM art. 15) — pekerne sender trafikken ut.

- **Fire seksjoner, ferdig — tavla er endelig:** I DIN VERDEN I DAG
  (editorial-tverrsnitt over egne data, proveniens-ⓘ) · NYTT (linse-matchede
  pekere) · RESULTAT (alltid bak «Vis resultat» når spoilervern gjelder,
  `eye.slash`) · FREMOVER (forvarsler utover dagens horisont).
- Ingen uleste-tellere, ingen engasjements-mekanikk. Stille «Det du følger»-
  lenke øverst.

## Deg-skjermen

Pushet fra `gearshape`. Native inset-gruppert `List` (SF Symbols leading,
verdi + chevron trailing). Grupper:

- **PROFIL:** Det du følger (n — vanlig liste, rad → detalj med endringer og
  «Slutt å følge», + **Legg til**-søk mot entitets-indeksen med Følg-knapper)
  · Sett opp på nytt.
- **DATA OM MEG:** Hva jeg vet om deg (n) · Det jeg ikke forsto (n) · Del profil (QR).
- **APP:** Varsel før start (leadMinutes) · Utseende (tema) · Nullstill.
- **FOT:** «BYGG <sha> · dato · SISTE / NYERE FINNES» (dempet).
- **DEBUG (kun DEBUG-bygg):** Eval · Telemetri (MetricKit).

Destruktive rader → ett rolig bekreftelses-ark (aldri system-alert var påkrevd,
men native `confirmationDialog`/sheet er nå tillatt): eksakt konsekvens i én
setning + Nullstill/Avbryt.

## Tema

Følger systemet via semantiske farger. Manuell overstyring (system → mørk → lys)
er en enhets-preferanse under **Deg › Utseende** (ikke lenger en header-glyf),
persistert, appliseres på appens rot. Overlever enhver profil-nullstilling.

## HIG-samsvar (BINDENDE sjekkliste)

Fordi baselinen bruker Apples kontroller, arves mesteparten. Hver UI-endring
skal likevel bestå denne før merge; håndhev det som kan håndheves i CI:

- [ ] **Dynamic Type:** all tekst via tekststiler; ingen isolert `.system(size:)`.
      *CI-gate:* en test feiler på nye faste størrelser i `Zenji/`.
- [ ] **Kontroller:** `List`/`Button` med pressed-state + a11y-rolle; ingen
      naken `.onTapGesture`-rad.
- [ ] **Tastatur:** keyboard avoidance verifisert; clear-knapp; diktering; autocap av for egennavn.
- [ ] **VoiceOver:** hver kontroll har label; dekorasjon skjult; logisk rekkefølge.
- [ ] **Tapp-mål:** ≥44×44 pt.
- [ ] **Kontrast:** tekst mot flate ≥ WCAG AA (amber-verdiene er valgt for dette).
- [ ] **Reduce Motion + Dark/Light:** begge respektert.
- [ ] **Modalitet:** native `.sheet` (grabber/detents) for ark.
- [ ] **Verifisering:** skjermbilder i BEGGE temaer + minst ett ved forstørret Dynamic Type.

## Cross-surface & innhold

- **iOS-app + widget = baseline (nå).** Begge følger denne kontrakten fullt ut;
  widgeten er en miniatyr av samme språk (semantiske farger + Dynamic Type).
- **Web (docs/) = baseline (nå).** Unntaket er lukket: `docs/`-flaten følger de
  samme § Tokens-verdiene som appen — system-font-stacken, Apple-system-fargene
  (true-black `#000000`-side i mørk, `#F2F2F7` grouped-light) og amber som eneste
  aksent. Verdiene er tokenisert i `base.css` og skal stå verifiserbart mot
  denne tabellen. Web beholder sine egne layout-detaljer (én kolonne maks 640px,
  dag-gruppert agenda), men fargene og typografien er baseline. Det historiske
  Tekst-TV-uttrykket (mono type-stack, near-black `#0A0A0C`, varmt-papir) er
  dermed avviklet.
- **Klokke-paritet (WP-128):** den sekundtikkende amber-klokka i web-headeren er
  **FJERNET** — datoen består, tid bor i raden (samsvar med § Bevegelse og iOS).
- **Tema-glyf-unntak (WP-128):** web beholder tema-toggle-glyfen ◐ i headeren
  (system → mørk → lys) som et *bevisst* unntak fra § Tema. iOS flyttet temavalget
  til Deg › Utseende, men web har ingen Deg-skjerm, så header-glyfen er den eneste
  plassen det kan bo.
- **Sport-symbol-unntak (WP-128):** § Radens anatomis per-sport SF-symbol gjelder
  KUN native flater. Web har ingen SF Symbols, og emoji/logo i kromet er forbudt
  (§ Forbudsliste), så web signaliserer sport gjennom innholdet (tittel + meta),
  ikke en per-rad-glyf. Et eget web-ikonsett innføres ikke bare for dette.
- **Stemme:** norsk, lavmælt, presis. «Kanal ukjent», ikke «Ingen streaming!».
  Aldri utropstegn i kromet. Feil forklarer hva og hvorfor.

## Forbudsliste

Faste punktstørrelser som ignorerer Dynamic Type · `.onTapGesture`-rader uten
pressed-state/a11y-rolle · trunkerte titler · fortid i agendaen · mer enn én
aksentfarge (amber) · to amber-elementer i samme rad · badges med tall ·
spinnere · haptikk-fest · egendefinerte overgangskurver der Apple har en native ·
egenlaget blur/glassmorfisme (system-Liquid Glass på kontroll-laget er native og
påkrevd; DIY-glass — særlig på innhold — er forbudt) ·
egne ikoner der en SF Symbol finnes · «AI-slop»-estetikk. Ved tvil: fjern.
