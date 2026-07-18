# Zenji designsystem — Apple-native baseline

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
- **`gearshape` i nav-baren (trailing)** pusher **Deg**-skjermen (§ Deg).
- **Detaljer** vises som native `.sheet` (detents) eller push i agendaens stakk.
- **Hjelperen** er en fast linje nederst på agenda (og Deg), ikke en fane
  (§ Hjelperen). Bunnen tilhører hjelperen alene.

## Agendaen (rot-skjermen)

Native `List`, inset-gruppert per dag. Bindende semantikk (uendret fra v2):

1. **I DAG først**, så I MORGEN, så ukedag + dato, 7 dager frem. Aldri passerte dager.
2. **Pågående flerdagsevents bor under I DAG** med vindu i tidskolonnen.
3. **Serie-kollaps** (≥4 events samme turnering): én rad, ekspanderes ved tapp.
4. **Live nå:** egen stille seksjon/rad øverst (`live`-farge) når noe pågår, maks to.
5. **Presentasjonsfilter:** en stille linje over lista + ett-trykks nullstilling.

### Radens anatomi (native List-rad)

```
[• amber]  [tid]  [tittel                    ] [🔔] [›]
                  [turnering · runde · kanal   ]
```

- **Must-see:** liten amber-prikk (leading). Prikken er signalet — ingen emoji.
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

- **Bunn-linje** på agenda + Deg: et native tekstfelt i søke-/skrivelinje-form
  (`mic` for diktering, send/retur), som en **flytende Liquid Glass-flate**
  (`glassEffect` + `safeAreaInset` — Safari-bunnfeltet-mønsteret; agendaen
  scroller under). Forstår BÅDE profil-endringer OG spørsmål.
- **Resultat i native sheet** (detents): diff (`+` grønn / `±` amber / `−` rød,
  semantiske signalfarger) med Bekreft/Avvis, eller et rolig svar over LOKAL data.
- **Kontekstbevisst:** agenda → følg/spør om tavla; detaljark → forhåndsscopet
  til eventet («Følg <lag>», «Påminn meg», «Hvorfor vises denne?»); Deg →
  innstillinger i naturlig språk.
- **Oppdagbarhet (tre tilstander):** hvile = konkret eksempel-placeholder ·
  fokus = en rad kontekst-forslag stiger opp · skriving = live grunning mot
  entitets-indeksen (velg, ikke stav). Ingen permanent krom.
- **Tenke-tilstand:** dempet «tenker …» + Avbryt, aldri en spinner.
- **Umiddelbar konsekvens:** Bekreft ⇒ sheet lukkes ⇒ agendaen re-kompileres.
- **Ærlighet:** Apple Intelligence av ⇒ si det rett ut, aldri falsk degradering.

## Deg-skjermen

Pushet fra `gearshape`. Native inset-gruppert `List` (SF Symbols leading,
verdi + chevron trailing). Grupper:

- **PROFIL:** Hva jeg følger (n) · Sett opp på nytt.
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
  dag-gruppert agenda, den tikkende amber-klokka i toppen), men fargene og
  typografien er baseline. Det historiske Tekst-TV-uttrykket (mono type-stack,
  near-black `#0A0A0C`, varmt-papir) er dermed avviklet.
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
