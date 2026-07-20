# Spec: Assistent-inngang + Nyheter-v0 (fra Claude Design-handoff 19.07.2026)

Kilde: Claude Design-prosjektet «Sportivista assistentinput redesign»
(`Assistent-inngang Konsepter.dc.html`, turn 3 = godkjent retning «Intuitivt
for alle», turn 2 bærer arkets indre tilstander og «For deg»-tavlas rad-DNA).
Eier har godkjent FULL implementering inkl. Nyheter-v0 (WP-100s klientdel
fremskyndet forbi G1 — eierbeslutning 19.07).

> **Oppdatering 20.07 (WP-144, eier-beslutning — iterasjonens endestasjon):**
> assistent-INNGANGEN er en **kompakt flytende BUNN-KNAPP** (`AssistantButton`:
> `sparkles` + etikett «Spør assistenten», id `assistant.button`) i tommelens nåbare
> sone. Iterasjonshistorikk: (a) WP-104s bunn-KAPSEL var en falsk søkefelt-affordance
> (så ut som et felt, var en knapp); (b) WP-143 flyttet inngangen til en ærlig header-
> verktøylinje-knapp («renest Apple»), men eieren fant den **uråkelig med én hånd** på
> toppen av en høy iPhone. WP-144 forener nåbarhet + ærlighet: tilbake til BUNNEN (nåbar
> sone), men som en TYDELIG KNAPP (glass-pille som hugger innholdet, ikke det gamle falske
> feltet) — det sanksjonerte iOS 26 flytende Liquid Glass-mønsteret. INGEN placeholder-
> tekst, INGEN `mic` inni; diktering bor i arket alene. Alle «header-toolbar-knapp»- og
> «Spør, eller be om noe»-formuleringer under er dermed historikk — SAMTALEARKET
> (nedenfor) er uendret; kun inngangen flyttet.

## Fem prinsipper (turn 3 — bindende for alle pakkene)

1. **Ord foran ikoner** — «Uka» og «Nyheter» som ord i segmented, aldri
   anonyme ikoner.
2. **Assistenten er synlig og selvforklarende** — inngangen er en kompakt flytende
   BUNN-KNAPP (`sparkles` + etikett «Spør assistenten») i tommelens nåbare sone
   (button-rolle, a11y «Assistent», id `assistant.button`, ≥44 pt); skriving og
   diktering skjer i arket, aldri inline. **WP-144 (eier-beslutning — iterasjonens
   endestasjon):** knappen leser umiskjennelig som en KNAPP (glass-pille som hugger
   innholdet, amber `sparkles` + aktiv etikett), ikke det gamle falske feltet — INGEN
   placeholder-tekst, INGEN `mic` inni. Den bor i den NÅBARE sonen (bunnen), som
   forener nåbarhet med en ærlig affordance. (Erstatter WP-143s header-toolbar-knapp:
   ærlig, men uråkelig med én hånd på en høy iPhone.) Guidingen skjer ved ENGASJEMENT
   (arkets eksempelrader), ikke som chips på agendaen (calm).
3. **Ett navigasjonsmønster** — rad → detalj (push/sheet med ‹ tilbake);
   aldri gester som eneste vei.
4. **Assistenten er en snarvei, aldri eneste vei** — alt den kan (følg,
   endre, varsler) finnes også som vanlige knapper/lister.
5. **Én hjelpesetning maks per flate** — chevron/knappeform/plassering bærer
   resten. Alt pedagogisk er trykkbart, aldri ren tekst.

## 3a · Roten

- Segmented med ORD under headeren: **«Uka | Nyheter»**. Begge sider dekker
  hele uka — skillet er hva som *skjer* (agendaen, som i dag) vs. hva som er
  *nytt* (Nyheter-tavla).
- Assistent-inngangen er en kompakt flytende BUNN-KNAPP (`sparkles` + «Spør
  assistenten») i tommelens nåbare sone, sentrert over safe area
  (`safeAreaInset(.bottom)`, button-rolle, a11y «Assistent», id `assistant.button`):
  tapp → samtaleark. Diktering bor i arket (feltets tastatur-mic), ikke på roten.
  Ingen inline-TextField i roten. (WP-144: tilbake til bunnen som en tydelig knapp,
  ikke WP-104s falske felt-kapsel og ikke WP-143s uråkelige header-knapp.)
- Agendaen/Nyheter scroller rolig UNDER den flytende knappen; netto minimalt krom —
  én kompakt pille, ikke en full-bredde bunnflate.

## Samtalearket (2a — fem tilstander)

Native sheet (grabber, dra-ned, tapp-utenfor lukker — WP-99-lukkeveiene
overlever i ark-form). Tittel ASSISTENT + Lukk.

