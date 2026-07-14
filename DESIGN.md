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

## Linse-rendering (P320 — rad = event × deltakelse × linse)

En sport når deg GJENNOM dem du følger. Følger du en golfturnering «med fokus på
norske utøvere» (linse `throughNorwegians`/`throughAthletes`), slutter «The Open»
å være én rad — den blir utøver-sentrerte rader, sett fra den fulgtes plass.
Bindende (WP-18):

- **Utøver-tid overstyrer eventtid.** Har en fulgt utøver en starttid (golf:
  tee time), er DEN radens tid — den overstyrer eventtiden for sortering,
  dag-gruppering OG visning i tidskolonnen (ikke flerdagsvinduet). Tittelen
  omformuleres til utøver-perspektiv («Reitan teer av — The Open»); status
  (runde/score/plassering) legges dempet i meta-linjen.
- **Én rad per utøver-tid.** Flere fulgte i samme event med ULIKE tider → én rad
  hver (hver tee time beholder sin egen tidskolonne — tidskolonnen er hellig).
  Deler de nøyaktig samme tid, kollapser de til én rolig rad med etternavnene
  listet. Roligst, og ærligst mot «når».
- **Grasiøs degradering.** Ingen linse (default `sportAsSuch`), eller ingen
  per-utøver-deltakelsesdata å rendre gjennom, ⇒ NÅVÆRENDE rad urørt. En sport
  uten per-utøver-tid (sjakk, fotball) rammes aldri.
- **Ærlighet over fylde.** Mangler tid, DIKT den ALDRI: behold eventtiden (eller
  flerdagsvinduet) og løft utøvernavnet inn i meta-linjen. Status vises verbatim,
  aldri tolket/oppdiktet.
- Linse-rader arver must-see-prikk og bjelle fra sitt event. Detaljarket viser
  fortsatt HELE eventet (linse-tittelen lekker aldri dit). Ingen nye farger/emoji.
- Rendering-lag, ikke seleksjon: linsen kjører ETTER relevans/must-see/kollaps
  og rører aldri de fem predikatene (de gylne vektorene forblir bit-like). I dag
  iOS-only (profil/linse bor lokalt per P310/P350); web venter på profil-sync.

## Header

Mosaikk-ensō som stille merke foran `ZENJI`-wordmarken, på alle flater (web:
`.wordmark-enso` i mastheaden; iOS: `EnsoMark` i Assets.xcassets, template-
rendret mot amber-token) — dekorativt, ikke interaktivt.

`ZENJI` (amber, tung mono) · dato («TIRSDAG 14. JULI», dempet) · levende klokke
`HH:MM:SS` (amber, tikker). Assistent-glyf: mono `»_` (IKKE pratebobler/emoji),
dempet, høyre — en FOKUS-SNARVEI til kommandolinjen nederst (ikke en egen skjerm;
se «Assistent»). Ingen sidetall/P-nummer i produktflatene — interne
tekst-TV-referanser som må forklares er dekorasjon, ikke kommunikasjon.

**Tema-overstyring (BINDENDE, gjelder alle flater):** én mono-glyf i headeren,
dempet, ved siden av assistent-glyfen, sykler system → mørk → lys → system ved
tapp, kvantisert tilstand (`◐` auto / `●` mørk / `○` lys), persistert og
appliseres på hele flaten (ingen egen innstillingsskjerm) — web har allerede
sin theme-toggle (`docs/js/dashboard.js`); iOS speiler den (`ThemeOverride.swift`
+ `.preferredColorScheme` på appens rot i `ContentView`).

## Interaksjon (BINDENDE — WP-14.3, Apple HIG)

Tapp-mål ≥44×44 pt for ETHVERT interaktivt element, uansett hvor liten glyfen
SER ut. Den lille, stille mono-glyfen er det VISUELLE språket og beholdes
uendret — treffflaten utvides usynlig rundt den (padding/`contentShape`,
aldri en større glyf/font). Gjelder header-glyfene, ⓘ og alle sigiler,
verktøylinje-knapper, og enhver liten tekst-«lenke» (Fjern/Slett/OK/Avbryt).

