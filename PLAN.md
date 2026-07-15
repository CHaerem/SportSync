# Zenji (tidl. SportSync) → personlig sportsfeed: implementeringsplan

Arbeidsdokument for å delegere arbeid til agenter. Strategien («hvorfor») ligger i
[kommersialiserings-dossieret](https://claude.ai/code/artifact/21c2971d-238a-48fe-b870-1c57218bd661)
(sidene P110–P700 refereres under). Dette dokumentet er «hva, i hvilken rekkefølge,
med hvilke akseptkriterier».

**Prinsipp:** Fase 0 er 100 % angrefri — hver pakke gjør dagens produkt bedre selv om
kommersialiseringen aldri skjer. Beslutningspunkter (💰/🚪) er eksplisitte og tas av
mennesket, aldri av en agent.

---

## Regler for alle agenter som jobber på dette dokumentet

1. **Én arbeidspakke (WP) = én branch = én PR.** Aldri bland pakker.
2. `npm test` grønt før commit; `node scripts/validate-events.js` etter enhver
   events-skriving. `git pull --rebase` før push.
3. **Aldri rør** `scripts/config/interests.json` (hook-håndhevet) eller de beskyttede
   stiene (`.github/workflows/**`, `scripts/hooks/**`) uten eksplisitt menneskelig ordre.
4. Nye filer under `docs/data/` må whitelistes i `.gitignore` (default-ignorert).
5. Tabs i `scripts/`; norsk UI-tekst; `escapeHtml` på alt som rendres.
6. Ved fullført pakke: oppdater statusraden i dette dokumentet (samme PR).
7. Ikke-mål er bindende: en WP som «også fikset» noe utenfor scope avvises.
8. **Bevis-policy (skjermbilder):** per-WP-bevis = maks ~4 skjermbilder per flate
   (f.eks. dark/light × to tilstander). Skjermbilder et nytt bevis erstatter
   slettes i SAMME PR — git-historikken bevarer dem. Utforskningsmateriale
   (varianter, rutenett, før/etter-serier) sjekkes aldri inn; det bor i PR-en.

**Delegeringsmal (prompt til en agent):**
> Les PLAN.md og implementer WP-XX. Hold deg til pakkens scope og ikke-mål.
> Akseptkriteriene er kontrakten; npm test er porten. Oppdater statusraden i PLAN.md.

---

## Status

| WP | Tittel | Fase | Avhenger av | Status |
|---|---|---|---|---|
| WP-01 | events.schema.json | 0A | – | ✅ merget (#235) |
| WP-02 | Stabil event-ID | 0A | – | ✅ merget (#234) |
| WP-03 | manifest.json | 0A | – | ✅ merget (#236) |
| WP-04 | Deltakelse-normalisering | 0A | WP-01 | ✅ merget (#239) |
| WP-05 | Entitets-indeks | 0A | WP-01 | ✅ merget (#240) |
| WP-06 | Gylne feed-vektorer | 0A | WP-02 | ✅ merget (#238) |
| WP-10 | iOS-scaffold | 0B | – | ✅ merget (#237) + bygg bevist (Xcode 26.6, iOS 26.5-SDK) |
| WP-11 | Codable-modeller | 0B | WP-01, WP-10 | ✅ merget (#241) — TEST SUCCEEDED 11/11 |
| WP-12 | SyncClient | 0B | WP-03, WP-11 | ✅ merget (#242) — 37/37 tester |
| WP-13 | FeedCompiler (Swift) | 0B | WP-06, WP-11 | ✅ merget (#243) — 13/13 vektorer bit-likt |
| WP-14 | Agenda-UI + widget | 0B | WP-13 | ✅ merget (#245) — 102/102 tester + screenshot-bevis |
| WP-15 | NotificationPlanner | 0B | WP-13 | ✅ merget (#244) — 69/69 tester |
| WP-14.1 | Designspråk-realisering iOS | 0B | WP-14 | ✅ merget (#254) |
| WP-14.2 | Tema-overstyring + finpuss | 0B | WP-14.1 | ✅ merget (#255) |
| WP-14.3 | Tapp-mål + ensō-merke + P100 ut | 0B | WP-14.2 | ✅ merget (#258) |
| WEB-1 | Web etter DESIGN.md (flatt radspråk) | 0B | WP-14.1 | ✅ merget (#256) |
| WP-16 | FM-lekegrind (samtale→profil) | 0B | WP-10 | ✅ merget (#246, +16.1 #247 linse/ærlighet, +16.2 #248 fuzzy-resolver) — 152/152 iOS-tester (mot mock; FM kjøres ikke i CI) + DeviceDev bygget/signert/installert på fysisk iPhone (launch krever engangs manuell utvikler-trust på enheten) |
| WP-16.4 | Sømløs assistent | 0B | WP-16,WP-14 | ✅ merget (#257) |
| WP-17 | 💰 TestFlight-oppsett | 0B | WP-14 | venter på beslutning |
| WP-18 | Linse-rendering (P320: event × deltakelse × linse) | 0B | WP-13,WP-16.1 | ✅ merget (#259, 14.07) — `LensRenderer` (Feed/, widget-trygg) + Agenda-integrasjon: golf rendres gjennom de norske du følger (tee time overstyrer tid/dag/sortering, status verbatim i meta, grasiøs degradering); de 5 predikatene urørt (13/13 gylne vektorer bit-like); 273/273 iOS-tester (+16), 373/373 JS urørt, begge schemes bygger, ZenjiDeviceDev installert; skjermbilder `ios/docs/design-v2/lens-{dark,light}.png` |
| WP-19 | Profil-sync (P360: iCloud + QR-bro) | 0B | WP-16 | ✅ merget (#260) — 317/317 |
| WP-30 | Personlig minne (P350) | 0B | WP-16.4,WP-19 | ✅ merget (#261) — 356/356 |
| WP-31 | Naturlig onboarding (P310 «definere») | 0B | WP-16.4,WP-05 | ✅ merget (#262) — 368/368 |
| WP-32 | Nullstill profil + re-onboard | 0B | WP-30,WP-31 | ✅ merget (#263) — 376/376 |
| WP-26 | Nytt navn | 0C | – | ✅ valgt + domene sikret — formell sjekk gjenstår |
| WP-27 | 💰 Domene + DNS-cutover | 0C | WP-26 | ✅ zenji.app live 13.07 (cert + enforce-https + rot-paths) |
| WP-28 | Repo-splitt (privat motor / public site) | ~~0C~~ → Fase 1 | trigger | utsatt — trigger-basert (se WP-28) |
| WP-29 | Self-hosted runner (kun privat repo) | ~~0C~~ → Fase 1 | WP-28 | utsatt — følger WP-28 |
| WP-40 | Autonomi-herding: felles merge-gate | 0D | – | ✅ merget (#267) — `scripts/merge-gate.js` delt av alle tre løkker (ui-fix-hullet tettet), BLOCK utvidet med `.claude/settings.json` + `.github/actions/**`, run-logger committes også på no-op, toppkommentarer rettet; 382/382 tester. Beskyttet sti → menneskelig merge |
| WP-41 | Web: død kode ut av shippet flate | 0D | – | ✅ merget (#265) — sport-config.js + asset-maps.js slettet (406 linjer, null kallsteder) + døde shared-constants-eksporter; sw-shell synket (+activity.html, cache v2-18); 373/373, begge temaer verifisert |
| WP-42 | Pipeline: dødkode-sanering | 0D | – | ✅ merget (#268) — sjakk-stier (fetchChessStandings + curated-gren), filters trimmet til de 2 brukte, buildURL/fetchWithDates, `_leagueMeta`, døde norsk-klubb-helpere, cycling-configlesing, pr-body.md, `.github/actions/setup/` slettet; 373/373 grønt, build+validate rent |
| WP-43 | Pipeline: konvensjons-konvergens | 0D | WP-42 | ✅ merget (#270) — coverage-gaps/fotball-no rutet gjennom `isEventInWindow` (endTime-blindheten fikset + regresjonstester: pågående flerdagsevent ⇒ ingen entity/sport-gap), delt `yyyymmdd`/`espnDateRange` i lib/helpers, én main-guard-form (`pathToFileURL`) i alle scripts, fetch/index `{name, fn}`-array; 411/411 grønt |
| WP-44 | fetch-results: intern dedupe | 0D | WP-43 | ✅ merget (#273) — trippelisering ut: én `mergeResults(existing, fresh, keyOf, retainDays)` (×3), én favoritter-først/dato-desc-komparator (×4) + `byDateDesc` (×2), én `dateSanityIssues`-validator (×3), `termMatchesHeadline`→`containsName`, golf-mapperen delt via ny `lib/golf.js` (`golfCompetitorFields`, gjenbrukt av fetch-standings `mapCompetitor`); fetch-results 820→770 linjer; golden-test fanger byte-likt output før/etter (12 asserts, frosset `Date.now`); 435/435 grønt |
| WP-45 | Golf: skraper-ekstraksjon | 0D | WP-43 | ✅ merget (#272) — pgatour-skrapingen ut i `lib/pgatour-scraper.js` (parseTeeTimeToUTC/tournamentNameMatches/fetchPGATourPage/Field/TeeTimes, injiserbar `fetcher`); delt `fetchText()` i `lib/helpers.js` (golfs hånd-rullede HTTPS-klient + `fetch-rss` migrert dit); tee-time-visning (×3) + turneringobjekt/endDate (×3) dedupet via `teeTimeFromDate`/`buildGolfTournament`; `datesToQuery`→`espnDateRange(14)`; `golf.js` 748→387 linjer; 31 nye network-frie fixture-tester (7 «for testing»-funksjonene dekket), byte-likhet bevist (tee-time-logikk + buildGolfTournament); 442/442 serielt grønt |
| WP-46 | Web: felles theme.js + side-småplukk | 0D | WP-41 | ✅ merget (#271) — ny `docs/js/theme.js` (3-stegs system→mørk→lys, ◐/●/○) på alle tre sider + pre-paint-snutt overalt; 2-stegs-variantene i activity/edit fjernet; theme-color/manifest → tokens (#0A0A0C/#F5F1E6); IBM Plex Mono-taggene ut (null eksterne requests); `SS_REPO` + `ssShortReason` i shared-constants; sw-cache `zenji-v2-19`; syklus verifisert identisk på alle sider, begge temaer screenshottet |
| WP-47 | Web: dashboard.js-splitt | 0D | WP-46 | ✅ merget (#274) — `Dashboard`-klassen delt langs sømmene over felles prototype (window-global, ingen byggesteg): kjerne `dashboard.js` 446 (livssyklus + hero + agenda), `live.js` 176, `detail.js` 218, `followed.js` 195, `chrome.js` 85 — alle < 500; script-tags + sw-shell (`zenji-v2-20`) + test-sandkasse oppdatert; de to foreldreløse doc-kommentarene ryddet; 411/411 grønt, begge temaer pikselidentiske (kun klokke/min-siden endres) |
| WP-48 | iOS: Profile/-modul + demo/mock-karantene | 0D | – | ✅ merget (#269) — 12 filer `git mv` → `Zenji/Profile/` + profil-sync-extension ut av AssistantViewModel; `Zenji/Demo/` (LensDemoSeed/MemoryDemoSeed) strukturelt utenfor widget/test-targets; Mock* i `#if DEBUG` (også MockMemoryDistiller — `endOfOsloDay` → ny `MemoryFreshness`, siden FM-distillasjonen bruker den); `nm`: 0 Mock*-symboler i Release (193 i Debug-kontroll); 376/376 iOS-tester (uendret antall), 373/373 JS, begge schemes + ZenjiDeviceDev bygger |
| WP-49 | Repo-vekt: skjermbilde-sanering + policy | 0D | – | ✅ merget (#264) — 57 PNG-er slettet (docs-design/, ios/docs/variants/, enso-grids; alle ureferert), enso-icon.swift beholdt med header for valgt variant v3-grov-contig (hash-bevist = shippet ikon), regel 8 (bevis-policy) lagt til; sporede PNG-er 12 MB → 8,3 MB |
| WP-50 | iOS: README-restrukturering | 0D | WP-48,WP-49 | ✅ merget (#275) — `ios/README.md` 1446 → 495 linjer, kronologisk bygglogg → delsystem-kart (én seksjon per `Zenji/`-katalog + targets/signering + testing); katalogoversikt regenerert mot treet, talldrift rettet (42 testfiler/376 tester, iOS 26.0, 4 targets/3 schemes), design-v2-skjermbilder (reset/onboarding/profil-deling m.fl.) referert fra riktig seksjon; signering/free-account + sync-arkitektur + fixture-policy bevart |
| WP-51 | Testdekning: eksporterte pure-funksjoner | 0D | – | ✅ merget (#266) — 32 nye tester (fetch-rss 23, buildDriverTeamMap 9), 405/405 grønt, kjøretid uendret ~5,3 s |
| WP-52 | Dok-resynk (kjøres sist) | 0D | alle 0D | 🔬 PR åpnet — CLAUDE.md (Frontend→Tekst-TV+DESIGN.md-peker, dashboard.js-splitt, Testing 35 filer/463 tester, datafil-liste +entities/manifest/interests, nye avsnitt ios/·PLAN/DESIGN·follow-request·gate-tier·CI-only-hook), README (research=Opus/deep=Fable, testtall, lenketekst), package.json-desc, copilot-instructions DESIGN.md+edit.js, prompter (research-logg-begrunnelse, verify+cs2-sources, editorial-guardrail), koherens-tester (alle prompter skannes, follow-request.yml), schema-tittel→Zenji, DIVERGENCES-linjerefs; 463/463 serielt |

---

## FASE 0A · Kontrakt-herding i repoet (dossier P300/P310/P320/P340) — ✅ KOMPLETT 13.07.2026

Bakgrunn (kartlagt 13.07.2026): kontrakten har fire hull for en Swift-klient —
ingen stabil ID (klienten syntetiserer med array-indeks, `docs/js/dashboard.js:60`),
ingen manifest (`meta.json` har kun `lastUpdated`), intet JSON Schema for events,
og polymorf utøverdata (`norwegianPlayers` er streng | `{name}` | `{name, teeTime, …}`).

### WP-01 · `events.schema.json`
- **Mål:** Formelt draft-07-skjema for events.json, håndhevet i valideringen.
- **Filer:** ny `scripts/config/events.schema.json`; wiring i `scripts/validate-events.js`;
  test i `tests/` (mønster: `tests/interests-schema.test.js` + `scripts/lib/validate-schema.js`).
- **Innhold:** feltunionen fra `pushEvent()` (`scripts/build-events.js:22–58`) +
  validator-reglene (time/title/sport påkrevd; importance 1–5; ai-research-kontrakten:
  confidence-enum, high ⇒ ≥2 evidence-URLer).
- **Merk:** `scripts/lib/validate-schema.js` støtter kun `type, required, properties,
  additionalProperties, items, enum, minimum, anyOf, $ref` — hold skjemaet innenfor.
- **Ikke-mål:** endre event-innhold; stramme inn felter som i dag varierer (det er WP-04).
- **Aksept:** dagens events.json validerer rent; muterte fixtures fanges; npm test grønt.

### WP-02 · Stabil event-ID
- **Mål:** Server-generert `id` på hvert event; klienten slutter å syntetisere.
- **Filer:** `scripts/build-events.js` (`pushEvent()` + dedupe-stien), `docs/js/dashboard.js:60`
  (+ live-overlay-nøkling), `tests/build-events-schema.test.js`.
- **Design:** `id` = kort hash av dedupe-nøkkelen `sport|title|time` (samme semantikk
  som `build-events.js:162`). Dokumentér kjent egenskap: amendes tid/tittel av verify,
  får eventet ny ID (akseptabelt — diff håndterer det som fjern+legg-til).
- **Klient:** bruk `e.id` fra data med fallback til gammel syntese (bakoverkompatibelt
  til første rebuild).
- **Aksept:** to påfølgende builds på samme input gir identiske ID-er (test);
  ingen kollisjoner i dagens datasett; npm test grønt.

### WP-03 · `manifest.json`
- **Mål:** Per-fil `bytes`, `sha256`, `lastModified` for alle publiserte datafiler —
  grunnlaget for klient-sync (dossier P340).
- **Filer:** ny `scripts/build-manifest.js`; kalles sist i `scripts/build-events.js`-løpet
  eller som eget steg i `static-pipeline.yml` (NB: workflows er beskyttet sti — hvis
  workflow-endring trengs, lag PR-en men IKKE auto-merge; flagg for menneskelig review);
  whitelist `docs/data/manifest.json` i `.gitignore`.
- **Ikke-mål:** sharding (unødvendig ved ~61 KB events); endre meta.json.
- **Aksept:** manifestet dekker alle `docs/data/*.json` + `events.ics`; hashene stemmer
  (test regenererer og sammenlikner); kjøring er idempotent.

### WP-04 · Deltakelse-normalisering
- **Mål:** Én kanonisk form: `norwegianPlayers: [{name, teeTime?, teeTimeUTC?, status?}]`,
  `participants: [{name}]` — aldri strenger, aldri null (tom array).
- **Filer:** normaliser i `pushEvent()` (`scripts/build-events.js`); rett opp fetchere som
  emitterer strenger (sjekk `scripts/fetch/*.js`, chess-stien spesielt); stram inn
  skjemaet fra WP-01; behold `p.name || p`-toleranse i klient én release til.
- **Aksept:** skjemaet håndhever formen; alle sport-filer bygger rent; agent-promptene
  (`scripts/agents/research.md`, `verify.md`) nevner formen i output-kontrakten
  (koherens-testen `tests/agent-prompts.test.js` er vakthund).

### WP-05 · Entitets-indeks
- **Mål:** Publisert `docs/data/entities.json`: `{id, name, aliases[], sport, type}` —
  bygget fra `scripts/config/tracked.json` (har allerede slugger: `viktor-hovland`),
  `scripts/config/sports-config.js` (fritekst-lag) og `norwegian-golfers.json` (aliases).
  Events beriket med `entityId` på matchede `norwegianPlayers`/lag (bruk eksisterende
  navnematch i `scripts/lib/helpers.js`: `normalizeText`/`containsName`).
- **Ikke-mål:** nøkle om `docs/js/asset-maps.js` til ID-er (fase 1) *(avgjort i WP-41:
  filen slettes som død kode — gjenskapes fra git-historikk om fase 1 trenger den)*;
  røre interests.json.
- **Aksept:** hver tracked-utøver som opptrer i events bærer `entityId`; indeksen
  whitelistet + i manifest; schema-utvidelse; npm test grønt.

### WP-06 · Gylne feed-vektorer
- **Mål:** Frys personaliserings-semantikken i testvektorer så Swift-porten (WP-13)
  kan bevises ekvivalent: `f(superset-fixture, interesse-fixture) → forventet feed`.
- **Bakgrunn:** logikken er i dag duplisert — server `isRelevant`/`mustWatchEntity`
  (`scripts/build-events.js:353–359`, `scripts/lib/helpers.js`) vs. klient `isMustSee`
  (`docs/js/dashboard.js:176–183`) og speilene i `docs/js/shared-constants.js`.
- **Leveranse:** `tests/fixtures/feed-vectors/` (input + forventet output som JSON),
  kjørt mot JS-logikken; dokumentér formatet i en README slik at samme vektorer kan
  kjøres fra XCTest.
- **Ikke-mål:** refaktorere bort dupliseringen nå (dokumentér den; konsolidering er
  eget arbeid hvis vektorene avdekker avvik mellom server og klient — rapportér avvik).
- **Aksept:** ≥10 vektorer som dekker: multi-dag-events (`isEventInWindow`), must-see
  (favoritt/importance≥4/norsk), linse-tilfellet golf (norwegianPlayers → fremheving),
  serie-kollaps; alle grønne mot dagens JS.

---

## FASE 0B · iOS-app (dossier P300–P360, roadmap Q3 2026)

Ny kode i `ios/` — ren konsument av kontrakten fra 0A. Ingen endring i agenter,
pipeline eller web. Bygges/testes lokalt med `xcodebuild` (macOS).

### WP-10 · Scaffold
SwiftUI-app + WidgetKit-extension + App Group (`group.sportsync`), iOS 26-target.
Tekst-TV-designtokens (mono, amber `#FFB000`, nesten-svart) som SwiftUI-theme.
**Aksept:** `xcodebuild build` grønt; tom agenda-skjerm med tokens rendrer i simulator.

### WP-11 · Codable-modeller
`Event`, `Streaming`, `Participant`, `TrackedEntity` — speiler WP-01-skjemaet.
**Aksept:** decode-test mot en *fersk kopi* av ekte `events.json` + `tracked.json`
(sjekket inn som fixture); ukjente felter ignoreres (forward-kompatibelt).

### WP-12 · SyncClient
Manifest-poll (ETag/If-None-Match — GitHub Pages sender ETag), hent kun endrede filer,
skriv til App Group-cache. BGAppRefreshTask-registrering.
**Aksept:** unit-tester med mock-URLProtocol: 304-stien, delvis oppdatering, offline
(cache serverer); ingen fetch uten manifest-endring.

### WP-13 · FeedCompiler (Swift)
Porten av L2: interesse-match → vekting → buckets → dag-gruppering.
**Aksept:** består *alle* WP-06-vektorene bit-likt. Dette er pakkens eneste kriterium.

### WP-14 · Agenda-UI + widget
Dag-gruppert agenda (når · hva · hvor), must-see-markering, ⓘ-provenance-ark;
widget med timeline pre-beregnet fra cache («neste must-see»).
**Aksept:** manuell sjekkliste + snapshot-tester; widget viser riktig uten refresh
i 24t-simulering.

### WP-15 · NotificationPlanner
Diff på event-ID-er (WP-02) etter hver sync → planlegg/omplanlegg lokale varsler
fra must-see-regler. Verifiseringsvindu-regelen: data eldre enn vinduet ⇒ forbeholdsformulering.
**Aksept:** unit-tester: flyttet event omplanlegger; fjernet event kansellerer;
ingen varsler fra events med `confidence: low` uten fersk re-hent.

### WP-16 · FM-lekegrind
Prototype samtale→profil: `@Generable InterestRule`-mutasjoner fra naturlig språk,
diff-visning, bekreft/avvis. Krever fysisk enhet med Apple Intelligence (norsk: iOS 26.1+).
**Aksept:** 10 norske testytringer («følg Ruud bare i Grand Slams», «slutt med tennis»)
gir riktige strukturerte mutasjoner; ingen fritekst-entiteter (kun oppslag mot
entities.json fra WP-05).
**WP-16.1 (etter første brukertest):** la til LINSE i mutasjons-skjemaet («med fokus på norske utøvere» → `.throughNorwegians`, grounet som en entitet) + regelen om at assistenten ALLTID forklarer seg (aldri «fant ingen endringer») — 166/166 iOS-tester, DeviceDev re-installert på iPhone.
**WP-16.2 (etter andre brukertest):** fuzzy entitets-oppslag i den DETERMINISTISKE resolveren (års-strippet + initial-alias i `entities.json`; case/diakritika/prefiks/innehold/initialer/skrivefeil ≤2) — «tour de france», «tdf» og «Tour de Farnce» serveres nå rett til `tour-de-france-2026` uten avvisning, og «mente du»-forslag er blitt trykkbare (re-grounder opprinnelig intensjon → diff → Bekreft; aldri en død knapp). Initial-aliaser holdes utenfor server-matching. 179/179 iOS-tester (+13), 373/373 JS-tester (+4), DeviceDev re-installert på iPhone.
**WP-16.3 (P310s forslagsløkke — «forsto ikke»-loggen):** hver submit som ender uten applisert mutasjon (avvist entitet / uuttrykkbar / alt avvist av bruker / tomt modellsvar) logges lokalt og privat i Application Support (ingen nettverkskode, cap 200, eldste ryker) med ytring + AssistantExplanation + tidsstempel; diskret seksjon nederst i AssistantView («Det jeg ikke forsto (N)») med valgfritt notat, slett (enkelt/alt) og «Del rapport» (anonymisert JSON-eksport via iOS-delesheet — kun ytring/utfall/forklaring/notat/tidsstempel/løst); en senere «mente du»-bekreftelse markerer entryen løst (beholdes i loggen/eksporten, telles ikke i N). 206/206 iOS-tester (+27), 373/373 JS-tester (uendret), DeviceDev re-installert på iPhone.
**WP-16.4 (sømløs assistent — «assistenten ER grensesnittet»):** flyttet assistenten ut av skjermen-bak-en-knapp og inn i flyten. (1) KOMMANDOLINJEN: en fast, stille prompt-linje nederst i agendaen (mono `»_` + tekstfelt + blinkende amber `▌`-markør, statisk under Reduce Motion), nå primær inngang; header-glyfen ble en fokus-snarvei. AssistantView splittet i `CommandLineView` + et flatt resultat-ark (`AssistantPanel`) som toner inn (≤150 ms) over agendaen; «Hva jeg følger» + forsto-ikke-loggen nås fra stille oppslag i samme ark (all 16.x-funksjonalitet beholdt). (2) INTENT-RUTING: `InterestAssistant.interpret` returnerer `AssistantTurn` = mutasjoner ELLER `answer`; spørsmål besvares over LOKAL data (`FeedQuery` + nye FM-verktøy `searchEvents`/`getProfile`), rolig norsk med referanse til rader (tid · tittel · kanal). MockInterestAssistant utvidet deterministisk for begge intents (`MockAnswerer`). (3) KONTEKST-HANDLINGER i detaljarket: «Følg <entitet>» (forhåndsutfylt gjennom vanlig diff/bekreft-flyt) + «Hvorfor vises denne?» (`FeedCompiler.whyShown`). (4) UMIDDELBAR KONSEKVENS: profil foldes inn i effektive interesser (`EffectiveInterests`), Bekreft re-kompilerer agendaen synlig med det samme. (5) TENKE-TILSTAND: blinkende markør + dempet «tenker …» + «Avbryt», aldri spinner. DESIGN.md Assistent-seksjon utvidet normativt. 257/257 iOS-tester (+25), JS-tester urørt, skjermbilder i begge temaer i `ios/docs/design-v2/assistant-*.png`.

### WP-19 · Profil-sync (P360: iCloud-kanal + QR-bro)
Forbereder ekte cross-device profil/minne-sync OG leverer en gratis-konto-bro nå.
Leverandør-agnostisk bak en `ProfileSyncBackend`-protokoll (portabilitetsprinsippet:
lock-in isolert til ett lag).
- **Sync-modellen (hjertet, testbar UTEN iCloud):** en ren
  `ProfileMerge(local, remote) → (merged, push-set)`. Regler (stabil `entityId`):
  siste-skriver-vinner på `modifiedAt` + **tombstones** for slettinger (respektert
  — en gammel peer gjenoppliver aldri; en genuint nyere re-følg vinner). Episodiske
  notater: append-only union. Tellere: grow-only G-counter (max per enhet, sum
  totalt). Kommutativ, idempotent, rekkefølge-uavhengig konvergens.
- **Backend-seam:** `CloudKitProfileSync` (brukerens PRIVATE CloudKit-DB,
  record-per-regel, `encryptedValues` på `reason`/notat — kompilerer på
  simulator/CI, kjører kun med betalt konto + entitlement) + `LocalOnlyProfileSync`
  (no-op). `ZenjiDeviceDev` bruker LocalOnly (gratis personal team støtter ikke
  CloudKit-entitlement på enhets-bygg) → telefon-installasjon virker fortsatt.
- **ProfileStore + koordinator:** superset-schema (bakoverkompatibelt med det flate
  WP-16-formatet), stempler kun endringer, tombstoner fjernede regler; `load()/save()`
  uendret for eksisterende kallere. Offline-først: pull → merge → push på
  app-start/foreground; feil bevarer lokal state og blokkerer aldri UI.
- **QR-bro (uten betalt konto):** eksporter profilen som komprimert payload i en
  QR-kode + `zenji://`-delelenke; import (skann/lim inn/dyplenke) kjører SAMME merge
  — slår sammen, overskriver aldri. Rolig DESIGN.md-tro UI.
- **Ikke-mål:** server-endringer (all sync er brukerens iCloud/QR); web-CloudKit-JS
  (payload enkel å porte, framtid); minne-innhold utover det som synkes.
- **Aksept:** merge uttømmende testet; backend mot mock; ProfileStore round-trip;
  QR-eksport/-import round-trip. 317/317 iOS-tester (+44), 373/373 JS urørt, begge
  schemes bygger, ZenjiDeviceDev installert (LocalOnly), skjermbilder i begge temaer.
- **Konsekvens for WP-22:** merge + backend + entitlement + `ProfileSyncBackendFactory`
  er nå på plass — WP-22 reduseres til å skru på CloudKit-backenden på betalt konto.

### WP-17 · 💰 TestFlight (BESLUTNING: 99 USD/år)
Apple Developer-konto, signering, 15–20 eksterne testere fra nisjemiljøene.
**Gjøres av mennesket;** agent kan forberede fastlane/exportOptions.

---

## FASE 0C · Flyttedagen: rebrand + repo-splitt (besluttet 13.07.2026)

**Statusnote 13.07.2026:** Navnet er Zenji; eier kjøpte zenji.app og valgte å
rename repoet umiddelbart (billigste tidspunkt — null brukere å brekke). Gjort:
repo → `CHaerem/zenji.app`, alle serverte stier/brand-strenger oppdatert
(manifest, sw.js, HTML, README, package.json). Konsekvens: **navnet er nå
offentlig** → zenji.no/.tv bør kjøpes STRAKS; formell varemerkesjekk står
fortsatt åpen; gamle PWA-installasjoner/ICS-abonnement på /SportSync/-URL-en er
brutt (re-installer). WP-27 reduseres til domene/DNS på det RENAMEDE repoet;
WP-28 (splitt) står som før. CLAUDE.md + agent-prompter refererer fortsatt
SportSync internt — koordinert oppdatering er en egen liten pakke.

Utføres som én samlet migrering, i denne rekkefølgen — WP-26 er blokkeren for alt annet.
Nøkkeltrikset: custom domain settes på DAGENS repo før splitten (Pages redirecter
github.io → domenet automatisk), så PWA-installasjoner og ICS-abonnenter migreres
mens alt er stabilt, og repostrukturen kan endres usynlig bak domenet etterpå.

### WP-26 · Nytt navn (kritisk sti — gratis, start nå)
- **Kriterier:** engelsk · generisk-men-brandbart · fungerer som App Store-navn ·
  domene ledig (.com/.app) · varemerke-rent i sport/software-klassene · rom for
  Tekst-TV-identiteten visuelt. Internasjonal ekspansjon er premiss.
- **Prosess:** navneøkt → shortlist → domene-/varemerke-/App Store-sjekk per kandidat.
- **Beslutning:** menneske. Agent kan generere/sjekke kandidater.
- **Status (13.07.2026): ✅ NAVN VALGT — primærdomene sikret** (kjøpt av eier).
  Full logg i privat artifact (holdes utenfor offentlig repo). Gjenstår før
  navnet brukes offentlig: (1) formell varemerkesjekk EUIPO/USPTO kl. 9/41/42
  + eksplisitt vurdering av én US-søknad i naboklasse, (2) defensive domener
  (.no/.tv) kjøpes FØR offentliggjøring, (3) navnet holdes utenfor dette repoet
  til flyttedagen (WP-27/28).
  - Biprodukt av jakten: to nære konkurrenter avdekket (Fixtured, Fixture
    Calendar) — ført inn i dossier P200.

### WP-27 · 💰 Domene + DNS-cutover (etter WP-26)
Kjøp domene (~150 kr/år); CNAME + custom domain på NÅVÆRENDE Pages; verifiser
redirect fra chaerem.github.io/SportSync; oppdater PWA-manifest, ICS-lenker og
interne absolutte URL-er til domenet.
**Aksept:** gammel URL redirecter; PWA re-registrerer service worker på nytt domene;
ICS-abonnement følger redirect.

### WP-28 · Repo-splitt — UTSATT, trigger-basert (besluttet 13.07.2026)
**Hvorfor utsatt:** splitten koster de ubegrensede gratis Actions-minuttene
(offentlig repo = hele økonomien i automasjonen) mot begrenset gevinst nå:
calibration/datafiler er offentlige by design (serveres fra CDN), strategien bor
i private artifacts, secrets er trygge i Actions-secrets, og den reelle moaten
er løkka-som-løper + akkumulert historikk — ikke prompt-teksten. Å bygge åpent
er en ressurs i denne fasen.
**Triggere (én holder):** (1) kommersiell lansering nærmer seg og prompts/skills
utgjør reell konkurransefordel, (2) inntekt skaper kopist-insentiv, (3) B2B-/
partnersamtaler krever IP-hygiene.
**Design når den utføres (invertert etter renamen):** `zenji.app` BEHOLDES
offentlig og strippes til kun site-innhold (`docs/`) — Pages/URL uavbrutt; nytt
PRIVAT `zenji-engine` får motoren (agenter, prompts, quirks, fetchere, tester,
workflows + secrets); deploy key scopet til site-repoet gir cross-repo-push av
bygget `docs/`. Site-repoet: INGEN workflows og ALDRI self-hosted runner
(offentlig repo + self-hosted = fremmed PR-kode på egen maskin — hard grense).
**Aksept:** site uavbrutt på samme URL; motor privat; full syklus
(research → verify → pipeline → cross-repo-push → publisert) bevist.

### WP-29 · Self-hosted runner i motor-repoet (etter WP-28 — utsatt med den)
- **Hodestart:** eier har allerede kjørt en dockerisert runner på ServerPi
  (`sportsync-runner` i docker-compose) — dette er gjenbruk, ikke nybygg.
- Kun i det PRIVATE repoet. Ephemeral + containerisert (`--ephemeral`, Docker/VM);
  nettverkssegmentert fra hjemmenettet (egen VLAN/dedikert boks — agentene kjører
  AI-generert kode, runneren må behandles deretter).
- **Hybrid:** behold `ubuntu-latest` for korte/hyppige jobber (scout, usage-monitor)
  innenfor 2 000 gratis-min; self-hosted for tunge agent-kjøringer.
- **Aksept:** en full agent-syklus (research → verify → pipeline → publish) kjørt
  på runneren; overage-forbruk ~0; runner-nedetid gir køede (ikke tapte) runs.

---

## FASE 0D · Strukturhelse (kodegjennomgang 14.07.2026)

Bakgrunn: fem parallelle strukturgjennomganger 14.07.2026 (pipeline, agent-økosystem,
web, iOS, dokumentasjon). Hovedfunn: (1) dokumentasjonsdrift — CLAUDE.md beskriver
pre-Tekst-TV-designet, 16 av 29 testfiler, og intet om `ios/`/follow-request/entities;
(2) ett hull i autonomi-sikkerheten — ui-fix auto-merger uten protected-paths-sjekk;
(3) død v1-kode som fortsatt shippes — 406 linjer klient-JS, sjakk-stier mot slettet
config, ~75 % av `lib/filters.js`; (4) akkresjon — `dashboard.js` 1123 linjer,
`Assistant/` er to domener, PNG-er er 80 % av sporede bytes.

Alle pakkene er angrefrie og skal ikke endre atferd — med ett tilsiktet unntak
(WP-43: `detect-coverage-gaps` skal slutte å generere falske gaps for pågående
flerdagsevents). Delegeringsmalen øverst i dokumentet gjelder; regel 7 (ikke-mål er
bindende) håndheves strengt — pakkene er skåret for å unngå filkollisjoner.

**Bølge-plan (maks parallellitet uten merge-konflikter):**
- **Bølge 1** (uavhengige, kan gå samtidig): WP-40, WP-41, WP-42, WP-48, WP-49, WP-51
- **Bølge 2:** WP-43 (etter 42) · WP-46 (etter 41) · WP-50 (etter 48+49)
- **Bølge 3:** WP-44 og WP-45 (begge etter 43, innbyrdes uavhengige) · WP-47 (etter 46)
- **Sist:** WP-52 — dok-resynk dokumenterer sluttilstanden og kjøres når resten er merget

**Beslutninger for mennesket (ikke agent):**
1. WP-40 rører beskyttede stier (`.github/workflows/**`) — denne planoppføringen er den
   eksplisitte ordren (regel 3), og PR-en merges av menneske.
2. WP-49 sletter innsjekkede skjermbilder — git-historikken bevarer alt, men slettingen
   godkjennes via PR-review.
3. `scripts/lib/llm-client.js` har null produksjonskallere men er dokumentert
   leverandørbytte-fallback — **behold (default)** eller slett; hvis slett, si det eksplisitt.
4. `events.ics` PRODID/`@sportsync`-UID-er beholdes med vilje (bytte dupliserer events i
   abonnenters kalendere) — ikke-mål i alle pakker.

### WP-40 · Autonomi-herding: felles merge-gate
- **Mål:** Invarianten «beskyttede stier auto-merges aldri» håndhevet i alle tre
  selvfiks-løkker, fra ÉN kilde. I dag har self-repair og improve BLOCK-sjekken
  (`self-repair-agent.yml:70-79`, `improve-agent.yml:65-74`) — **ui-fix mangler den**
  (`ui-fix-agent.yml:58-77` merger enhver `ui-autofix/`-PR som passerer testene).
- **Filer:** ny `scripts/merge-gate.js` (delt re-gate: test-kjøring + BLOCK-sjekk +
  auto-merge/label); `.github/workflows/{ui-fix,self-repair,improve}-agent.yml` kaller
  den; CLAUDE.md-listen over beskyttede stier (kun listelinjene — resten er WP-52).
- **Innhold:** (1) trekk ut delt gate-script, wire inn i alle tre; (2) utvid BLOCK med
  `.claude/settings.json` (filen som wirer hookene) og `.github/actions/**`; (3) rett
  toppkommentarene i `improve-agent.yml:3-6` og `ui-fix-agent.yml:3-6` som sier
  «never auto-merged»/«a human to merge» — motsatt av koden lenger ned; (4) legg til
  commit-steg for `docs/data/{ui-fix,self-repair,improve}-log.json` — promptene krever
  loggene, men på no-op-kjøringer skrives de og forkastes (improve miner dem som bevis).
- **Ikke-mål:** reusable-workflow-refaktor av all boilerplate (over-engineering, jf.
  anti-maskineri-linjen); endre hooks eller prompts.
- **Aksept:** alle tre workflows kaller samme script; en test-PR som rører beskyttet
  sti blir stående åpen med `needs-review`; en som ikke gjør det auto-merges; npm test
  grønt (`tests/workflows.test.js`).

### WP-41 · Web: død kode ut av shippet flate
- **Mål:** Ingen JS shippes, precaches og testes som ikke har ett eneste kallsted.
- **Innhold:** slett `docs/js/sport-config.js` (55 linjer) og `docs/js/asset-maps.js`
  (351 linjer) — null kallsteder, header-kommentarene refererer slettede v1-filer, og
  asset-maps kan ikke brukes uten å bryte DESIGN.md (logoer/emoji bevisst fjernet).
  Fjern referansene: `docs/index.html:58-59`, `docs/sw.js:18-19`,
  `tests/dashboard-cards.test.js:10-11`, `docs/js/dashboard.js:4`. Slett døde eksporter
  i `docs/js/shared-constants.js`: `ssExtractAggregate` (:73-90) og
  `isNoteworthyNorwegianResult` + `NORWEGIAN_CLUBS`/`UEFA_COMPETITION_CODES`-kopiene
  (:12-40, ubrukt klientside). Synk sw-shell-listen: `activity.html` inn (lenket fra
  footer, precaches ikke i dag), døde entries ut, bump `CACHE_NAME`.
- **Merk:** WP-05s ikke-mål nevner asset-maps for fase 1 — beslutningen tas HER
  (filen gjenskapes fra historikk om fase 1 trenger den); oppdater den linjen med
  en parentes i samme PR.
- **Ikke-mål:** designendringer; tema-arbeid (WP-46); dashboard-splitt (WP-47).
- **Aksept:** `grep -rn "docs/js/sport-config\|asset-maps" docs/ tests/ scripts/ *.md`
  tomt (NB: `scripts/config/sports-config.js` er en ANNEN, levende fil); npm test grønt;
  `npm run screenshot` i begge temaer viser uendret side.

### WP-42 · Pipeline: dødkode-sanering
- **Mål:** v1-restene ut av `scripts/` — ren sletting, null atferdsendring.
- **Innhold:**
  - Sjakk: `fetch-standings.js:304-380` (`fetchChessStandings` leser
    `scripts/config/chess-tournaments.json` som ble fjernet i v2 — returnerer alltid
    `{}`); curated-grenen + `loadJsonFile` i `fetch/chess.js:22-55,177-185`
    (chess-sources i `sports-config.js:135-142` er kun lichess).
  - `lib/filters.js`: trim til de to brukte (`filterCurrentWeek`, `filterByTimeRange`
    — kalt fra `fetch/chess.js:161-162`, `fetch/esports.js:165`); resten (~75 % av
    API-flaten) har null kallere.
  - `lib/adapters/espn-adapter.js`: ubrukt `EventFilters`-import (:3) + `_leagueMeta`
    (:83-88, spreades bort i `base-fetcher.js:29` før noen kan lese det).
  - `lib/api-client.js:131-158`: `buildURL`/`fetchWithDates`, null kallere.
  - `lib/helpers.js:10-40`: død server-kopi av norsk-klubb-helperne (live-kopien er
    klientens; klientens egen død-eksport tas i WP-41).
  - `.github/actions/setup/` — dedup-mekanisme null workflows bruker, driftet
    (checkout@v4/node 20 vs. inline @v5/node 22). NB: stien er IKKE beskyttet
    (`.github/workflows/**` er), men nevn slettingen tydelig i PR-beskrivelsen.
  - `apply-follow-request.js`: header (:4-6) beskriver det forlatte PR-baserte designet
    og `pr-body.md`-outputen (:123-128) leses av ingen — workflowen committer til main.
  - `fetch/cycling.js:29-35`: leser `scripts/config/cycling-*.json` som ikke finnes;
    `build-events.js:156-172` sitt generiske config-pass eier det ansvaret alene.
- **Ikke-mål:** konvensjonsendringer (WP-43); `llm-client.js` (menneskebeslutning,
  se fase-intro); flytting av filer.
- **Aksept:** npm test grønt; grep på hvert slettet symbol tomt;
  `node scripts/build-events.js` + `node scripts/validate-events.js` kjører rent.

### WP-43 · Pipeline: konvensjons-konvergens
- **Mål:** Konvensjonene CLAUDE.md erklærer er sanne overalt — og den ene reelle
  konsekvensen av bruddet fikses: falske coverage-gaps for flerdagsevents.
- **Innhold:**
  1. `detect-coverage-gaps.js:99-121` (`hasEventWithin`/`countSportEventsWithin`)
     vinduer kun på `Date.parse(e.time)` og ignorerer `endTime` — en pågående
     golf-turnering/etapperitt som startet for >1 døgn siden leses som «ikke på tavla»
     og kan generere falske gaps. Rut gjennom `isEventInWindow` + regresjonstest
     (flerdagsevent startet i går ⇒ ingen entity/sport-gap). **Fasens ene tilsiktede
     atferdsendring.**
  2. Samme mønsterbrudd (harmløst for enkeltkamper, men konvensjonen er absolutt):
     `fetch/fotball-no.js:31-34` → `isEventInWindow`.
  3. Én `yyyymmdd()`/`espnDateRange(days)` i `lib/helpers.js`; migrer
     `fetch-results.js:22-24` og `espn-adapter.js:297-307` (golfs inline-variant tas
     i WP-45).
  4. Standardiser CLI-main-guard på `import.meta.url === pathToFileURL(...).href`-formen
     (fire idiomer i dag; `process.argv[1]?.includes(...)`-varianten kan false-positive
     på sti-substrenger).
  5. `fetch/index.js:16-38`: fetcher-array og filnavn-array er koblet kun via posisjon
     — én `{name, fn}`-array, avled `${name}.json`.
- **Avhenger av:** WP-42 (samme filer — ta rebase-rekkefølgen alvorlig).
- **Ikke-mål:** fetch-results-dedupe (WP-44); golf (WP-45); nye features i
  coverage-gaps.
- **Aksept:** regresjonstesten over grønn; npm test grønt; grep viser én
  main-guard-form i `scripts/`.

### WP-44 · fetch-results: intern dedupe
- **Mål:** 823-linjersfilen krymper ~100 linjer ved å fjerne intern triplisering —
  byte-likt output.
- **Innhold:** én `mergeResults(existing, fresh, keyOf, retainDays)` (i dag tre
  identiske modulo nøkkel: `:698-717`, `:436-453`, `:539-556`); én
  favoritter-først/dato-desc-komparator (×4: `:249-253`, `:427-431`, `:745-749`,
  `:778-782`); én dato-sanity-validator (×3: `:55-61`, `:345-351`, `:462-468`);
  `termMatchesHeadline` (`:625-630`) erstattes av `containsName`
  (`lib/helpers.js:81-87`); golf-leaderboard-mapperen deles med `fetch-standings.js`
  (`mapCompetitor` `:87-97` vs. inline-kopiene `:294-300`/`:311-317`) via lib.
- **Avhenger av:** WP-43.
- **Ikke-mål:** splitte filen per sport (valgfritt senere — dedupen gjør det trivielt);
  endre `recent-results.json`-formatet.
- **Aksept:** npm test grønt; golden-test: kjøring mot fixture gir identisk JSON
  før/etter.

### WP-45 · Golf: skraper-ekstraksjon etter husmønsteret
- **Mål:** Golf slutter å være arkitektur-avvikeren blant fetcherne; pgatour-skrapingen
  får samme form som huset allerede har bevist:
  `fetch-tvkampen.js` + `lib/tvkampen-scraper.js` + test.
- **Innhold:** ny `scripts/lib/pgatour-scraper.js`; delt `fetchText()` i lib (golfs
  hånd-rullede HTTPS-klient med redirect-håndtering `:98-154` duplicerer
  `fetch-rss.js:55-72` og tvkampen-scraperens); dedupe tee-time-visningsblokken
  (×3: `:202-216`, `:302-315`, `:316-335`) og turneringobjekt/endDate-konstruksjonen
  (×3: `:616-640`, `:650-691`, `:699-719`); `tournamentNameMatches` (`:377-386`)
  gjenbruker titleTokens-overlapp-logikken; tester for de 7 funksjonene `golf.js:736-737`
  allerede eksporterer «for testing» (ingen test importerer dem i dag).
- **Avhenger av:** WP-43 (delt fetchText/datohjelpere lander der/her koordinert).
- **Ikke-mål:** full `BaseFetcher`-konvertering (valgfritt senere); endre
  `golf.json`-formatet.
- **Aksept:** golf-output byte-likt på fixture; nye scraper-tester grønne (network-fritt,
  fixture-HTML); `fetch/golf.js` < 400 linjer.

### WP-46 · Web: felles theme.js + side-småplukk
- **Mål:** Én tema-implementasjon (i dag tre — to av dem subtilt feil) og undersidenes
  småfeil ut.
- **Innhold:** ny `docs/js/theme.js` med 3-stegs system/dark/light-syklusen fra
  `dashboard.js:1092-1118` + pre-paint-snutt på ALLE tre sider (i dag kun
  `rediger.html:12`; index.html har flash-of-wrong-theme-risiko). Erstatt de
  uavhengige 2-stegs-variantene i `activity.html:96-109` og `edit.js:215-220` (kan
  sette `data-theme="system"` som matcher ingen CSS-selektor og oppdaterer aldri
  ◐-glyfen). Småplukk i samme PR: undersidenes `theme-color`-metaer
  (`#0c0e11`/`#f6f3ec` → tokens `#0A0A0C`/`#F5F1E6`); manifest
  `theme_color`/`background_color` `#000000` → token; fjern IBM Plex Mono-taggene
  (`activity.html:11-13`, `rediger.html:13-15` — lastes fra Google Fonts, brukes aldri,
  eneste tredjeparts-request på siten); repo-slug som én konstant (i dag tre steder,
  to stavinger: `CHaerem/Zenji` vs `CHaerem/zenji`); flytt `shortReason` til
  `shared-constants.js` og bruk fra både dashboard og edit (i dag divergerende kopier,
  130 vs 95 tegn); `edit.js:13-15` bruker `escapeHtml` fra shared-constants (lastes
  allerede); `CACHE_NAME` → `zenji-…` + bump.
- **Avhenger av:** WP-41.
- **Ikke-mål:** dashboard-splitt (WP-47); designendringer; ny funksjonalitet.
- **Aksept:** tema-toggle oppfører seg identisk på alle tre sider (manuell sjekkliste
  + screenshot begge temaer); null eksterne font-requests; npm test grønt.

### WP-47 · Web: dashboard.js-splitt
- **Mål:** 1123-linjersklassen deles langs de fire naturlige sømmene — fortsatt uten
  byggesteg, null atferdsendring.
- **Innhold:** window-global-mønsteret (som `shared-constants.js`;
  `tests/helpers/load-client.js` laster allerede scripts enkeltvis): (a) live-polling +
  live-rendering (`:257-325` + `:991-1090`, tre ESPN-pollere — renest ekstraksjon) →
  `docs/js/live.js`; (b) agenda/detalj/serie-kollaps (`:327-799`) forblir kjernen i
  `dashboard.js`; (c) «Dine neste»/«Hva vi følger»-indeksen (`:801-989`) → egen fil;
  (d) shell-chrome (klokke/dato/footer/usage/install-hint; tema er alt flyttet i WP-46)
  → egen fil. Oppdater script-tags i `index.html`, sw-shell-listen + cache-bump,
  test-sandkassens innlasting. De to foreldreløse doc-kommentarene (`:563` hører til
  `hasDetail`, `:894` beskriver slettet crest-funksjon) forsvinner naturlig i flyttingen.
- **Avhenger av:** WP-46.
- **Ikke-mål:** endre rendering/DOM-output; nye features; røre shared-constants-logikk.
- **Aksept:** `tests/dashboard-cards.test.js` grønt uten assertion-endringer;
  screenshot begge temaer visuelt likt; ingen fil i `docs/js/` > 500 linjer.

### WP-48 · iOS: Profile/-modul + demo/mock-karantene
- **Mål:** `Assistant/` slutter å være to domener i én mappe (12 av 24 filer er
  profil-domenet — havnet der fordi mappen alt var wiret i test-targetet,
  `project.yml:153`); demo/mock-kode karanteneres strukturelt, ikke via
  plasserings-folklore.
- **Innhold:** ny `ios/Zenji/Profile/` med de 12: `ProfileStore`, `InterestProfile`,
  `ProfileMerge`, `ProfileSyncModel`, `ProfileSyncBackend`, `ProfileSyncCoordinator`,
  `CloudKitProfileSync`, `ProfileShareCodec`, `ProfileSharePanel`, `ProfileQRCode`,
  `ResetService`, `EffectiveInterests` (bro — vurder plassering). +1 kildelinje i
  ZenjiTests-targetet i `project.yml` (app-target bruker `path: Zenji`, uberørt;
  verifiser widget-eksklusjonene). `AssistantViewModel.swift:391-480`
  (`MARK: WP-19 profil-sync`-blokken) → extension-fil i Profile/. Ny `Zenji/Demo/`
  ekskludert fra widget/test-targets for `LensDemoSeed` + `MemoryDemoSeed`
  (MemoryDemoSeeds header-påstand «test-target plukker den ikke opp» er FEIL i dag —
  `project.yml:160` kompilerer `Zenji/Memory` inn i ZenjiTests). Pakk
  `MockInterestAssistant` (285 linjer) + `MockAnswerer` (177) i `#if DEBUG` — de
  kompileres i dag inn i Release; alle produksjonsreferanser er alt DEBUG-gatet, og
  ZenjiTests bygger Debug så hostless-testene påvirkes ikke.
- **Ikke-mål:** logikkendringer; navne-nits (plural/suffiks-inkonsistensene — valgfri
  senere); splitte `AssistantPanel` (egen vurdering, sømmene er MARKet).
- **Aksept:** alle iOS-tester grønne (samme antall som før flytting); begge schemes +
  ZenjiDeviceDev bygger; Release-bygg inneholder ikke Mock*-symboler (verifiser i
  build-logg/`nm`).

### WP-49 · Repo-vekt: skjermbilde-sanering + bevis-policy
- **Mål:** Ureferert bildeballast ut (PNG-er er 80 % av sporede bytes, 12,4 MB), og en
  policy så per-WP-bevismønsteret ikke akkumulerer ~250 KB døde blobs per erstattet
  skjermbilde.
- **Innhold:** slett `docs/docs-design/` (2,2 MB før/etter-bilder i den PUBLISERTE
  Pages-roten, referert av ingenting — PR #256 bevarer beviset); slett
  `ios/docs/variants/` (60 PNG-er) + `enso-*varianter.png`-rutenettene (~10 MB
  ikonutforskning — valget er tatt, ikonet ligger i Assets.xcassets); beslutt
  `ios/tools/enso-icon.swift` (1050 linjer, header sier «DRAFT, not wired») — behold
  kun med header som navngir valgt variant + regen-kommando, ellers slett;
  `ios/docs/design-v2/` BEHOLDES (bevisførsel README refererer) — rekomprimer gjerne;
  nytt policy-punkt under «Regler for alle agenter» (regel 8): per-WP-bevis = maks ~4
  skjermbilder per flate, erstattede slettes i samme PR (historikken bevarer).
- **Ikke-mål:** git-historie-omskriving (gamle blobs blir — akseptert); røre
  app-ikoner/`Assets.xcassets`; røre design-v2-bevisene.
- **Aksept:** `git ls-files '*.png' | xargs du -ch` ned fra ~12,4 MB til ≤ ~9 MB;
  grep viser ingen brutte bildereferanser; Pages-deploy uendret.

### WP-50 · iOS: README-restrukturering
- **Mål:** `ios/README.md` går fra 1446-linjers kronologisk bygglogg (tittelen stopper
  på WP-16, katalogoversikten `:139-230` mangler halve treet, `:504` påstår «102 tests»,
  `:40` er en innbakt PR-tekst, WP-18/19/31/32 mangler helt) til et subsystem-dokument
  som matcher treet.
- **Innhold:** strukturer per delsystem — targets/signering, Sync, Feed, Agenda,
  Assistant, Profile (ny fra WP-48), Memory, Onboarding, Widget, testing; regenerer
  katalogoversikten; rett alle talldrifter; per-WP-narrativ overlates til git-/PR-
  historikk; de urefererte design-v2-skjermbildene (reset/onboarding/profil-deling)
  refereres fra riktig seksjon.
- **Avhenger av:** WP-48 (ny struktur), WP-49 (endelig docs/-innhold).
- **Ikke-mål:** røre PLAN.md-innhold; dokumentere nye features utover strukturen.
- **Aksept:** hver katalog i `ios/Zenji/` har et avsnitt; stikkprøve: ingen tall-/sti-
  påstand motsies av treet; < 500 linjer.

### WP-51 · Testdekning: eksporterte pure-funksjoner
- **Mål:** De siste utestede pure-flatene får tester i husstilen
  (`tests/esports.test.js`-mønsteret: importer eksportene, fixture-data, network-fritt).
- **Innhold:** `fetch-rss.js` (`parseRssItems`/`filterRecent`/`applyPerSportCap`/
  `isNorwegianRelevant` — eksportert, testbart, utestet); `fetch-standings.js`
  (`buildDriverTeamMap` `:186-234` — den genuint intrikate). Golf dekkes i WP-45.
- **Ikke-mål:** nettverkstester; dekningsprosent-jag; røre produksjonskode.
- **Aksept:** nye testfiler grønne; total kjøretid holder seg < 5 s-budsjettet.

### WP-52 · Dok-resynk (kjøres SIST)
- **Mål:** Dokumentasjonen agentene leser som fasit stemmer med repoet igjen — fasens
  viktigste pakke, kjørt sist så den dokumenterer SLUTTtilstanden etter WP-40–51.
- **Innhold (funnliste 14.07 — verifiser hver mot sluttilstanden):**
  - **CLAUDE.md:** Frontend-seksjonen beskriver pre-Tekst-TV-designet («Schibsted
    Grotesk» vs. mono-stacken `base.css:21`; «dashboard.js ~250 linjer»); pek på
    DESIGN.md som normativ UI-kontrakt; Testing «16 filer» → reelt antall; datafil-
    listen mangler `entities.json`/`manifest.json`/`interests.json`; nye avsnitt:
    `ios/` (peker til ios/README), PLAN.md + DESIGN.md, follow-request-flyten
    (menneske-initiert, OWNER-gated skrivesti til interests.json — nyansér «AI never
    writes here»); gate-tier-listen (+ ui-fix/self-repair/improve som optional);
    presiser at interests-hooken er CI-only (lokale menneske-økter er unntatt,
    `protect-interests.js:10,15`).
  - **README.md:** `:89` + `:122-123` påstår research kjører «Fable 5 → Opus 4.8» hver
    4. time — det er den FORLATTE designen (standard-tier ER Opus 4.8; Fable kun
    deep-tier); testtall «~20 filer (~160 tester)»; lenketekst
    «chaerem.github.io/Zenji» vs. href `zenji.app`.
  - **package.json:** description er v1-generisk — nevn agent-arkitekturen.
  - **.github/copilot-instructions.md:** legg til DESIGN.md-peker (+ edit.js/rediger).
  - **Prompter:** `research.md:179-184` begrunner logg-regelen med workflow-atferd som
    ikke finnes lenger (fail-on-no-commit) — behold regelen, rett begrunnelsen;
    `verify.md` mangler cs2-sources-referanse (skillen sier selv «verifying esports»);
    `editorial.md` er eneste prompt uten interests-guardrail.
  - **Koherens-tester:** `agent-prompts.test.js:80` skanner 3 av 9 prompter for
    skill-stier — loop alle `scripts/agents/*.md`; `workflows.test.js:12` mangler
    `follow-request.yml` i forventningslisten.
  - **Småting:** `interests.schema.json:3` tittel «SportSync – …» (synlig i
    github.dev-hover — eneste brukersynlige navnerest); `DIVERGENCES.md`-linjerefs
    etter WP-47; `dashboard.js`-doc-kommentarene hvis WP-47 ikke tok dem.
- **Avhenger av:** alle 0D-pakkene (spesielt WP-40/41/47/48).
- **Ikke-mål:** beskyttede stier (workflow-kommentarene tas i WP-40); omskrive
  DESIGN.md (den er verifisert presis, verdi-for-verdi mot CSS-en).
- **Aksept:** utvidede koherens-tester grønne; stikkprøve: hver fil-/tall-påstand i
  CLAUDE.md §Frontend/§Testing/§Data files verifiserbar mot treet; grep «Schibsted»
  tomt.

---

## 🚪 GATE G1 · Lakmustesten (dossier P500 Fase 0)

Etter ~4 uker TestFlight: åpner folk appen daglig uten push-mas? D7-retention?
**Beslutning (menneske):** gå til Fase 1, forbli hobbyprodukt, eller avvikle app-sporet.
Alt under denne linjen er skisse som re-planlegges ved gaten.

---

## FASE 1 · Norge-lansering (Q4 2026, dossier P400/P500) — skisse

- **WP-20 · Kildemigrering til primærkilder** (P400 regel #1): erstatt tvkampen-scraperen
  med kringkaster-EPG-er (NRK/TV 2/Viaplay/Discovery+); forbunds-terminlister
  (NHF, FIS, IBU, UCI) som nye fetchere. *Angrefri — styrker hobbyversjonen også.*
- **WP-21 · 💰 Serverlag → SLA**: GitHub Actions → Cloudflare Workers cron + R2;
  Max-abonnement → API-nøkkel. Samme statiske JSON-kontrakt (WP-03-manifestet er porten).
- **WP-22 · CloudKit profil-sync** (P360): SwiftData-speiling, merge-strategiene,
  E2E-felter.
- **WP-23 · Gap-voting v1** (P330): anonymt signal + server-kø under budsjett.
- **WP-24 · Live Activities** via broadcast-kanaler (P340) — krever WP-17.
- **WP-25 · Lansering ved vintersesongstart** — Gate G2: 5 000 brukere, D30 > 30 %.

## FASE 2 · Inntekt (vår 2027) — skisse
Affiliate-avtaler (Viaplay/TV 2/Discovery+) → Pro-tier 59 kr/mnd (frontier-brief,
Live Activities, ubegrensede interesser). Gate G3 / kill-kriterium: affiliate + Pro
dekker serverkost innen 12 mnd.

## FASE 3 · Skalering (2028) — skisse
Land-playbook (Sverige først), Android (zero-knowledge profil-blob), ev. B2B.

---

*Opprettet 13.07.2026 fra kommersialiserings-dossieret v3 + kontraktkartlegging av repoet.
Vedlikeholdes av agentene som jobber på pakkene (regel 6).*