1. **Åpnet:** én setning «Skriv eller snakk — helt vanlig norsk.» + TRE
   trykkbare eksempelrader (ikke chips): «Følg et lag eller en utøver ›»
   (åpner Legg til-søket, 3b), «Hva går i kveld? ›» (kjører spørsmålet),
   «Endre varsler eller tema ›» (kjører kommando-armen). Felt nederst
   («Skriv her …») med mic.
2. **Skriver (flerlinje):** feltet vokser vertikalt til ~4 linjer
   (Meldinger-mønsteret); lang tekst brytes, aldri trunkert. Send = amber
   primærknapp i feltet; retur gir linjeskift.
3. **Diktering:** native diktering; bølgen erstatter feltet mens du snakker,
   transkripsjon bygger seg over; «Lytter — teksten lander i feltet, du
   sender selv». Stopp dempet; amber-bølgen er radens ene aksent.
4. **Svar i tråden:** svaret lander i SAMME ark som tråd — din melding som
   boble, forslag/svar/utført som kort under (gjenbruk diff-/answer-armene).
   Oppfølging («Følg opp …»-felt) er ett felt unna. Bekreft ⇒ arket lukkes ⇒
   agendaen re-kompileres.
5. **Tenke-tilstand:** dempet «tenker …» + Avbryt (DESIGN-regel, aldri spinner).

Tokens: accent (send, dikterings-bølge, feltets mic — én per rad/flate),
cell/cell2, secondary-/tertiaryLabel, separator, groupHeader (PRØV/FORSLAG),
radius.card. Ofring akseptert: ett tapp mer enn dagens linje; pedagogikken
flytter inn i arkets eksempelrader (guiding ved engasjement). (WP-144: inngangen
er en flytende bunn-knapp med en fast etikett «Spør assistenten» som navngir
handlingen, ikke en evne — WP-142s kontekstuelle kapsel-hvile-linje er dermed utgått.)

## 3b · Interesser uten assistent

- **«Det du følger»**: vanlig liste — rad per fulgt entitet («Bodø/Glimt ·
  fotball · varsler på ›»), rad → detalj med endringer + «Slutt å følge».
  Nås fra Deg («Hva jeg følger» oppgraderes) og fra en stille lenke øverst
  på Nyheter.
- **«Legg til»**: søk mot samme entitets-indeks som assistenten
  (entities.json) — velg, ikke stav. Treffliste med «Følg»-knapper
  (accent, én per rad).
- «Følg»-knapp også i event-detaljen — veien fra «så noe interessant» til
  «følger» krever aldri assistenten.

## Nyheter-v0 (fra 2b «For deg», WP-100-modellen)

**Radens DNA = agendaens:** type-tag (når kjent) · én faktalinje · entitet ·
kilder ut (↗, åpner kilden) · relativ tid. ALDRI innbakt artikkeltekst,
aldri AI-sammendrag av én enkelt kilde (DSM art. 15).

**Tavla er endelig — fire seksjoner, ferdig. Ingen uleste-tellere, ingen
pull-to-refresh-mekanikk utover systemets:**
1. **I DIN VERDEN I DAG** — editorial-briefens tverrsnitt (featured.json,
   egen-data), med proveniens-ⓘ «bygget på dine events og resultater».
2. **NYTT** — linse-matchede nyhetspekere fra news.json (v0: uten type-tag
   når klassifisering mangler; tag-raden er forberedt i layouten).
3. **RESULTAT** — fra recent-results, ALLTID bak «Vis resultat» når
   spoilervern gjelder (eye.slash).
4. **FREMOVER** — forvarsler fra events (trekninger, sesongstarter) utover
   dagens horisont.

Tokens: cell, secondary-/tertiaryLabel, separator, groupHeader (seksjoner +
type-tag), radius.card, eye.slash (spoiler), info.circle-rollen (proveniens).

## Server-kontrakt for news.json (ny fil, publiseres av build-events)

```json
{ "items": [ { "id": "sha1-of-link", "title": "…", "link": "https://…",
  "source": "vg-sport", "sport": "fotball", "entityIds": ["team:arsenal"],
  "publishedAt": "ISO" } ] }
```
- Bygges fra rss-digest-items × entities.json-matching (samme navnematching
  som build-events bruker på events — gjenbruk helpers, ikke ny logikk).
- Dedupe på link; capped (~100 items / 7 dager); byte-idempotent på uendret
  input (manifest-kontrakten); whitelistes i .gitignore + inn i manifest.
- Klienten linse-filtrerer selv på entityIds/sport per profil — serveren
  kjenner aldri profilen (to-lags-arkitekturen).