Handlingsknapper er ALDRI glyf-små: en handling som Bekreft/Avvis eller et
«mente du»-forslag er komfortabel — min. 44 pt høy, romslig horisontal
padding, en flat hårlinje-ramme i handlingens egen farge (diffAdd/diffRemove/
amber/dempet). Aldri en fylt «pill button» (forbudslisten gjelder også her).

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

## Onboarding (P310 — «definere»)

Førstegangsopplevelsen er en **samtale, ikke et skjema** — ingen konkurrent lar
deg SI hva du bryr deg om; alle tvinger deg gjennom liga-lister. Zenji gjør det
motsatte, og lander deg i en agenda som ALLEREDE reflekterer valgene (umiddelbar
konsekvens, samme mønster som assistenten). Bindende:

- **Vises kun ved førstegang.** Ett persistent flagg (`@AppStorage`); onboarding
  dukker opp bare når profilen er tom OG flagget ikke er satt. Re-kjørbar på
  forespørsel fra «Hva jeg følger» (samme stille flyt) — aldri automatisk igjen.
- **Rolige steg, ingen «AI-slop».** Ingen hero-illustrasjoner, karuseller, emoji
  eller utropstegn. Mono, amber, nesten-svart, ensō-merket i toppen; DESIGN.md-
  tokens og ≥44 pt tapp-mål gjennomgående. Fire steg:
  1. **Velkommen** — én ærlig setning om hva Zenji er (når · hva · hvor) +
     personvern-øyeblikket, on-brand og sant: «Det du følger bor på telefonen din
     — aldri på en server.» (P350/P360-løftet).
  2. **Samtale** (primærvei når Apple Intelligence er tilgjengelig) — samme `»_`-
     kommandolinje-idiom. Fri norsk tekst → den EKSISTERENDE assistenten
     (`InterestAssistant.interpret`) → en rolig diff brukeren bekrefter, flere ting
     etter hverandre, mens «Følger nå»-lista vokser. Gjenbruk av assistenten, ikke
     en parallell inntasting. Grasiøs: forstår den ikke → alltid-forklar (WP-16.1)
     + tilbud om hurtigvalg.
  3. **Hurtigvalg** (fallback + for alle) — kuraterte norske startpakker som
     tappbare valg (≥44 pt), bygget fra entitets-indeksen + en liten kuratert
     startliste. Fornuftige linser der det gir mening (golf/sykkel gjennom de
     norske → `throughNorwegians`, WP-18). Dette steget ALENE gir full verdi ved
     cold-start uten Apple Intelligence (pakkene bærer egne entitetsdata).
  4. **Landet** — peker på den alltid-tilstedeværende kommandolinjen («du kan
     alltid si mer til Zenji») og slipper deg inn i en fylt agenda.
- **Hopp over er alltid lov.** Tom profil ⇒ agendaen viser en rolig «Fortell Zenji
  hva du følger»-tomtilstand med peker til `»_` — aldri et falskt «ingenting på».
- **Ærlighet over fylde.** Hurtigvalg-pakkene er grunnet i ekte, i-sesong
  entiteter (så en tapp har konsekvens umiddelbart). Vintersport (langrenn/
  skiskyting/hopp) er bevisst utelatt utenom sesong — det finnes ingen entiteter
  ennå, og en pakke som matchet ingenting ville brutt ærlighets-løftet;
  research-agenten legger dem til ved sesongstart.

## Profil-sync (P360 — WP-19)

Profilen (det du følger) og minnet er DITT, og synkes gjennom **din egen
iCloud** — aldri via vår server. Bindende:

- **iClouds egen kanal.** Ekte cross-device-sync går til brukerens PRIVATE
  CloudKit-database (i deres iCloud-kvote), record-per-regel, med `encryptedValues`
  på fritekst (regelens `reason`, notater) — E2E der CloudKit støtter det.
  Krever betalt Apple-konto (WP-17); til da er backenden `LocalOnly` (no-op) og
  telefon-installasjonen (gratis-konto) virker som før.
- **Merge-strategiene** (deterministiske, CRDT-aktige): regler = siste-skriver-vinner
  på `modifiedAt` + **tombstones** for slettinger (en sletting replikeres — en
  gammel enhet gjenoppliver den aldri); episodiske minnenotater = append-only
  union; atferdstellere = grow-only (max per enhet, sum totalt). Merge er
  kommutativ, idempotent og rekkefølge-uavhengig.
