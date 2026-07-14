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
[tid HH:MM]  [tittel — inntil TO linjer, ALDRI trunkert]      [kanal]
 [• amber]   [meta: turnering — én dempet linje ved behov]
```

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
`HH:MM:SS` (amber, tikker — eneste bevegelse i appen). Assistent-inngang: mono-glyf
`»_` eller `◆` (IKKE pratebobler/emoji), dempet, høyre. Valgfri side-semantikk:
`P100` foran dato på brede flater (arven fra Tekst-TV-indeksen).

## Detaljark / assistent / widget

- Detaljark: flate-token, samme radspråk: venue · sammendrag · alle
  se-muligheter som lenkeliste · ⓘ-proveniens (confidence + kilder) for AI-events ·
  stille varsel-toggle. Ingen kort-i-kortet.
- Assistent: samme skjermspråk; diff i amber (ny) / dempet gjennomstreket (fjernet);
  forklaringer som rolig tekst, aldri alerts. «Hva jeg følger» = agendarader.
- Widget: mosaikk-ensō + neste must-see (tid · tittel · kanal) i tokens — en
  miniatyr-teletekstside, ikke en iOS-plakat.

## Bevegelse & lyd

Klokkens sekundtikk er appens eneste kontinuerlige bevegelse. Overganger:
umiddelbare eller ≤150 ms fade. Ingen spretne kurver, parallakse, konfetti,
haptikk-fest. `prefers-reduced-motion`/Reduce Motion: klokka viser HH:MM statisk.

## Stemme

Norsk, lavmælt, presis. «Kanal ukjent» ikke «Ingen streaming tilgjengelig!».
Aldri utropstegn i kromet. Feil forklarer hva og hvorfor, uten unnskyldninger.

## Forbudsliste (kort versjon til review)

Trunkerte titler · fortid i agendaen · emoji i krom · chevroner · glød/gradient/
skygge/blur · mer enn én aksentfarge · kort/paneler · badges med tall · pull-quotes
av engasjement · alt som ligner «AI-slop»-estetikk. Ved tvil: fjern.
