# Zenji designspråk

Normativ kontrakt for alle flater: web (docs/), iOS-app (ios/), widget, ikon.
Agenter som endrer UI leser dette FØRST og avviker aldri uten menneskelig ordre.
Verifisering: skjermbilder i begge temaer før merge; eieren er siste smaksinstans.

## Grunnlov (tre setninger)

1. **Ro i en skjerm full av støy** — hver flate er ett stille, skannbart svar på
   *når · hva · hvor ser jeg det*; alt som ikke tjener det svaret, fjernes.
2. **Ærlig digital** — Zenji er en skjerm som vet den er en skjerm (Tekst-TV-arv,
   mosaikk-ensō): kvantisert, flatt, presist. Aldri falsk-analog (ingen
   penselimitasjon, papirtekstur, glød, gradient, skygge, glassmorfisme).
3. **Ærlig innhold** — ukjent kanal er «–», AI-funn bærer ⓘ med kilder, tomhet
   forklares. Aldri lat som.

## Tokens

| Token | Mørk (DEFAULT) | Lys (varmt papir) |
|---|---|---|
| bakgrunn | `#0A0A0C` | `#F5F1E6` |
| flate (ark/detalj) | `#131316` | `#EDE8D9` |
| tekst | `#E8E6E0` | `#1D1B15` |
| dempet | `#8A877E` | `#6E6A5C` |
| amber (ENESTE aksent) | `#FFB000` | `#8F6400` |
| hårlinje | `#26251F` | `#D9D3C0` |
| live (semantisk, sparsom) | `#5BD990` | `#2E7D4F` |

- Mørk er merkevare-default; begge temaer likestilt polert. Aldri ren svart/hvit-inversjon.
- Amber brukes KUN til: wordmark, dagoverskrifter, must-see-prikk, klokke, valgt tilstand.
  Aldri til brødtekst, aldri to amber-elementer i samme rad.

**Typografi:** mono ÉN familie overalt (SF Mono/ui-monospace; web: samme stack).
Tabular numerals alltid. Skala (iOS pt / web rem): tittel 17/1.0 · tid 17 semibold ·
meta/kanal 15 dempet · dagoverskrift 13 uppercase +8 % sporing · header-wordmark 28 tung.
Dynamic Type respekteres (skaler hele skalaen, bryt aldri til trunkering).

**Rytme:** 4pt-grid. Rad: 12pt vertikal luft + hårlinje. Dagseksjon: 28pt før
overskrift, 10pt etter. Én kolonnebredde (maks 640pt på store flater, sentrert).

## Agendaens semantikk (BINDENDE — dette var feil i v1)

1. **I DAG først.** Deretter I MORGEN, så ukedag + dato, 7 dager frem. ALDRI
   passerte dager i agendaen.
2. **Pågående flerdagsevents bor under I DAG** med vindu i tidskolonnen
   («3.–11. juli» ERSTATTER klokkeslett — aldri i tillegg til tittel, aldri
   duplisert i tittelfeltet).
3. **Serie-kollaps** (≥4 events samme turnering): én rad, «neste: <etappe> i dag
   HH:MM», ekspanderes ved tapp.
4. **Live nå**: egen stille linje øverst under headeren når noe pågår
   (`▌ LIVE` i live-farge + tittel + kanal), maks to; ellers usynlig.

## Radens anatomi

```
[tid HH:MM]  [tittel — inntil TO linjer, ALDRI trunkert]
 [• amber]   [meta: turnering · runde · kanal — én dempet linje]
```
(Kanalen bor i meta-linjen — realisert slik i både iOS og web; den krymper
aldri tittelen.)

- Tid: fast venstre kolonne, semibold, tabular. Flerdagsvindu i samme kolonne.
- **Titler trunkeres aldri** — to linjer, deretter omformuler datakilden (aldri «…»).
- Kanal: høyre, dempet, krymper ALDRI tittelen (tittel har prioritet; kanal kan
  gå til egen linje under på smale skjermer). Ukjent: «–» i dempet.
- Must-see: amber-prikk venstre for tid. **Prikken er hele språket** — 🔔 og
  all annen emoji i kromet er FORBUDT (emoji tillatt kun i redaksjonell brødtekst).
- Varslings-tilstand vises IKKE i raden (den bor i detaljarket som stille toggle).
- **Ingen chevroner.** Hele raden er tappbar; det signaliseres av rytme, ikke pil.
  ⓘ-glyf (mono, dempet) KUN på AI-research-events — åpner proveniens.

## Header

`ZENJI` (amber, tung mono) · dato («TIRSDAG 14. JULI», dempet) · levende klokke
`HH:MM:SS` (amber, tikker). Assistent-glyf: mono `»_` (IKKE pratebobler/emoji),
dempet, høyre — en FOKUS-SNARVEI til kommandolinjen nederst (ikke en egen skjerm;
se «Assistent»). Valgfri side-semantikk: `P100` foran dato på brede flater
(arven fra Tekst-TV-indeksen).

