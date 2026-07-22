# Sportivista — stemmen (mikrocopy)

Dette er stemme-kontrakten for all brukersynlig tekst i Sportivista: rad-etiketter,
knapper, tomme tilstander, feil, bekreftelser, assistent-svar, onboarding. Den
**beskriver stemmen som allerede finnes i produktet** — hvert eksempel under er sitert
fra kodebasen — så agenter og mennesker kan skrive ny copy som lyder likt.

Forholdet til de andre kontraktene:
- `DESIGN.md` § Cross-surface har stemmen i tre linjer («norsk, lavmælt, presis …»).
  Denne fila er den utfyllende siden bak de tre linjene.
- `design/brand/BRAND.md` eier MERKET (ordmerke, kolon, ikon, tagline). Denne fila eier
  ORDENE.
- Stemmen er en del av det **fryste** laget i DESIGN.md § Visjon vs. skall
  («ærlighet», «rolig én-formåls agenda») — den overlever en rebranding. Fonten kan
  byttes; tonen skal ikke.

---

## Stemmen i én linje

> Den rolige, presise norske redaktøren som forteller deg når og hvor — og som heller
> sier «vet ikke» enn å pynte på det.

---

## Grunnprinsipper (med ekte eksempler)

### 1. Rolig norsk, bestemt form
Konkrete substantiv i bestemt form, ikke markedsføringsabstraksjoner. Appen snakker om
«det du følger», ikke «dine preferanser».

- `Det du følger` — Deg-skjermens seksjon (ikke «Mine interesser»).
- `Dette dekker vi` — dekningsflaten (ikke «Vår dekning» eller «Utforsk»).
- `Hva jeg vet om deg` · `Det jeg ikke forsto` — minne-flatene, et stille førstepersons «jeg».
- Egennavn står på originalspråket (klubber, spillere, turneringer) — aldri oversatt.

### 2. Ærlighet foran selvtillit
Når vi ikke vet, sier vi det rett ut — vi gjetter aldri og pynter aldri. Dette er
produktets viktigste tonefall.

- Ukjent kanal er en ærlig `–` i raden, eller `Kanal ukjent` i tekst — aldri en oppdiktet kanal.
- `Fulgt — venter på dekning` — når du følger noe vi ennå ikke har et event for.
- `Du følger «<navn>» — venter på dekning.` — samme løfte, forklart.
- `Vi kjenner ikke navnet ennå. Raden i Det du følger venter til dekningen kommer.`
- `Resultatet er klart. Åpne når du vil se det.` — spoilervern: rolig, uten å friste med resultatet.
- `Slått sammen — ingen nye endringer.` — en no-op rapporteres ærlig, ikke feiret som suksess.

### 3. Aldri hype, aldri utropstegn
Ingen utropstegn i kromet. Ingen superlativer, ingen «nå!», ingen engasjements-agn
(uleste-tellere, «ikke gå glipp av»).

- `Kanal ukjent`, IKKE `Ingen streaming!` (DESIGN.md § Cross-surface — det kanoniske anti-eksempelet).
- Tenke-tilstand er en dempet `tenker …` + Avbryt — aldri en spinner, aldri «Laster inn magien».

### 4. Tomhet og feil forklares — hva og hvorfor
En tom flate eller en feil forteller alltid hva som skjedde og hva du kan gjøre. Aldri
en blank skjerm, aldri en rå feilkode.

- `Ingen nyheter om det du følger akkurat nå.` — tom, men forklart.
- `Jeg ser ingenting kommende i agendaen din akkurat nå.`
- `Fant ikke «<navn>». Søk i «Dette dekker vi» for å følge.` — feil + neste steg.
- `Fant ikke <navn> i indeksen over det du kan følge. Du kan likevel følge navnet — da venter det på dekning.`
- En generering som ryker på tid får rolig norsk («tok for lang tid») via den vanlige forklaringsflyten — aldri en teknisk timeout-melding.

### 5. Bestemt, konkret handling
Knapper og bekreftelser sier nøyaktig hva som skjer, i én setning, og nevner at det kan angres.

- Knapper: `Kom i gang` · `Hopp over` · `Følg` · `Slutt å følge` · `Be om dekning` · `Avbryt` · `Nullstill`.
- `<navn> forsvinner fra det du følger, og agendaen oppdateres. Du kan angre.` — konsekvens + angre.
- `Sikker? Dette sletter alt jeg vet om deg. Det du FØLGER beholdes.` — eksakt hva som slettes OG hva som består.
- `Det du følger bor på telefonen din — aldri på en server.` — personvern sagt enkelt og sant.
- `Lim inn en profillenke. Den slås SAMMEN med det du følger her — ingenting overskrives.`

### 6. Samme stemme på hver flate
Web (`docs/`) og iOS-appen deler ordforråd og tone. En etikett heter det samme begge
steder («Det du følger», «Dette dekker vi», den ærlige `–`). Skriver du en ny streng på
én flate, sjekk om tvillingen finnes på den andre og hold dem like.

---

## Taglinen

**«Hele sporten. Ett rolig utsyn.»** — to korte setninger, punktum etter hver (ikke
ellipse, ikke utropstegn). Brukes sparsomt på markeds-/førsteinntrykks-flater (App
Store-undertittel, web-innloggingsgaten, onboarding, delekort) — den er IKKE en del av
ordmerke-lockupen og står aldri ved siden av ordmerket i produktet (`BRAND.md` § Tagline).

---

## Slik skriver du ny copy (sjekkliste)

1. **Norsk, bestemt form.** Konkret substantiv, ikke abstraksjon. Egennavn på originalspråket.
2. **Vet vi det?** Hvis nei — si «vet ikke» eksplisitt (`–`, `Kanal ukjent`, `venter på dekning`). Gjett aldri.
3. **Null utropstegn, null hype, null superlativ.** Les setningen høyt: hvis den selger, skriv den om.
4. **Tomt eller feil?** Forklar hva som skjedde OG hva brukeren kan gjøre.
5. **Handling?** Én setning: hva skjer, og at det kan angres. Destruktivt sier eksakt hva som slettes og hva som beholdes.
6. **Finnes ordet allerede?** Gjenbruk den kanoniske etiketten («Det du følger» osv.) — ikke ett synonym til.
7. **Begge flater.** Web og iOS skal si det samme.
8. **Ved tvil: fjern et ord.** Roen er poenget.

---

## Anti-eksempler (skriv ALDRI slik)

| Feil (hype / uærlig / støy) | Riktig (Sportivistas stemme) |
|---|---|
| `Ingen streaming! 😱` | `Kanal ukjent` / en ærlig `–` |
| `Se det utrolige resultatet nå!!` | `Resultatet er klart. Åpne når du vil se det.` |
| `Beklager, en feil oppstod (error 500).` | `Fant ikke «<navn>». Søk i «Dette dekker vi» for å følge.` |
| `Du har ingen interesser 🙁` | `Ingen nyheter om det du følger akkurat nå.` |
| `Laster inn magien …` (spinner) | `tenker …` + Avbryt |
| `Slett` (uten konsekvens) | `<navn> forsvinner fra det du følger … Du kan angre.` |
| `Mine preferanser` / `Utforsk` | `Det du følger` / `Dette dekker vi` |
| `Vi elsker sport!` | (ingenting — appen selger ikke seg selv) |
