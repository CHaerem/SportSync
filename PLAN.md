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
| WP-27 | 💰 Domene + DNS-cutover | 0C | WP-26 | ✅ sportivista.com (tidl. zenji.app) live 13.07 (cert + enforce-https + rot-paths) |
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
| WP-52 | Dok-resynk (kjøres sist) | 0D | alle 0D | ✅ merget (#276) — CLAUDE.md (Frontend→Tekst-TV+DESIGN.md-peker, dashboard.js-splitt, Testing 35 filer/463 tester, datafil-liste +entities/manifest/interests, nye avsnitt ios/·PLAN/DESIGN·follow-request·gate-tier·CI-only-hook), README (research=Opus/deep=Fable, testtall, lenketekst), package.json-desc, copilot-instructions DESIGN.md+edit.js, prompter (research-logg-begrunnelse, verify+cs2-sources, editorial-guardrail), koherens-tester (alle prompter skannes, follow-request.yml), schema-tittel→Zenji, DIVERGENCES-linjerefs; 463/463 serielt |
| WP-60 | iOS-ytelse: agenda-pipeline av main-tråden | 0E | – | ✅ merget (#279) — agenda-reload (`reloadFromCache`) av main-aktøren: last/dekod/`buildSections`/`liveRows` kjører i `computeReload` (`nonisolated async`, av main), hopp til @MainActor kun for tilordning; én reload om gangen + koalescering (burst av N ⇒ ≤2 rekompileringer, siste vinner); EntityIndex caches mellom reloads (invalideres ved sync), profil-fila dekodes én gang (dobbel-dekoding profile+memory fjernet); AssistantViewModel gjenbruker VM-ens EntityIndex i feedProvider (ingen ny indeks per submit); DEBUG `MainThreadGuard` i dekode-/kompileringsstien (trap på main) + test som beviser det; 5 nye tester (AgendaReloadConcurrencyTests), 360/360 iOS grønt, 13/13 vektorer bit-like, 463/463 JS, Zenji+ZenjiWidgetExtension+ZenjiDeviceDev bygger |
| WP-61 | iOS-ytelse: matching-skalering + perf-porter | 0E | WP-60 | ✅ merget (#281) — `followableEntities` sluttet å kalle `EntityIndex.resolve` (full skann + Levenshtein) ×3 per rad: ny `EntityIndex.servedEntity(for:)` slår opp i eksakt-/initial-kart bygget ÉN gang per indeks (navn+aliaser+spaced-id+edition-strippet → 100, lagrede initialer → 96), fuzzy `resolve`-fallback KUN ved miss; `buildSections` deler en `NameResolveCache` (memoisering per navn innen én kompilering). Match-semantikk uendret: `servedEntity` bevist bit-lik `resolve().served` (EntityServedParityTests over hele fixture-en + kollisjonsindekser). Ny O(n²)-testport (AgendaMatchingPerfTests): skalert syntetisk fixture (500 events / 2000 entiteter, generert deterministisk i kode) — dobling av skala holder seg ~lineær (< 3×, quadratisk ville vært ~4×) + measure-baselines på `buildSections` og `FeedQuery.build`. iOS-tester grønne inkl. 13/13 vektorer bit-like; begge schemes + ZenjiDeviceDev bygger; npm test urørt |
| WP-62 | iOS-responsivitet: QR/klokke/FM-timeout | 0E | – | ✅ merget (#277) — tre jank-kilder fjernet: (1) QR beregnes én gang i `.task` keyed på delings-payload + delt statisk `CIContext` (`ProfileQRCode`); (2) klokka ekstrahert til `TekstTVClock`-bladvisning som eier egen timer + `now` (1-min kadens under Reduce Motion, ellers 1 s, kant-justert til hel sekund/minutt) så `ContentView`-body ikke lenger invalideres per sekund; (3) FM-generering får frist via `withTimeout`-primitiv + `TimeoutInterestAssistant`-dekoratør (Task-race, wraps FM-assistenten i AssistantViewModel), rolig norsk «tok for lang tid» via eksisterende `.generationFailed`-forklaringsflyt, Avbryt/cancel består (propagerer som `CancellationError`, ikke timeout). 382/382 iOS-tester (+6 nye CI-kjørbare timeout-tester mot fake sovende assistent), begge schemes + ZenjiDeviceDev bygger, skjermbilder uendret begge temaer; `ContentView`-endringen holdt kirurgisk (kun klokke-ekstraksjonen) for å ikke kollidere med WP-60 |
| WP-63 | iOS-instrumentering: signposts + MetricKit | 0E | WP-60 | ✅ merget (#282) — `Zenji/Perf/`: (1) `PerfSignpost` os_signpost-helper (subsystem `app.zenji.perf`), `reload`-kategori med nestede intervaller last/index/kompiler i `AgendaViewModel.computeReloadSync` + `assistant`-kategori med `submit-prelude` rundt feed/minne-preludiet i `AssistantViewModel.submit` (rene innpakninger — vektorene bit-like); (2) `MetricSubscriber` (`MXMetricManagerSubscriber`, startet i `ZenjiApp.init`) som persisterer anonymiserte `MXAppLaunchMetric`- + `MXHangDiagnostic`-sammendrag til `Application Support/ZenjiProfile/metric-log.json` (cap 50/type, eldste ryker — samme mønster/personvern som MisunderstoodLog); diskret «DEL TELEMETRI»-eksport (delesheet, anonymisert JSON, ingen device-id/call-stack) på samme DEBUG-flate som eval-skjermen; (3) unit-tester med syntetiske value-type-payloads (`MetricSubscriberTests` + `MetricLogStoreTests` — histogram-summering, cap, eksport-kontrakt; MetricKit leverer ikke i simulator, kommentert); (4) ios/README §«Ytelse: signposts + MetricKit» (hvordan Hangs leses mot signpostene i Instruments, hvor eksporten bor). ZenjiTests får `Zenji/Perf` (view-modellene refererer PerfSignpost). |
| WP-64 | Entitets-/kategoridekning (vintersport m.m.) | 0E | – | ✅ merget (#278) — `build-entities.js` publiserer nå sport-/kategori-entiteter for alle `followBroadly`-sporter: 11 `type:"sport"` (bl.a. `sport-biathlon`/Skiskyting, `sport-cross-country`/Langrenn, `sport-alpine`/Alpint, `sport-nordic`/Nordisk kombinert, `sport-ski-jumping`/Hopp) + 1 `type:"category"` `category-winter-sports`/Vintersport (aliaser vinteridrett(er)/vintersporter) — norske navn+aliaser, server-inerte (utenfor athlete/team/league-enrichment). iOS `SportVocabulary` fikk vintersport-nøkler + `categoryToSports`/`keywordToCategory`; `EntityIndex.categoryKeyword`/`categoryEntity`; `detectEntities` ignorerer sport/kategori-typer; mock-parseren grounder «følg skiskyting»→`sport-biathlon` og «følg vintersport»→`category-winter-sports` (én bred kategorifølging) via vanlig diff/bekreft. entities.json 40→52; fixtures re-frosset (entities+manifest). Tester: JS 467/467 (+4), iOS 385/385 (+9); begge schemes bygger. Eval-cases beskrevet i PR-body (WP-69 bygges parallelt). |
| WP-65 | Assistent: bulk-fangst + delvis rapportering | 0E | WP-64,WP-69 | ✅ merget (#284) (`wp-65-bulk-fangst`) — FM-instruksjonene fikk eksplisitt fan-out (én mutasjon per ledd, `searchEntities` per kandidat, deklarativ «jeg liker/følger …»-cue → mutasjonsarmen, bart idrettsnavn → sport-entitet, ukjent ledd rapporteres i stedet for å droppes). Mock-parseren dekomponerer nå deterministisk (norsk konnektor-split med modifier-sammenslåing, så «Mer sykkel, bare de norske» forblir ÉN klausul mens «golf, Hovland og F1» blir tre) og grunnfester bart idrettsnavn til sport-entiteten (WP-65-prinsipp: hele sporten, ikke en tilfeldig flaggturnering). Per-ledd `MutationTally` («la til golf, Hovland, F1 · fant ikke «Brann»») publiseres av AssistantViewModel og vises rolig i AssistantPanel + onboarding — aldri stille ledd-dropp. Eier-ytringen gir 5 forslag (4 grunnfestet + Brann rapportert som ikke-funnet). Korpus v1→v2 (33 cases: 12 canon, 13 multiPart inkl. 8 nye, 2 winter, 1 present-knownGap WP-67, 5 question), goldens re-kalibrert til sport-nivå-prinsippet, winter/bulk-hull lukket. Ekte-FM-eval (iPhone 17-simulator, AI-aktivert Mac) forbedret fra 8/20-baseline (se PR-body). iOS-tester grønne (mock-suite uten FM); begge schemes + ZenjiDeviceDev bygger |
| WP-66 | Assistent: app-kommando-arm + hurtigknapper | 0E | WP-62,WP-65 | ✅ merget (#285) (`wp-66-kommando-arm-2`) — tredje intent-arm `AssistantTurn.command` + kommandokatalog (`AssistantCommand`): tema (system/mørk/lys), nullstill (gjenbruker WP-32-bekreftelse), kjør onboarding på nytt, del profil/QR, «hva vet du om meg» (åpne minne) + «glem …» (målrettet/alt), varsel-ledetid på/av (ny persistert `NotificationLeadPreference` → NotificationPlanner-kontrollflate), åpne event-detalj («vis Brann-kampen» → detaljark for matchende rad, ellers ærlig forklaring). Deterministisk validering + bekreftelses-semantikk (kun destruktiv nullstill holdes for Bekreft; resten utføres direkte med rolig kvittering). Mock-kommandoparser (`MockCommandParser`) + FM-instruksjoner/`GeneratedTurn` utvidet med kommando-intent. Fire stille hurtig-chips i arket (TEMA/VARSEL/DEL PROFIL/MITT MINNE — flate hårlinje-bokser, aldri fylte pills). Korpus v2→v3 (+12 `command`-cases, mock-asserteret i CI). 469 iOS-tester grønne (+26), alle fire schemes bygger, ZenjiUITests grønn (7), skjermbilder av chips i begge temaer |
| WP-67 | Assistent: presentasjonsfilter | 0E | WP-66 | ✅ merget (#287) — fjerde intent-arm `AssistantTurn.present(AgendaFilter)`: efemær `AgendaFilter { sports, entities, window }` (aldri persistert, rører aldri profilen; et rent visningslag på `AgendaViewModel.displayedSections` over ferdig-kompilerte `sections`, så de fem predikatene/gylne vektorene er urørt). Delt pure `AgendaFilterParser` (mock + FM): «vis bare golf denne uka»→sports{golf}+denne uka, «vis vintersport»→kategori-ekspansjon, «vis alt igjen»→nullstill; presentasjonscue vinner over mutasjonscue for «vis …» mens «følg …» og «vis Brann-kampen» (openEvent) består. Stille filterlinje «VISER: GOLF · DENNE UKA ✕» med ett-trykks reset (Tekst-TV, DESIGN.md §Presentasjonsfilter). FM: intent='present' + `presentFilter`-felt + instruksjoner. Korpus v3→v4: `present`-casen finalisert (var uventet-passerende known-gap under WP-66 — nå ekte `present`-kind-case, ikke gap) + 5 nye present-cases (kategori/multi-sport/entitet/reset/vindu), ny `EvalKind.present`+scorer, mock-asserteret i CI. Nye tester: AgendaFilterTests (parsing + filter-anvendelse + VM aldri profil-mutasjon) + XCUITest-flyt 7 (sett filter → linje synlig → ✕ → alt tilbake). `npm test` urørt |
| WP-68 | Assistent: app-hjelp-kunnskap | 0E | WP-66 | ✅ merget (#286) — versjonert norsk hjelpe-/kapabilitetsdokument (`AssistantHelp`) ved siden av WP-66-kommandokatalogen: per-kommando-hjelpen er keyet på `CommandKind` (én arm per `AssistantCommand`-case via EKSHAUSTIV switch — ny kommando kompilerer ikke uten mapping), og STYRE APPEN-seksjonen i dokumentet genereres fra katalogen så den aldri drifter. Eksponert som read-only FM-verktøy `getHelp` (à la `getProfile`) + i mock-answereren (`MockAnswerer` sjekker hjelp først, «hvordan» lagt til spørsmåls-rutingen): «hva kan du?», «hvordan nullstiller jeg?», «hvordan følger jeg noe?» besvares fra kuratert fakta med en konkret handling («si 'nullstill'», «trykk TEMA-chippen»), aldri fra tom feed; generelle kunnskapsspørsmål avvises ærlig (ikke-mål). Koherens-test: hver `CommandKind` har hjelpe-omtale (bevist rød ved fjernet hjelpetekst). Korpus v3→v4: ny `help`-kategori (5 cases: 4 hjelp + 1 ute-av-scope ærlighet med forbudte-påstander-vakt), mock-asserteret i CI. Svararm-justering: eksplisitt «SITER RAD-ID-ENE … et agendasvar uten rad-id-er regnes som ugrunnet» (adresserer q 2/5 fra siste ekte-FM-eval). iOS-tester grønne (+13 WP-68), alle fire schemes bygger; ekte-FM-eval kjøres av hovedsesjonen etter merge |
| WP-69 | FM-eval-harness på enhet + korpus | 0E | – | ✅ merget (#280) — versjonert korpus `ios/ZenjiTests/Fixtures/eval-corpus.json` (24 cases: 12 canon + 5 multiPart + 2 winter + 5 question; 4 `knownGap` mot WP-64/65); delt pure `EvalCorpus`/`EvalScorer`/`EvalRunner`/`EvalReport` (id-sett for mutasjoner, rad/påstand-rubrikk for svar) i `Zenji/Eval/`; CI: `EvalCorpusTests` kjører samme korpus mot mocken (20 asserted grønne, 4 gap skippet med markering); DEBUG-only eval-skjerm (`Zenji/Eval/EvalView`, nås fra assistent-arkets fot) kjører ekte FM på enhet, pass-rate per kategori, anonymisert JSON-rapport via delesheet + eksport av forsto-ikke-loggen som korpus-kandidater; ingen ny target (korpus bundlet som ressurs i Zenji + ZenjiDeviceDev, `Zenji/Eval` i test-sources); 385/385 iOS-tester grønne (+9), begge schemes + ZenjiDeviceDev bygger. Eier kjører første reelle runde på fysisk iPhone og deler rapporten |
| WP-71 | Hotfix: FM-prompt-budsjett (kontekst-overflow) | 0E | WP-68 | ✅ merget (#288) — WP-66/67/68 la alle fire armene + hele `GeneratedTurn`-skjemaet + fire verktøy på ÉN generering, som sprengte on-device-konteksten (~95 «Context length of 4096 exceeded during singleExtend», slutt-eval 10/55). Fiks: **budsjettér prompten ved å dele den ene store genereringen i to små** (`AssistantInstructions`, FM-fri + CI-testbar). Fase 1 = en liten, verktøyløs intent-klassifikator (`GeneratedIntent`); fase 2 = én fokusert økt per arm med KUN den armens skjema (`GeneratedMutations`/`GeneratedAnswer`/`GeneratedCommand`/`GeneratedPresent`) og KUN de verktøyene armen trenger (mutasjon→searchEntities, svar→searchEvents/getProfile/getHelp, kommando/present→ingen). Ingen enkelt-generering holder lenger alle fire armene — hver får vid margin i 4096, uten tapt kapabilitet (alle armer, linse, minne, verktøy består). Prompt-tekst: den gamle mono-prompten var ~4700 tegn (~1340 tok); nå ~772 tegn klassifikator + ≤817 tegn per arm. @Guide-skjema + verktøybeskrivelser komprimert; `getHelp`-dok slanket (~2000→~1840 tegn, hentes kun ved kall). Ny CI-vakt `AssistantInstructionsTests` (tegn-budsjett per fase, dokumentert ~3,5 tegn/token-antakelse) fanger neste oppblåsing i CI, ikke i evalen. DEBUG-miljøfiltre `TEST_RUNNER_ZENJI_EVAL_CATEGORY`/`_CASE` i RealFMEvalTests for billig enkeltkategori-iterasjon. Ekte-FM-eval (55 cases, iPhone 17-sim): **null kontekst-overflow** (var ~95), **total 32/55 = 58 %** (var 10/55) — canon 6/12, multiPart 8/13, winter 0/2, present 6/6, question 2/5, command 7/12, help 3/5. Terskler re-kalibrert «målt minus margin»: canon ≥5, total ≥25 (~45 %-gulv ≈ gamle 15/32). Gjenstående bom er grunnfestings-granularitet (bart idrettsnavn → sport-entitet), ikke overflow. Mock-suite 502-basis + 3 nye vakt-tester grønne; alle fire schemes bygger |
| WP-70 | XCUITest: hovedflyter + launch-metrikk | 0E | – | ✅ merget (#283) — ny `ZenjiUITests`-target (bundle.ui-testing) + egen scheme (Zenji-scheme uendret → rask unit-run består); appen drives mot deterministisk `ZENJI_DEMO=uitest`-harness (`UITestSeed`: mock-assistent + seedet cache, ingen nett, ingen Apple Intelligence). 6 hovedflyter grønne i simulator (iPhone 17): onboarding (quick-picks + samtale), følg via kommandolinja → diff → Bekreft → rad dukker opp, N raske starter-pack-toggles uten heng (vokter WP-60-koalesceringen), event-detalj + «Hvorfor vises denne?», tema-toggle, nullstill (avbryt + gjennomfør). `XCTApplicationLaunchMetric` kaldstart-baseline ~0,97 s (5 kjøringer, RSD ~1–4 %). Additive accessibility-identifiers; `waitForExistence`/predikat-venter (ingen sleeps); ios/README §testing oppdatert |
| WP-80 | Token- & typografi-fundament (Apple-native) | 0F | – | ✅ merget (#289) — semantiske farge-tokens (system + amber) + Dynamic Type-API (`Font.zenji`/`zenjiTabular`), `zenjiMono(size:)` beholdt som deprecated shim (alle 4 schemes bygger urørt), 529 iOS-tester grønt + 13/13 vektorer bit-like |
| WP-81 | Agenda → native List + sveip/pressed-state | 0F | WP-80 | ✅ merget (#290) — native `List(.insetGrouped)`, rad=Button (pressed-state + a11y-rolle), SF Symbols (bell/info), sveip «Følg», detaljark på detents; 529 unit + 13/13 vektorer bit-like |
| WP-82 | Hjelperen → native (oppdagbarhet) | 0F | WP-80 | ✅ merget (#291) — tre oppdagbarhets-tilstander (hvile-eksempel/fokus-forslag/live grunning), native felt (clear/diktering/autocap av), font-migrering; mock-suite urørt grønn. Samlet bølge-2-verifisering: unit 529 + UI 9/10 (begge nye flyter), `testEventDetailWhyShown` er pre-eksisterende feil (fikses separat) |
| WP-83 | Navigasjon (NavigationStack) + Deg-skjerm | 0F | WP-81,WP-82 | ✅ merget (#293; samlet bølge-3-verif. grønn m/ #292) — agenda i `NavigationStack` + `gearshape`→Deg; v2-header-glyfer (`»_`/`◐`/klokke) fjernet; hjelperens resultat = native `.sheet` (detents); `AssistantPanel` slanket til samtale/resultat; ny `Profile/DegView.swift` re-hjemmer profil/minne/forsto-ikke/del/varsel/tema/nullstill/eval; alle 4 schemes bygger, 529 unit + 13/13 vektorer bit-like, UI-flyter (Deg-nav/tema/reset/sheet) grønne |
| WP-84 | Widget token-paritet (web utsatt) | 0F | WP-80 | ✅ widget merget (#294) — WidgetKit av `zenjiMono`-shimen + deprecated farge-aliaser, over på `Font.zenji`/`zenjiTabular` + semantiske tokens; alle 4 schemes bygger, 529 unit. **Web-delen (`docs/css` + `theme.js`) utsatt til rebrandingen** (eierbeslutning 17.07 — web reskin'es uansett da) |
| WP-85 | Baseline-designsystem + HIG-gate (promoter DESIGN.md) | 0F | WP-80,WP-81,WP-82,WP-83,WP-84 | ✅ merget (#295) — 105 font + 121 farge-kall migrert over de 4 siste filene, `zenjiMono`-shim + aliaser fjernet (null treff), HIG-gate `tests/ios-dynamic-type-gate.test.js` (dekker Zenji+ZenjiWidget), `DESIGN-BASELINE.md`→`DESIGN.md` promotert. Fable 5-sluttreview: KLAR (F1–F3 fikset i PR). Samlet verif.: npm+gate, 4 schemes, 526 unit + 12 UI + 13/13 vektorer |
| WP-90 | Kanal-korrekthets-kjeden (golf/carry-forward/skill) | 0G | – | ✅ merget (#302) — reell rotårsak lå i norwegian-rights-KARTET (appliseres etter carry-forward); verified-wins m/ 14d-TTL + verificationSources-korroborasjonsvakt (håndterer korrupte revert-vrak); golf tier-splitt web-verifisert; 486 tester (+11), vektorer urørt. LIVE-BEKREFTET: Corales flippet Viaplay→HBO Max på tavla 2 min etter pipeline-kjøring |
| WP-91 | CI-nervesystemet (403/push-auth/skill-write) — beskyttede stier | 0G | – | ✅ merget (#301, eier-instruert) — rotårsak A+B: claude-code-action bytter GITHUB_TOKEN med OIDC-app-token (mangler actions:write, trekkes tilbake etter steget) ⇒ eskalering via sentinel + eget steg m/ ekte token + escalation-failed-Issue-alarm; loggcommit re-peker origin; C: skill-write-«blokkering» avlivet som vandrehistorie (denials var Bash-kall, Edit var alltid tillatt) — prompter presisert. VERIFISERES i drift: neste scout/coverage-critic/self-repair-kjøringer (ingen escalation-failed-Issue + logg-commits lander + skill-writes committes) |
| WP-92 | Relevans-gaten (chess/esport + iOS-låssteg) | 0G | – | ✅ merget (#306) — chess/esports ut av ubetinget followBroadly (sport-scopet entitets-match kreves, lest fra interests — aldri hardkodet); ai-research-autopass scopet til reelle interesser; iOS FeedCompiler speilet i låssteg; 13 vektorer re-frosset + ny vektor 14 (fryser gaten); 526 tester begge plattformer, bit-like, 4 schemes. Live-diff: 49→47 — kun Sant Martí (bevist støy) + Sjakk-NM-eliteklassen (GRENSETILFELLE dokumentert: matcher ikke Carlsen/Norway Chess/VM mekanisk; EIER avgjør via interests.json om NM skal inn) |
| WP-93 | Vaktene (grader/gap-detektor/kalibrering) | 0G | – | ✅ merget (#304) — grader: hard failure #6 (summary-vs-streaming-selvmotsigelse, kan strukturelt ikke degraderes til «note») + gjentatte-anbefalinger + evidens-monokultur; gap-detektor: fjerde RSS-uavhengige signal `tracked-claim` (Gstaad-klassen, 0 falske positiver live etter to presisjons-iterasjoner); kalibrering: `boardWasProvisional` (kilde-retter-oss = styrke, redder cyclingstage 0.27, bakoverkompatibel); coverage-critic: recall-utmattelse auto-eskalerer gjentatte gap (F1-quali-fella); venue-sync i verify. Samlet bølge-2-verif.: 522 tester + build/validate/gap/kalibrering rent
| WP-94 | Drifts-småplukk (kvote-gate/validate-degradering/UCL) | 0G | – | ✅ merget (#303) — kvote-gate m/ fersk-henting >10min (pure functions, fail-open bevart; NB: fersk-stien er no-op i kritiske workflows til et lite BESKYTTET workflow-tillegg sender OAuth-token til gate-steget — egen mini-PR til eier); validate-degradering uten workflow-endring (in-prosess-validering før skriving, forrige gyldige data består, build-alert.json-helsesignal; fant+fikset round-trip-valideringsbug); UCL-placeholder-regel i research.md; 506 tester
| WP-95 | Deltakelses-ferskhet (cut/trekning — eier-funn) | 0G | – | ⬜ |

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

### WP-17 · 💰 TestFlight (BESLUTNING: 99 USD/år) — runbook oppdatert 18.07.2026

**Menneskets steg (blokkerende, i rekkefølge):**
1. **Re-logg Apple-ID i Xcode** (Settings → Accounts → chris.haerem@gmail.com) —
   økten er utløpt («No Accounts»); trengs også for gratis device-bygg av
   `app.sportivista.ios` (ny bundle-id ⇒ ny profil må registreres).
2. **Enroll i Apple Developer Program** (developer.apple.com/programs, 99 USD/år,
   godkjenning kan ta 24–48 t). Noter den betalte team-ID-en.
3. Gi agenten team-ID + en **App Store Connect API-nøkkel** (Users and Access →
   Integrations → App Store Connect API, rolle App Manager) for skriptet opplasting.

**Agentens steg (klare til å kjøres når 1–3 er gjort):**
- `project.yml`: sett `DEVELOPMENT_TEAM: <betalt team>`, `CODE_SIGNING_ALLOWED/
  REQUIRED: YES` for app+widget; re-aktiver App Group (`group.app.sportivista`
  registreres på det betalte teamet) og embedded widget på device-target.
- App Store Connect: opprett app-record (`app.sportivista.ios`, navn «Sportivista»
  — sjekk navnetilgjengelighet i App Store), primærspråk nb-NO.
- `xcodebuild archive` + `-exportArchive` (App Store-metode) + opplasting via
  `xcrun altool`/`notarytool` med API-nøkkelen; intern TestFlight-gruppe med eieren;
  deretter 15–20 eksterne testere fra nisjemiljøene.
- Husk: bundle-id-byttet (rebrand) betyr at TestFlight-appen er en NY app-identitet;
  gamle enhets-installasjoner (app.zenji.ios) slettes manuelt.

---

## FASE 0C · Flyttedagen: rebrand + repo-splitt (besluttet 13.07.2026)

**Statusnote 13.07.2026:** Navnet er Zenji; eier kjøpte sportivista.com (tidl. zenji.app) og valgte å
rename repoet umiddelbart (billigste tidspunkt — null brukere å brekke). Gjort:
repo → `CHaerem/sportivista.com (tidl. zenji.app)`, alle serverte stier/brand-strenger oppdatert
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
**Design når den utføres (invertert etter renamen):** `sportivista.com (tidl. zenji.app)` BEHOLDES
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

## FASE 0D · Strukturhelse (kodegjennomgang 14.07.2026) — ✅ KOMPLETT 15.07.2026

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
   *(Avgjort 16.07: beholdt — default sto seg gjennom hele 0D/0E.)*
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
    «chaerem.github.io/Zenji» vs. href `sportivista.com (tidl. zenji.app)`.
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

## FASE 0E · iOS-kvalitet: snappy uten heng + full-kapabel assistent (audit 15.07.2026) — ✅ KOMPLETT 16.07.2026 (＋WP-71 hotfix, se raden)

Bakgrunn: eier-testing avdekket heng og at lang fritekst om interesser ikke ble tolket.
To granskninger 15.07 fant årsakene. **Heng:** all datalasting + full rekompilering skjer
synkront på main-aktøren og re-kjøres per profilendring (`AgendaViewModel.reloadFromCache`,
`ContentView.swift:211`); matching er O(events × entiteter × Levenshtein); QR genereres i
SwiftUI-body med fersk CIContext; 1 Hz-klokka invaliderer hele ContentView; FM-kall mangler
timeout; null instrumentering. **Fritekst:** én FM-generering skal fange N interesser med
kun én-entitets-eksempler («vær konservativ») så ledd droppes; «vintersport» er *ugroundbart*
(null vintersport-entiteter i indeksen, intet paraplybegrep i `SportVocabulary`) enda
serveren følger skiskyting/langrenn/alpint; deklarativ «jeg liker …» er off-script; delvis
suksess rapporteres som bom. **Kapabilitet:** assistenten kan i dag KUN redigere følge-profil
+ svare på feed-spørsmål — tema, nullstill, re-onboard, deling, minne, varsler og all
presentasjonskontroll er UI-only; «hva kan du?» har ingen kunnskapskilde. **Testbarhet:**
ingenting tester ekte FM (kun mock i CI; FM finnes ikke i simulator).

Mål: appen skal føles øyeblikkelig (aldri synkron IO/kompilering på main), assistenten skal
fange interesser fra naturlig prosa og kunne utføre alt UI-et kan, og kvaliteten skal
regresjonstestes uten manuell eier-testing — eierens rolle reduseres til å trykke «kjør eval»
på iPhonen når en assistent-pakke lander.

**Tverrgående regel for 0E:** hver assistent-pakke (WP-65–68) SKAL legge sine cases inn i
eval-korpuset (WP-69) og mock-testene i samme PR. XcodeGen: target-endringer i `project.yml`
følger husstilen med per-linje-begrunnelse.

**Bølge-plan:** 1: WP-60, WP-62, WP-64, WP-69 · 2: WP-61, WP-63, WP-65, WP-70 ·
3: WP-66 · 4: WP-67 + WP-68. (iOS-byggene er tunge — maks ~4 xcodebuild-agenter samtidig.)

**Eierens rolle (eneste manuelle punkter):** kjøre eval-skjermen på fysisk iPhone etter
WP-69/65/66/68 og dele rapporten; ellers ingenting.

### WP-60 · iOS-ytelse: agenda-pipelinen av main-tråden
- **Mål:** Aldri disk-IO/JSON-dekoding/kompilering på main-aktøren; profilendringer
  koalesceres. Dette er den sannsynlige heng-årsaken.
- **Innhold:** `AgendaViewModel.reloadFromCache` (`:74-97`) lastes/dekodes/`buildSections`
  i bakgrunns-Task med hopp tilbake til @MainActor kun for tilordning av
  `sections`/`liveNow`; dekodede entiteter + `EntityIndex` caches i stedet for å gjenbygges
  per kall (også dobbel-dekodingen via `MemoryStore` `:87` og `feedProvider`-en i
  `AssistantViewModel.swift:152-159` som bygger NY indeks per submit — gjenbruk VM-ens);
  raske `onProfileChanged`-kall koalesceres/debounces (starter-pack-scenarioet);
  DEBUG-assertions (`dispatchPrecondition`/MainActor-sjekk) i dekode-/kompileringshjelperne
  så main-tråd-regresjon feiler høylytt i test.
- **Ikke-mål:** matching-algoritmen (WP-61); signposts/MetricKit (WP-63); endre
  kompileringens resultat (alle gylne vektorer bit-like).
- **Aksept:** alle iOS-tester grønne + 13/13 vektorer bit-like; ny test: N raske
  profilendringer ⇒ ≤2 rekompileringer; DEBUG-assertion-test som beviser at dekoding på
  main feiler; begge schemes + ZenjiDeviceDev bygger.

### WP-61 · iOS-ytelse: matching-skalering + perf-porter
- **Mål:** Rekompilering skalerer til kommersiell datastørrelse; ytelse blir en testport.
- **Innhold:** `followableEntities` (`AgendaViewModel.swift:291-307`) kaller
  `EntityIndex.resolve` (full skann + Levenshtein, `EntityIndex.swift:79-102,152-186`)
  ×3 per event — legg eksakt/ordgrense-oppslagskart bygget én gang per indeks, fuzzy kun
  ved miss, memoisering per navn innen én kompilering; XCTest `measure {}`-baselines på
  `buildSections` + `feedProvider` med skalert syntetisk fixture (~500 events / 2000
  entiteter) som feiler ved O(n²)-regresjon.
- **Avhenger av:** WP-60. **Ikke-mål:** endre match-semantikk (vektorene er dommer).
- **Aksept:** identisk output på dagens data (vektorer + snapshot); measure-baseline
  sjekket inn; skalert kompilering < 50 ms på CI-Mac.

### WP-62 · iOS-responsivitet: QR/klokke/FM-timeout
- **Mål:** Fjerne de tre gjenværende jank-kildene fra auditen.
- **Innhold:** QR: `ProfileSharePanel.swift:66` genererer i body med fersk `CIContext`
  (`ProfileQRCode.swift:34-35`) — beregn lenke+bilde én gang i `.task` keyed på payload,
  del statisk CIContext. Klokke: `ContentView.swift:77,310` — flytt ticking til
  liten bladvisning som eier timer + `now` (1-min kadens under Reduce Motion). FM-timeout:
  `session.respond` (`FoundationModelsInterestAssistant.swift:265`) mangler frist — Task-race
  med deadline, rolig norsk «tok for lang tid»-tilstand, behold Avbryt; unit-test med
  fake assistent som sover (timeout-kontrakten er CI-testbar selv om FM ikke er).
- **Ikke-mål:** øvrig AssistantViewModel-endring (WP-66).
- **Aksept:** iOS-tester grønne inkl. ny timeout-test; skjermbilder uendret begge temaer.

### WP-63 · iOS-instrumentering: signposts + MetricKit
- **Mål:** Reelle heng på enhet gir telemetri i stedet for å måtte reproduseres for hånd.
- **Innhold:** `os_signpost`-intervaller rundt last/kompiler/submit-preludium (hotpathene
  fra auditen); MetricKit-abonnent (`MXHangDiagnostic`, `MXAppLaunchMetric`) som logger
  lokalt til Application Support med diskret eksport fra debug-/innstillings-flate
  (personvern: aldri nettverk, samme mønster som MisunderstoodLog); kort README-avsnitt
  om hvordan Instruments-Hangs leses mot signpostene.
- **Avhenger av:** WP-60 (instrumenterer de flyttede stiene). **Ikke-mål:** fjerntelemetri.
- **Aksept:** iOS-tester grønne; signposts synlige i Instruments på simulatorkjøring;
  MetricKit-abonnenten unit-testet med syntetisk payload.

### WP-64 · Entitets-/kategoridekning (vintersport m.m.)
- **Mål:** Paraplybegreper og bredt-fulgte sporter kan groundes — «all vintersport» skal
  bli en gyldig, bekreftbar mutasjon.
- **Innhold:** Server: `scripts/build-entities.js` publiserer sport-/kategori-entiteter
  for alle `followBroadly`-sporter i interests.json (skiskyting, langrenn, alpint, hopp …)
  med norske aliaser; `entities.json`-fixtures i `ios/ZenjiTests/Fixtures` re-fryses etter
  policyen. iOS: `SportVocabulary` (`EntityIndex.swift:356-365`) får vintersport-nøkler +
  kategori→sport-ekspansjon («vintersport» → settet), og resolveren kan servere en
  kategorifølging (scope: bred sport) — samme diff/bekreft-flyt.
- **Ikke-mål:** prompting (WP-65); nye fetchere (research-agenten eier vintersport-events).
- **Aksept:** npm test grønt (entities-tester); iOS-tester grønne; «følg vintersport» og
  «skiskyting» grounder i mock-testen; eval-case lagt til korpuset (når WP-69 er inne —
  ellers i PR-beskrivelsen).

### WP-65 · Assistent: bulk-fangst + delvis rapportering
- **Mål:** Lang naturlig prosa om interesser gir korrekt sett av mutasjoner, og delvis
  forståelse rapporteres per ledd — aldri som samlet bom.
- **Innhold:** Dekomponering: FM-instruksjonene (`FoundationModelsInterestAssistant.swift:349-404`)
  får eksplisitt fan-out (flerledds-eksempler, deklarativ «jeg liker/følger …»-cue →
  mutasjonsarmen, én mutasjon per ledd, `searchEntities` per kandidat); vurder to-stegs
  kandidat-ekstraksjon hvis én generering fortsatt underproduserer (mål mot eval).
  Delvis rapportering: `AssistantExplanation` (`AssistantModels.swift:224-243`) utvides til
  per-ledd-regnskap («la til golf, Hovland, F1 · fant ikke 'X' — mente du …?»); dropp
  aldri ledd stille. Onboarding («Si gjerne flere ting», `OnboardingView.swift:149`)
  bruker samme flyt. Mock-parseren utvides tilsvarende (deterministisk flerledds-split)
  så alt er CI-testbart.
- **Avhenger av:** WP-64 (vintersport må kunne grounde), WP-69 (målbart).
- **Ikke-mål:** app-kommandoer (WP-66); presentasjonsfilter (WP-67).
- **Aksept:** mock-tester: eierens faktiske ytring-klasse («jeg liker golf, spesielt
  Hovland, all vintersport, følger Brann og litt F1») gir 5 forslag med riktige id-er;
  per-ledd-forklaring verifisert; eval-korpuset utvidet med ≥8 flerledds-cases; alle
  iOS-tester grønne.

### WP-66 · Assistent: app-kommando-arm + hurtigknapper
- **Mål:** «Alt» kan utføres via assistenten; hovedfunksjonalitet får i tillegg få,
  intuitive knapper.
- **Innhold:** Tredje intent-arm (`AssistantTurn.command`) + kommandokatalog med
  bekreftelses-semantikk der det trengs: tema (system/mørk/lys), nullstill (gjenbruk
  WP-32-flytens bekreftelse), kjør onboarding på nytt, del profil / vis QR, «hva vet du
  om meg» (åpne minne) + «glem …», varsel-ledetid på/av (NotificationPlanner har i dag
  INGEN kontrollflate — minimal innstilling innføres her), åpne event-detalj («vis
  Brann-kampen»). Grounding-prinsippet består: kommandoer valideres deterministisk, farlige
  krever bekreft. Hurtigknapper: stille chips i assistent-arket for hovedhandlingene
  (DESIGN.md-tro, ingen dashboard-følelse). Mock-parser + tester for hver kommando.
- **Avhenger av:** WP-62 (deler AssistantViewModel), WP-65 (deler FM-instruksjoner).
- **Ikke-mål:** presentasjonsfilter (WP-67); nye features bak kommandoene.
- **Aksept:** dekningsmatrisen fra auditen lukket (hver rad ✅ eller eksplisitt
  besluttet-utenfor); mock-tester per kommando; eval-cases lagt til; iOS-tester grønne;
  skjermbilder av chips i begge temaer.

### WP-67 · Assistent: presentasjonsfilter
- **Mål:** «Vis bare golf denne uka» endrer hva agendaen viser — midlertidig, ærlig, lett
  å nullstille (i dag feiltolkes det som *følg golf*).
- **Innhold:** Efemær `AgendaFilter { sports, entiteter, datovindu }` på `AgendaViewModel`
  (aldri persistert, rører ikke profilen); `AssistantTurn.present(filter)`; stille
  filterlinje over agendaen («Viser: golf · denne uka ✕») med ett-trykks reset;
  `FeedQuery`-gjenbruk for filtersemantikk; mock + FM-instruksjoner + eval-cases.
- **Avhenger av:** WP-66 (intent-arm-mønsteret). **Ikke-mål:** lagrede visninger.
- **Aksept:** de 5 predikatene/vektorene urørt (filteret er et visningslag); mock-tester;
  filterlinje-skjermbilder begge temaer; eval-cases.

### WP-68 · Assistent: app-hjelp-kunnskap
- **Mål:** «Hva kan du?» / «hvordan nullstiller jeg?» / generelle spørsmål om appen
  besvares fra kuratert fakta — ikke fra tom feed.
- **Innhold:** Versjonert norsk hjelpe-/kapabilitetsdokument (kort, vedlikeholdes som
  kode ved siden av kommandokatalogen — WP-66-katalogen genererer gjerne deler av det);
  eksponert som read-only FM-verktøy (à la `getProfile`) + i mock-answereren; svar
  refererer handlinger brukeren kan ta («si 'nullstill' eller åpne …»). Koherens-test:
  hver kommando i katalogen har hjelpe-omtale.
- **Avhenger av:** WP-66. **Ikke-mål:** generell verdenskunnskap (on-device-modellen
  svarer ikke på ting utenfor appen/feeden — ærlighetsregelen består).
- **Aksept:** mock-tester for hjelpe-spørsmål; koherens-testen grønn; eval-cases.

### WP-69 · FM-eval-harness på enhet + korpus
- **Mål:** Ekte FM-kvalitet måles med ett trykk på eierens iPhone — erstatter manuell
  utforskende testing som kvalitetssignal.
- **Innhold:** DEBUG-only eval-skjerm (ingen ny target — minst mulig project.yml-endring):
  kjører versjonert ytringskorpus (`ios/ZenjiTests/Fixtures/eval-corpus.json` e.l.:
  WP-16-kanonene + eierens flerledds-klasse + vintersport + kommandoer/filter etter hvert)
  gjennom den EKTE `FoundationModelsInterestAssistant`, scorer strukturert output mot
  golden-forventninger (id-sett for mutasjoner; rad-id-er for svar; rubrikk for fuzzy
  svar-tekst), viser pass-rate per kategori og eksporterer anonymisert JSON-rapport via
  delesheet (samme personvernmønster som MisunderstoodLog-eksporten); import av
  MisunderstoodLog-entries som nye korpus-kandidater. Samme korpus kjøres mot mocken som
  vanlig XCTest i CI (deterministisk del).
- **Ikke-mål:** kjøre FM i CI (umulig); auto-tuning.
- **Aksept:** korpus-filen versjonert med ≥20 cases; mock-delen kjører i CI; eval-skjermen
  bygger i DEBUG og er manuelt kjørbar (eieren kjører første reelle runde og deler
  rapporten); rapportformatet dokumentert i ios/README.
### WP-70 · XCUITest: hovedflyter + launch-metrikk
- **Mål:** Hoved-UX-en regresjonstestes i simulator uten manuell testing.
- **Innhold:** Ny UI-test-target i `project.yml` (per-linje-begrunnelse); flyter mot
  mock-assistenten: onboarding (quick-picks + samtale), følg via kommandolinje +
  bekreft-diff, starter-packs (N raske — vokter WP-60-koalesceringen), event-detalj +
  «hvorfor vises denne», tema-toggle, nullstill-flyt; `XCTApplicationLaunchMetric` for
  kaldstart + `XCTOSSignpostMetric` rundt følg-flyten (bruker WP-63-signpostene når de
  finnes, ellers legges de inn her minimalt); kjøres lokalt/på PR-agentens Mac — CI-krav
  er kun at targeten bygger.
- **Ikke-mål:** eval av ekte FM (WP-69); visuell pixel-perfeksjon (visual-qa eier web).
- **Aksept:** alle flytene grønne i simulator; launch-metrikk-baseline sjekket inn;
  ios/README §testing oppdatert.

### Oppfølgingsregister etter 0E (kjente svakheter, kandidater til neste fase)

Konsolidert fra PR-beskrivelsene #277–#288 (detaljer der). Eierens on-device
eval-rapport er fasiten for alle:

- **A · Grunnfestings-granularitet** — bart idrettsnavn grunnfestes til
  enkeltutøvere i stedet for sport-entiteten («Mer sykkel» → ryttere). Største
  kjente assistent-kvalitetsgap (#288).
- **B · Winter-kvalitet 0/2** mot ekte FM (samme mønster som A) (#284/#288).
- **C · Spørsmålsarmen 2/5** — modellen utelater rad-siteringer; WP-68s
  instruks hjalp ikke målbart (#286/#288).
- **D · Norske klubber ugroundbare** — «Brann» finnes ikke i entitetsindeksen;
  klubbdekning utover interests.json er et datahull (#284/#285).
- **E · 5-ledds fan-out** upålitelig on-device (mocken klarer alt) (#284).
- **F · Ruting-presedens/parser-overlapp** i mock-stakken — fire parsere med
  hver sin tokenisering; en delt interrogativ-detektor ville forebygget neste
  «varsler»-type kollisjon (fikset enkeltvis 16.07).

---

## FASE 0G · Motor-herding før TestFlight (audit 18.07.2026) — ✅ IMPLEMENTERT 18.07.2026 (WP-90–94, #301–#306) · observasjonsvindu + portmåling gjenstår

Bakgrunn: eier-beslutning om å herde kjernemotoren (pipeline + research/verify —
riktig tid, riktig norsk kanal, null tapte events) FØR eksterne TestFlight-testere.
Fem parallelle READ-ONLY-audits (research-kvalitet, korrekthet, dekning, tavle-
sanity, robusthet) fant konvergerende funn. Tavle-sanity var betryggende (7/8
web-verifiserte stikkprøver KORREKTE, inkl. VM-tider/NRK og F1-tittelen) — men
kjedene RUNDT tavla har reelle brudd.

**Hovedfunnene (konsolidert):**
1. **Kanal-korrekthets-kjeden er brutt live:** `golf.js` hardkoder Viaplay for all
   PGA (utdatert — HBO Max/Eurosport fra 2026); `build-events` sin carry-forward
   fyller kun TOMME felt, så verify-rettelser klobres av fetcher-defaulten HVER
   time (Corales: 5+ dagers revert-krig; motstridende data på tavla i dag).
   `norwegian-rights`-skillen sier fortsatt Viaplay [solid].
2. **Skill-skrivingen «BLOCKED by permission gate» er trolig VANDREHISTORIE:**
   settings.json har ingen slik regel, workflow-allowlisten tillater Edit +
   `git add .claude/skills/`, og commit 914b55666 (3. juli) SKREV til fila.
   Seks kjøringer har gjenfortalt påstanden uten å feilsøke. Må REPRODUSERES.
3. **Eskaleringsveien død ≥2 uker:** coverage-critic/scout får HTTP 403 på
   `gh workflow run` (trolig repo-innstilling «Workflow permissions: read»).
   `escalated: false` i alle 13 kjøringer — fast-lane har aldri virket.
4. **Selvhelbredelses-loggen mistes:** self-repair/ui-fix sitt «Commit run log»-
   steg feiler på git-push-auth (Invalid username or token) — logger 8 dager
   stale, ekte funn tapt, og runs feilmerkes «failure».
5. **Vaktene sover:** graderen 52/52 pass (klassifiserte den kjente feilen som
   «note»); mekanisk gap-detektor blind for alt RSS ikke nevner (Gstaad-hullet
   usett); kalibreringen straffer KORREKTE kilder som retter våre provisoriske
   verdier (cyclingstage.com 0.27!).
6. **Relevans-gaten håndhever ikke presiseringene:** `chess` ubetinget i
   followBroadly + ai-research-autopass ⇒ Barcelona-klubbturnering på tavla
   tross «kun elite»-interesse; samme hull latent for esport («kun 100 Thieves»
   beskyttes bare av fetcheren). NB: endring av isRelevant berører de gylne
   feed-vektorene ⇒ iOS FeedCompiler i lås-steg + re-frysing.
7. Småplukk: kvote-gate leser inntil 1t gammel snapshot (kritiske agenter
   hard-feiler i røde vinduer i stedet for grasiøst hopp); validate-feil fryser
   hele pipeline-timen (bør degradere); venue:"TBD" usynkron med verifisert
   summary; F1-KVALIFISERING står i interests men mangler hver helg (severity-
   felle: alltid «low», aldri eskalert — EIERBESLUTNING: vil du ha quali-events,
   eller justere interests-teksten?); UCL mangler tracked-placeholder; sykkel-
   evidens = samme to boilerplate-URL-er.

**Eierbeslutninger:** (a) F1-kvalifisering inn på tavla eller ut av interests?
(b) Repo-innstilling Actions workflow-permissions → read/write (sikkerhetsvalg);
(c) WP-91 rører `.github/workflows/**` = beskyttet sti ⇒ PR-ene venter på
menneskelig merge.

### WP-90 · Kanal-korrekthets-kjeden (HASTER — brukersynlig feil nå)
- **Mål:** Verifiserte verdier overlever; golf-kanalene riktige.
- **Innhold:** `golf.js` tier-splitt (majors/DPWT→Viaplay, ordinær PGA→HBO Max/
  Eurosport); `build-events` carry-forward: felt med `verificationStatus:
  confirmed|amended` vinner over ikke-tom fetcher-default (med TTL) + test;
  `norwegian-rights`-skillen rettes (PGA-linja + de fire ferdig-utkastede
  rettelsene i tracked.json-loggen); fjern/rett Corales-motsigelsen på tavla.
- **Aksept:** npm-suite grønn + ny carry-forward-test; Corales viser HBO Max
  og OVERLEVER neste pipeline-kjøring.

### WP-91 · CI-nervesystemet (tokens/permissions) — BESKYTTEDE STIER
- **Mål:** Eskalering virker; run-logger committes; skill-skriving avmystifisert.
- **Innhold:** Diagnostisér+fiks 403 på workflow-dispatch (repo-innstilling
  eller PAT); fiks push-auth i «Commit run log»-steget (self-repair/ui-fix/
  improve); REPRODUSÉR skill-skrive-«blokkeringen» med faktisk feilmelding og
  fiks rotårsaken; alarm ved feilet eskalering (ikke stille notes-felt).
- **Aksept:** en test-eskalering går gjennom; run-log-commit lander; en
  skill-write fra CI-kjøring beviselig committet.

### WP-92 · Relevans-gaten (ro-løftet)
- **Mål:** interests-presiseringene håndheves i koden, ikke bare i prosa.
- **Innhold:** `chess` ut av ubetinget followBroadly (krev alwaysTrack-match:
  Carlsen/Tari/navngitte turneringer); esport-lagsjekk i isRelevant; scope
  ai-research-autopass til events som OGSÅ matcher en interesse;
  `research.md` sjakk-scout får elite-terskel. **Lås-steg:** iOS FeedCompiler
  speiles + gylne vektorer re-fryses bevisst (DIVERGENCES.md-prosedyren).
- **Aksept:** Sant Martí-klassen filtreres; vektorer re-frosset og bit-like
  på begge sider; eksisterende relevante events uendret.

### WP-93 · Vaktene (grader + gap-detektor + kalibrering)
- **Mål:** Vaktene fanger det auditene fant manuelt.
- **Innhold:** Grader-rubrikk: summary-vs-streaming-selvmotsigelse = hard
  deduction; uadresserte gjentatte anbefalinger scores; evidens-domene-
  diversitet telles. `detect-coverage-gaps`: fjerde signal (tracked.json-
  påstander vs events.json-realitet). `aggregate-calibration`: skill mellom
  «kilden tok feil» og «kilden rettet vår provisoriske verdi». Gjentatt
  identisk gap N ganger ⇒ auto-eskaler severity én klasse.
- **Aksept:** rubrikk-test som beviser Corales-klassen fanges; gap-test for
  Gstaad-klassen; cyclingstage-reliability normaliseres.

### WP-94 · Drifts-småplukk — 🔬 PR åpen
- **Innhold:** kvote-gate: fersk sjekk før kritisk-tier-kall + grasiøst
  «skippet: kvote» i stedet for hard feil; validate-events-feil degraderer
  (behold forrige gyldige data + alarm) i stedet for å fryse timen; verify-
  kontrakten synker `venue` med verifisert summary; UCL tracked-placeholder-
  regel (hver alwaysTrack-turnering har entry).
- **Levert i denne PR-en:** (1) `usage-gate.js` henter selv en fersk
  ratelimit-avlesning (gjenbruker `check-usage.js`) når den cachede
  `usage-state.json`-snapshoten er eldre enn ~10 min, med fail-open bevart og
  `source` (fresh/cached-fresh/cached-stale-fetch-unavailable/none) logget i
  gate-outputen — NB: live-lesningen trenger `CLAUDE_CODE_OAUTH_TOKEN` i
  akkurat det workflow-steget, som i dag kun `usage-monitor.yml` har; de
  kritiske agent-workflowene (research/verify/scout) må selv eksponere den til
  usage-gate-steget for at fresh-veien faktisk skal slå inn — det er en
  `.github/workflows/**`-endring (beskyttet sti), ikke gjort her, degraderer nå
  trygt til det gamle cached/fail-open-oppførselen. (2) `build-events.js`
  validerer selv (gjenbruker `validate-events.js` sin nye eksporterte
  `validateEvents()`) FØR den skriver `events.json`; ved brudd beholdes forrige
  gyldige fil urørt + `docs/data/build-alert.json` skrives (ok:true/false,
  persistent helse-signal, ikke bare en engangs-feillogg) — scriptet exit(0)
  uansett, så pipeline-jobben (og det påfølgende harde `validate-events.js`-
  steget, som da re-validerer den BEHOLDTE gode filen) fortsetter uavbrutt. (3)
  `research.md` Steg 1 presisert: hver `alwaysTrack.tournaments`-oppføring
  krever en tracked.json-entry, av-sesong-placeholder inkludert. **Ikke i
  denne PR-en:** `venue`/summary-synk i verify-kontrakten — det er
  `verify.md`, WP-93 sitt territorium (parallell nabo, ikke rørt her).
- **Aksept:** npm grønn; simulert rød kvote gir skip-not-fail; simulert
  validate-brudd publiserer forrige data med alarm.

**Bølge-plan:** 1: WP-90 (+ WP-91-diagnosen) · 2: WP-91-fiks (menneske-merge)
+ WP-93 · 3: WP-92 (lås-steg med iOS) + WP-94. **Porter måles deretter 1–2
uker normal drift** (dekning: null tapte fulgte events; korrekthet: amend-rate
nær-term → ~0; robusthet: null stille kritiske stopp) → grønt = TestFlight.

### WP-95 · Deltakelses-ferskhet (eier-funn 18.07 — NY FEILKLASSE)
Eieren fant live-feil auditen ikke målte: Hovland vises som aktiv i The Open +
morgen-headline «Hovland ut i tredje runde» — generert TIMER etter at han røk
cutten (web-bekreftet: fem over fredag, to slag bak cut-linjen). Auditen målte
tid/kanal — ikke DELTAKELSE (cut/trekning/eliminering midt i turneringer).
Diagnose: `norwegianPlayers`-berikelsen (golf.js/pgatour-scraper) har INTET
status-begrep; iOS-linsen (`LensRenderer`) har allerede et `status`-felt som
rendres ordrett — serveren sender det bare aldri.
- **Mål:** En fulgt utøver som er ute av en pågående turnering vises ALDRI som
  aktiv, og redaksjonen kan aldri skrive en deltakelses-påstand mot stale data.
- **Innhold:** (a) Server: cut-/status-deteksjon i golf-berikelsen (ESPN-
  leaderboard har per-spiller-status/MC) → `norwegianPlayers[].status` («røk
  cutten» o.l.) + fjern tee-rader for spillere ute; (b) `verify.md`: deltakelses-
  sjekk for fulgte utøvere i pågående turneringer (cut/WD/startliste) — samme
  prioritet som tid/kanal; (c) `editorial.md`: hard regel — enhver «spiller
  i dag»-påstand om fulgt utøver krysssjekkes mot fersk kilde før headline;
  (d) klient: lens/web viser rolig «røk cutten»-status i stedet for tee-rad
  (iOS-feltet finnes; web sjekkes); (e) grader-rubrikk: deltakelses-påstand i
  brief uten kilde = trekk.
- **Aksept:** The Open-oppføringen viser korrekt Hovland-status og OVERLEVER
  pipeline-rebuild; test som reproduserer cut-klassen; kveldsbrief 15:00 UTC
  skriver ikke feilen på nytt. **NY PORT i portmålingen:** null feilaktige
  deltaker-statuser for fulgte utøvere.

## FLYTTEDAGEN · Zenji → Sportivista — ✅ UTFØRT 17.07.2026

Eierbeslutning (varemerke-søk utsatt, risiko akseptert av eier): repo omdøpt til
`CHaerem/sportivista` (GitHub redirecter gamle URL-er), rebrand+identitetsflytting
merget til main, Pages-domene → `sportivista.com` (GoDaddy-DNS A/AAAA/CNAME via API),
`zenji.app` kuttet som domene (auto-fornyelse skrus av — dør ved utløp 2027-07-13).
iOS: `app.sportivista.ios`-id-er, `group.app.sportivista`, `sportivista://`, baseURL →
`sportivista.com/data/`. Web: navnebyttet; Tekst-TV-utseendet består til egen web-reskin.
Gjenstår: formelt varemerke-søk+registrering (eier), `sportivista.no`-forwarding (manuell,
GoDaddy-UI), zenji.app renewAuto-toggle (manuell — API-PATCH bet ikke), web-reskin til
baseline, mekanisk target-rename (Zenji.xcodeproj → Sportivista), TestFlight (WP-17).

## FASE 0F · iOS-UX: Apple-native baseline (audit 17.07.2026) — ✅ KOMPLETT 17.07.2026 (#289–#295)

> **Resultat:** iOS-appen + widgeten står nå på et Apple-native fundament — systemfont
> + Dynamic Type, semantiske system-farger + amber-token, `List`/`NavigationStack`/
> native sheets, SF Symbols, lett haptikk — med visjonen intakt (rolig agenda, ambient
> kontekst-hjelper, personvern, ærlighet). `DESIGN.md` er den nye kontrakten; en HIG-CI-
> gate hindrer regresjon. **Web (`docs/`) beholder Tekst-TV til rebrandingen** (eierbeslutning).
> Neste (egne beslutninger): web-migrering ved rebrand, robusthet (degradering uten Apple
> Intelligence, trygge destruktive kommandoer), og selve rebrandingen (nytt navn + profil).

Bakgrunn: eier-gjennomgang 17.07 fant at UX-en ikke føles intuitiv/snappy, at
assistent-arket er overlesset (~15 seksjoner i én flate: `AssistantPanel.swift`),
at det ikke finnes forutsigbar navigasjon (alt er overlays på én skjerm), og at
flere valg bryter Apple HIG. Tydeligst: `zenjiMono(size:)` (`DesignTokens.swift:104`)
bruker FASTE punkter og skalerer IKKE med Dynamic Type — tross DESIGN.md-løftet;
agenda-rader er `.onTapGesture` (`AgendaView.swift:74`) uten pressed-state/button-
rolle; lista er `ScrollView`+`LazyVStack`; assistent-resultatet er et egendefinert
fade-lag (`ContentView.swift:174-186`), ikke en native sheet.

Mål: legg et **Apple-native fundament** (systemfont + Dynamic Type, semantiske
system-farger + amber-token, SF Symbols, `List`/`NavigationStack`/native sheets,
native bevegelse + lett haptikk) UTEN å miste visjonen (rolig én-formåls agenda,
ambient kontekstbevisst hjelper, personvern på enheten, ærlighet). Normativ
kontrakt: **`DESIGN-BASELINE.md`** (utkast — promoteres til `DESIGN.md` i WP-85).

Strategisk premiss (eier 17.07): en full rebranding (nytt navn + designprofil)
kommer på sikt («Zenji» oppleves for lite intuitivt). Derfor bygges skallet som et
tynt, byttbart token-lag, så rebrandingen blir en **re-skin** (nye token-verdier,
font, ikoner, logo) — ikke en ombygging. Kjernefunksjonaliteten + UX mot hovedmålet
herdes FØRST; det kosmetiske byttes ETTERPÅ.

**Tverrgående regel for 0F:** (a) hver WP migrerer KUN sine egne filer til det nye
token-/type-API-et; **WP-80 beholder `zenjiMono(size:)` som deprecated shim** så alt
kompilerer underveis — shimen dør først i WP-85. (b) Ingen gylne vektorer/predikater
endres (rendering + nav er lag oppå). (c) Skjermbilder i BEGGE temaer + minst ett ved
forstørret Dynamic Type per UI-PR.

**Bølge-plan:** 1: WP-80 · 2: WP-81 ∥ WP-82 · 3: WP-83 · 4: WP-84 ∥ WP-85.
(Maks ~4 xcodebuild-agenter; her ≤2 samtidig.)

**Sluttreview (Fable 5):** etter bølge 4, FØR promotering til `DESIGN.md`, kjører
hovedsesjonen én dyp review-runde på den rebasede kombinasjonen — HIG-sjekklista
(`DESIGN-BASELINE.md`) + korrekthet + gylne vektorer bit-like — med **Fable 5** som
reviewer når ukeskvoten tåler det (ellers Opus + `/code-review`). Enkelt-PR-er
grønne beviser ikke kombinasjonen (WP-71-lærdommen).

**Eierens rolle (manuelle punkter):** (1) godkjenn baseline-retningen
(`DESIGN-BASELINE.md`) før delegering; (2) ingen beskyttede stier berøres ⇒ alt
auto-merger etter test-gate; (3) kjør evt. FM-eval på iPhone kun hvis assistent-
OPPFØRSEL endres (WP-82 er ren presentasjon — mock-suite grønn holder).

### WP-80 · Token- & typografi-fundament
- **Mål:** Semantiske farge-tokens (system-farger + amber-aksent) + Dynamic Type-
  tekststil-API. Ikke-brytende (shim beholdes) så resten kan migrere uavhengig.
- **Innhold:** `DesignTokens.swift:22-107` — erstatt de rå `ZenjiTokens.Dark/Light`-
  flatene med semantiske tokens (background/groupedBackground/cell/cell2/label/
  secondaryLabel/separator/accent/live/destructive) mappet til system-farger +
  amber; nytt Dynamic Type-tekststil-API (`Font.zenji(_ style:)` bundet til
  tekststiler, tabular der sifre rettes inn); behold `zenjiMono(size:)` som
  `@available(*, deprecated)` shim → nærmeste tekststil (widget + alle view-er
  kompilerer uendret); spacing-tokens (8pt). Token-tester.
- **Ikke-mål:** migrere view-ene (surfaces gjør sitt eget); fjerne shim (WP-85);
  web/widget-restyling (WP-84).
- **Aksept:** alle fire schemes bygger (shim holder widget/agenda/assistant levende),
  iOS-suite grønn, 13/13 gylne vektorer bit-like.

### WP-81 · Agenda → native List
- **Mål:** Agendaen som native `List` med pressed-state, sveip-handlinger og SF Symbols.
- **Innhold:** `Agenda/AgendaView.swift` — `ScrollView`+`LazyVStack`+`.onTapGesture`
  → `List` inset-gruppert (dag-seksjoner), rad som `Button`/`NavigationLink`
  (pressed-state + button-rolle gratis), native chevron, SF Symbols (`bell.fill`
  varsel, `info.circle` AI), amber must-see-prikk beholdt; sveip venstre → Følg/
  Demp/Påminn; `EventDetailSheet`/`SeriesDetailSheet` på
  `.presentationDetents([.medium,.large])`; migrér `Agenda/`-fontene til WP-80-API;
  lett haptikk på sveip-handling. UI-suite agenda-flyt oppdatert.
- **Avhenger av:** WP-80. **Nabo:** WP-82 eier `Assistant/` — union ved rebase-konflikt.
- **Ikke-mål:** navigasjon/`ContentView` (WP-83); feed-predikater/vektorer (dommer); assistant.
- **Aksept:** 13/13 vektorer bit-like, ZenjiUITests agenda grønn, alle schemes
  bygger, skjermbilder begge temaer + forstørret Dynamic Type.

### WP-82 · Hjelperen → native (slank + sheet + oppdagbarhet)
- **Mål:** Assistenten gjør KUN samtale+resultat; resultat i native sheet;
  kommandolinja som native søke-/skrivelinje; de tre oppdagbarhets-tilstandene.
- **Innhold:** `Assistant/AssistantPanel.swift` — fjern de permanente seksjonene
  (profil/minne/del/varsel/tema/nullstill/versjon/eval → re-hjemmes i WP-83s Deg);
  behold svar/diff/regnskap/ikke-funnet/ingen-endring; vis resultatet via `.sheet`
  + `.presentationDetents`. `Assistant/CommandLineView.swift` — native tekstfelt i
  søke-/skrivelinje-form (diktering via tastatur-mic, clear-knapp, keyboard
  avoidance), hvile-eksempel-placeholder, fokus-forslag, live grunning ved skriving;
  lett haptikk på Bekreft. Migrér `Assistant/`-fontene.
- **Avhenger av:** WP-80. **Nabo:** WP-81 eier `Agenda/`.
- **Ikke-mål:** intent-tolkning/FM-oppførsel (uendret); Deg-skjermen (WP-83); nav.
  **0E-regel:** ingen ny modell-kapabilitet ⇒ mock-suite MÅ forbli grønn + UI-cases
  for de tre tilstandene (ikke nye eval-cases påkrevd).
- **Aksept:** mock-suite grønn, ZenjiUITests assistent-flyt grønn, alle schemes
  bygger, skjermbilder.

### WP-83 · Navigasjon + Deg-skjerm
- **Mål:** `NavigationStack` med agenda som rot + `gearshape`→Deg; ny gruppert
  Deg-skjerm som re-hjemmer de permanente seksjonene fra WP-82.
- **Innhold:** `ContentView.swift` — pakk agendaen i `NavigationStack`, `gearshape`-
  toolbar-knapp (trailing) pusher Deg; fjern v2-header-glyfene (assistent = bunn-
  linja, tema flyttes til Deg). Ny `Zenji/Profile/DegView.swift` — inset-gruppert
  `List` (SF Symbols leading) som re-hjemmer HVA JEG FØLGER, HVA JEG VET OM DEG,
  DET JEG IKKE FORSTO, DEL PROFIL, VARSEL, UTSEENDE (tema), NULLSTILL, versjonslinje
  (+ EVAL/TELEMETRI i DEBUG); gjenbruk `WhatIKnowView`/`ProfileSharePanel`/reset-
  flyten pushet fra Deg. UI-suite nav/Deg/tema.
- **Avhenger av:** WP-82 (seksjonene fjernet der) + WP-81 (agenda-host stabil).
- **Ikke-mål:** endre minne-/profil-/reset-LOGIKKEN (kun re-hjemme innganger);
  assistant-innhold (WP-82).
- **Aksept:** alle schemes bygger, ZenjiUITests (åpne Deg via gear, tilbake-swipe,
  tema-sykle) grønn, skjermbilder begge temaer.

### WP-84 · Widget + web token-paritet
- **Mål:** Widget og web følger de nye tokenene.
- **Innhold:** `Zenji/Widget/*` bruker de semantiske tokenene + Dynamic-Type-analog;
  `docs/css/*` + `docs/js/theme.js` speiler token-verdiene (rem/clamp).
- **Avhenger av:** WP-80. **Nabo:** WP-85.
- **Ikke-mål:** app-skjermene (gjort i WP-81/82/83).
- **Aksept:** ZenjiWidgetExtension bygger, web-screenshots begge temaer, `npm test` grønt.
- **Status (🔬):** widget-delen er levert i egen PR — `ios/ZenjiWidget/*` migrert av
  `zenjiMono(size:)`-shimen og de deprecated farge-aliasene (`foreground`/`muted`) til
  `Font.zenji`/`zenjiTabular` + semantiske tokens (`label`/`secondaryLabel`), så shimen
  trygt kan fjernes i WP-85. **Web-delen (`docs/css/*` + `docs/js/theme.js`) er bevisst
  utsatt til en egen beslutning** og er IKKE med i denne PR-en.

### WP-85 · Baseline-designsystem + HIG-gate (SIST)
- **Mål:** Fjern shimen, slå på HIG-gaten, promotér designdokumentet.
- **Innhold:** `DesignTokens.swift` — fjern `zenjiMono(size:)`-shimen (alle surfaces
  migrert). Ny CI-gate `tests/ios-dynamic-type-gate.test.js` (vitest greper
  `ios/Zenji` for isolert `.system(size:` utenom hvitelistede unntak — samme
  koherenstest-mønster). Promotér `DESIGN-BASELINE.md` → `DESIGN.md` (arkivér v2);
  oppdater `CLAUDE.md`/`ios/README.md`-referanser + Forbudslista.
- **Avhenger av:** WP-80,81,82,83,84.
- **Ikke-mål:** nye features.
- **Aksept:** full JS+iOS-suite grønn MED gaten på, alle schemes bygger, null
  `zenjiMono(size:)`-referanser igjen, `DESIGN.md` = baseline.

---

## 🚪 GATE G1 · Lakmustesten (dossier P500 Fase 0)

Etter ~4 uker TestFlight: åpner folk appen daglig uten push-mas? D7-retention?
**Beslutning (menneske):** gå til Fase 1, forbli hobbyprodukt, eller avvikle app-sporet.
Alt under denne linjen er skisse som re-planlegges ved gaten.

---

## VISJON v3 (eier, 18.07.2026) · Den komplette personlige feeden — dossier-tillegg

Sportivista er på sikt **den komplette personlige nyhetsfeeden for alt du
følger**: nyheter om det du følger + live-status + kommende events med hvor
du ser det. Strategiske rammer (drøftet og omforent):

- **Posisjonen er DET PERSONLIGE FILTERET** — tverrsnittet ingen eier:
  FotMob/F1/PGA-appene = vertikal dybde; nyhetshusene = horisontal bredde uten
  personalisering. Sportivista = personlig horisontal (alt du følger, inkl.
  esport, ingenting annet, rolig, med tider/kanaler du stoler på). Spoilervernet
  blir en genuin differensiator i nyhetskontekst.
- **Ikke konkurrer på dekning eller live-dybde.** Live = «hva er på nå,
  stillingen, hvor ser jeg det» + deep-link til spesialisten (FotMob/F1-appen/
  kringkaster). Rights-trygt (fakta er frie); offisielle datalisenser
  (Opta/Sportradar-klassen) er andres voll.
- **Nyhets-juss designes rundt fra dag én:** DSM art. 15 (publisher-retten) gjør
  AI-sammendrag av enkeltartikler grått. Strategien er «facts are free»:
  destiller FAKTA på tvers av kilder til egen brief-tekst + lenk kildene
  (dagens editorial-mønster). Overskrift+lenke ut er trygt.
- **Arkitektur = dagens to-lags-mønster, ny datatype:** server aggregerer/
  klynger/destillerer med entity-tags → `news.json` via manifest-syncen;
  klienten personaliserer med ren Swift-linse (FeedCompiler-mønsteret,
  golden-vector-testbart) + on-device FM for Q&A/sammendrag. (NB: PCC er
  Apples egen infra — tredjeparter deployer ikke dit; personalisering skjer
  on-device + egen server, personvernløftet holdes ved at serveren aldri ser
  interessene.)
- **Formen forblir tavle, ikke strøm:** entitets-sentrerte kort (nyhet ·
  resultat · kommende · live) i rolig dagsrytme med redaksjonelt tak — aldri
  uendelig scroll. Ro-identiteten ER differensiatoren.

**WP-100 · Nyhets-v0 «Nyheter om det du følger» (ETTER G1):** nesten gratis
innenfor dagens arkitektur — `rss-digest.json` (11 kilder, hentes alt hver
time) + entity-matching → en stille seksjon med overskrift · kilde · lenke ut,
filtrert av linsen, spoiler-vernet. Tester nyhets-hypotesen på TestFlight-
testerne uten én ny serverkomponent.

## AI-ØKONOMI ved skalering (eier-dilemma 18.07.2026) · dossier-tillegg

Dagens løkker kjører på eierens Claude Max-abonnement (kontobred kvote, delt
med interaktiv bruk — auditens røde vinduer var delvis FORÅRSAKET av eierens
egen utviklingsaktivitet). Omforent analyse:

**Den avgjørende egenskapen er allerede bygget: kost skalerer med DEKNING,
ikke BRUKERE.** Research/verify/editorial produserer én delt verdens-sannhet
(events/news) som alle brukere konsumerer likt; personalisering skjer klient-
side (linsen) til null marginal AI-kost. Marginal bruker ≈ 0 kr. Det som
koster er dekningsbredde (sporter × kilder × ferskhet) — og inntekt skalerer
med brukere. Unit-økonomien fungerer PRESIS fordi arkitekturen er to-lags.

**Det som faktisk er 1-bruker-formet i dag** (og må re-formes ved
kommersialisering):
1. **Deknings-MÅLET:** interests.json definerer hva research jakter på.
   Kommersielt: aggregert etterspørselsmodell — kjernekatalog (toppligaer/
   -sporter, dekket av billige statiske kilder) + langhale utløst av samlet
   brukerbehov (WP-23 gap-voting er allerede skissen).
2. **Editorial:** én personlig brief i dag. Løses av VISJON v3-modellen:
   server destillerer entity-taggede fakta ÉN gang, klienten komponerer den
   personlige briefen lokalt.
3. **Coverage-critic/scout:** dømmer mot én persons interesser → dømmer mot
   etterspørselsmodellen i stedet. Governance-løkkene (self-repair/ui-fix/
   improve/visual-qa) er bruker-uavhengige fastkostnader — uendret.

**Migrasjonssti (abonnement → API):**
- **Fase A (nå, hobby):** Max + kvote-governoren — riktig som det er.
- **Fase B (TestFlight):** SPLITT tokens — pipeline-løkkene over på API-nøkkel
  (ToS-rent, forutsigbart, uavhengig av eierens interaktive bruk) med hard
  budsjett-cap + per-løkke kost-telemetri (utvid usage-monitor); dev forblir
  på Max. Dette fjerner også «eieren jobber mye ⇒ motoren stopper»-koblingen.
- **Fase C (lansering, WP-21):** serverless cron + batch-API (50 % rabatt på
  ikke-hastende research/verify-sveip), prompt-caching, formalisert modell-
  tiering per løkke (scout er alt Haiku; mer av dette).

**Kost-disiplinen som monner mest:** ukens gjennomgående lærdom — **AI
oppdager, KODE håndhever.** Hver løkke som mekaniseres (WP-90: verify fant
golf-buggen 5×, fiksen var kode; WP-93: vaktene ble deterministiske sjekker)
er kvote frigjort permanent. Prinsipp: en AI-løkke som gjentar samme funn ≥3×
skal produsere en kode-/skjema-endring, ikke flere AI-kjøringer.

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