**Tema-overstyring (BINDENDE, gjelder alle flater):** én mono-glyf i headeren,
dempet, ved siden av assistent-glyfen, sykler system → mørk → lys → system ved
tapp, kvantisert tilstand (`◐` auto / `●` mørk / `○` lys), persistert og
appliseres på hele flaten (ingen egen innstillingsskjerm) — web har allerede
sin theme-toggle (`docs/js/dashboard.js`); iOS speiler den (`ThemeOverride.swift`
+ `.preferredColorScheme` på appens rot i `ContentView`).

## Detaljark / assistent / widget

- Detaljark: flate-token, samme radspråk: venue · sammendrag · alle
  se-muligheter som lenkeliste · ⓘ-proveniens (confidence + kilder) for AI-events ·
  stille varsel-toggle · KONTEKST-HANDLINGER (se Assistent). Ingen kort-i-kortet.
- Widget: mosaikk-ensō + neste must-see (tid · tittel · kanal) i tokens — en
  miniatyr-teletekstside, ikke en iOS-plakat.

## Assistent (kommandolinjen ER grensesnittet)

Assistenten er ikke et rom bak en knapp — den er inngangen. «Assistenten ER
grensesnittet.» Normativt (BINDENDE):

- **Kommandolinjen**: en fast, stille prompt-linje NEDERST i agendaen, over
  safe-area, på hver skjerm — den PRIMÆRE inngangen. Anatomi: mono `»_`-sigill
  (venstre, dempet, trykkbart = åpner assistent-oppslaget) · tekstfelt
  («Skriv eller spør …») · blinkende `▌`-blokkmarkør i amber (høyre). Markøren er
  appens eneste bevegelse utenom klokka; Reduce Motion ⇒ statisk. Header-glyfen
  er kun en fokus-snarvei hit.
- **Intent-dualitet**: linjen forstår BÅDE profil-endringer OG spørsmål. Ett svar
  er enten mutasjoner (diff) ELLER et svar over LOKAL agenda-data (aldri sky).
  Spørsmål besvares rolig på norsk med referanse til radene (tid · tittel · kanal).
- **Forslag/diff som ark**: resultater vises som et flatt ark (flate-token) som
  toner inn (≤150 ms fade) OVER agendaen, med kommandolinjen synlig under (aldri
  en egen skjerm). Diff-tegn: `+` grønn (ny) · `±` amber (endret) · `−` rød
  (fjernet) — grønn/rød er SEMANTISKE signalfarger (som live-fargen), sparsomt
  brukt, aldri en andre aksent. Forklaringer som rolig tekst, aldri alerts.
  «Hva jeg følger» + «Det jeg ikke forsto» nås fra stille oppslag NEDERST i
  samme ark.
- **Tenke-tilstand**: mens modellen jobber blinker markøren i linjen og viser en
  dempet «tenker …» + «Avbryt». ALDRI en spinner. Alltid avbrytbar.
- **Umiddelbar konsekvens**: Bekreft ⇒ arket toner bort (≤150 ms) ⇒ profilen
  appliseres ⇒ agendaen re-kompileres synlig med det samme.
- **Kontekst-handlinger** (i detaljarket): «Følg <entitet>» (forhåndsutfylt
  mutasjon gjennom den vanlige diff/bekreft-flyten) og «Hvorfor vises denne?»
  (den deterministiske relevans-grunnen). Samme rolige radspråk.
- Ærlighet: er Apple Intelligence av, sier arket det rett ut — aldri falsk
  degradering til nøkkelord.

## Bevegelse & lyd

Klokkens sekundtikk og kommandolinjens blinkende `▌`-markør er appens eneste
kontinuerlige bevegelser. Overganger: umiddelbare eller ≤150 ms fade (assistent-
arket toner inn/ut). Ingen spretne kurver, parallakse, konfetti, haptikk-fest,
spinnere. `prefers-reduced-motion`/Reduce Motion: klokka viser HH:MM statisk og
markøren står stille.

## Stemme

Norsk, lavmælt, presis. «Kanal ukjent» ikke «Ingen streaming tilgjengelig!».
Aldri utropstegn i kromet. Feil forklarer hva og hvorfor, uten unnskyldninger.

## Forbudsliste (kort versjon til review)

Trunkerte titler · fortid i agendaen · emoji i krom · chevroner · glød/gradient/
skygge/blur · mer enn én aksentfarge · kort/paneler · badges med tall · pull-quotes
av engasjement · alt som ligner «AI-slop»-estetikk. Ved tvil: fjern.