- **QR-broen** (verdifull NÅ, uten betalt konto): profilen eksporteres som en
  komprimert payload i en QR-kode + `zenji://`-delelenke; import på en annen
  enhet kjører SAMME merge — den **slår sammen, overskriver aldri**. Rolig UI:
  mono, én amber-aksent, QR tonet til blekk-token, ingen emoji.
- **Aldri vår server.** All sync er brukerens iCloud eller QR/lenke mellom deres
  egne enheter. Personvern-løftet holder bokstavelig.

## Personlig minne (P350 — WP-30)

Assistenten skal føles som en redaktør som HUSKER DEG mellom øktene. Foundation
Models er statsløs — «minne» = persistert data + smart innsetting i sesjonen.
Kjernen er skillet mellom **personlig kontekst** (hvordan DU forholder deg til
det du følger — smak, kunnskapsnivå, spoiler-preferanse, varslingstoleranse;
liten, privat, KUN på enheten) og **verdens-kontekst** (form, storylines — stor,
delt, server-produsert). **Serveren samler ALDRI personlig kontekst.** Bindende:

- **Tre minnelag, alle lokalt** (utvider P360-synkmodellen `ProfileSyncState`, en
  egen konkurrent lages aldri): **strukturert** (relasjonsmetadata per
  entitet/sport — «nybegynner i sjakk», «ser F1 på opptak», «ikke varsle før
  08:00» — LWW + tombstone, redigerbart), **episodisk** (etter en samtale
  destillerer FM ett KOMPAKT notat, aldri råtranskript — append-only), og
  **atferd** (åpninger/utvidelser/avvisninger per entitet — ren kode, ingen AI,
  grow-only). Alt synkes gjennom brukerens egen iCloud/QR (P360), aldri serveren.
- **Retrieval er ren Swift** (deterministisk entitet-match + ferskhet, ingen AI):
  et `memoryDigest` (~500-token-tak) bygges for det som er relevant NÅ og
  **injiseres i `LanguageModelSession`-instruksjonene** i både svar og en lokal
  `saveMemory`-verktøy modellen kaller for å lagre noe den lærer. Svar REFLEKTERER
  minnet (bruker kunnskapsnivå til å forklare/ikke forklare fagtermer) — det leses
  aldri opp ordrett.
- **Spoilervern er et presentasjonslag** (signaturtrekket, umulig server-side): en
  `spoilerPolicy`-minnepost gir (a) svar formulert uten å avsløre utfall, og (b)
  et `spoilerSafe`-flagg agendaen/detaljarket respekterer ved å **maskere
  resultat/score** for den entiteten/sporten til brukeren har «sett» det (tapp for
  å vise). Ligger OPPÅ feeden som linsen (WP-18) — rører aldri de fem predikatene
  eller de gylne vektorene.
- **«Hva jeg vet om deg»** er tillits- og GDPR-flaten: en rolig liste over ALT
  lagret minne (strukturert + episodisk + atferd), hver post lesbar, redigerbar,
  slettbar, med «Glem alt». Nås fra assistent-flyten (samme sted som «Hva jeg
  følger»). Mono, ingen emoji, tapp-mål ≥44 pt. Sier rett ut at minnet bor kun på
  enheten (og din egen iCloud), aldri på en server.

### Nullstill uten å reinstallere (WP-32)

En «NULLSTILL»-disclosure i samme stille oppslag som «Hva jeg følger»/«Hva jeg
vet om deg» — ikke en ny fane — gir to rolige nivåer: **«Nullstill det du
følger»** (profilen + onboarding-flagget, så onboarding starter på nytt) og
**«Slett alt om meg»** (det over PLUSS alt personlig minne og «det jeg ikke
forsto»-loggen — GDPR-knappen). Destruktiv handling → ett rolig
bekreftelses-ark (DESIGN.md-tro, aldri en system-alert): eksakt setning om
konsekvensen + Nullstill/Avbryt i `ZenjiActionButtonStyle`. Ærlig om omfang:
gjelder KUN denne enheten (en synket enhet beholder sitt til neste sync, som
da også ser slettingen — tombstones, ikke en taus forsvinning). Tema-
overstyringen er en enhets-preferanse, ikke en del av profilen, og overlever
enhver nullstilling uendret.

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
