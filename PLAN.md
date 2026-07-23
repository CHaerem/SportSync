# Sportivista → personlig sportsfeed: implementeringsplan

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
| WP-17 | 💰 TestFlight-oppsett | 0B | WP-14 | ✅ 18.07 — Apple Developer-enrollment GODKJENT: gratis-teamet ble konvertert in place (samme team-ID 9LVCB72DT8); `app.sportivista.ios` + widget-id + App Group + iCloud-container registrert via provisjoneringsbygg; device-bygget signerer nå fulle entitlements, embedder widgeten og kompilerer med `-D SPORTIVISTA_CLOUDKIT` (CloudKitProfileSync aktiv) — installert på eierens iPhone. ✅ FULLFØRT 18.07 kveld: app-record (eier, app-id 6792373768), ASC API-nøkkel NHMW747CLA (App Manager — NB: mangler cloud-signing, distribusjonssignering går via Xcode-kontosesjonen), bygg 0.1.0 (1) arkivert + lastet opp (to valideringsfunn fikset: ITSAppUsesNonExemptEncryption, TARGETED_DEVICE_FAMILY=1 per target — #313), prosessert VALID, intern gruppe «Intern» (auto-alle-bygg) opprettet via API med eieren som tester. Eier: installer TestFlight-appen og aksepter invitasjonen. Eksterne testere: FORTSATT gatet bak grønn portmåling (WP-96-gate åpnet, portene måles). OPPFØLGER 19.07 — full CI/CD: universell web-testgate (ci.yml, npm-suiten gatet før INGEN PR-er utenom loopene), alltid-rapporterende iOS-gate (ios-tests.yml, macos-26 gratis på offentlig repo, skippes selv når ios/ er urørt), TestFlight-release-lane (ios-release.yml: ASC-styrt byggnummer, cloud-signering med Admin-nøkkel, auto-record av opplastingen), merge-gate venter på PR-sjekker, static-pipeline fetch-depth 0 (ærlig iosCommit). Håndhevings-lærdom 19.07: required checks på plattformnivå blokkerer også github-actions-botens DIREKTEPUSH (brakk release-lanens registrerings-commit; ville brukket pipelinens datacommits), og GitHub tillater ikke Actions-appen som bypass-aktør i rulesets på personlige repoer — så sjekk-håndhevingen bor i merge-gate (`gh pr checks --watch --fail-fast` før merge), som uansett er punktet alle automatiske merges går gjennom. Første lane-release (bygg 5) beviste arkiv+cloud-signering+opplasting E2E; kun registrerings-pushen røk (protection, nå fjernet — registrert manuelt). Versjonslærdommer: TestFlight viser aldri lavere versjonsstreng (1.0.x-linjen er låst inne av bygg 1–2); XcodeGen baker literal-versjoner uten $()-referanser |
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
| WP-95 | Deltakelses-ferskhet (cut/trekning — eier-funn) | 0G | – | ✅ merget (#307) — ESPN core-API competitor-status (lett-scoreboardet skjuler cut mid-turnering; én billig henting per fulgt spiller, fail-soft); verify/editorial/grader-kontrakter tettet; web viser rolig status; iOS trengte null endring (LensRenderer var klar). 536 tester. LIVE-BEKREFTET: Hovland «røk cutten» på tavla 12:47 UTC — før kveldsbriefen 15:00. NY PORT: null feilaktige deltaker-statuser |
| WP-96 | Flerbruker-splitten (interests → katalog) — GATE for eksterne testere | 0G | portmåling | ✅ merget (#308) — `catalog.json` (tier1 bredt + tier2 elite-langhale, nøkternt seedet; tennis via tier2-majors for å unngå ATP/WTA-flom); `isCovered(catalog)` server-side, personlig presisjon eies av linsen alene; vektorer IKKE re-frosset (semantisk riktig: linsen uendret — pinner nå klienten, DIVERGENCES §6); to-profil-aksepttest (eier uendret + Nakamura-sjakk + NAVI-CS2 → alle meningsfulle fra samme feed); interests.json avpublisert, web viser «Dette dekker vi»; agent-kompass → katalogen; ICS/mustWatch bevisst eier-artefakt; rediger = «be om dekning» (skrivevei → WP-23). 542 JS + 526 iOS + vektorer bit-like + 4 schemes |
| WP-97 | Design-biblioteket (tokens.json + koherens + brand-assets + styleguide) | 0G | – | ✅ merget (#309) — tokens.json (W3C) + 48 koherens-tester m/ rød-bevis; kolonet.svg pikselskannet fra shipped ikon; generate-icons.swift piksel-identisk verifisert; BRAND.md fra faktisk kilde; styleguide.html fra ekte CSS begge temaer; 590 tester. TRE AVVIK DOKUMENTERT (ikke stille fikset): (1) tertiaryLabel brukt men udokumentert/utenom token-enum; (2) web-wordmark 26px vs DESIGN.md 34px; (3) web-wordmark helamber vs iOS' label+amber-kolon-merkelås — web avviker fra godkjent merkelås. Oppfølger: harmoniser de tre |
| WP-98 | Brand-harmonisering + skjermkatalog | 0G | WP-97 | ✅ merget (#310) — web-merkelås rettet til godkjent (label+amber-kolon, 28px; DESIGN.md-rad korrigert: ingen skjerm bruker largeTitle); tertiaryLabel inn i token-systemet (enum+migrering+test 48→52); skjermkatalog: 17 demo-moduser × 2 temaer = 34 PNG on-demand (design/screens/generate.sh). TO NYE FUNN fra kjøringen: reset-entry/-confirm rendrer samme skjerm (harness-begrensning) + EKTE AgendaView-layoutbug (overlappende tekst i flerdags-golfrader, onboarding-landing/landed, begge temaer) — logget som oppfølger. 594 JS + 526 iOS grønne |
| WP-99 | Tastatur-lukking + assistent-klarhet + agenda-layoutbug (eier-dogfooding) | 0G | WP-98 | ✅ #311 merget 18.07, installert på eierens iPhone (stempel 95b1fbe71) — TRE eier-funn fra fysisk-iPhone-dogfooding: (1) tastaturet i kommandolinja kunne ikke lukkes — HIG-native fiks: `.scrollDismissesKeyboard(.interactively)` på agenda+Deg, tapp-utenfor (simultaneous gesture, stjeler ikke rad-tap), lukke-glyf (`keyboard.chevron.compact.down`) i tom-fokusert-hullet; (2) uklart hva chatten kan → stående FØRSTE «Hva kan du gjøre?»-pill som ruter til eksisterende hjelp-arm (WP-68), verifisert at fokus-forslag ikke er mock-only; (3) rotårsak flerdags-golf-overlapp: `TimeColumn` (fixedSize+minWidth 58) tapte bredde-forhandlingen mot grådig `RowBody` (maxWidth .infinity) → bred dato-vindu-tekst tegnet OVER tittelen — fikset med `.layoutPriority(1)` på tidskolonnen; deterministisk offline-repro (GolfBoardDemoSeed) for onboarding-landed/-landing. Vektorer urørt (ren layout). 4 nye UI-tester + 1 unit; før/etter-skjermbilder |

| WP-103 | Nyhets-server: `news.json` (entity-stampede pekere fra rss-digest) | 0H | — | ✅ bølge 1 merget 19.07 (#318/#319/#320) |
| WP-104 | Assistent-inngang: segmented rot «Uka/Nyheter» + kapsel-knapp + samtaleark | 0H | WP-99 | ✅ bølge 1 merget 19.07 (#318/#319/#320) |
| WP-105 | «Det du følger» + Legg til-søk (interesser uten assistent, 3b) | 0H | — | ✅ bølge 1 merget 19.07 (#318/#319/#320) |
| WP-106 | Nyheter-v0-klienten (fire-seksjons-tavla) | 0H | WP-103, WP-104, WP-105 | ✅ #321 merget 19.07 — FASE 0H KOMPLETT |
| WP-107 | Ytelse: Nyheter-bytte-jank + oppstarts-«Henter data» (eier-dogfooding bygg 6) | 0H+ | WP-106 | ✅ #323 merget 19.07 |
| WP-108 | Visuell affordanse: kapsel-anker + ekte Capsule + sport-symbol per rad (eier-dogfooding bygg 6) | 0H+ | WP-106 | ✅ #324 merget 19.07 |

| WP-110 | Pipeline-vakter: sjakk-falsk-positiv + kontrakter | 0I | — | ✅ #329 merget 20.07 — dropped-in-build katalog-gatet (delt `makeCoverageGate` i helpers, build-events + gap-detektor deler én gate; Sant Martí-anomali borte, øvrige gaps uendret); usage-gate-kommentar oppdatert (token wiret); cyclingstage-tidssemantikk-quirk lagt til; scout/self-repair logg-kontrakt strammet (logg+commit på HVER kjøring) |
| WP-111 | Web: deltaker-visning + ferskhetsvakt + «Om»-lesbarhet + Zenji-headere | 0I | — | ✅ #328 merget 20.07 — matchup-tittel ved nøyaktig 2 participants («Spania – Argentina»), featured-ferskhetsvakt ~20 t → heroFallback, «Om» i avsnitt + nøkkelfakta (aboutParagraphs, forkortelses-trygg setningssplitt), Zenji→Sportivista i 10 headere, sw v1-6; 15 nye tester |
| WP-112 | iOS: perf-port-robusthet + deltaker-visning i agendaraden | 0I | — | ✅ #330 merget 20.07 — interleavede small/large-målinger + 3-forsøks ratio-port (2,13–2,15× lokalt ×3, O(n²)-vakt bevart); AgendaFormat.matchupTitle i rad/live/detalj/widget-kallsteder; 582 iOS-tester, vektorer bit-like, 4 schemes |
| WP-113 | Sikkerhet: preview-deploy-injeksjon + CI-skrivevakt (BESKYTTEDE STIER — eier merger) | 0I | — | 🔬 PR #327 ÅPEN (needs-review) — execFileSync + refs/pull/N/head + SAFE_REF-regex + fork-PR-skip; ny protect-automation.js-hook (CI-only) + wiring + tester; 651 tester grønne. VENTER PÅ EIER-MERGE. Review-punkter: fork-PR-er mister preview (bevisst); hooken gjelder også PR-løkkene (workflow-fikser må forfattes av menneske) |
| WP-114 | Dok-resynk etter 19.07-gjennomgangen | 0I | — | ✅ #331 merget 20.07 — CLAUDE.md (web-identitet Apple-native, testtall 44/648, +9 testfiler, build-alert, 4 workflows dokumentert), workflows-test ×4, ios/README (News/-seksjon, LaunchTrace, 61 testfiler/573), PLAN-metadata restaurert mot git-historikk |
| WP-115 | iOS: in-app nyhetsbrowser (SFSafariViewController) | 0I | WP-106 | ✅ #333 merget 20.07 |
| WP-116 | Dekningsbredde: katalog-utvidelse + deltaker-/«Om»-kontrakter i research/verify | 0I | WP-110 | ✅ #334 merget 20.07 — PR åpen (katalog: tier1 +håndball/friidrett, tier2-langhale 55→130 entiteter; research horisont-scan + verify deltaker-/«Om»-kontrakter) |
| WP-117 | Design-review av alle flater (read-only rapport) | 0I | — | ✅ rapport levert 20.07 — bekreftet alle tre eier-svakheter + W1 fortids-daggruppe over «I DAG», W2 live-poll kollapser åpne rader, rediger-amber-overload, onboarding-copy «kommandolinjen», RESULTAT-seksjon feilplassert, DESIGN.md selvmotsigelse om web-klokka, stale skjermkatalog → WP-120/126–129 |
| WP-118 | Kjernefunksjonalitet-audit (read-only rapport) | 0I | — | ✅ rapport levert 20.07 — 🔴 varsel-reconcile kun ved kald oppstart; 🔴 widget-timeline aldri invalidert ved sync; 🟡 ingen foregrunn-sync, horisont-divergens (web 14d-cap/iOS ingen/data 42d), ICS uten DTEND, 100T-entitetsdublett + intet lens-miss-signal → WP-121–125 |
| WP-119 | Portmåling-artefakt (port-report fra verify/coverage/build-alert) | 0I | — | ✅ #332 merget 20.07 — `scripts/build-port-report.js` (kjøres fra build-events før writeManifest, ingen workflow-endring) → `docs/data/port-report.json`; fire porter (coverage/amendRate/silentStops/participantStatus) grønn/gul/rød + ærlig `basis` (manglende kilde ⇒ «ukjent», aldri stille grønn); .gitignore-whitelist + manifest auto-inkluderer; nye tester (grønn/gul/rød/ukjent + integrasjon) |
| WP-120 | «Det du følger»: visning + håndtering (fra WP-117-funn) | 0I | WP-117 | ✅ #340 merget 20.07 — verdi per rad + type-gruppering + trygg håndtering + web-paritet |
| WP-121 | iOS leverings-ferskhet: varsel-reconcile + widget-reload + foregrunn-sync | 0I | WP-118 | ✅ #337 merget 20.07 — reconcile på alle sync-veier (SyncFreshness) + WidgetCenter-reload + foregrunn-gate; SyncFreshnessTests |
| WP-122 | ~~Deltaker widget/detalj~~ → slått inn i WP-127 | 0I | — | — |
| WP-123 | ICS: DTEND fra endTime (flerdagsevents) | 0I | — | ✅ #335 merget 20.07 |
| WP-124 | Horisont-konsistens: web «Fremover» (14–42 d) + iOS Uka-cap (EIERBESLUTNING) | 0I | WP-118 | ✅ #344 merget 20.07 — iOS Uka cappes 14 d (buildSections `maxHorizon`, speiler web `agendaDayGroups`); web «Fremover»-disclosure (14–42 d, ingen kanal); NewsBoard forwardHorizonDays 7→14 (null [7,14]-overlap/gap); vektorene urørt (predikater, ikke vindu) |
| WP-125 | Entitets-konsolidering (100T-alias) + lens-miss-signal | 0I | WP-118 | ✅ #343 merget 20.07 |
| WP-126 | Live-koherens: ett delt live-begrep på alle flater (eierbestilling 20.07) | 0I | WP-121 | ✅ #341 merget 20.07 — ssLiveState (web) + AgendaViewModel.liveState (iOS-speil): 'direkte'/'pågår'/null; «Direkte nå» viser TdF/sjakk/CS2 (ESPN beriker); iOS minutt-tikk (TimelineView.everyMinute); followed.js relDay bruker delt def. Widget: WP-127 eier fila (urørt) |
| WP-127 | Detalj & widget: «Om»-avsnitt iOS + deltaker-titler + RESULTAT sist + prosa-bredde web | 0I | WP-112 | ✅ #339 merget 20.07 |
| WP-128 | Web-agenda: fortids-dag-fiks + ekspandert-tilstand over live-poll + klokke-avstemming | 0I | WP-117 | ✅ #336 merget 20.07 |
| WP-129 | Onboarding-klarhet: formål i klarspråk + kapsel-copy + stale kommentarer | 0I | WP-117 | ✅ #342 merget 20.07 |
| WP-130 | Pipeline-kvalitet: refaktor-auditens quick-wins | 0I | — | ✅ #338 merget 20.07 — containsName-memo, haystack-dedup ×3, én fillesing, configDirPath (+2 env-bugfiks), 2 døde eksporter, flattenStats, golf mergeEvents |
| WP-131 | Interests-arv-sanering: eier-personlige flagg ut av publiserte artefakter | 0I | WP-96 | ✅ #345 merget 20.07 — publisert events.json uten mustWatch (0 stempler verifisert); ICS beregner VALARM selv fra interests; klienter beregner must-see fra egen profil/linse (statusrad etter-rettet 21.07, regel 6) |
| WP-132 | Onboarding: quick-picks-først + generiske pakker + assistent-intro (dyp personalisering) | 0I | WP-129 | ✅ #347 merget 20.07 |
| WP-133 | Entitets-dekning: Eliteserien + Ingebrigtsen + Norge-dedup + pakke-repek | 0I | WP-132 | ✅ #348 merget 20.07 |
| WP-134 | Visningsbugs: tekst-forskyvning/feil størrelse (eier-dogfooding 20.07) | 0I | — | ✅ #349 merget 20.07 |
| WP-135 | Agenda-tid klippes av bred deltaker-tittel (standard str., eier-skjermbilde 20.07) | 0I | WP-112 | ✅ #351 merget 20.07 — TimeColumn definert ScaledMetric-bredde (fjernet fixedSize-forgiftning) + agenda-width demo-seed; AX-reflow urørt, korte rader pikselidentiske|
| WP-136 | Ferskhets-herding: brief dag-vakt (iOS+web) + re-evaluer ved foregrunn/dagskifte | 0I | WP-121 | ✅ #352 merget 20.07 — brief dag-vakt (samme Oslo-dag) på iOS+web, foregrunn-re-eval av-main (WP-107-koalescering, ingen jank); web-vakt 20t→samme-dag|
| WP-137 | Auto-TestFlight på iOS-endringer (lukk enhets-løkka) — BESKYTTET STI, eier merger | 0I | WP-17 | ✅ #353 merget 20.07 (eier) — HENDELSESDREVET CD: push på ios/** → TestFlight umiddelbart + time-plan-sikkerhetsnett for GITHUB_TOKEN-merges + detect-vakt. Eieren dogfooder alltid HEAD |

## FASE 0I+ · CI/CD-herding (fra 20.07-reviewen, karakter 5/6) — BESKYTTEDE STIER, eier merger

CI/CD-reviewen (4 read-only agenter) ga 5/6 og en billig herdingspakke. Disjunkte filer per WP så tre parallelle PR-er ikke kolliderer.

| WP-138 | Pre-merge iOS-arkiv-/byggvalidering + permissions på testgatene + doc-forsoning (ci/ios-tests) | 0I+ | WP-137 | ✅ #356 merget 20.07 (eier) — build-for-device (usignert) fanger CloudKit-sti/plist/family/widget-embed før merge; contents:read; ærlig gate-ordlyd |
| WP-139 | merge-gate selvvern (PROTECTED_PATHS + protect-automation dekker merge-gate.js selv) | 0I+ | WP-40 | ✅ #354 merget 20.07 (eier) — håndheveren i PROTECTED_PATHS (6) + hooken; testen bevisst ubeskyttet |
| WP-140 | ios-release tag-fotgever-fiks + koherenstest pinner jobbnavn/modell-tier + CLAUDE.md-forsoning | 0I+ | WP-137 | ✅ #355 merget 20.07 (eier) — tag-trigger fjernet fra paths-blokk; jobbnavn+modell-tier pinnet i koherenstest; CLAUDE.md forsonet med rulesetet |
| WP-141 | Agenda-tid-klipp — EKTE fiks (WP-135 løste den ikke; eier så «:00» på bygg 9) | 0I+ | WP-135 | ✅ #357 merget 20.07 — reprodusert i sim (SE3 375 + iPhone 17 402, std str. large→xxxL: bred deltaker-tittel holdt seg på ÉN linje og overflyttet raden → `Button(.plain)` sentrerte overflyten → ledende tidskolonne skjøvet av VENSTRE kant, «15:00»→«:00»). Rotårsak: `RowBody.secondaryLine` sin `ChannelLabel(...).fixedSize()` — en UGRENSET sekundærlabel som selv ble bredere enn cellen. Fiks: bind kanalen (flexibel + `lineLimit(1)`), løft titen sitt linjetak (`nil`, aldri «…»-trunkering) og lås raden `.frame(maxWidth: .infinity, alignment: .leading)`. Tittelen BREKKER nå i stedet for å overflyte; tid alltid hel; flerdagsvindu helt; AX-reflow (WP-134) urørt. ViewThatFits-reflow ble prøvd først (brief-anbefaling) men reflowet HVER rad til vertikal på iPhone-bredder (måler tittelens én-linjes ideal) → brukte briefens egen alternativ «sikre at Button-label aldri overstiger cellebredden». Vektorer bit-like (763 vitest + 630 iOS unit grønne, 4 schemes bygger) |
| WP-142 | Assistent-inngang: fjern command-line-følelsen, bevar calm (eier-beslutning 20.07) | 0I+ | WP-104 | ✅ #358 merget 20.07 — kapselen i RO NAVNGIR nå en evne KONTEKSTUELT (Uka → «Følg et lag, eller spør om uka»; Nyheter → «Følg noe, eller spør om nyhetene») i stedet for den blanke «Spør, eller be om noe …» som leste som en kommandolinje. Ny `CapsuleContext`-enum (Uka/Nyheter); `ContentView` mapper `rootTab.capsuleContext` inn. Ledende assistent-symbol + mic beholdt (uten symbolet leses linja som dødt felt). NULL chips på agendaen — guidingen skjer ved ENGASJEMENT (arkets eksisterende eksempelrader, verifisert rolige/klare). DESIGN.md § Hjelperen + spec-en oppdatert; onboarding-copy («Trykk assistenten nederst …») konsistent, uendret. Verifisert visuelt (RO Uka+Nyheter dark+light + åpnet ark): ÉN rolig linje, ingen chips, agenda urørt. 630 iOS unit grønne (gylne vektorer bit-like), 4 schemes bygger; ingen endring i armer/FM-prompt/eval-corpus |
| WP-144 | Assistent-inngang → kompakt flytende BUNN-KNAPP (nåbar med én hånd + ærlig affordance) — iterasjonens endestasjon (eier-beslutning 20.07) | 0I+ | WP-143 | ✅ #365 merget 20.07 — **SUPERSEDERER WP-143** (header→bunn): eieren fant header-`sparkles`-knappen ÆRLIG men **uråkelig med én hånd** på toppen av en høy iPhone. WP-144 forener nåbarhet + ærlighet: tilbake til BUNNEN (tommelens nåbare sone), men som en TYDELIG KNAPP (ikke WP-104s falske søkefelt-kapsel). Ny `AssistantButton.swift` — en KOMPAKT glass-pille (`glassEffect(.regular.tint(amber).interactive(), in: .capsule)`) som HUGGER innholdet (ikke full bredde), sentrert over safe area: `sparkles` i amber + aktiv etikett «Spør assistenten», ≥44 pt, button-rolle, a11y «Assistent», id `assistant.button`. INGEN placeholder-tekst, INGEN `mic` inni (diktering bor i arket). `ContentView`: fjernet WP-143s `sparkles`-`ToolbarItem` (tannhjulet står igjen alene), lagt til `safeAreaInset(.bottom)` som kaller `openAssistant` — samme scroll-under-mønster som den gamle kapselen; agendaen/Nyheter scroller rolig UNDER. Samtalearket (AssistantSheetView) + intent-armene + FM-prompt + eval-corpus HELT uendret — ren INNGANGS-flytting. Onboarding-copy gjort plassering-robust (navngir knappen, ikke retning): AgendaView tom-tilstand «Trykk Spør assistenten.» + OnboardingView assistent-intro «… Trykk Spør assistenten når du vil legge til noe.». DESIGN.md § Navigasjon + § Hjelperen + § Liquid Glass + spec-en oppdatert (alle «header-toolbar-knapp»-formuleringer → historikk). UI-tester: `assistant.toolbar`→`assistant.button` (MainFlowsUITests + SportivistaUITestCase), `testToolbarButton…`→`testAssistantButton…`, prosa «toolbar button»→«bottom button» |
| WP-145 | Release-lane selv-opprydning av signeringssertifikater (hindrer Apple cert-tak) | 0I+ | WP-137 | ✅ #367 merget 21.07 (eier; statusrad etter-rettet 21.07) — cloud-signering på fersk CI-runner minter et nytt «Apple Development»-cert per kjøring (runneren har ingen signeringsidentitet i nøkkelringen); med auto-CD (WP-137, hver iOS-merge) hopet 10 «Created via API»-certer seg opp → traff Apples cert-tak → arkiveringen feilet med «reached the maximum number of certificates» (de 10 er døde — privatnøklene lå i engangs-nøkkelringer). Ny `scripts/prune-signing-certs.js` (bruker `ascRequest`): `GET /v1/certificates?limit=200`, BEHOLD navngitte (eierens, f.eks. «christopher hærem») + de nyeste `KEEP_RECENT`=2 API-mintede, REVOKER (`DELETE /v1/certificates/{id}`) resten. FAIL-SOFT: list-/DELETE-feil logges og svelges (exit 0) — prune skal ALDRI felle et gyldig bygg. Ny workflow-steg «Rydd gamle signeringssertifikater» i `ios-release.yml` FØR arkiveringen (en cap-et konto selv-heler i kjøringen). Ny enhetstest `tests/prune-signing-certs.test.js` (`certsToRevoke` pure-seleksjon + fail-soft, network-fri, injisert `request`). Rører BESKYTTET STI (`.github/workflows/`) → PR `needs-review`, eier merger |
| WP-146 | Assistent-knapp variant D (kollaps ved scroll, bunn-trailing) + live-linje-reflow (design-review 21.07, eier valgte variant D) | 0I+ | WP-144 | ✅ #374 merget 21.07 — To rene inngangs-/visnings-endringer, ingen armer/ark/FM-prompt/eval-corpus rørt. (1) `AssistantButton`: FLYTTET fra bunn-SENTER → bunn-TRAILING (≈16 pt innrykk via `frame(maxWidth:.infinity, alignment:.trailing)` + `padding(.trailing,16)` på `safeAreaInset(.bottom)`) — mer nåbar for tommelen + rydder lesekolonnen (løser at sentrert pille okkluderte siste Nyheter-rad); copy i RO «✨ Assistent» (var «Spør assistenten»); KOLLAPS til bare `sparkles`-glyfen ved scroll via ny `collapsed`-param (spacing/padding/label-transisjon), re-ekspanderer i toppen (jf. Foto/Musikk). BEHOLDT: `glassEffect`, amber-tint, `sparkles`, button-rolle, ≥44 pt, a11y «Assistent», id `assistant.button` — ikke en FAB (glass-kapsel, ikke fylt sirkel). (2) `ContentView`: `onScrollGeometryChange` observerer aktiv fanes List-offset (Uka/Nyheter) og driver `assistantCollapsed` (animasjon på parent, respekterer Reduce Motion; reset på fane-bytte); `liveNowLine` REFLOWER ved `dynamicTypeSize.isAccessibilitySize` (tittel + kanal wrapper på egne linjer, «·» droppes) — fikser trunkering «The Open»→«The O…» / «TV 2 Play»→«TV 2…» (DESIGN § Typografi «bryt aldri til trunkering»); pikselidentisk ved std str. DESIGN.md § Navigasjon + § Hjelperen oppdatert til variant D. UI-tester urørt (id/a11y-label uendret) |
| WP-143 | Assistent-inngang → header-toolbar-knapp (`sparkles`, «renest Apple»); bunn-kapsel fjernet (eier-beslutning 20.07) | 0I+ | WP-142 | ✅ #360 merget 20.07 — SUPERSEDERER WP-142s kapsel: bunn-kapselen var en FALSK søkefelt-affordance → FJERNET. Assistent-inngangen er nå en `ToolbarItem(.topBarTrailing)` `sparkles`-knapp til VENSTRE for tannhjulet (a11y «Assistent», id `assistant.toolbar`, ≥44 pt bar-button, iOS 26 Apple-Intelligence-idiom). `safeAreaInset(.bottom)`-kapselen borte → agendaen/Nyheter fyller HELE skjermen (ingen bunnflate). Slettet: `AssistantCapsule.swift` (hele fila), `AssistantViewModel.CapsuleContext`-enum + `capsulePrompt(for:)` + `RootTab.capsuleContext` + `dictateToAssistant`-handleren (micen bodde bare på kapselen; diktering bor nå i arket alene). Samtalearket (AssistantSheetView) + intent-armene + FM-prompt + eval-corpus HELT uendret — ren INNGANGS-flytting. Onboarding-copy «nederst»→«øverst» (AgendaView tom-tilstand + OnboardingView assistent-intro). DESIGN.md § Navigasjon+§ Hjelperen + spec-en oppdatert (alle «kapsel nederst»/«Liquid Glass-bunnflate»/«Spør, eller be om noe»-setninger utgått). UI-tester: `assistant.capsule`/`assistant.capsule.mic`→`assistant.toolbar`; mic-only-flowen (Flow 13) fjernet. Verifisert visuelt (RO Uka+Nyheter dark+light: header `sparkles`+tannhjul, agenda/Nyheter fyller skjermen, INGEN bunn-kapsel; tapp `sparkles`→samtalearket uendret). 630 iOS unit grønne (1 hoppet = FM-eval-gate; gylne vektorer bit-like), 4 schemes bygger. UI-suiten: 17/18 grønne — ALLE assistant.toolbar-flowene grønne (`testToolbarButtonOpensSheetAndLukkCloses`, Sheet-drag, Deg-gear-back-swipe, Nyheter-segment, følg-via-ark). Den ene røde (`testRapidStarterPackTogglesStayResponsive`) er URØRT av diffen (linje 119 = quick-picks-steget; min eneste OnboardingView-endring er copy i det SENERE assistent-intro-steget) og en last-indusert timing-flake: 45s-responsivitetsbudsjettet bommes ved maskin-last ~10-13, mens «FØLGER NÅ (9)» rendrer korrekt — ikke en WP-143-regresjon (UI-suiten er ikke en CI-gate). Ingen endring i Feed-predikater/vektorer/docs-data |
| WP-147 | iOS amber-disiplin + klarspråk (design-reviewens quick-wins) | 0I+ | WP-83 | ✅ #373 merget 21.07 — Håndhever DESIGN.md-fargekontrakten (amber = KUN handling/tilstand/must-see) etter design-reviewen 21.07 — ren farge/copy, INGEN data/logikk/vektor-endring. Fem fikser: (1) 🔴 detaljark-seksjonsoverskrifter (`EventDetailSheet.header`) amber→`secondaryLabel` grå — de kolliderte med de grå ARENA/OM-etikettene (to farger, samme rolle) og ble matt sennep/brun i lys modus (datert Tekst-TV); amber beholdt KUN på «På»/streaming-lenke+↗/«Skjult»-avsløring; (2) Deg-rad-ikoner (`DegView.rowLabelContent`) amber→grå — fra ~9 amber-ikoner til 2 fargede elementer (amber «Varsel før start»-toggle + rød «Nullstill»); (3) golf-rad-meta klarspråk: ny ren `AgendaFormat.humanizeGolfMeta` («R2 · −4 · T8»→«Runde 2 · −4»: runde utskrevet, leaderboard-plassering droppet, score beholdt), brukt i `AgendaViewModel.makeLensRow`; `LensRenderer`-verbatim-kontrakten (LensRendererTests) URØRT (transformen bor i agenda-display-laget, ikke i renderer/vektorer); (4) «vekt 0.8»-jargon fjernet fra assistent-diff-subtittelen (`AssistantResultThread.subtitle` + ubrukt `weightLabel`); (5) Nyheter «Det du følger»-lenkerad strammet til standard radhøyde (`NewsView.followedLink`). Agenda-tomtilstand-glyfen var alt grå (verifisert, ingen endring). IKKE rørt ContentView/AssistantButton (WP-146 eier dem). 6 nye `AgendaFormatTests`-caser. Verifisering: iOS unit-suite + 4 schemes + gylne vektorer bit-like; skjermbilder dark+light av detaljark/Deg/golf-rad/assistent-diff |
| WP-148 | Web design — reviewens quick-wins (pills/badges ut, grå dagoverskrifter, Neste-opp-hierarki, etappeløp-Om, destructive-token) | 0I+ | WP-127 | ✅ #375 merget 21.07 — branch `wp-148-web-design` — 21.07 design-review-fikser mot appens egen styleguide: (1) rediger.html 999px-pills («Slå av varsel»/«Fjern») + `.suggestion`-bokser → FLATE tekst-handlinger/hårlinje-rader (som agendaens `.ev-act`); ny `--destructive`-token (#FF453A/#FF3B30) i base.css brukt av `btn-danger` (erstatter hardkodet dark-rød i BEGGE temaer). (2) activity.html `.run-agent` solid-amber badges → amber TEKST-etikett (PR-lenken nøytralisert til hover-amber → ingen to-amber-i-rad). (3) `.day-name` amber → `--fg-2` (grå, matcher iOS' secondaryLabel; web fra ~10 til ~5 amber-merker). (4) «Neste opp» flyttet UNDER agendaen — den uvindtuerte per-entitet-glansen (5 «om 8–14 dager»-rader) begravde «I dag»; MINST inngripende + dedupe/`nextUpEntries` urørt (18d-Neste-opp-test grønn), calmere enn en 14d-gate som ikke ville fjernet 8–10d-radene. (5) `seriesDetail`-«Om» gjennom samme `aboutParagraphs()`+`.d-prose` full-bredde som `eventDetail` (WP-127 lukket alt UNNTATT etappeløp-stien). (6) felles `.mast-row`-scaffold på alle fire sider (`masthead-clock` retirert → grå `.mast-date`-underrad). Koherens: tokens.json (destructive.web + groupHeader), styleguide swatch/meta, design-tokens-testen låser `--destructive`, ny dashboard-cards series-Om-test; sw `v1-8`. FØR/ETTER-screenshots begge temaer 375/393/900. INGEN iOS/docs-data-endringer |
| WP-149 | Onboarding-reskin til native (lukker Tekst-TV-todelingen, lesbar primær-CTA) | 0I+ | WP-83 | ✅ #382 merget 21.07 — INNHOLDET var sterkt (klarspråk, meningsfulle startpakker, gode assistent-intro-eksempler), men DRAKTEN hang igjen i det PENSJONERTE Tekst-TV-språket mens agenda/Deg/Nyheter fikk native-reskinnen — FØRSTEINNTRYKKET så uferdig/derivativt ut (design-review 🔴 21.07). Ren DRAKT-endring (all copy/flyt/assistent-armer/eval-corpus/mock URØRT), konsistent med Deg/Nyheter: (1) skarpkant-`Rectangle().stroke`-bokser → native avrundede 12 pt `cell`-celler (ny fil-privat `onboardingCell` = Deg/Nyheter-uttrykket, fyll-vs-bakgrunn = kortet, ingen strek); (2) `»_`-prompt-sigil + `▌`-blokkmarkør FJERNET fra converse-feltet → rent native `TextField` (autocap/autocorrect av for egennavn, mic-når-tom — paritet med assistent-arket); (3) amber-sperrede VERSAL-mikroetiketter («PÅ TELEFONEN DIN»/«FORSLAG»/«FØLGER NÅ»/«APPLE INTELLIGENCE»/«VALGT») → grå `secondaryLabel` `.footnote` seksjonshoder (matcher Deg' `groupHeader`), UTEN tracking; (4) quick-picks-VALGT → native selection: amber `checkmark.circle.fill` (vs. grå `plus.circle`), ÉN amber per rad, ikke en VERSAL-etikett; (5) primær-CTA («Kom i gang»/«Fortsett»/«Prøv nå») amber KONTUR uten fyll → ny delt `SportivistaPrimaryButtonStyle` (fylt amber-kapsel, skjema-invers label-farge for WCAG i BEGGE temaer, ≥44 pt, Dynamic Type) — ÉN per skjerm; sekundære («Hopp over»/«Til agendaen»/«Tilbake til startpakker») forblir flate/dempede; (6) velkomst-vertikalbalanse: GeometryReader lar det sparsomme velkomst-steget fylle viewporten og skyve primærknappen ned i tommelsonen (content → action-flyt), innholdstunge steg scroller som før. Copy «Trykk Spør assistenten» → «Trykk Assistent» (WP-146-knappnavnet). DESIGN.md § Forbudsliste presisert (primær-CTA-avklaringen). Verifisering: FØR/ETTER-skjermbilder av hver onboarding-skjerm (velkomst/quick-picks/samtale/assistent-intro) dark+light; iOS unit-suite + 4 schemes + gylne vektorer bit-like; onboarding-UI-flyten grønn; vitest urørt. Alle a11y-id-er bevart (starterpack.*/onboarding.field/onboarding.send/onboarding.continue/…). IKKE rørt AssistantSheetView/AssistantResultThread/WhatIKnowView (WP-150) eller ContentView/agenda/docs |
| WP-150 | Assistent-ark + minne-side reskin til native (lukker Tekst-TV-todelingen) | 0I+ | WP-104,WP-30 | ✅ #381 merget 21.07 — ren DRAKT-endring av de to flatene som hang igjen i pensjonert Tekst-TV-språk mens agenda/Deg/Nyheter fikk native-reskinnen: assistent-arket (`AssistantSheetView` + `AssistantResultThread`) + «Hva jeg vet om deg» (`WhatIKnowView`). Skarpkant-`Rectangle().stroke`-bokser → avrundede 12pt native-celler (`cell`-flate over `background`); «ASSISTENT» amber-VERSAL → native inline nav-tittel «Assistent» + Lukk-cancellation; øvrige amber/grå-sperrede VERSAL-etiketter («FORESLÅTTE ENDRINGER», «PRØV», «SVAR», «APPLE INTELLIGENCE», «STRUKTURERT» …) → grå native seksjonshoder (`secondaryLabel` footnote-semibold, ingen tracking); kontur-Bekreft/Avvis/Glem-alt → ÉN primær amber-kapsel (delt `SportivistaPrimaryButtonStyle` m/WP-149; `.borderedProminent` FJERNET helt app-vidt så amber-kapselen er det ENESTE fylte prominente språket; diff-kortet nøytralt med add/remove-semantikk på +/−-markør; destruktive bekreftelser flat rød à la Deg › Nullstill; `SPOILERVERN`-kategorietikett grå — alt rev2 etter design-review) + dempet flat sekundær (`.borderless`); «mente du»-pille-bokser → flate hårlinjefrie rader; skrivefeltet → Meldinger-mønster (avrundet compose-felt); minne-prosa tabular→systemfont; atferd-tellere av-amberet. BEHOLDT: samtale-flyt, intent-armer, FM-prompt, eval-corpus, diff-/answer-semantikk, diff-farger (+grønn/−rød/±amber som tilstand), BlinkingCursor «tenker …» (delt m/onboarding, WP-149). IKKE rørt: OnboardingView/StarterPacks (WP-149), ContentView/AssistantButton (WP-146). Følger WP-149s DESIGN § Forbudsliste-avklaring («ingen pills» = ingen pille-sekundærer, men ÉN primær KAN være prominent fylt native knapp) — notert i PR-body, ingen DESIGN.md-endring her (unngår WP-149-konflikt). FØR/ETTER dark+light av ark/tråd/minne; iOS unit + 4 schemes + gylne vektorer bit-like + assistent-UI-flyter; `vitest` urørt |
| WP-151 | Release-lane selv-heler byggnummer-race (retry med høyere nummer ved ASC-kollisjon) | 0I+ | WP-145 | ✅ #378 merget 21.07 — `next-testflight-build.js` henter byggnummer = ASC-maks+1 ved JOBB-START, men ASC registrerer en fersk opplasting med treghet (eventual consistency). Auto-CD (WP-137, hver iOS-merge) + manuelle dispatcher lager tette kjøringer; to tett henter SAMME nummer → den andre feiler i eksport med «The bundle version must be higher than the previously uploaded version: 'N'» (exit 70). Concurrency serialiserer, men beskytter ikke mot ASCs treghet. Fiks: nytt `scripts/testflight-upload.js` orkestrerer arkiver→eksporter→opplast i ÉN selv-helende operasjon — fanger kollisjonen, parser N, bumper til N+1 og RE-ARKIVERER (`CURRENT_PROJECT_VERSION=<N+1>`; arkivet baker inn `CFBundleVersion` med `manageAppVersionAndBuildNumber:false`, så nummeret må settes ved arkivering — re-eksport alene holder ikke), re-eksporterer, opptil `TF_MAX_ATTEMPTS`=3 forsøk med økende nummer. Det FAKTISK opplastede nummeret skrives til `$GITHUB_OUTPUT` (`build=`) og brukes av «Registrer opplastingen» (`record-testflight` registrerer riktig nummer, ikke det opprinnelig hentede). Feiler HØYLYTT hvis alle forsøk brukt opp (ekte problem). Prune (WP-145)/signering/alt annet uendret. Den rene logikken (`parseBuildCollision` → N+1; `uploadWithRetry`-beslutningen) er eksportert og enhets-testet network-/xcodebuild-fritt med injiserte arkiver/opplast-mocks (`tests/testflight-upload.test.js`, 12 caser: suksess uten retry, kollisjon→N+1, max(N+1,current+1)-bump, oppbrukte forsøk feiler, ikke-kollisjons-feil feiler umiddelbart). Rører BESKYTTET STI (`.github/workflows/ios-release.yml`) → PR `needs-review`, eier merger |
| WP-152 | Kolonet i ordmerket som appens LIVE-signatur (prototype, iOS) | 0I+ | WP-146 | ✅ #387 merget 21.07, EIER-GODKJENT 21.07 («bare å pushe — minimal designendring») → normativt innskrevet i DESIGN.md § Bevegelse + § Cross-surface; web-paritet er dokumentert oppfølging (eies p.t. av parallell web-agent) — ordmerkets amber «:» (kandidat A «Kolonet») blir det LEVENDE live-signalet: pulserer rolig når noe eieren følger sender NÅ, ellers den statiske amber-aksenten det er i dag. Drevet av det EKSISTERENDE live-signalet (`AgendaViewModel.currentLiveRows`/`liveNow` — SAMME kilde som ▌ LIVE-linja, minutt-tikk via `TimelineView(.everyMinute)` så kolon og linje ALDRI er uenige). Pulsen er CALM, ikke alarm: langsomt (~1,6 s) ease-in-out, autoreverserende åndedrag opacity ~1,0 ↔ ~0,5 + myk amber-glød som puster med; INGEN layout-shift (kun opacity/glød animeres — kolonets ramme står stille, «SPORTIVISTA» rykker ikke), ingen fargeendring utover amber. Ny fil-privat `MastheadColon` (ContentView) + `mastheadLabel`. **Reduce Motion (bindende):** ingen bevegelse — statisk amber-glød bærer «på»-tilstanden. **a11y:** masthead-label «Sportivista — sender nå (N)» når live. **Demo-repro:** ny `MastheadLiveDemoSeed` + `SPORTIVISTA_DEMO=masthead-live`/`masthead-calm` (gjenbruker cache-seed-mekanismen; live-rad via autoritativ `status:"in"` så pulsen er deterministisk uansett klokkeslett). iOS KUN — web-paritet i `docs/`-headeren er DOKUMENTERT oppfølging (§ Cross-surface), IKKE bygd. Ren presentasjon: feed-kompilering/gylne vektorer URØRT. DESIGN.md § Bevegelse + § Cross-surface merket PROTOTYPE (avventer eierens dom, «amber = aksent»-invarianten holder). Verifisering: iOS unit + 4 schemes + gylne vektorer bit-like; skjermbilder av begge tilstander (nøytral/live) dark+light + Reduce-Motion-live. **Eier-godkjent 21.07 — normativt** |
| WP-153 | Fast CI-signeringsidentitet — stopp cert-churn + «Certificate Revoked»-mailene | 0I+ | WP-145 | ✅ #388 merget 21.07 (eier; statusrad etter-rettet 21.07) — eieren fikk jevnlig «Your Certificate Has Been Revoked»-mail fordi prune-steget (WP-145) tilbakekaller ett API-mintet dev-cert per bygg (og hver tilbakekalling = én mail; «null null» = ASC-nøkkelens tomme visningsnavn). Rot: en fersk CI-runner uten signeringsidentitet får `-allowProvisioningUpdates` til å MINTE et nytt «Apple Development»-cert hver arkivering. Fiks (eier valgte «jeg lager certet»): jeg genererte ÉN dedikert CI-dev-identitet via ASC-admin (RSA-nøkkel jeg kontrollerer + CSR → `POST /v1/certificates`; cert-id `T8J9GR47HS`, gyldig 2027), bygde .p12 (cert+nøkkel, moderne AES-256-PBKDF2), satte secrets `SIGNING_CERT_P12`+`SIGNING_CERT_PASSWORD` (materiale ALDRI i repoet — kun scratchpad). Lanen importerer nå identiteten i en midlertidig nøkkelring FØR arkivering (`security import`/`set-key-partition-list`/søkeliste), så minting skal gjenbruke den → ingen churn, ingen mail. Prune beholdt som SIKKERHETSNETT men beskytter CI-certet på ID (`KEEP_CERT_IDS=T8J9GR47HS` — certet bærer også «Created via API», ville ellers blitt tilbakekalt av sin egen prune); `certsToRevoke`/`pruneSigningCerts` fikk `keepIds`-param + 4 nye tester (15 grønne). Verifisering: prune+workflows-tester grønne, js-yaml gyldig. **Etter merge:** verifiser at ingen nytt «Created via API»-cert mintes → oppfølger fjerner prune + rydder de stale churn-certene → mailene slutter helt |
| WP-138B | Adaptiv personalisering on-device (akse A — affinitets-løft) | 0I+ | WP-132 | ✅ #364 merget 20.07 (slice 1 Affinity-kjerne + slice 2 løft i «Det du følger») — `ios/Sportivista/Memory/Affinity.swift`; omnummerert 21.07 fra dobbelt-tildelt WP-138 (nummeret var alt brukt av pre-merge-arkivvalideringen over) — se `### WP-138B`-seksjonen |
| WP-154 | Web↔app-paritet: Nyheter-fane, rad-glyf+chevron, flytende assistent, Logg ut | 0I+ | WP-148 | ✅ #389 merget 21.07 (commit 4a82a0773) — etter-registrert 21.07: nummeret var brukt i PR-en uten PLAN-rad (regel 6) |

---

## FASE 0I · 19.07-gjennomgangen: fikser + dekning/design-løft — 🔬 påbegynt 19.07.2026

Bakgrunn: full 8-agents prosjektgjennomgang 19.07 kveld (rapport i økt-scratchpad;
funn-sammendrag i PR-ene) + eierbestilling samme kveld: fiks funnene, in-browser
nyhetsvisning, langt bredere sportsdekning («forutse mulige interesser»), full
design-review inkl. «Det du følger»-flaten og «Om»-seksjonen (wall of text),
kjernefunksjonalitet-audit, og VM-finale-hullet (deltakere vises ikke).

**Menneskebeslutninger i fasen:** (a) WP-113 rører BESKYTTEDE STIER
(.github/workflows/preview-deploy.yml + scripts/hooks/** + .claude/settings.json)
— PR-en blir stående til eier merger; (b) de to 0G-eierbeslutningene som støyer i
dekningsporten står fortsatt åpne: F1-kvalifisering inn/ut og Sjakk-NM-eliteklassen;
(c) WP-116s bredde-ambisjon: defensibel default = utvid tier1/tier2 vesentlig
(håndball, vintersport-detaljering, friidrett, mer fotball/sykkel/tennis-langhale)
— serverbredde er trygt for calm design siden linsen filtrerer per bruker.

Bølge 1 (✅ komplett 20.07, ~2,5 t): WP-110 #329, WP-111 #328, WP-112 #330,
WP-114 #331 merget; WP-113 #327 ÅPEN (venter eier); WP-117/118-rapportene levert
og omsatt til WP-120–129. Samlet verifisering: 648 JS-tester + build/validate +
screenshot grønt; iOS-gaten grønn på main.
Bølge 2 (✅ komplett 20.07 natt): WP-115 #333, WP-116 #334, WP-119 #332, WP-121 #337.
Bølge 3 (✅ komplett 20.07 natt): WP-120 #340, WP-123 #335, WP-126 #341,
WP-127 #339, WP-128 #336. Bølge 4 (✅ komplett 20.07 natt): WP-124 #344,
WP-125 #343, WP-129 #342 + WP-130 #338 (refaktor-audit-quick-wins).
Nattskiftet 20.07 tok også: 9,7 MB utdaterte bevis-PNG-er slettet (regel 8),
.claude/worktrees/ gitignored, git gc, designbeslutninger på delegert
eiermyndighet (web-klokka fjernet for paritet; iOS Uka-cap 14 d).
GJENSTÅR i fasen: kun WP-113 (#327, beskyttede stier — eier reviewer/merger).

### WP-110 · Pipeline-vakter: sjakk-falsk-positiv + kontrakter
**Mål:** fjern den kroniske HIGH-falsk-positiven og tett tre småkontrakter.
**Innhold:** (1) `scripts/detect-coverage-gaps.js` (~192–209): «dropped-in-build»-
anomalien skal kjøre samme katalog-/entitetsgate som `build-events.js` `isCovered`
på kildefil-eventene før flagging (sjakk/esports er entitetsgatet — Sant Martí-
klassen skal aldri flagges) + regresjonstest i `tests/detect-coverage-gaps.test.js`;
(2) `scripts/usage-gate.js:24–28`: utdatert kommentar (tokenet ER nå wiret i alle
gate-steg); (3) `.claude/skills/source-quirks/SKILL.md`: ny entry cyclingstage.com
tidssemantikk (3/11 enige på tid = etappestart vs. sendetid — foretrekk
letour.fr/TV 2 Play for sendetider); (4) `scripts/agents/scout.md` +
`self-repair.md`: logg SKAL skrives også på quiet/none-kjøringer (i dag hopper
scout over ~50 %). **Ikke-mål:** ingen workflow-filer (beskyttet), ingen endring
av gap-detektorens øvrige semantikk. **Aksept:** `npx vitest run --maxWorkers=1`
grønn; sandbox-kjøring av detect-coverage-gaps mot dagens data viser 0
sjakk-anomali og uendrede øvrige gaps.

### WP-111 · Web: deltaker-visning + ferskhetsvakt + «Om»-lesbarhet + Zenji-headere
**Mål:** VM-finale-klassen (deltakere finnes i data, vises ikke) + tre småløft.
**Innhold:** (1) agenda-raden (docs/js/dashboard.js) viser `participants` når
satt og tittelen er generisk (→ «Spania – Argentina» under/i stedet for
«VM-finalen 2026»; escapeHtml); (2) `renderTodayLine` (~108–113): forkast
featured.json med `generatedAt` eldre enn ~20 t → heroFallback (hindrer
faktafeil-headline når editorial kvote-hoppes); (3) detail.js «Om»-seksjonen:
strukturert lesbarhet — splitt beskrivelsen i avsnitt (\n\n og setningsgrupper),
nøkkelfakta-linjer (runde/underlag/format) der de finnes, aldri én vegg;
(4) «Zenji»→«Sportivista» i de 10 kommentar-headerne i docs/, sw-cache-bump.
**Ikke-mål:** ingen design-omlegging (WP-117/120 eier det), ingen CSS-token-
endringer. **Aksept:** vitest grønn (+ nye dashboard-cards-tester for deltaker-
rendering og ferskhetsvakt), `npm run screenshot` begge temaer.

### WP-112 · iOS: perf-port-robusthet + deltaker-visning i agendaraden
**Mål:** WP-61-porten skal tåle delt runner; VM-finale-klassen fikses også i appen.
**Innhold:** (1) `ios/SportivistaTests/AgendaMatchingPerfTests.swift` (~80–122):
interleave small/large-målingene per iterasjon OG kjør ratio-sjekken opptil 3
forsøk der ALLE må feile (ekte O(n²) feiler deterministisk; runner-støy gjør ikke)
— dokumentér begrunnelsen (19.07: CI målte 6,03× på byte-identisk kode som målte
2,26 lokalt; rød runner var 2,3× tregere); (2) agendarad-visning av
`participants` for events med generisk tittel (LensRenderer/RowBody — ren
visning, de fem predikatene og vektorene urørt). **Ikke-mål:** ingen endring i
matching/kompilering. **Aksept:** full unit-suite grønn, 4 schemes bygger,
13/14 vektorer bit-like, perf-suiten kjørt 3× lokalt uten flake.
🔬 **Implementert (branch wp-112-ios-perfport-deltakere):** (1) perf-porten:
`interleavedMinTimes` måler small+large BACK-TO-BACK per iterasjon (deler
øyeblikkslast → forholdstallet er lastuavhengig), og ratio-sjekken kjører opptil
3 forsøk der bare ALLE-over-tak feiler (ekte O(n²) er deterministisk hvert forsøk,
ett runner-hikk absorberes av neste rene forsøk) — begrunnelsen står i
testkommentaren. (2) `AgendaFormat.title(...)` tar nå `participants` og fikk
`matchupTitle`: nøyaktig 2 ikke-tomme deltakere + generisk tittel (som ikke
allerede navngir begge) ⇒ «Spania – Argentina», 1 eller 3+ (golffelt/CS2-
gruppespill) beholder tittelen. `makeItem` løfter matchup-en til tittelen og
demoter den generiske tittelen til dempet meta-linje (VM-finalen 2026 bevares);
live-linja, widgeten og detaljarket sender også `participants` (én delt ren
visnings-funksjon). De fem predikatene + gylne vektorene urørt. Nye tester:
AgendaFormatTests (7 title-caser) + AgendaViewModelTests (matchup-rad + team-
regresjonsvakt); `EventBuilder` fikk `participants`/`round`.

### WP-113 · Sikkerhet: preview-deploy-injeksjon + CI-skrivevakt (BESKYTTEDE STIER)
**Mål:** lukk RCE-vektoren og håndhevingsgapet fra sikkerhetsgjennomgangen.
**Innhold:** (1) `.github/workflows/preview-deploy.yml` (~62–71): fork-PR-grennavn
går uvasket inn i `execSync`-shell — bytt til argument-array (`execFileSync('git',
['fetch','origin',branch,'--depth=1'])` osv.) OG valider `branch` mot
`^[A-Za-z0-9._/-]+$` (defense in depth; vurder `refs/pull/N/head`); (2) ny/utvidet
PreToolUse-hook (scripts/hooks/, samme CI-only-mønster som protect-interests):
blokker CI-agent-mutasjoner av `.github/workflows/**`, `.github/actions/**`,
`scripts/hooks/**`, `.claude/settings.json` — tetter at direkte-pushende agenter
omgår merge-gaten (main har ingen branch protection; verifisert 19.07);
wiring i `.claude/settings.json`; tester i `tests/hooks.test.js`.
**Ikke-mål:** ingen endring i merge-gate.js (den er korrekt), ingen ruleset-
endringer på GitHub (eier vurderer separat). **Aksept:** vitest grønn inkl. nye
hook-tester (blokk i CI, tillatt lokalt); PR-en MERGES IKKE av agent/hovedsesjon
— eier reviewer og merger (beskyttede stier).

### WP-114 · Dok-resynk etter 19.07-gjennomgangen
**Mål:** dokumentene skal igjen være verifiserbare mot koden (koherens-løftet).
**Innhold:** CLAUDE.md — web-identitet (Tekst-TV-unntaket LUKKET 18.07, Apple-
native baseline: #000000/#F2F2F7/systemfont/#FFB000-#9A6800; «Hva vi følger»→
«Dette dekker vi»), testtall 36/~470→44/628 + de 9 manglende testfilene i lista,
`build-alert.json` inn i datafil-lista, dokumentér ci.yml/ios-tests.yml/
ios-release.yml/preview-deploy.yml, usage-monitor «hourly 05–22 UTC»,
dashboard.js ~456; `tests/workflows.test.js` — dekk de 4 udekkede workflowene
(eksistens + refererte filer finnes); `ios/README.md` — News/-delsystemseksjon
(NewsBoard/NewsLens/NewsModel/NewsView), LaunchTrace i kartet, testtall 69
filer/573 tester, whyShown-notatet i WP-82-historikk krysshenvist til #292;
PLAN.md-metadata — tittel («Sportivista»), søk-erstatt-artefaktene (~394/396/441),
WP-106-headingen ⬜→✅, WP-17-glyfen, FLYTTEDAGEN-listens utførte rename-punkt.
**Ikke-mål:** ingen kodeendringer utover tests/workflows.test.js.
**Aksept:** vitest grønn; stikkprøve: hver CLAUDE.md-påstand om base.css/testtall
er verifiserbar mot koden.

### WP-115 · iOS: in-app nyhetsbrowser (bølge 2)
**Mål:** NYTT-rader (og kilde-lenker i event-detaljen) åpner i in-app-browser
(SFSafariViewController) i stedet for å kaste brukeren ut i Safari.
**Innhold:** `ios/Sportivista/News/NewsView.swift`: bytt `Link`-ut-navigering mot
`SFSafariViewController`-wrapper (UIViewControllerRepresentable, .pageSheet/full),
Reader-modus-hint på artikler, behold «åpne i Safari»-utvei i menyen; samme
komponent gjenbrukes for evidens-/kildelenker i event-detaljens AI-provenance.
**Aksept:** unit + UI-røyk (tapp NYTT-rad → in-app-browser vises), 4 schemes.

### WP-116 · Dekningsbredde: katalog + deltaker-/«Om»-kontrakter (bølge 2)
**Mål:** langt bredere/dypere dekning så mulige interesser kan forutses — og
innholdskontrakter som fikser VM-semifinale-klassen (deltakere aldri stemplet)
og «Om»-veggen ved kilden. **Innhold:** (1) `scripts/config/catalog.json`:
utvid tier1 (håndball, vintersport-grenene eksplisitt, friidrett) og tier2-
langhalen (flere ligaer/turneringer/utøvere per sport) — nøkternt men vesentlig;
(2) `scripts/agents/research.md`: horisont-scanning-pass («hva skjer i norsk/
internasjonal sport neste 4 uker som IKKE er på tavla/i katalogen — foreslå
katalog-kandidater med begrunnelse i tracked.json»); (3) `scripts/agents/verify.md`:
deltaker-ferskhet — når et knockout-event innen 7 dager har tomme `participants`
og kampene som avgjør dem er spilt, SKAL deltakerne fylles (VM-semifinalene sto
tomme hele uka); (4) research/verify «Om»-kontrakt: `description` skrives som
2–3 korte avsnitt / nøkkelfakta, aldri én blokk >~400 tegn. **Aksept:** vitest +
`node scripts/build-events.js && node scripts/validate-events.js` grønn;
agent-prompts-koherens grønn.

### WP-117 · Design-review av alle flater (read-only)
**Mål:** full gjennomgang mot DESIGN.md: web (agenda/detalj/«Dette dekker vi»/
rediger/activity/styleguide) + iOS (agenda/Nyheter/Deg/«Det du følger»/detalj/
onboarding/widget) — med særlig vekt på «Det du følger»-flyten (eieropplevd
mangelfull) og «Om»-seksjonen (wall of text). **Leveranse:** prioritert
funnrapport + konkrete WP-forslag (mater WP-120). Ingen kodeendringer.

### WP-118 · Kjernefunksjonalitet-audit (read-only)
**Mål:** eiers mistanke — «en del av kjernefunksjonaliteten er ikke helt på
plass» — avkreftes/bekreftes systematisk: varsler (planlegges de OG leveres på
enhet?), sync-ferskhet (hvor gammel kan tavla være?), live-status, deltaker-/
resultat-ferskhet, horisonten (7 dager nok?), lens-treffsikkerhet, ICS,
widget-innhold, spoiler-skjold. **Leveranse:** prioritert gap-liste med evidens
+ WP-forslag. Ingen kodeendringer.

### WP-119 · Portmåling-artefakt (bølge 2)
**Mål:** portene som gater eksterne testere måles mekanisk, ikke på magefølelse.
**Innhold:** nytt `scripts/build-port-report.js` (kjøres fra build-events eller
eget pipeline-kall UTEN workflow-endring): aggregerer per dag — amend-rate
nær-term (verify-log + calibration-ledger), tapte fulgte events (coverage-audit
gaps mot catalog), stille stopp (build-alert + run-metadata der tilgjengelig),
deltaker-status-feil (verify-log) → `docs/data/port-report.json` (+ .gitignore-
whitelist + manifest). **Aksept:** vitest + integrasjonstest mot fixtures.

### WP-120 · «Det du følger»: visning + håndtering (bølge 3)
**Mål:** flaten skal svare på «hva GIR følgingen», skille regel-typer, og gjøre
slutt-å-følge trygt (WP-117 A(a): i dag navneliste med identisk undertittel per
rad). **Innhold:** (1) `ios/Sportivista/Profile/FollowedListView.swift`:
seksjoner per regel-type (UTØVERE/LAG/TURNERINGER/SPORTER/KATEGORIER); rad =
navn + kanonisk sport-symbol + **per-entitet neste event** («Neste: lør 25. ·
Strømsgodset – Lyn · TV 2») eller ærlig «ikke satt opp ennå» — erstatt den
enhets-globale «varsler på/av»-undertittelen; (2) `FollowDetailView`: nye
seksjoner KOMMENDE (1–3 neste events, tappbare) og SISTE NYTT (linse-matchede
news-pekere) over OM/HVORFOR; (3) `.swipeActions` «Slutt å følge» med samme
bekreftelse + kort angre; (4) web-paritet: `docs/js/followed.js` + `edit.js` —
neste-event-per-rad + type-gruppering; rediger-amber-overload fikses (navn i
`--fg`, ett amber-element per rad, rad→detalj i stedet for to inline-knapper).
**Gjenbruk:** FeedQuery/NewsLens/AssistantViewModel.follow/removeRule — ingen ny
skrivevei. **Ikke-mål:** ingen ny per-entitet-varselmodell; ingen serverendring.
**Aksept:** type-gruppert liste med neste-event per rad; detalj med KOMMENDE +
SISTE NYTT; swipe + bekreftelse + angre; full unit-suite + nye tester; skjermbilder
begge temaer begge flater.

### WP-121 · iOS leverings-ferskhet: varsel-reconcile + widget-reload + foregrunn-sync (bølge 2)
**Mål:** lukk de to 🔴-hullene + foregrunn-hullet fra WP-118-auditen — tavla og
varslene skal aldri være eldre enn siste sync. **Innhold:** (1)
`NotificationPlanner.reconcile` har i dag ETT kallsted (`ContentView.swift:652`,
kun kald oppstart): kall den også fra bakgrunnssyncen
(`BackgroundRefreshScheduler.handle` — snapshot events før/etter, reconcile ved
endring) og pull-to-refresh-veien (`AgendaViewModel.refresh`/ContentView); (2)
`WidgetCenter.shared.reloadAllTimelines()` etter enhver sync som endret
events/entities (i dag: 0 kallsteder i hele ios/ — widgeten er opptil ~24 t bak);
(3) foregrunn-sync: `scenePhase == .active` og > ~15 min siden `lastSync` →
`refresh()` (i dag kjøres kun profil-CloudKit ved foregrunn,
`ContentView.swift:484–487`). **Ikke-mål:** ingen endring i planleggings-/
diff-semantikken (den er bevist solid); ingen News/-filer (WP-115 eier dem).
**Aksept:** unit-test med RecordingNotificationScheduler beviser `.reschedule`
når en ikke-launch-sync endrer et events tid; widget-reload-kall verifisert i
begge sync-veier; full suite + 4 schemes + vektorer bit-like.

### WP-123 · ICS: DTEND fra endTime (bølge 3)
**Mål:** flerdagsevents (9 i dagens data, flere mustWatch) skal bli blokker i
abonnert kalender, ikke enkeltpunkt. **Innhold:** `scripts/build-ics.js`
`vevent()` emitter `DTEND` fra `endTime` når satt (ellers som i dag); VALARM
uendret. **Aksept:** `tests/build-ics.test.js` asserterer DTEND for events med
endTime + uendret output for events uten; vitest grønn.

### WP-124 · Horisont-konsistens (bølge 4)
**Mål:** web og iOS skal være enige om hvor langt frem tavla ser (i dag: web
hard-capper 14 d (`dashboard.js:223`), iOS Uka capper aldri, data går ~42 d).
**Innhold:** (1) web: «Fremover»-affordanse som avslører 14–42-dagers-events
(rolig, bak dagens «Vis mer»-mønster); (2) iOS: Uka cappes på 14 d og
Nyheter-FREMOVER eier resten — **EIERBESLUTNING** bekreftes før implementering
(calm vs. fullstendighet). **Aksept:** vitest + iOS-suite; samme event-sett
synlig på begge flater for samme vindu.

### WP-125 · Entitets-konsolidering + lens-miss-signal (bølge 4)
**Mål:** lukk 100T-klassen (to lag-entiteter `100-thieves` og `100t` uten
alias-kobling → linse-miss) og gjør stille-døde følginger synlige. **Innhold:**
(1) `scripts/build-entities.js`: kallenavn/initial-dubletter konsolideres til
alias på hovedentiteten; entities-test som vokter mot lag-dubletter; fixtures
re-fryses bevisst; (2) lens-miss-signal: fulgt regel som har matchet 0
events/nyheter siste N dager flagges stille i «Det du følger» («ikke satt opp
ennå» vs. «ingen treff på 14 dager — sjekk navnet») — klientberegning, ingen
telemetri. **Aksept:** vitest + iOS-suite; 100T-eventet treffer
100 Thieves-følging i vektor/test.

### WP-126 · Live-koherens: ett delt live-begrep (bølge 3; eierbestilling 20.07)
**Mål:** «pågår live» skal være konsistent og sann på alle flater (i dag tre
usammenhengende begreper: web «Direkte nå» viser KUN ESPN-pollede sports
(fotball/golf/F1 — TdF-etappen vises aldri), tidsvindu-«pågår nå» er sann kl. 03
for flerdagsevents, iOS liveNow beregnes kun ved reload og tikker aldri).
**Innhold:** (1) delt definisjon i `shared-constants.js` (+ speiling i
FeedCompiler/AgendaViewModel): DIREKTE = nå ∈ [time, effectiveEnd] der
effectiveEnd = endTime ELLER sport-typet default-varighet (fotball ~2t15,
F1-økt ~2t, etappe ~5t, sjakkrunde ~5t, CS2 ~2t); flerdagsturneringer utenfor
plausible spillevinduer er «pågår» (stille tilstand), ALDRI live-dot; (2) web
«Direkte nå»-linja (live.js) viser alle DIREKTE tavle-events, ESPN-score beriker
der den finnes (score = bonus, ikke inngangsbillett); (3) iOS: samme definisjon
+ lett minutt-tikk (Reduce Motion-vennlig) så linja er sann mellom reloads;
widget markerer DIREKTE. **Ikke-mål:** ingen ny polling av nye kilder.
**Aksept:** tester begge flater (DIREKTE-grensetilfeller: uten endTime,
flerdags, ferdigspilt); TdF-etappe synlig i «Direkte nå» i testfixture.

### WP-127 · Detalj & widget: «Om»-avsnitt iOS + deltaker-titler + RESULTAT sist (bølge 3)
**Mål:** lukk detalj-/widget-delene av Om- og deltaker-funnene. **Innhold:**
(1) `ios/Sportivista/Agenda/EventDetailSheet.swift`: `summary` rendres som
avsnitt + nøkkelfakta-linjer (speil WP-111s aboutParagraphs-semantikk), mykt
lengdetak + «mer»; RESULTAT-seksjonen flyttes sist (DESIGN § Event-detalj);
(2) deltaker-titler i detaljarkene (web `detail.js` + iOS `titleText`) og
widget-highlight (`WidgetTimelineBuilder.swift:98`) via samme delte
formateringshjelper som raden (WP-111/112); (3) `docs/css/cards.css`: lang
prosa i detalj får full radbredde (`.d-prose`), nøkkel/verdi-oppsettet beholdes
kun for korte felt (i dag klemmes 700+-tegns tekster inn i ~130 px kolonne).
**Aksept:** WidgetTimelineBuilderTests + detalj-tester begge flater; skjermbilde
av 700+-tegns event viser avsnitt i full bredde begge temaer.

### WP-128 · Web-agenda: fortids-dag + ekspandert-tilstand + klokke-avstemming (bølge 3)
**Mål:** de to høy/middels-funnene fra WP-117 + DESIGN-avstemming. **Innhold:**
(1) `dashboard.js renderAgenda`: ferdigspilte flerdagsevents skal aldri gi en
fortids-dagoverskrift over «I DAG» (19.–20.07 tronet «TORSDAG 16. JULI»/Corales
øverst — flytt under «I dag» eller filtrer når endTime < now); (2) live-pollens
`renderAgenda()`-rebuild hvert 60. s skal bevare ekspanderte rader
(aria-expanded-tilstand over re-render); (3) klokke/tema-glyf: DESIGN.md
motsier seg selv om web-klokka (§ Bevegelse sier fjernet, § Cross-surface sier
beholdt) — **EIERBESLUTNING**: fjern web-klokka for paritet ELLER dokumentér
unntaket; tema-glyf-unntaket noteres samme sted; (4) valgfritt småplukk: «NESTE
OPP»-rader som dupliserer synlige agendarader dedupes; sport-symbol på web-raden
vurderes for paritet. **Aksept:** nye dashboard-cards-tester (ingen fortids-dag
øverst; ekspandert overlever poll); DESIGN.md internt konsistent.

### WP-129 · Onboarding-klarhet: formål i klarspråk + kapsel-copy + stale kommentarer (bølge 4)
**Mål:** appen skal ikke lære bort en kontroll som ikke finnes, OG (eierbestilling
20.07) forklare formålet i klarspråk for ikke-tekniske brukere før den ber om noe.
**Innhold:** (1) `OnboardingView.swift` (landing) + `AgendaView.emptyRow`:
«skriv i kommandolinjen nederst»/«»_»-idiomet erstattes med kapsel-modellens
språk («trykk assistenten nederst») + en rolig kapsel-preview (assistent-symbol ·
prompt · amber mic); (2) formåls-klarhet: velkomst-steget sier HVA appen gjør i én
klarspråks-setning før quick-picks/samtale, den tomme agendaen forklarer formål +
neste steg vennlig — quick-picks beholdes som den universelle vei-uten-AI,
samtalen er entusiast-veien (routing uendret); (3) stale «Tekst-TV»/«teletext»-
kommentarer i 14 Swift-filer omformuleres (constraint-bærende linjer i
DesignTokens/Interaction beholder rasjonalet, forankret i «Apple-native baseline»).
Skjermkatalog-punktet utgår — design-v2-galleriet er slettet (regel 8), ingen
gjenoppretting. **Aksept:** grep 0 treff på «kommandolinjen»/«Tekst-TV»/«teletext»
i ios/Sportivista; enhets-suite + UI-røyk onboarding grønn.

Første designer-runde gjennom Claude Design ga en godkjent retning («Intuitivt
for alle», turn 3) som eier har bestilt FULL implementering av — inkludert å
fremskynde WP-100s klientdel forbi G1-gaten (eierbeslutning i hovedsesjonen
19.07; serverdataene forblir uherdet til portmålingen er grønn, og eksterne
testere er fortsatt gatet). **Bindende spec:** `design/specs/assistent-nyheter-v0.md`
(destillert fra design-dokumentet i Claude Design-prosjektet). DESIGN.md
§ Navigasjon/§ Hjelperen/§ Nyheter/§ Deg er oppdatert som kontrakt FØR
implementering.

Bølge 1 (parallelle, disjunkte filer): WP-103 (server), WP-104 (rot +
assistent — eier ContentView.swift + Assistant/), WP-105 (3b — eier Profile/ +
event-detaljen). Bølge 2: WP-106 (Nyheter-klienten, avhenger av alle tre).
Menneskebeslutninger: ingen beskyttede stier i noen av pakkene.

### WP-103 · Nyhets-server — ✅
`scripts/lib/news.js` + kall fra `build-events.js` (IKKE nytt pipeline-steg —
workflows er beskyttet): bygg `docs/data/news.json` fra `rss-digest.json`-items
× `entities.json`-navnematching (gjenbruk helpers-matchingen build-events
bruker på events). Kontrakt i spec-en: id=hash(link), dedupe på link, cap ~100
items/7 dager, byte-idempotent, whitelist i .gitignore, med i manifest.
**Aksept:** vitest-suite for matching/dedupe/idempotens; `node
scripts/build-events.js && node scripts/validate-events.js` grønn; news.json
i manifest.json.

### WP-104 · Assistent-inngang (3a + samtaleark) — ✅
Eier `ios/Sportivista/ContentView.swift` + `ios/Sportivista/Assistant/`.
Segmented «Uka | Nyheter» (ord) under headeren — Nyheter-siden viser en
minimal plassholder-view (fil `News/NewsView.swift` OPPRETTES her som skall,
WP-106 fyller den); kapsel-KNAPP nederst erstatter inline-feltet; samtaleark
med de fem tilstandene fra spec-en (gjenbruk diff-/answer-armene i tråd-form);
WP-99-lukkeveiene overlever i ark-form. Demo-modus `command-focused` omdøpes/
erstattes med ark-tilstander for skjermkatalogen. **Aksept:** unit + UI-suite
grønn (eksisterende tastatur-tester omskrives mot arket), 4 schemes bygger,
vektorer bit-like, mock-tester for eksempelradene + eval-corpus-cases for de
to kjørbare eksemplene (0E-regelen).

### WP-105 · Det du følger + Legg til (3b) — ✅
Eier `ios/Sportivista/Profile/` + event-detaljfila. «Det du følger» som vanlig
liste (fra Deg, rad → detalj, Slutt å følge), «Legg til»-søk mot entities.json
med Følg-knapper, Følg-knapp i event-detaljen. RØRER IKKE ContentView.swift
(WP-104 eier den — navigasjon nås fra DegView). **Aksept:** unit-suite +
mock-tester; profil-endringer går gjennom samme ProfileStore-vei som
assistenten (én kilde til sannhet).
🔬 **Implementert (branch wp-105-det-du-folger):** ny delt apply-vei
`Profile/AssistantViewModel+Follow.swift` (`follow(_:)`/`isFollowing(_:)` — trakter
inn i samme `InterestProfile.applying` + `ProfileStore.save` + `onProfileChanged`
som `confirm`/`toggleStarterPack`; ingen ny skrivevei). Nye
`Profile/FollowedListView.swift` (Det du følger + rad→detalj + Slutt-å-følge via
`removeRule` bak rolig `confirmationDialog`) og `Profile/AddFollowSearchView.swift`
(søk mot `EntityIndex(DataStore().loadEntities())`, Følg-knapp per rad → `follow`).
DegView-raden omdøpt «Det du følger» (id `deg.follows` uendret). Event-detaljens
«Følg»-knapp beholder `onFollow`-sømmen, nå dokumentert mot den direkte apply-veien.
**Integrasjons-handoff til WP-104 (én linje i ContentView.follow):**
`assistant.proposeFollow(entity)` → `assistant.follow(entity)` gjør detalj-/swipe-
følg assistent-fri. Tester: `SportivistaTests/FollowActionTests.swift` +
UI-røyk `SportivistaUITests/FollowedListUITests.swift`.

### WP-106 · Nyheter-v0-klienten — ✅
Fyller `News/` med fire-seksjons-tavla per spec: brief (featured.json),
NYTT (news.json linse-matchet på entityIds/sport), RESULTAT (recent-results
bak spoiler-skjoldet), FREMOVER (events utover horisonten). Sync: news.json +
featured.json + recent-results.json inn i filesOfInterest (og fjern død
`interests.json`-referanse — avpublisert i WP-96); kilder åpnes UT (Link/
SFSafariVC). «Det du følger»-lenke øverst (WP-105s view). **Aksept:** unit +
UI-røyk på tavla, 4 schemes, skjermkatalog-modus `news` legges til.
🔬 **Implementert (branch wp-106-nyheter-klient):** Nyheter-modeller i
`Models/` (`NewsItem`/`NewsFeed`, `FeaturedBrief`, `RecentResults`/`FootballResult`
— widget-trygge Codable som den delte `DataStore` leser via nye `loadNews/
loadFeatured/loadRecentResults`); `SyncClient.defaultFilesOfInterest` fikk
`news.json`/`featured.json`/`recent-results.json` og MISTET død `interests.json`
(WP-96-avpublisert). Ny `News/`: `NewsLens` (linse-matching — entityId ∩ fulgte,
ELLER fulgt hel-sport/kategori-regel via profilens rule-semantikk + SportVocabulary,
ingen ny fuzzy), `NewsBoard` (ren fire-seksjons-bygger: brief-headline, linse-
matchet NYTT nyest-først/capped, RESULTAT for fulgte lag med spoiler-flagg fra
`SpoilerShield`, FREMOVER via `FeedCompiler.isEventInWindow` utover 7-dagers
horisont), og `NewsView` (fire seksjoner + stille «Det du følger»-lenke til
`FollowedListView`, NYTT-rader åpner kilden UT via `Link`, RESULTAT bak «Vis
resultat» med `eye.slash`-reveal). Demo-modus `news` (`Demo/NewsDemoSeed`) + i
`design/screens/generate.sh`/README. `Sportivista/News` lagt i test-targetet.
Tester: `NewsLensTests` (linse/decode/tom+korrupt fil) + `NewsBoardTests`
(seksjons-montering) + `NewsBoardUITests` (bytt til Nyheter, se seksjon);
`SyncClientTests`/`SyncTestSupport` + nye fixtures oppdatert for fil-settet.

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
- **GATE: eksterne testere inviteres IKKE før WP-96 (flerbruker-splitten) er
  landet** — ellers tester de eierens tavle, ikke sin egen (se WP-96).
- `xcodebuild archive` + `-exportArchive` (App Store-metode) + opplasting via
  `xcrun altool`/`notarytool` med API-nøkkelen; intern TestFlight-gruppe med eieren;
  deretter 15–20 eksterne testere fra nisjemiljøene.
- Husk: bundle-id-byttet (rebrand) betyr at TestFlight-appen er en NY app-identitet;
  gamle enhets-installasjoner (app.zenji.ios) slettes manuelt.

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
**Design når den utføres (invertert etter renamen):** `CHaerem/sportivista` BEHOLDES
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

### WP-96 · Flerbruker-splitten: interests → katalog + etterspørsel (GATE for eksterne testere)
Ærlig systemvurdering 18.07 (verifisert i kode: interests.json leses av ~10
server-skript + styrer 6 agent-prompter): klient-halvdelen + distribusjons-
planet er kommersielt klare (linsen bærer ALL personlig relevans — bevist av
WP-92s låssteg); men SERVER-motorens kompass er eierens interests.json i hvert
ledd. Konsekvens i dag: `isRelevant()` filtrerer den delte tavla etter ÉN
persons interesser — en ekstern tester som følger andre sjakkspillere/CS-lag
enn eieren får TOM tavle (serveren droppet innholdet før deres linse så det).
- **Mål:** Server-relevans («hva DU følger») → katalog-scoping («hva Sportivista
  DEKKER»); all personlig filtrering skjer i klient-linsen der den alt bor.
- **Innhold:** (a) ny `scripts/config/catalog.json` (tier 1: toppligaer/-sporter
  bredt; tier 2: entitets-langhale, senere etterspørselsdrevet à la WP-23) —
  seedes fra dagens interests + rimelig norsk generalist-bredde; (b)
  `build-events` `isRelevant` → `isCovered(catalog)`; klient-linsen uendret
  (den personlige presisjonen består per bruker); vektorer re-fryses bevisst
  (WP-92-prosedyren); (c) research/verify/coverage-critic/scout retter seg mot
  katalogen (tracked.json blir katalogens bokføring); (d) editorial → entity-
  taggede nøytrale fakta (VISJON v3-modellen), klienten komponerer den
  personlige briefen; (e) `build-ics` parameteriseres/flyttes klient-side;
  (f) `docs/data/interests.json` avpubliseres — eierens interests.json blir
  første brukers on-device-profil + katalog-seed («Hva vi følger»-web-flaten
  vises fra katalogen i stedet).
- **Ikke-mål:** kontosystem/server-personalisering (aldri — arkitekturprinsipp);
  etterspørsels-aggregering (WP-23, senere).
- **Aksept:** to test-profiler med DISJUNKTE interesser (f.eks. annen sjakk-
  spiller + annet CS-lag) får begge meningsfull tavle fra samme publiserte
  katalog-feed via egen linse; eierens egen feed er uendret (linsen hans
  filtrerer som før); vektorer bit-like begge plattformer etter re-frys.
- **Sekvensering:** ETTER portmålingen, FØR eksterne TestFlight-invitasjoner
  (interne testere/eieren trenger den ikke). Kost-note: bredere katalog øker
  research-/verify-omfang — koordineres med API-splitten (Fase B i
  AI-ØKONOMI-tillegget).

### WP-97 · Design-biblioteket (én token-sannhet + koherens-tester) — 🔬 PR åpen
Eier-beslutning 18.07: konsistent branding-stil trenger bibliotek. I dag lever
tokens i TRE parallelle sannheter (DESIGN.md-prosa, DesignTokens.swift,
base.css) holdt i takt for hånd, og app-ikon-scriptet finnes kun i en sesjons-
scratchpad. Repoets signaturgrep anvendes: verifisering fremfor kodegen.
- **Innhold:** `design/tokens.json` (W3C-format, én kilde: farger mørk/lys,
  typografi-roller, spacing, radius — inkl. semantiske system-farge-mappinger
  for iOS der hex ikke finnes); `tests/design-tokens.test.js` (koherens:
  base.css-hex OG DesignTokens.swift-mappinger verifiseres mot tokens.json —
  drift = CI-feil); `design/brand/` (kolonet.svg kilde-vektor, innsjekket
  parametrisert ikon-script for alle størrelser, merkelås-spek med avstand/
  minstestørrelse/feil-bruk, favicon-sett); `docs/styleguide.html` (levende
  styleguide rendret fra ekte base.css — tokens + komponenter; referanse for
  visual-qa); DESIGN.md §Tokens peker på tokens.json som fasit.
- **Ikke-mål:** Figma/eksterne verktøy; kodegen; iOS-komponentgalleri (senere).
- **Aksept:** koherens-testen grønn mot DAGENS verdier (biblioteket låser
  virkeligheten, endrer den ikke); styleguide-siden viser alle tokens +
  kjernekomponenter i begge temaer; ikonet kan regenereres fra innsjekket
  script byte-likt dagens.
- **Levert i denne PR-en:** `design/tokens.json` (W3C-format) + 48 tester i
  `tests/design-tokens.test.js` som krysssjekker tokens.json ⇄ base.css ⇄
  DesignTokens.swift ⇄ DESIGN.md § Tokens (rødt bevist på en ekte
  verdi-mutasjon, revertert); `design/brand/kolonet.svg` (kilde-vektor,
  radius 118 / avstand 168 på 1024-rammen — utledet ved pikselinspeksjon av
  det skipede ikonet, ikke antatt) + `design/brand/generate-icons.swift`
  (innsjekket, parametrisert — `--all <dir>` regenererer hele settet); 1024-
  utgaven verifisert **PIKSEL-IDENTISK** (null delta i alle RGBA-kanaler) mot
  `AppIcon-1024.png`, samme for alle fire web-ikonene — PNG-filene selv er
  12 byte større (kun `eXIf`-metadata, `IDAT`-lengden er identisk); `design/brand/BRAND.md`
  (konstruksjon, avstand, minstestørrelser fra faktisk kildekode-grep, feil
  bruk, tagline); `docs/styleguide.html` (lenker ekte base.css/layout.css/
  cards.css, ingen duplisert CSS; fargeswatcher leser CSS-variablene live via
  `getComputedStyle`; skjermbilder tatt i begge temaer). **Avvik funnet, IKKE
  stille rettet** (se `design/tokens.json` `$extensions.sportivista.discrepancy`
  per token/rolle): (1) `tertiaryLabel`/`--fg-3` brukes på begge flater men
  mangler i DESIGN.md § Farge-tabellen OG i `SportivistaTokens`-enumet (iOS-
  views kaller `Color(uiColor: .tertiaryLabel)` direkte); (2) wordmarkens
  «Stor tittel»-rolle er 26px på web, ikke DESIGN.md sin dokumenterte
  2.125rem (34px) — en reell, ikke-avrundings-differanse; (3) web sitt
  ordmerke er HELT amber (én av fem sanksjonerte amber-bruk i `base.css`),
  mens iOS/widget kun farger kolonet amber — dokumentert som bevisst
  flate-avvik i BRAND.md, ikke rettet.

### WP-98 · Brand-harmonisering + skjermkatalog — 🔬 PR åpen
Oppfølger til WP-97: løser de tre dokumenterte avvikene (fasit: det som
shipper på iOS er den eier-godkjente merkelåsen) + bygger en innsjekket
skjermkatalog-generator som Claude Design kan bruke (iOS-skjermer kan ikke
web-captures).
- **Innhold:** (1) `docs/css/layout.css` `.wordmark` fra hel-amber til
  `var(--fg)` (label), kun `.wordmark-colon` amber — matcher iOS/widgets
  merkelås (`ContentView.swift`/`OnboardingView.swift`/`SportivistaWidget.swift`);
  (2) wordmark-størrelsen 26px → 28px (~1.75rem) — matcher iOS' faktisk
  shippede `.title` bold (~28pt), IKKE den tabell-dokumenterte, aldri wired
  opp `.largeTitle`/2.125rem (ingen skjerm i appen bruker native large-title
  nav — `.navigationBarTitleDisplayMode(.inline)` overalt); DESIGN.md-tabellens
  rad omdøpt «Stor tittel (nav)» → «Ordmerke (masthead)» + tokens.json + Swift-
  kommentaren rettet til samme sannhet; (3) `tertiaryLabel` inn i systemet:
  ny token i `design/tokens.json` (discrepancy fjernet, historikk-notat i
  `$description` i stedet), ny rad i DESIGN.md § Farge, `SportivistaTokens.tertiaryLabel`
  i `DesignTokens.swift`, migrerte `AgendaView.swift:423` + `DegView.swift:227`
  fra rå `Color(uiColor: .tertiaryLabel)`; `tests/design-tokens.test.js` utvidet
  (semantisk mapping + DESIGN.md-rad + migrerings-grep på begge kallsteder);
  BRAND.md § Construction rule 5 omskrevet (harmonisert, ikke lenger «bevisst
  avvik»); `docs/styleguide.html` + `base.css`/`layout.css`-kommentarer rettet
  til «wordmark colon» i femer-listen over amber-bruk. (2) `design/screens/generate.sh`
  (innsjekket, kjørbar) — bygger `Sportivista`-scheme (Debug, eksplisitt
  `-derivedDataPath`), booter «iPhone 17», installerer FERSKT (avinstallerer
  først), looper alle 17 `SPORTIVISTA_DEMO`-moduser × begge temaer
  (`simctl ui appearance`) → 34 PNG-er i en OUTPUT-katalog (default
  `/tmp/sportivista-screens/`, aldri innsjekket); `design/screens/README.md`
  forklarer bruken mot Claude Design + moduskatalogen.
- **Ikke-mål:** relevans-/feed-logikk (urørt — token-migreringen er ren
  stil); web-reskin utover merkelås-fiksen (den generelle Tekst-TV → baseline
  web-reskinen er en egen, senere WP); iOS-komponentgalleri.
- **Aksept:** `npx vitest run --maxWorkers=1` grønn (594 tester, inkl. 52 i
  det utvidede design-tokens-testsettet) — ingen gjenstående discrepancy-unntak
  trengs for grønt (testene sjekker verdier, ikke feltet, men de tre feltene
  er nå fjernet fra tokens.json siden avvikene er løst); `xcodegen generate` +
  full unit-suite (526 tester) + alle 4 schemes (`Sportivista`,
  `SportivistaDeviceDev`, `SportivistaUITests`, `SportivistaWidgetExtension`)
  bygger grønt; skjermkatalog-scriptet kjørt og minst 4 skjermer på tvers av
  moduser/temaer visuelt inspisert (riktig skjerm, riktig tema, ingen
  home-screen-feilskudd).
- **Levert i denne PR-en:** se commit-diff — CSS-fiksen er en synlig endring
  på live-siten (meningen: retter drift mot godkjent design), øvrig er
  dokumentasjons-/token-/test-harmonisering + det nye, innsjekkede
  skjerm-scriptet.

### WP-99 · Tastatur-lukking + assistent-klarhet + agenda-layoutbug — ✅ (#311)
Eier-funn fra dogfooding på fysisk iPhone. Tre uavhengige feil, alle på
assistent-/agenda-flaten, fikset minimalt og HIG-native.
- **Funn 1 — tastaturet kunne ikke lukkes (kontraktsbrudd mot DESIGN § Hjelperen).**
  Tre native lukke-veier lagt til: (a) `.scrollDismissesKeyboard(.interactively)`
  på agendaens `List` (`AgendaView`) + Deg-lista (`DegView`) — dra for å lukke;
  (b) tapp-utenfor: `.simultaneousGesture(TapGesture)` på `AgendaView` i
  `ContentView` som resignerer `commandFocused` — SIMULTAN, så en rad-tapp fortsatt
  åpner detaljen (bevist av ny UI-test); (c) en stille lukke-glyf
  (`keyboard.chevron.compact.down`, ≥44pt, a11y «Lukk tastaturet») i
  trailing-slotten når feltet er TOMT og fokusert — nettopp hullet eieren traff
  (feltet-med-tekst har send, tenking har Avbryt).
- **Funn 2 — uklart hva chatten kan.** En stående FØRSTE pill «Hva kan du gjøre?»
  i fokus-forslagene (`CommandLineView.focusSuggestions`), som SUBMITTER
  (`AssistantViewModel.askForHelp`) og ruter til den EKSISTERENDE hjelp-armen
  (WP-68 `AssistantHelp`/`getHelp`; mock-answereren matcher «kan du») — ingen ny
  intent-logikk. Verifisert at fokus-forslagsraden IKKE er mock-only: den leser
  `viewModel.focusSuggestions` (ren computed prop) og vises på `focused &&
  tom`, uavhengig av FM-tilgjengelighet.
- **Funn 3 — flerdags-golf-rad-overlapp (WP-98-oppfølger).** Rotårsak: i
  `EventRowView`/`SeriesRowView` tapte `TimeColumn` (`.fixedSize(horizontal:)` +
  `.frame(minWidth: 58)`) bredde-forhandlingen mot en grådig `RowBody`
  (`.frame(maxWidth: .infinity)`). En klokke («23:20») får plass i 58pt så alt
  gikk bra; et bredt dato-VINDU («16.–19. juli») ble under-proposert bredde,
  rammen klemte til 58pt mens den indre fixedSize-teksten tegnet sin fulle ~130pt
  — altså OPPÅ (og delvis av venstre kant på) tittelen. Fiks: `.layoutPriority(1)`
  på tidskolonnen så HStacken reserverer dens fulle bredde først. Ren layout —
  gylne vektorer/`FeedCompiler` urørt. Ny `GolfBoardDemoSeed` gir deterministisk
  OFFLINE-repro for `onboarding-landed`/`-landing` (før lente de seg på live-
  tavlen → nettverksfritt skjermbilde fanget bare «Henter data …»).
- **Ikke-mål/urørt:** beskyttede stier, relevans-/feed-logikk, `docs/**`,
  FM-intent-tolkningen (hjelp-pillen bruker eksisterende arm).
- **Aksept:** `xcodegen generate`; full unit-suite grønn (+ 1 ny:
  `AssistantViewModelTests.test_askForHelp_*`); vektorer bit-like; alle 4
  schemes bygger; `SportivistaUITests` grønn inkl. 4 nye flyter (tapp-agenda
  lukker · rad-tapp åpner detalj under fokus · tom-fokusert lukke-glyf ·
  hjelp-pill gir svar); før/etter-skjermbilder av golf-raden + fokusert
  tilstand; `npx vitest run --maxWorkers=1` grønn (urørt web).

## FLYTTEDAGEN · Zenji → Sportivista — ✅ UTFØRT 17.07.2026

Eierbeslutning (varemerke-søk utsatt, risiko akseptert av eier): repo omdøpt til
`CHaerem/sportivista` (GitHub redirecter gamle URL-er), rebrand+identitetsflytting
merget til main, Pages-domene → `sportivista.com` (GoDaddy-DNS A/AAAA/CNAME via API),
`zenji.app` kuttet som domene (auto-fornyelse skrus av — dør ved utløp 2027-07-13).
iOS: `app.sportivista.ios`-id-er, `group.app.sportivista`, `sportivista://`, baseURL →
`sportivista.com/data/`. Web: navnebyttet; Tekst-TV-utseendet reskinnet til Apple-native baseline 18.07 (commit `1a5e89d31`).
Utført siden: mekanisk target-rename (`Zenji.xcodeproj` → `Sportivista.xcodeproj`), web-reskin
til baseline (18.07), TestFlight-lanen (WP-17). Gjenstår: formelt varemerke-søk+registrering (eier),
`sportivista.no`-forwarding (manuell, GoDaddy-UI), zenji.app renewAuto-toggle (manuell — API-PATCH bet ikke).

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

## MILEPÆLSKARTET mot kommersialisering (eier-bestilling 21.07.2026)

Eieren pekte 21.07 på de store milepælene som gjenstår før appen er reelt klar
for kommersialisering; en syv-agenters kartlegging (web-følgeflyt, iOS-følgeflyt,
entitetsmodell, identitet, planstatus, go-to-gap + adversariell kritiker som
etterprøvde funnene mot koden) verifiserte rotårsakene mekanisk:

1. **«Jeg prøvde å legge til Liverpool og fikk beskjed om at det ikke fantes.»**
   Verifisert kjede: ALT følge-søk (iOS `AddFollowSearchView`/`MutationGrounder`,
   webens detaljark-knapper) går mot `entities.json` — 53 oppføringer (42 reelt
   følgbare, 4 lag), bygget av `build-entities.js` fra tracked.json/sports-config/
   norwegian-golfers. `catalog.json` tier2 — som SELV lister Liverpool (linje 59)
   og hele PL-toppen — foldes ALDRI inn. Følge-universet er avledet av tavlas
   nå-tilstand (tracked-entries utløper, indeksen regenereres uten husk), ikke av
   verden; to skipte startpakker peker alt på døde id-er, og onboardingen
   reklamerer med «Liverpool» som eksempel (OnboardingView.swift:176). Det er en
   OPPSLAGS-feil, ikke en hente-feil (fotball er tier1 — PL-kampene kommer på
   tavla i sesong), og datamodellen under er klar (lens/FeedCompiler matcher på
   navn, CRDT-en tåler alt): kun registeret + opprettelsesflatene mangler.
   → **FASE 0J**.
2. **«Appen er for anonym/kjedelig — mangler identitet.»** Villet mellomtilstand
   (DESIGN.md: kosmetikken byttes ETTER at kjernen er herdet) — men kjernen ER
   herdet nå, og ingen WP eide neste steg. Kolonet (WP-152) er et ekte,
   eier-godkjent merke som bærer ~5 % av flaten; den redaksjonelle norske
   stemmen — aktivumet INGEN konkurrent har — rendres som én faint grå linje;
   null delbare flater (ingen og:image, ingen delekort). → **FASE 0L**.
3. **«Go-to-appen for agenda/nyheter for det du følger.»** «Laget mitt»-objektet
   finnes ikke (ingen entitetsside — svaret er spredt over Uka/Nyheter/detaljark);
   resultater er fotball-only på tavla og målscorere hentes men vises aldri; iOS
   har null live-score og synker ikke engang standings.json; nyhetslinsen treffer
   6/32 saker (samme entitets-rot som Liverpool); pipelinen natt-fryser 23–07
   Oslo — akkurat «hva skjedde i går kveld»-vinduet. Tid-til-svar-MEKANIKKEN er
   god (kredit: onResume-sync, spoilervern, øyeblikkelig fanebytte) — gapet er
   INNHOLD, ikke friksjon. → **FASE 0K**.

Kritikeren fant i tillegg det planendrende: **Gate G1 er umålbar som definert** —
null eksterne testere (WP-17: fortsatt gatet), null fjerntelemetri by design, og
ekstern TestFlight KREVER personvernerklæring + privacy manifest som ikke finnes.
→ **FASE 0M**.

**Sekvens:** 0J først — den er forutsetningen både for 0K (entitetsside/nyheter
trenger entitetsuniverset) og for reell G1-testing (en PL-fan må kunne følge
laget sitt før retention betyr noe). 0L og 0M kan gå parallelt med 0K.
Nummerblokker: 0J=160-serien, 0K=170, 0L=180, 0M=190 (155–159 = buffer for
løpende småting). Hygiene ryddet 21.07 i samme slengen: WP-131/145/153-radene
à jour, WP-154 etter-registrert, dobbelt-tildelte WP-138 → WP-138B.

---

## FASE 0J · «Følg hva som helst» — interesse-universet (eier-funn 21.07) — planlagt

Kjerneprinsipp (fra entitets-kartleggingen): skill **FØLGE-UNIVERSET** (register:
stort, varig, verdens-avledet) fra **DEKNINGSKOMPASSET** (catalog: kuratert,
kostnadsbegrenset) fra **BOKFØRINGEN** (tracked.json: flyktig, datert). I dag
avledes det første av det tredje — derfor «finnes ikke Liverpool». Merk også
laget UNDER oppslaget: en bruker som følger noe helt utenfor katalogen får
ingenting fra pipelinen (dekningsgaten) — det er WP-165s etterspørselssignal som
over tid lukker dét, mens 0J-resten lukker oppslags-feilen.

**Menneskebeslutninger i fasen:** ingen — alt er angrefritt og innenfor
null-infra. (WP-165 følger B.1-rammen som alt er besluttet i BRUKERDATA-seksjonen:
offentlige, anonyme signaler.)

Bølge 1: WP-160 (pipeline) ∥ WP-163 (web) ∥ WP-164 (iOS) — ✅ 21.07 (#394/#392/#393).
Bølge 2: WP-161 (register) ∥ WP-165 (signal) ∥ WP-166 (iOS-indeks-tuning — disjunkte
filer mot WP-161, og bør lande FØR registeret vokser indeksen 10–30×).
Bølge 3: WP-162 (id-varighet).

| WP | Tittel | Fase | Avhenger av | Status |
|---|---|---|---|---|
| WP-160 | Strakstiltak: catalog.tier2 → entities.json + håndball-label + alias-datafil | 0J | — | ✅ #394 merget 21.07 — catalog.json tier2 (29 lag→team + 72 turneringer→tournament) foldet inn i entities.json som 4. kilde (tracked vinner dedup, tier2-type autoritativ ved type-mismatch); `handball` lagt til `SPORT_LABELS` (Håndball groundbar, WP-64-klassen); `KNOWN_ALIAS_GROUPS`→datafil `scripts/config/entity-aliases.json` (research/verify-vedlikeholdbar, seed norway/norge). docs/data/entities.json 53→141 (bærer hele langhalen). iOS-fixtur re-frosset som superset (53→60, null fjernet) med akseptkritiske tillegg (Liverpool + hele håndball-langhalen + sport-handball); «liverpool»→team & «håndball»→sport-handball treffer i EntityIndex-søk. NB: full langhale i iOS-fixturen endrer assistent-grounding (representativeEntity/search-presedens/detection) som krever ios/Sportivista/**-kildeendringer → skilt ut som WP-166 (registrert 21.07). Tester: JS 857/857 (+6), full iOS unit-suite grønn, 13/13 gylne vektorer bit-like, 4 schemes bygger, sandbox build-entities→build-events→validate-events rent (Liverpool-event får homeTeamEntityId=liverpool) |
| WP-161 | Verdensregisteret: seedet entitetsregister (~1 500–5 000 entiteter) | 0J | WP-160 | ✅ #396 merget 22.07 — 9 registerfiler `scripts/config/registry/` (3 571 entiteter: fotball 128 ESPN-klubber+VM-landslag, f1 33, tennis 200 ATP/WTA-topp-100, sjakk 203 FIDE-topplister, esport 873 Liquipedia-orgs, sykkel 918 WorldTeams+ryttere via Wikidata, vintersport 565, håndball 425, friidrett 226) + `registry.schema.json` + koherenstest (skjema, kebab-id, global id-unikhet, sortert determinisme, external-nøkkel, 1500–5000-skala); seed-skript `scripts/seed-registry/` (`npm run seed:registry`, injiserbar fetch — testene er nettverksfrie m/fixtures) med stabil id-kontrakt (external-match ved re-seed: navnebytte beholder id, gammelt navn → alias; ingenting slettes); build-entities folder registeret SIST (alle 141 publiserte id-er uendret — verifisert; merge donerer aliases+external+country, type-mismatch logges, registry-vs-registry hopper dedup via boundary); entities.json 141→3 661 (3 559 m/external, 774 601 B — chunking per sport dokumentert fallback >1 MB); news-vakt: ≤2-bokstavs entitetsnavn kan aldri claime nyheter (CS2-orgen «OG» vs. ordet «og»); research (ukentlig deep-sweep-reconciliering) + improve (evidensdrevet re-seed; månedlig Action = eier-oppfølger, workflows er beskyttet sti) fikk register-kontrakt. JS 919/919 serielt; sandbox build-entities→build-events→validate-events rent (46/59 events entity-stemplet, news 21/32). iOS ikke rørt (WP-166 eier ios/) | **Sluttføring i merge (hovedsesjon + WP-166-agenten):** rebase-konflikter på `docs/data/`-artefaktene løst ved REGENERERING (aldri tekst-merge; pipelinen committer datafiler hver time), iOS-fixturen re-frosset som fullt speil (3 663 entiteter, 774 962 B, sha-verifisert mot produksjonsfila). TRE AT-SKALA-FUNN som bare et ekte register kunne avdekke: (a) `AssistantTestSupport.liveIndex()` bygde indeksen på nytt per test-INSTANS (XCTest instansierer én per testmetode ved discovery) → runner-prep-timeout før første test; memoisert. (b) 8 røde grounding-tester med ÉN rotårsak: registerets landslag `france` matchet ordet inne i «Tour de France», og WP-166s «lag/utøver slår konkurranse»-regel droppet da turneringen for det falske laget — fikset prinsipielt med SUB-SPAN-VAKT (en entitet hvis matchede token-spenn alle er ekte delmengder av et annet vinnerspenn er et navnefragment, ikke en omtale; «Lyn» ved siden av «OBOS-ligaen» har disjunkte spenn og består). Eval-korpuset URØRT — ingen fasit slakket. (c) EKTE PRODUKTKODE-REGRESJON: `detectEntities` var et lineært skann over alle 3 663 entiteter (regex per term) på HVER ytring (assistent-parser per klausul + isModifierFragment + MemoryDistiller + AgendaFilter) → invertert token→entitet-indeks (`mentionIndex`) bygget én gang i init; semantikk bevart ved konstruksjon (begge match-signalene krever at alle term-tokens finnes i ytringen ⇒ kandidatsettet er et ekte supersett, scoring byte-identisk). `resolve()` bevisst latt O(n): fuzzy kan matche uten delt token («Hovlan»→«Hovland»), og den ligger ikke på agenda-hot-pathen. Ytelse: full iOS-suite 125 min → **151 s** (parity-testen alene 6 937 s → 35 s, splittet etter `servedEntity`s to reelle stier: fullt eksakt-sveip O(1) per form + fuzzy mot kuratert sett & deterministisk stride-utvalg — garantien bevart, ikke slettet). Verifisert: 684 iOS-tester / 0 feil, 13/13 gylne vektorer bit-like, 4 schemes, vitest 943/943 |
| WP-162 | Sesongløse id-er + re-grounding: follows overlever sesonger | 0J | WP-161 | ✅ #407 merget natt til 23.07 — branch wp-162-sesonglose-ider — kanoniske sesongløse turnerings-/liga-id-er (`premier-league`, ikke `premier-league-2026-27`) med utgave som METADATA (`edition`) + hver forrige id bevart som `altIds`-alias på entiteten (`build-entities.js` `canonicalizeEditions`, kjørt før alias-dekorering; 19 daterte id-er → 19 kanoniske, entities.json 3 663→3 659 fordi tracked-daterte og katalogens sesongløse turnering nå MERGER til én post — logo/colors/country/external/dedup uendret, verifisert felt-for-felt; `rosenborg-2026` (feilarkivert klubb-som-liga) beholder daterte id fordi kanonisk `rosenborg` eies av en annen entitet — kollisjon logget, aldri stjålet). Edition-stripping inn i MATCHING-stien på begge flater: web `lens.js` (`ssWithEditionlessTerms` via ny `ssEditionStripped`), iOS `EffectiveInterests.seasonProof` — en regel frosset på fjorårets navn matcher årets utgave; additivt (aldri forkorter et navn til en annen entitet — «Tour de France Femmes» blir aldri «Tour de France»). Bakoverkompat: forrige id resolver via `altIds` i `EntityIndex.entity(id:)` + web `ssCanonicalIdMap` FØR migrering rekker (levende primær-id vinner alltid). Engangs-migrering på begge flater (`ProfileIdMigration` iOS i reload-stien, `ssMigrateProfileIds` web ved last) re-peker regler til kanonisk id — TAPSFRI (uoppløselig regel beholdt urørt som soft-follow), IDEMPOTENT (nullskriving ved andre kjøring), KONVERGERENDE (gammel id tombstones + ny skrives, så CRDT-en flytter i stedet for å duplisere på tvers av enheter — web-tvillingen gjør byte-samme flytt). Startpakkene re-pekt til kanoniske id-er; ny CI-vakt `tests/starter-packs.test.js` beviser null døde id-er mot LIVE-indeksen (ikke fixturen — der driften gjemte seg før). Gylne vektorer IKKE re-frosset (dokumentert i DIVERGENCES.md §7: ingen vektor-input bærer utgave-id på interesse-siden — kun titler, som er høystakk ikke term; feed-vectors bit-like). Nye testklasser på begge flater («2026-regel matcher 2027-utgave»): `tests/season-proof-follows.test.js` (10) + `SportivistaTests/SeasonProofFollowsTests.swift`. Verifisert: vitest 1120/1120 serielt, full iOS-suite + 4 schemes, sandbox build-entities→build-events→validate-events rent. RESTRISIKO ved sesongskiftet medio august: research-agentens neste catalog/tracked-rewrite må skrive daterte id-er som fortsatt strippes til de EKSISTERENDE kanoniske (samme sesongløse rot) — ellers lager den en ny kanonisk entitet ved siden av; migreringen fanger brukerregler, men to katalogposter for én turnering ville dele opp dekningen til `canonicalizeEditions` merger dem igjen (den gjør det, men bare når typene er liga/turnering + samme sport). |
| WP-163 | Web: søk-og-følg-flate + assistent-mutasjon wiret + katalog-kollaps-fella | 0J | WP-160 | ✅ #392 merget 21.07 — søk-og-følg mot entities.json i «Dette dekker vi» (treff → ssProfileFollow); assistenten UTFØRER «følg X» (kind:'mutation' konsumert i bindAssistant); followTargets slår opp ekte entityId før syntetisk fallback (ingen CRDT-dubletter); katalogen lagdelt under «Det du følger» (aldri kollapset); rediger.html omprofilert til «Be om dekning». 26 nye tester, 877/877 grønt, E2E i browser (dark/light) |
| WP-164 | iOS: soft-follow («følg likevel») + ærlig off-season-svar | 0J | WP-160 | ✅ #393 merget 21.07 — «Følg likevel» ved søke-miss + grounder-avvisning (navnebasert regel m/deterministisk soft-id → CRDT-konvergens, nøytral notify-default for ukjent type), ærlig «Fulgt — …»-status m/sesonglinje fra tracked.json-reasons (grasiøs degradering), VENTER PÅ DEKNING-seksjon i følgelisten, onboarding-CI-vakt (Liverpool-assert flippet til hard etter #394, commit på main 21.07). 672 iOS-tester, vektorer bit-like, 4 schemes, UI-flyt dark+light |
| WP-165 | Etterspørselssignal v0: utenfor-katalog-follow → anonymt, offentlig signal | 0J | WP-163, WP-164 | ✅ #395 merget 21.07 — ny issue-mal `coverage-request.yml` (KUN navn+sport, anonym; egen label, `follow.yml` urørt); `scripts/lib/demand.js` aggregerer åpne `coverage-request`-issues (injiserbar gh-runner, fail-soft → `demand`-feltet utelates ved gh-feil, aldri fell pipelinen) foldet inn i `coverage-gaps.json` via `detect-coverage-gaps.js`; research.md prioriterer `demand[]` i horisont-skann (aldri auto-add — katalog-rewrite forblir AI-styrt); klient-tapp «meld inn ønsket» → forhåndsutfylt offentlig issue-URL (web: søke-miss i profile-ui.js; iOS: `CoverageRequest.swift` + `CoverageRequestLink` i AddFollowSearchView soft-follow + FollowedListView VENTER PÅ DEKNING), ingen auto-post — brukeren sender selv. Body-format `### Entitet`/`### Sport` delt av mal+web+iOS+parser (koherens-testet). Tester: JS 906 grønt (+demand-suite +web coverageRequestUrl +agent-prompts demand-kontrakt), iOS 678 grønt (+CoverageRequestTests), E2E web-render verifisert |
| WP-166 | iOS-indeksen tåler langhalen: grounding-tuning + fullt fixture-speil (WP-160-funn) | 0J | WP-160; FØR WP-161 | ✅ #397 merget 21.07 — iOS-grounding tåler full 141-langhale, prinsipielt (ingen slakkede asserts). (1) `EntityIndex.representativeEntity` + `search` bruker KILDE-PRIORITET som deterministisk tie-break — build-entities' dokumenterte fold-rekkefølge («insertion order = source priority»: tracked/tier1-flaggskip før tier2-langhale) finnes ALT i array-rekkefølgen, så INGEN scripts/docs-data-endring (ikke `sourceRank`): Tour de France (ikke Arctic Race) representerer sykkel, og flaggskip flommer ikke ut av søke-topp-N ved store treffsett. (2) `detectEntities`-robusthet: et bart sport-ord-alias («F1») ruter via `sportKeyword`→sport-nivå-entitet (ikke tier2-turneringen aliaset med forkortelsen — kun `f1-world-championship-2026` kolliderte), og en co-nevnt konkurranse er SCOPE når et lag/utøver er målet («Lyn i OBOS-ligaen» → kun Lyn). (3) `AgendaFilter`: event-substantiv («Brann-kampen») → openEvent-armen, ikke present-filter (Brann groundes nå). (4) fixtur re-frosset til FULLT speil av docs/data/entities.json (60-supersett→141) + manifest-entry; stale startpakke-id `the-open-championship-2026`→`the-open-championship` (produktets kanoniske id). (5) perf-porten dimensjonert til WP-161-skala (2500→5000 entiteter, doblings-invariant + tak bevart). Eval-korpus (v5→6) + mock: «Brann»→«Skeid» (Brann nå RIKTIG dekket), «sjakk»→`grand-chess-tour-saint-louis-2026` (chess/esports er entity-gated — IKKE i catalog.tier1, så ingen sport-chess/-esports; grounder til representativ turnering). Nye eksplisitte representative-/search-/detection-tester. **677 iOS-tester grønne, 13/13 gylne vektorer bit-like, 4 schemes bygger, perf-port grønn, JS 883/883 urørt.** |

### WP-160 · Strakstiltak: fold catalog.tier2 inn i entities.json (bølge 1)
**Mål:** Liverpool — og hele tier2-langhalen (~29 lag + ~70 turneringer) — blir
søkbar/følgbar på begge flater NÅ, uten å vente på verdensregisteret.
**Innhold:** (1) `scripts/build-entities.js`: les `catalog.json` tier2 som fjerde
kilde (tracked.json vinner fortsatt dedup via eksisterende termsOverlap-maskineri);
tier2-lag → `type:"team"`, tier2-turneringer → `type:"tournament"`, aliaser fra
katalogen; (2) håndball-hullet: `SPORT_LABELS` mangler `handball` → tier1-sporten
kan ikke groundes i det hele tatt (samme klasse som WP-64 lukket for vintersport)
— legg til; (3) generaliser `KNOWN_ALIAS_GROUPS` (kodekonstant i build-entities)
til datafil `scripts/config/entity-aliases.json` så research/verify kan
vedlikeholde aliaser (Liverpool FC/LFC-klassen) uten kodeendring; (4) re-frys
iOS-fixturen (`ios/SportivistaTests/Fixtures/entities.json`) + manifest.
**Ikke-mål:** ingen eksterne kilder (WP-161); ingen endring i catalog.json selv;
ingen klientendring. **Aksept:** «liverpool» og «følg håndball» gir treff i
`EntityIndex`-søk mot re-frosset fixture; entities.json ≈150+; vitest
(build-entities/manifest) + full iOS-suite + 4 schemes + gylne vektorer bit-like;
sandbox `build-entities → build-events → validate-events` rent.

### WP-161 · Verdensregisteret: seedet, varig entitetsregister (bølge 2)
**Mål:** følge-universet avledes av VERDEN (~1 500–5 000 entiteter: alle klubber i
dekkede ligaer, landslag, F1-førere/-team, WorldTour-lag, ATP/WTA- og
FIDE-topplister, esport-orgs, vintersportutøvere), ikke av tavla. **Innhold:**
(1) nye sjekket-inn registerfiler `scripts/config/registry/{football,f1,cycling,
tennis,chess,esports,winter,handball,athletics}.json` + `registry.schema.json` +
koherenstest (à la catalog-schema); (2) seed-skript på månedlig/kvartalsvis
Action: ESPN teams-API for klubbene i alle ligaer fetcherne alt dekker (samme
host `APIClient` bruker), Wikidata SPARQL for utøvere (QID + flerspråklige
aliaser), Liquipedia for CS2-orgs, FIDE-lister for sjakk; (3) stabile kebab-slugs
som primær-id + `external`-felt per entitet (`{wikidata, espnId}`) for re-seeding
og dedup; (4) `build-entities.js` folder registeret som kilde (tracked vinner
dedup); (5) AI-vedlikehold: research/improve reconcilierer register mot verden
ukentlig (opprykk/nedrykk, overganger, nye orgs) — prompt-tillegg med
output-kontrakt. **Ikke-mål:** ingen utvidelse av hva pipelinen HENTER (catalog
styrer fortsatt dekning/kost — registeret er oppslag, ikke dekningsløfte); ingen
betalte API-er. **Aksept:** entities.json ≥1 500 med `external`-felter;
manifest-diffen håndterer størrelsen (Pages + `manifest.json`-kontrakten; chunking
per sport dokumentert som fallback); iOS `EntityIndex`-søk holder seg innenfor
eksisterende perf-porter (AgendaMatchingPerfTests-klassen) mot skalert indeks;
alle suiter grønne.

### WP-162 · Sesongløse id-er + re-grounding: follows overlever sesonger (bølge 3)
**Mål:** en følging dør aldri stille av et sesong-/utgaveskifte. I dag er id-ene
utgave-stemplet (`premier-league-2026-27`, `the-open-championship-2026`), en
profilregel fryser id+navn ved follow-tidspunkt, og edition-stripping finnes i
RESOLVEREN men ikke i MATCHING-stien — så neste utgave matcher aldri (verifisert:
to skipte startpakker peker alt på døde id-er, og grounding-testen kjører mot
FIXTUREN så CI ikke ser driften). **Innhold:** (1) kanoniske, sesongløse id-er
for tilbakevendende turneringer/ligaer i registeret (`the-open-championship`,
`premier-league`) med utgave som metadata; tracked.json kan fortsatt bokføre
daterte utgaver — build-entities mapper dem til kanonisk id; (2)
edition-stripping inn i matching-stien (iOS `EffectiveInterests`/`FeedCompiler`/
`NewsLens`-navnefallback; web `lens.js` term-bygging) så en gammel regel matcher
ny utgave; (3) engangs-migrering av profilregler (re-ground mot ny indeks ved
første last — `FollowPresenter.unresolved`-maskineriet finnes); (4) startpakkene
re-pekes til kanoniske id-er + grounding-testen kjører mot LIVE-indeksen (eller
en CI-vakt som diffing fixture↔live). **Ikke-mål:** ingen endring i de fem
predikatene. **Aksept:** golden-vektorer — forventet re-frys KUN hvis
vektor-inputs bærer utgave-id-er (dokumentér i DIVERGENCES.md); ny testklasse
«2026-regel matcher 2027-utgave» begge plattformer; null døde id-er i skipte
startpakker (CI-vakt).

### WP-163 · Web: søk-og-følg + assistenten UTFØRER følging (bølge 1)
**Mål:** en vanlig web-bruker kan følge noe som ikke står på tavla — i dag
finnes kun detaljark-knappene (universet = tavlas rader), assistentens «følg X»
er en død stub (`kind:'mutation'` konsumeres aldri), og rediger.html skriver
KUN eierens interests.json via OWNER-gatede issues (no-op for alle andre).
**Innhold:** (1) søk-og-følg-flate på hovedsiden (i/ved «Dette dekker vi»):
søk mot entities.json (navn+aliaser, samme normalisering som `lens.js`), treff →
`ssProfileFollow` direkte; (2) wire assistentens mutation-intent: «følg
Liverpool» slår opp i entities.json og utfører følgingen med rolig kvittering
(gjenbruk `bindAssistant`-flyten); (3) fjern den syntetiske id-divergensen:
`followTargets` slår opp ekte entityId fra entities.json før fallback (i dag
`normalize(name)|sport` som aldri matcher iOS-id-en → CRDT-dubletter på tvers av
enheter); (4) katalog-kollaps-fella: første følging bytter «Dette dekker vi»/
«Neste opp» fra katalog (~130 navn) til KUN profilens liste — vis «dine follows
+ katalogen» lagdelt i stedet; (5) rediger.html omprofileres ærlig til «be om
dekning» (WP-96-intensjonen) og lenker til den nye følg-flaten for selve
følgingen. **Ikke-mål:** ingen endring i follow-request-flyten/interests.json;
ingen ny backend. **Aksept:** E2E i browser: søk «Liverpool» → følg → raden i
«Det du følger» + iCloud-push kalles; assistent-«følg Liverpool» utfører;
dashboard-cards-tester + nye lens/profile-tester; ingen feed-vektor-endring.

### WP-164 · iOS: soft-follow + ærlig off-season-svar (bølge 1)
**Mål:** søket sier aldri bare «finnes ikke» — og et navn utenfor indeksen kan
likevel følges. **Innhold:** (1) «Følg likevel»-affordance ved søke-miss i
`AddFollowSearchView` og i grounder-avvisningen: oppretter navnebasert regel
(nedstrøms er `FeedCompiler`/`EffectiveInterests` alt navne-tolerante —
verifisert; `FollowPresenter.unresolved` viser den ærlig med «venter på
dekning»-tekst i stedet for «sjekk navnet»); fiks notify-default-detaljen
(ukjent type havner i atlet-bøtta → arver bjelle-semantikk — sett nøytral
default); (2) ærlig off-season-linje når entiteten FINNES men ikke har kommende
events: «Fulgt — Premier League starter medio august» (sesongvindu fra
registerets metadata (WP-161) eller tracked-reasons, som ALT vet dette —
tracked.json:10 nevner sesongstarten i klartekst); (3) onboarding-copyen
beholder «Liverpool»-eksemplet — etter WP-160 grounder det faktisk (CI-vakt:
eksempel-ytringene i onboarding-copy må grounde mot live-indeksen); (4)
`MutationGrounder` beholder anti-hallusinasjons-gaten for ASSISTENT-forslag, men
avvisningen tilbyr soft-follow som eksplisitt brukervalg. **Ikke-mål:** ingen
FM-prompt-utvidelse utover avvisnings-copy; ingen endring i diff/bekreft-flyten.
**Aksept:** ny UI-flyt (søk-miss → Følg likevel → rad i «Det du følger» med
ærlig status); unit-tester for navneregel-kompilering + notify-default; full
iOS-suite + 4 schemes + vektorer bit-like (soft-follow er additiv regel, ingen
predikatendring).

### WP-165 · Etterspørselssignal v0: serveren FÅR VITE hva folk vil følge (bølge 2)
**Mål:** en soft-follow utenfor katalogen skal ikke være «fulgt men dødt for
alltid» — uten signal ser serveren aldri etterspørselen (rediger-veien er
OWNER-gatet; WP-23 var kun skisse). B.1-rammen fra BRUKERDATA-seksjonen:
offentlige, anonyme, ikke-personlige signaler. **Innhold:** (1) klient (begge
flater): ved follow av entitet uten katalog-/registerdekning, tilby ETT valgfritt
tapp «meld inn ønsket» → forhåndsutfylt offentlig GitHub-issue (follow-request-
malen gjenbrukes med ny label `coverage-request`; INGEN auto-post, brukeren ser
og sender selv — personvern-ærlig); (2) server: `detect-coverage-gaps.js` (eller
et lite nytt skript) aggregerer åpne `coverage-request`-issues → et
`demand`-felt i coverage-gaps.json; research-prompten prioriterer gap med
etterspørsel; katalog-utvidelse skjer fortsatt via research-agentens vanlige
catalog-rewrite (AI-styrt, kostnadsbevisst). **Ikke-mål:** ingen CloudKit
public-DB ennå (B.2 — egen WP når massen finnes); ingen auto-endring av catalog.
**Aksept:** issue-malen validerer; aggregering enhets-testet; research-prompt-
kontrakten oppdatert + agent-prompts-koherenstesten grønn.

### WP-166 · iOS-indeksen tåler langhalen: grounding-tuning + fullt fixture-speil (bølge 2 — WP-160-funn 21.07)
**Bakgrunn:** WP-160 fant at full langhale i entitetsindeksen endrer
assistent-groundingens semantikk: `representativeEntity` for sykkel flippet
Tour de France → Arctic Race, search-topp-N flommer over ved store treffsett,
og «Brann»/«OBOS-ligaen» detekteres nå der eldre WP-65-tester brukte dem som
«ukjent»-eksempler. iOS-test-fixturen ble derfor targeted-re-frosset (60
entiteter) mens produkt-indeksen fra Pages er 141 — dvs. RUNTIME-appen møter
ALLEREDE langhalen med utestet grounding-semantikk, og WP-161 vokser den til
~1 500–5 000. **Mål:** iOS-grounding (søk/representativ/deteksjon) er robust og
kuratert-fornuftig med full langhale, og fixturen speiler produktet igjen.
**Innhold:** (1) `EntityIndex.representativeEntity`-presedens: kuratert
prioritet (tracked-/tier1-flaggskip vinner over tier2-langhale — Tour de France
representerer sykkel, ikke Arctic Race); (2) `search`-rangering ved store
treffsett: eksakt/prefiks foran delstreng, stabil topp-N; (3)
detection-oppdatering: WP-65-testenes «ukjent»-eksempler byttes til navn som
fortsatt er ukjente (Brann er nå dekket — det er RIKTIG); (4) re-frys fixturen
til FULLT speil av docs/data/entities.json (supersett-avviket fra WP-160
fjernes); (5) perf-porten (AgendaMatchingPerfTests-klassen) verifiseres mot
141+ og den syntetiske skalerings-fixturen dimensjoneres for WP-161-skala.
**Ikke-mål:** ingen endring i feed-predikatene/gylne vektorer; ingen
registerutvidelse (WP-161); ingen FM-prompt-endring. **Aksept:** full iOS-suite
grønn med fullt fixture-speil; eksplisitte representative-/search-/
detection-tester; 13/13 vektorer bit-like; 4 schemes bygger; perf-port grønn.
**Avhengighet:** WP-160 (✅). Bør lande FØR WP-161 vokser indeksen.

---

## FASE 0K · Go-to-opplevelsen: «laget mitt»-dybde i det daglige sjekket — planlagt

Målet er eierens formulering: det skal være ENKLERE/RASKERE å sjekke Sportivista
enn FotMob/VG Live/F1-appen for «hva skjer med det jeg følger i dag / hva skjedde
i går». Posisjonen står (VISJON v3: det personlige filteret; deep-link til
spesialisten for dybde) — men i dag mangler selve OBJEKTET (entitetssiden) og
innholdsdybden rundt det. All data en entitetsside trenger er ALLEREDE publisert
(events + entityId, news, recent-results, standings, entities) — mye av fasen er
ren klient-komposisjon.

**Menneskebeslutninger i fasen — AVGJORT 22.07 (eier delegerte valget):** WP-176
varselnivå — **(a) valgt**: «vi konkurrerer på riktig agenda + ro, ikke på
mål-push» (kun on-device-oppdagelse via BGAppRefresh, ærlig dokumentert). **(b)
Actions→APNs eksplisitt FRAVALGT** og skal ikke bygges: 15–60 min latens gjør et
målvarsel verre enn ingen (det lærer brukeren å mistro appen), og et
device-token-register ville brutt personvern-posisjonen «dine data rører aldri
serveren vår» — tillitskapital man bruker opp én gang. Mål-push i SANNTID er
strukturelt utenfor null-infra.

Bølge 1: WP-170 (iOS-klient) ∥ WP-171 (web-klient + pipeline-visning) ∥ WP-173
(workflow-cron, beskyttet sti). Bølge 2: WP-172 ∥ WP-174. Bølge 3: WP-175 ∥ WP-176.

| WP | Tittel | Fase | Avhenger av | Status |
|---|---|---|---|---|
| WP-170 | Entitetssiden: «laget mitt»-objektet (begge flater) | 0K | 0J WP-160 | ✅ #408 merget natt til 23.07 — branch wp-170-entitetssiden — ÉN side per fulgt entitet, nådd på ≤1 tapp fra «Det du følger»/«Neste opp» OG fra entitetsnavn i event-detaljen, på BEGGE flater. Ren komposisjon (ingen ny server-fil/kontrakt): iOS `EntityPage`/`EntityPageView` (delt `EntityPageSections`, foldet INN i `FollowDetailView` så admin ligger under verdien) + web `entity-page.js` (ark som låner assistent-arkets chrome). Seksjoner i fast rekkefølge: anker (WP-185/186-avatar i stor variant, additivt `scale`) · KOMMENDE (delt neste-event-matching) · SISTE RESULTAT (WP-171-radene, iOS bak SAMME `SpoilerShield`/«Vis resultat») · TABELL (ærlig entitets-gate — en OBOS-klubb får ALDRI PL-tabellen; iOS bak «Vis tabell») · SISTE NYTT (NewsLens/id-eller-navn) · MER (én deep-link til spesialisten — FotMob/PCS/Liquipedia, aldri gjettet). Hver seksjon utelates grasiøst ved manglende data; tomt = én ærlig linje. Spoilervernet gjenbrukt, aldri nyoppfunnet (web har ingen shield — resultater vises rått som Nyheter-tavla alt gjør). Tester: iOS 804 (+EntityPageTests 18, +UI-flyt), JS 1117 (+entity-page 14, dashboard-cards oppdatert), 13/13 gylne vektorer bit-like, alle 4 schemes bygger. Skjermbilder web dark+light |
| WP-171 | Resultat- og tabelldybde: alle sporter, målscorere, standings på iOS | 0K | — | ✅ #401 merget 22.07 — branch wp-171-resultat-tabell — RESULTAT dekker nå ALLE sporter i recent-results.json på begge flater (én rad-DNA per sport: nøytral tittel · utfall · meta · detaljlinjer), målscorere med minutt rendres (web XSS-trygt via escapeHtml), per-sport round robin + cap 5 med «Vis alle»-disclosure, `standings.json` inn i SyncClient + ny TABELL-flate i event-detalj (ligatabell/golf-ledertavle/F1-VM-stilling, kun når det ER eventets tabell) — alt nytt resultatinnhold bak SAMME spoilervern |
| WP-172 | Live-paritet: iOS-scorepolling + config-drevet ligaliste (nor.1/nor.2) | 0K | — | ✅ #411 merget 22–23.07 — branch wp-172-live-paritet — (1) **web**: ligalisten er nå config-drevet fra `SS_FOOTBALL_LEAGUES` i `shared-constants.js` (mirror av sports-config, nor.1/nor.2/uefa.champions inn — en Lyn-kamp får endelig live-score) og PINNES mot sports-config av `tests/live-leagues.test.js`; tavle-gaten løsnet til per-liga kampvindu-gating (`footballLeaguesToPoll`: poll KUN ligaer med en fulgt/tavle-kamp i vinduet `(now-3t, now]` → én scoreboard i vanlig-tilfellet, aldri hele lista, aldri utenfor vinduer — SENKER ESPN-flatetrykket vs. gamle «poll alle 3 hardkodede»). (2) **iOS**: nytt `Sportivista/Live/`-modul — foreground-polling (60 s, KUN mens appen er åpen OG et fulgt/tavle-lag er i kampvindu) av samme ESPN-scoreboard → stilling + kampklokke i agendaradens meta-linje OG i entitetssidens (WP-170) KOMMENDE-rad (tabular, `live`-farge, ingen ny rad-DNA); pen gate/parse/match rent testet (injiserbar `LiveScoreTransport`, nettverk mocket i ALLE tester); delt vindus-/tilstandslogikk med `ssLiveState`-tvillingen. Spoilervern: en skjermet entitet får ALDRI stillingen (`spoilerSafe`). iOS er appens ENESTE tredjepartskall — `docs/personvern.html` + `ios/README.md` oppdatert ærlig. golf/F1-live på iOS bevisst ikke i scope. Verifisert: iOS live-rad-demo (`SPORTIVISTA_DEMO=live`, dark+light skjermbilder), full iOS-suite + 4 schemes + 13/13 gylne vektorer bit-like, `npx vitest run` grønn |
| WP-173 | Kvelds-ferskhet: pipeline-cron 22/23/00/03 UTC (BESKYTTET STI — eier merger) | 0K | — | ✅ #409 merget 23.07 (eier) (branch wp-173-kvelds-ferskhet, hovedsesjonen natt til 23.07) — 4 kvelds-/natt-kjøringer lagt til static-pipeline-cronen + morgenbriefen flyttet 05:00→04:30 UTC (06:30 Oslo, FØR morgensjekket). beskyttet sti, eier-merget |
| WP-174 | «Min brief»: deterministisk personlig brief on-device (begge flater) | 0K | WP-171 | ✅ #412 merget 22–23.07 — branch wp-174-min-brief — deterministisk personlig brief («I din verden i dag …») komponert on-device fra egen feed (kommende events for follows · siste resultater · nyhetstreff), 2–3 rolige norske setninger, maks 220 tegn. TVILLING-motor pinnet av delte golden-fixtures (`tests/fixtures/brief-vectors/`, 12 vektorer): `ssComposeBrief` (`docs/js/brief.js`) ↔ `MinBrief.compose` (`ios/Sportivista/News/MinBrief.swift`) gir bit-lik streng for samme kontekst. Vises: web — heroens editorial-linje NÅR profilen har follows (tom profil → EKSAKT dagens editorial-fallback, byte-for-byte); iOS — Nyheter-tavlas «I DIN VERDEN I DAG»-slot. Spoilervern respektert (skjermet entitets resultat omtalt uten utfall — iOS via `SpoilerShield`; web har ingen shield, dokumentert avvik). Grasiøs degradering: ingen follows med innhold → fallback til editorial. Ingen LLM, ingen server-/agent-endring, editorial.md urørt. Tester: JS 20 (composer-vektorer + web-seleksjon/hero-wiring), iOS `MinBriefTests` (samme vektorer + build/spoiler/caps), full JS-suite 1120 grønn, 13/13 gylne feed-vektorer bit-like |
| WP-175 | Nyhetsbredde per fulgt entitet: kilder + register-matching | 0K | 0J WP-161 | 🔬 PR åpen — branch wp-175-nyhetsbredde — **SERVER+WEB** (scope-kutt fra hovedsesjonen: iOS-type-tag = egen mikrooppfølger, WP-181-agenten eier `NewsView`). (1) **entity-tag-andel målt på ekte rss-digest: 40,6 % → 55,1 %** (>50 %-målet nådd, ekte prod-kjøring; kontrollert samme-øyeblikks-sim 39 %→54–57 %). Re-verifisert at matchingen bruker HELE registeret (3663) godt — ingen normaliserings-/aliasfeil funnet: de untaggede sakene refererer entiteter som er FRAVÆRENDE fra registeret (Haaland/Ødegaard/Guardiola — build-entities/WP-161-dekning), ikke matching-bugs; word-boundary avviser korrekt «rain» i «training». (2) **3 kuraterte feeds** inn i `fetch-rss.js`: `aftenposten-sport` (no — Eliteserien/registerklubber), `guardian-football` (en, entity-modus — PL/internasjonalt), `cyclingnews` (en, entity-modus — fyller ZERO-cycling-hullet: eier følger Uno-X/TdF, 900+ cycling-entiteter). `skysports` vurdert+FORKASTET (pubDate-zone «BST» → `Date.parse` NaN → items droppes stille). Ny **entity-modus** (Norwegian ELLER register-treff, gjenbruker buildNews-matcheren → ingen foreldreløse pekere; arver OG-≥3-guarden, fail-open ved manglende register); cap 40→55 så den norske backbone-en (general 32) bevares (editorial-input uberørt). (3) **typeklassifisering** i `news.js` (kamprapport/overgang/skade/intervju) — konservativ regelbasert (tittel/URL), additivt valgfritt `type`-felt (utelatt når usikker, ALDRI gjettet): **100 % presisjon på 168 ekte titler**, typer ~12–14 %; eierskaps-overtakelser + kontraktsfornyelser ekskludert fra «overgang», quote-dash IKKE «intervju». (4) **web**: stille grå tag i `nw`-rad-DNA-en (allowlist → XSS-trygg; dark+light skjermbilder). Tester: 1199 grønne (+news/fetch-rss/news-web/dashboard-cards additivt); `build-events`+`validate` sandbox rent |
| WP-176 | Varselnivå (EIERBESLUTNING) + widget-løft (resultater, accessory-familier) | 0K | WP-171 | ✅ #403 merget 22.07 — branch wp-176-varsler-widget — **NIVÅ (a) valgt** (eier delegerte 22.07): vi konkurrerer på ro + riktig agenda, ikke på push-hastighet; nivå (b) Actions→APNs eksplisitt fravalgt (40 min forsinket målvarsel er verre enn ingen, og et device-token-register ville brutt «dine data rører aldri serveren vår»). Bygget: (1) **fulltidsvarsel** — ett rolig lokalt varsel når en fulgt kamp er ferdig, **av som default og opt-in per entitet** (`ResultAlertPreference`, per enhet, aldri i synk-profilen; bryteren står i FollowDetailView § VARSEL); **spoilervernet vinner** — en skjermet entitet får varselet, men teksten sier bare «Resultatet er klart», aldri «2–1». FÅ: ett per avsluttet kamp, hard cap per synk, 12t ferskhetsvindu, levert-ledger, og INGEN varsler på en seedende synk (fersk installasjon åpner aldri med en byge). Ren kjerne i `News/ResultDigest.swift` (gjenbruker `NewsBoard.resultRows` + `NewsLens` + `SpoilerShield` — ingen ny fuzzy), utført av `SyncFreshness.deliverResults` (BGAppRefresh + pull-to-refresh; cold start skriver bare widget-linja); (2) **widget-løft** — medium får «siste resultat»-linje (PRE-RENDERET av appen i `widget-result.json`, fordi widget-targetet ikke kompilerer profil/minne og derfor ikke KAN kjenne spoiler-policyen) + nye `accessoryRectangular`/`accessoryInline` (låseskjerm/StandBy, systemets vibrante materiale via per-familie container-bakgrunn); (3) **ærlig dokumentasjon** i README § «Notifications: what we do, and what we deliberately don't» + ios/README. Tester: iOS 742 (+39: ResultDigest/ResultAlertPreference/SyncFreshness/Widget), JS 1 028 uendret, 13/13 gylne vektorer bit-like, alle 4 schemes bygger. Skjermbilder: medium-widget dark+light |

### WP-170 · Entitetssiden (bølge 1)
**Mål:** ett sted som svarer «hva skjer med X?» per fulgt entitet: neste event
(med kanal), siste resultat, tabellposisjon, nyheter. FotMob/VG Lives
kjerneritual — i dag spredt over tre flater hos oss. **Innhold:** iOS: naviger
fra «Det du følger»-raden (FollowedListView) og fra entitetsnavn i detaljark →
ny `EntityPageView` komponert av eksisterende data (FeedQuery.upcoming, ny
results/standings-lesing fra WP-171, NewsLens-filtrert nyhetsliste); web:
tilsvarende visning fra «Det du følger»/detaljark (gjenbruk `followed.js`
nextUp-logikken + news-web-radene). Deep-link til spesialist-appen (FotMob/
kringkaster) nederst — VISJON v3-prinsippet. **Ikke-mål:** ingen ny server-fil;
ingen tropp/spillerstall (andres voll); ingen endring i agendaens kronologi.
**Aksept:** fra følge-rad til side på ≤1 tapp begge flater; alle seksjoner
degraderer grasiøst når data mangler (ærlig «–»); UI-flyt-test iOS + dashboard-
cards-test web; suiter grønne.

### WP-171 · Resultat- og tabelldybde (bølge 1)
**Mål:** «hva skjedde i går» besvares for ALT du følger — i dag er tavla
fotball-only og kaster bort data som alt hentes. **Innhold:** (1) Nyheter-tavlas
RESULTAT-seksjon viser golf/F1/tennis fra recent-results.json (i dag kun
`.football`-nøkkelen på begge flater); (2) render målscorere med minutt (hentes
alt av fetch-results — vises aldri); (3) iOS: `standings.json` inn i
`SyncClient.defaultFilesOfInterest` + tabellflate (PL-tabell/F1-stilling/
golf-leaderboard) i entitetssiden og event-detalj (web har den alt i detaljark);
(4) resultat-cap per seksjon beholdes (ro), men «vis alle»-disclosure.
**Ikke-mål:** ingen nye fetchere; ingen live-oppdatering av tabeller (statisk
pipeline-kadens er nok). **Aksept:** golf-/F1-resultater synlige på begge tavler
med testdekning; iOS-tabellflate med fixture-test; målscorer-rendering
XSS-trygg (`escapeHtml`); suiter grønne.

### WP-172 · Live-paritet (bølge 2)
**Mål:** live-score der brukeren faktisk er — i dag har iOS NULL scorepolling
(kun vindus-heuristikk «direkte»), og webens hardkodede ligaliste (eng.1/esp.1/
fifa.world) dekker ikke Eliteserien/OBOS — Lyn får aldri live-score. **Innhold:**
(1) web: ligalisten config-drevet fra sports-config (nor.1, nor.2, uefa.champions
inn); løsne tavle-gaten så polling dekker fulgte lags kamper (poll ligaer med
fulgt lag i kampvinduet, ikke kun «event på tavla siste 3 t» — arver ellers
Liverpool-feilklassen); (2) iOS: foreground-polling av samme ESPN-scoreboard
(60 s, kun mens appen er åpen og et fulgt/tavle-lag er i kampvindu) → stilling +
kampklokke i agendarad/entitetsside; gjenbruk web-mønsteret, del vindus-logikken
med `ssLiveState`-tvillingen (WP-126). **Ikke-mål:** ingen bakgrunns-polling;
ingen golf/F1-live på iOS i første kutt (web har det — paritet kan følge);
ingen mål-varsler (WP-176). **Aksept:** iOS viser stilling for pågående fulgt
kamp i sim-demo (deterministisk seed); web poller norsk serierunde
(fixture-test på ligaliste-bygging); nettverkskall mocket i tester; suiter +
vektorer urørt.

### WP-173 · Kvelds-ferskhet (bølge 1 — BESKYTTET STI, eier merger)
**Mål:** «hva skjedde i går kveld»-vinduet dekkes — i dag natt-fryser pipelinen
23:00–07:00 Oslo (cron 5–21 UTC), så CL-kvelder/sen F1 lander først neste
morgen. Et VALG, ikke en grense (Actions er gratis; kvote-guvernøren gjelder
AI-agentene). **Innhold:** utvid `static-pipeline.yml`-cron med 22, 23, 0, 3
UTC; verifiser at editorial-morgenkjøringen (05:00 UTC = 07:00 Oslo) treffer
morgensjekket eller flytt til 04:3x; dokumentér kadensen i CLAUDE.md.
**Ikke-mål:** ingen agent-kadensendring (kvote). **Aksept:** workflows-testen
pinner ny cron; én natts drift viser resultater synlige før 07:00.

### WP-174 · «Min brief» — personlig, deterministisk, on-device (bølge 2)
**Mål:** briefen handler om DET DU FØLGER — i dag er editorial-linja bevisst
katalog-bred (WP-96) og dermed flaten med størst avstand til go-to-løftet.
Løsningen er VISJON v3-arkitekturen: server destillerer ÉN gang, klienten
komponerer personlig. **Innhold:** deterministisk brief-komposisjon i klienten
(begge flater, delt logikk-tvilling à la lens): «I din verden i dag: [neste
events for follows] · [siste resultater] · [nyhetstreff]» — 2–3 setninger,
maks-lengde, spoilervern respektert; editorial-linja beholdes som katalog-bred
fallback når profilen er tom; navnsettingen/ritualiseringen eies av 0L (WP-181
— dette WP-et er MOTOREN, 0L er DRAKTEN). **Ikke-mål:** ingen LLM i klienten
(web-LLM-spiken konkluderte norsk-kvalitet er bindende); ingen server-endring.
**Aksept:** golden-tester på brief-komposisjon (tom profil → fallback; rik
profil → deterministisk tekst); begge flater viser samme innhold for samme
profil/data (tvilling-test); suiter grønne.

### WP-175 · Nyhetsbredde per fulgt entitet (bølge 3)
**Mål:** nyhetslinsen treffer det du følger — i dag har 6/32 news-items
entityIds (universet var tavla — 0J fikser matching-siden), og kildelisten er
11 generelle feeds: en Liverpool-følger får i praksis tom NYTT-seksjon.
**Innhold:** (1) re-match news mot det NYE entitetsregisteret (WP-161) —
måltall: >50 % av items entity-tagget; (2) utvid feed-listen målrettet:
klubb-/forbunds-feeds og 1–2 engelskspråklige PL-/internasjonale kilder,
prioritert etter registerets mest fulgte sporter (feed-listen forblir
redaksjonelt kuratert, ikke bruker-styrt); (3) typeklassifisering av pekere
(kamprapport/overgang/intervju — rad-DNA-en har alt et tomt type-slot); fortsatt
KUN tittel+lenke (DSM art. 15-posisjonen står). **Ikke-mål:** ingen
artikkeltekst/sammendrag per sak; ingen per-bruker-feeds server-side. **Aksept:**
entity-tag-andel målt i test-fixture; nye feeds i fetch-rss med parser-tester;
news-schema uendret (pekere).

### WP-176 · Varselnivå + widget-løft (bølge 3 — EIERBESLUTNING først)
**Mål:** lukk gapet mellom «forhåndspåminnelse» (alt vi har) og go-to-vanen —
på det nivået eieren velger (se fasens menneskebeslutning). **Innhold (nivå a,
grunnpakken):** (1) BGAppRefresh-oppdagelse: når ny sync viser sluttresultat
for fulgt lag → lokalt, rolig varsel («Fulltid: Lyn 2–1» med spoilervern-
respekt — av som default, opt-in per entitet fra entitetssiden); (2) widget:
medium-varianten får «siste resultat»-linje under «neste must-see»;
accessoryRectangular/-Inline (låseskjerm/StandBy) — ren klientjobb over
eksisterende App Group-cache; (3) dokumentér ærlig i README/App Store-tekst hva
vi IKKE gjør (mål-push) og hvorfor (ro + null-infra). **Nivå b (kun hvis eier
velger det):** egen oppfølger-WP for Actions→APNs-arkitekturen — IKKE i denne.
**Ikke-mål:** Live Activities (krever push-oppdatering for å være meningsfull —
re-vurderes med nivå b / Fase 1 WP-24). **Aksept:** varsel-flyt testet med
seedet resultat-diff (NotificationPlanner-mønsteret); widget-snapshot-tester;
suiter grønne.

---

## FASE 0L · Identitet: gi roen en egen stemme — planlagt

Rammen fra identitets-kartleggingen: appen er ikke identitetsløs — Kolonet
(merkelås + ikon + live-puls, WP-152) er et ekte, eier-godkjent merke — men det
bærer ~5 % av flaten, og «anonym»-tilstanden var en VILLET deferral («kosmetikk
etter herding») som nå har utløpt: kjernen er herdet, og eierens «kjedelig»-dom
er signalet. Identitetsløftet bygges INNENFOR calm-grunnloven («Ro-identiteten
ER differensiatoren») og OPPÅ Apple-native-basen — det handler om å eie de få
tingene som er våre (kolonet, den norske redaksjonelle stemmen, tallene/tidene),
ikke om å legge på støy. DESIGN.md er kontrakt for KONSISTENS — denne fasen får
eksplisitt mandat til å UTVIDE den (per WP, aldri fritt).

**Menneskebeslutninger i fasen — AVGJORT 22.07 (eier delegerte a/b/c til agenten,
besluttet (d) selv):** (a) WP-183 display-/tallfont — **JA, bygges** (eier: «det du
mener er best»); scope holdt snevert (ordmerke + tidskolonne + delekort, brødtekst
forblir SF), fonten er et TOKEN så valget kan vetoes billig. (b) WP-180 rad-kolon-live
— **NEI, bygges ikke** (agent-avgjørelse, begrunnet): masthead-kolonet bærer allerede
live-signalet fra enhver skjerm, og radene fikk nettopp visuell vekt av WP-185s
avatarer; pulserende amber i en scrollende liste ville brutt ro-grunnloven og tømt
amber for betydning. Registrert som avgjort i DESIGN.md, ikke som åpen oppfølging.
(c) brief-navnene — agenten foreslår ved WP-181. (d) EKTE klubblogoer — **eier vil ha
dem (22.07)**, og står på det etter å ha fått korrigert premisset (varemerke-
referansebruk er trygt, men Norge/EU har ingen fair use-doktrin for opphavsretten
til crest-tegningen). WP-186 implementerer det som en BRYTER med proveniens per
merke — frie merker først, ESPN-kilden fyller hullene, og ett felt (`free-only`)
reverserer standpunktet uten klientendring. Se WP-186s juridiske grunnlag.

Bølge 1: WP-180 (web-header + ikoner) ∥ WP-182 (meta/delekort) ∥ WP-184
(dokumenter/rydding). Bølge 2: WP-181 (rituale — etter 0K WP-174-motoren)
∥ WP-185 (etter WP-161-metadata). Bølge 3: WP-183 (eier-beslutning).

| WP | Tittel | Fase | Avhenger av | Status |
|---|---|---|---|---|
| WP-180 | Kolonet fullført: web-live-paritet + ikonvarianter (+ rad-kolon, eierbeslutning) | 0L | — | ✅ #398 merget 22.07 — branch wp-180-kolonet-fullfort — kolon-live-pulsen bygget på web (drives av det delte `ssLiveState` via `directLiveEvents`, samme kilde som «Direkte nå»; ~1,6 s ease-in-out autoreverserende opacity + myk amber-glød, kun opacity/glød ⇒ ingen layout-shift; `prefers-reduced-motion` ⇒ statisk glød; a11y-etikett som iOS; `?demo=masthead-live`/`masthead-neutral` for deterministisk repro) + dark/tinted app-ikonvarianter regenerert fra `kolonet.svg` (piksel-verifisert mot det shippede ikonet) + 10 nye vitest-tester; rad-kolonet BEVISST ikke bygget (eierbeslutning (b)) |
| WP-181 | Briefen som navngitt rituale («Morgenbriefen»/«Kveldsbriefen») | 0L | 0K WP-174 | planlagt |
| WP-182 | Delbare flater: og:image + delekort (event/brief) i merkedrakt | 0L | — | ✅ #399 merget 22.07 — branch wp-182-delbare-flater — og:/twitter:-metadata på alle fire docs-sider mot ETT innsjekket statisk brand-kort (`docs/og/og-default.png` 1200×630, regenereres med `design/brand/generate-og-image.swift --all`, samme mønster som ikon-generatoren); delekort per event OG brief på begge flater i samme 1200×630-drakt — iOS `ShareLink` + `ImageRenderer`/`Transferable` (`ios/Sportivista/Share/ShareCard.swift`, ETT kallsted i EventDetailSheet-toolbaren) og web canvas (`docs/js/share-card.js`, koblet på «Del»-knappen + ny «Del briefen» under heroen, `navigator.share({files})` med tekst-fallback). Markedsflate-frihet dokumentert som egen DESIGN.md-presisering (amber tid på kortet, `label` i produktet; innelukket i egne filer som aldri rendres on-screen). Ærlighet holdt: ukjent kanal er «–», kortet gjenbruker radens EGNE etiketter. Null eksterne requests (bevist: 0 nettverkskall fra kort-rendringen, kun de forhåndseksisterende CloudKit-kallene på siden); sw-shell + cache-versjon bumpet. Tester: JS 62 filer / 961 (+18 `tests/share-card.test.js`), iOS 696 (+12 `ShareCardSpecTests`) + XCUITest-flyt for ShareLink-arket, 13/13 gylne vektorer bit-like, alle fire schemes bygger (`Sportivista`, `SportivistaWidgetExtension`, `SportivistaUITests`, `SportivistaDeviceDev`) |
| WP-183 | Typografisk stemme: eie tallene (EIERBESLUTNING — display-font-token) | 0L | — | ✅ #402 merget 22.07 — branch wp-183-typografisk-stemme — **Space Grotesk** (SIL OFL 1.1, Florian Karsten) valgt: eneste kandidat som samtidig er tydelig ANNERLEDES enn SF i sifrene (den ensidige `1`, den åpne `4`), har ekte tabulære sifre (`tnum` verifisert mekanisk: alle ti = 620/1000 em), full æøåÆØÅ i alle tre vekter, og er billig nok subsettet (13,9 kB web totalt). Archivo forkastet (kravene bestått, men grotesk-nøytral — nesten like anonym som SF, altså løser den ikke problemet); Instrument Sans forkastet (smalere/mer redaksjonell, minst særpreg i sifrene); IBM Plex Sans forkastet (tabulær som standard, men repoets forrige, avviklede identitet — et tilbakeskritt, ikke en stemme). Brukt på NØYAKTIG tre flater (ordmerke · tidskolonne · delekort); brødtekst/UI forblir SF. Tabulariteten er BAKT INN i fontfila (tnum løst opp i cmap), så canvas-delekortet får den også. Web: `--display` + selvhostet `@font-face` (`font-display: swap`, null CDN, sw-cache bumpet). iOS: `Font.sportivistaDisplay` med `UIFontMetrics` (Dynamic Type bevart), `UIAppFonts` i app/device/widget. Merkelåsen bevart og nå bokstavelig på web også (ordmerke 600 → kolon 700); kolon-pulsen visuelt verifisert på begge flater. Sammenligningsbilde for billig veto: `design/brand/wp183-font-comparison.png`. Tester: JS 64 filer / 1046 (+17 display-font-gate i `design-tokens.test.js` — den parser den shippede TTF-en dependency-fritt og MÅLER sifferbreddene, +2 i Dynamic-Type-gaten som sperrer `UIFont(name:)` utenfor token-laget), iOS 739 (+6 `DisplayFontTests` som registrerer fontene i test-bundelen og beviser at PostScript-navnene i DesignTokens.swift faktisk løser), 13/13 gylne vektorer bit-like, alle fire schemes bygger |
| WP-184 | Brand-voice-kodifisering + stale-identitetsrester ryddet | 0L | — | ✅ #410 merget 22–23.07 — branch wp-184-brand-voice — ny `design/brand/VOICE.md` (mikrocopy-stemmen kodifisert fra EKTE kodebase-strenger: «Dette dekker vi»/«Det du følger»/«Hva jeg vet om deg»/ærlig «–»/«Fulgt — venter på dekning»/«Resultatet er klart. Åpne når du vil se det.» + «slik skriver du»-sjekkliste + anti-eksempel-tabell); taglinen «Hele sporten. Ett rolig utsyn.» rullet ut i web-innloggingsgatens lead (`docs/index.html` + `.auth-gate-tagline` i base.css) — onboarding-velkomsten LOT STÅ (dagens plain-language-copy er allerede på-stemme, WP-129). Stale identitetsrester ryddet: `ios/tools/enso-icon.swift` + `EnsoMark.imageset` SLETTET (pensjonert ensō-merke; fasit er nå `generate-icons.swift`/`kolonet.svg`, dinglende referanse i generate-icons rettet); ensō-kommentarer (OnboardingView ×2, ios/README) + Tekst-TV-kommentarer (SportivistaWidgetBundle, README, ios/README ×4, copilot-instructions) → Apple-native/Kolonet; (PROTOTYPE)→normativ i ContentView (WP-152 eier-godkjent); DESIGN.md-rebrand-notat omformulert (navnebyttet HAR skjedd, kun designprofil gjenstår); base.css↔BRAND.md amber-lister synket mot shippet (klokke/day-headers UT, WP-180-live-glød INN). Historikk-kommentarer («var Tekst-TV», «ensō retired») bevisst beholdt. 1100 JS-tester + 786 iOS-tester grønne, alle 4 schemes bygger (asset-sletting brøt ikke bygg), gate-lead skjermbilde dark+light |
| WP-185 | Visuell entitets-identitet: flagg + farge-monogrammer per rad (eier-funn 21.07) | 0L | 0J WP-161 (delvis) | ✅ #400 merget 22.07 — branch wp-185-entitets-identitet — registeret utvidet med ISO-`country` (2 559 entiteter, én kurert tabell folder FIDE-kode/ESPN-engelsk/Wikidata-nb; historiske stater droppes fremfor å gjettes), `colors` (139: ESPN-klubber + F1-konstruktører) og `national` (205 — skiller landslag fra klubb, ellers hadde «Elverum Håndball» fått norsk flagg); identitets-stigen flagg → farge-monogram → sportglyf tvillingimplementert (`docs/js/entity-avatar.js` ↔ `Models/EntityIdentity.swift`) med BEREGNET monogram-blekk (WCAG-luminans) og O(1)-oppslag per rad; DESIGN.md § Entitets-avatar + forbudsliste-presisering; 4 skjermbilder (dark/light × web/iOS). Ikke-mål holdt: ingen crester, ingen fotos, ingen eksterne bilde-requests. 1 017 JS-tester + 703 iOS-tester grønne, 13/13 gylne vektorer bit-like, 4 schemes bygger |
| WP-186 | Ekte klubblogoer — policy-styrt kilde med proveniens | 0L | WP-185 | ✅ #405 merget 22.07 — branch wp-186-ekte-klubblogoer — MÅLT dekning: **104 av 1 175 klubber/organisasjoner (8,9 %)** bærer nå et ekte merke — 30 `free-license` (Wikidata P154 → Commons, fail-closed lisens-whitelist) + 74 `editorial-use` (ESPN, eierbeslutning 22.07). Per sport: **fotball 80/80 (100 %)** — 6 frie + 74 editorial; **håndball 10/182 (5 %)**; **esport 12/873 (1 %)**; **sykkel 2/29 (7 %)**; **F1 0/11** (ESPNs F1-endepunkt har ingen `logos` — ingen gjettet URL). Faktisk forekommende frie lisenser: Public domain ×24, CC BY-SA 4.0 ×4, CC BY-SA 3.0 ×1, CC BY 4.0 ×1 (alle CC-merker har navngitt opphavsperson — de uten ble avvist). Byte-kostnad: 797,7 kB for 104 PNG-er (~96 px), samme sett på web (egen origin, `loading=lazy`) og i app-/widget-bundlen (~1,0 MB på disk, ~5,6 % av debug-bundlen). Bryter: `scripts/config/logo-policy.json` (`editorial` aktiv; `free-only` fjerner de 74 fra alle flater ved neste `build:entities` — bevist i test). Landslag beholder bevisst flagget. Ingen eksterne bilde-requests (grep-bevist, 0 off-origin bilde-kall i skjermbilde-kjøringen). 1 082 JS-tester + 746 iOS-tester grønne, gylne vektorer bit-like, 4 schemes bygger |

### WP-180 · Kolonet fullført (bølge 1)
**Innhold:** (1) web-paritet av kolon-live-pulsen i headeren (dokumentert
forpliktelse, DESIGN.md § Cross-surface — drives av samme delte live-begrep,
`ssLiveState`; Reduce Motion → statisk glød, som iOS); (2) dark/tinted
app-ikonvarianter (Contents.json har kun én 1024-PNG; regenerer fra
`design/brand/kolonet.svg` via `generate-icons.swift`); (3) HVIS eier godkjenner:
rad-kolonet i tidskolonnen pulser på LIVE rader — hele tavla svarer på
merkeidéen (egen DESIGN.md-presisering av amber-regelen). **Aksept:**
piksel-verifiserte ikoner; web-puls demo-reproduserbar; design-tokens-testen
grønn; Reduce Motion verifisert.

### WP-181 · Briefen som rituale (bølge 2)
**Mål:** stemmen ingen konkurrent har — den rolige norske redaktøren — blir et
NAVNGITT daglig rituale i stedet for én faint grå linje folk aldri registrerer.
**Innhold:** navngi flaten («Morgenbriefen» 07:00 / «Kveldsbriefen» 17:00 —
eier godkjenner navnene), gi den en stille egen innramming (fortsatt 2–3
setninger, aldri kort-støy), valgfri daglig lokal notifikasjon («Morgenbriefen
er klar» — opt-in), speiling i widgetens medium-variant; innholdet er WP-174s
personlige brief (fallback: katalog-linja). **Ikke-mål:** ingen ny agent-kadens
(kvote); ingen push-server. **Aksept:** rituale-flaten på begge plattformer +
widget; notifikasjon opt-in-testet; DESIGN.md-tillegg for flaten.

### WP-182 · Delbare flater (bølge 1)
**Mål:** identiteten kan reise — i dag har docs/index.html NULL og:image/
twitter-meta (en delt lenke rendrer uten identitet i iMessage/Slack), og det
finnes ingen delekort for innhold (kun profil-QR). Hver deling er i dag en tapt
merkeeksponering — dette er vekst like mye som identitet. **Innhold:** (1)
og:image/og:title/twitter:card på alle docs-sider — ett generert statisk
brand-bilde (svart, kolonet, tabular-tid-estetikk); (2) delekort per event og
per brief: iOS ShareLink med renderet kort (svart, amber kolon, stor tabular
tid, tittel, kanal), web canvas/statisk tilsvarende; delekortene er MARKEDSFLATE
— her kan amber-på-svart brukes modigere enn i produktkromet (kontrakten
regulerer produktflater). **Aksept:** lenke-preview verifisert i
iMessage/Slack-debugger; ShareLink-flyt UI-testet; ingen eksterne requests
(CSP/null-infra: bildet er statisk asset).

### WP-183 · Typografisk stemme: eie tallene (bølge 3 — EIERBESLUTNING)
**Mål:** produktets ansikt er bokstavelig talt klokkeslett (fast tidskolonne,
tabular semibold) — én distinkt display-/tallfont KUN for ordmerket +
tidskolonnen (+ delekort) gir gjenkjennelighet uten å røre lesbarhet.
Arkitekturen er bygget for det: `--display`-tokenet finnes alt i base.css og
peker i dag på `--font`; DesignTokens.swift er «a re-skin of this file alone».
**Innhold:** eier velger font (forslag legges frem: 2–3 kandidater med
mockups); token-bytte web (`--display`) + iOS (DesignTokens + UIFontMetrics for
Dynamic Type); DESIGN.md § Typografi-presisering («systemfont overalt UNNTATT
ordmerke/tidskolonne/delekort»); brødtekst forblir SF. **Ikke-mål:** ingen
brødtekst-/UI-fontbytte; ingen webfont-CDN (selvhostet asset, null eksterne
requests). **Aksept:** Dynamic Type-gaten grønn; design-tokens-testen oppdatert;
mockup-godkjenning fra eier FØR merge.

### WP-184 · Brand-voice + stale-rydding (bølge 1)
**Innhold:** (1) kodifiser mikrocopy-stemmen som `design/brand/VOICE.md`
(«Dette dekker vi», «Det du følger», ærlig «–», rolig norsk, bestemt form —
i dag tre linjer i DESIGN.md; den fortjener en side agenter kan følge); tagline
«Hele sporten. Ett rolig utsyn.» rulles ut (App Store-tekst, onboarding-velkomst,
web-gatens lead — gaten er førsteinntrykket på web og i dag ren funksjonell
prosa); (2) rydd stale identitets-rester som aktivt VILLEDER agenter:
`ios/tools/enso-icon.swift`-headeren hevder ensō-mosaikken er fasit (usant siden
Kolonet — en agent som følger den regenererer FEIL ikon), død
`EnsoMark.imageset`, «ensō»/«Tekst-TV»-kommentarer i OnboardingView/
SportivistaWidget, `(PROTOTYPE)`-markeringer i ContentView etter at WP-152 ble
normativ, DESIGN.md-rebrand-notatet omformuleres (navnebyttet HAR skjedd — kun
designprofil gjenstår), base.css/BRAND.md-amber-listene synkes (klokke/day-headers-
driften). **Aksept:** grep-rent for ensō/Tekst-TV utenfor historikk-seksjoner;
BRAND.md↔base.css-listene samstemte; koherens-/tokens-tester grønne.

### WP-185 · Visuell entitets-identitet: flagg + farge-monogrammer per rad (bølge 2 — eier-funn 21.07)
**Mål:** radene og entitetssidene får et rolig visuelt ANKER per entitet —
eierens dom 21.07: tavla oppleves anonym, «vi mangler blant annet logoer/flagg».
I dag er raden ren tekst (sport-glyfene fra WP-108/WP-154 er sport-nivå, ikke
entitets-nivå). Referanse-appene (FotMob/Sofascore) bruker ekte klubblogoer —
men crests er VAREMERKER med reell IP-risiko for en kommersiell app, så
grunnpakken bygger den trygge stigen og lar ekte logoer være eierbeslutning (d).
**Innhold:** (1) registeret (WP-161) utvides med `country` (ISO-kode) og
`colors` (primær/sekundær hex) per entitet — Wikidata (P17/P6364-klassen) og
ESPN teams-API bærer begge; registry.schema.json + seed-skriptene oppdateres;
(2) FLAGG for landslag og utøvere: emoji-flagg fra `country` — null assets,
null rettigheter, skalerer med Dynamic Type gratis; (3) FARGE-MONOGRAM for
klubber/lag/orgs: liten avrundet avatar (to klubbfarger + 1–2 initialer, à la
Kontakter/Kalender) tegnet LOKALT (SwiftUI-shape / ren CSS — aldri eksterne
bilde-requests: null-infra + personvern); (4) sportglyf beholdes som fallback
når register-metadata mangler (grasiøs degradering); (5) DESIGN.md-utvidelse
(sanksjonert per 0L-mandatet): avatar-spesifikasjon — størrelse ~24–28 pt,
plassering i raden, dark/light-varianter, og regelen «maks ÉN farget
avatar-flate per rad» (amber-invarianten står: avataren er entitetens farger,
aldri en ny aksent); entitetssiden (0K WP-170) bruker samme avatar i stor
variant. **Ikke-mål (BINDENDE):** ingen ekte klubblogoer/crests i dette WP-et —
eierbeslutning (d) med rettighetsvurdering/lisensiert kilde som egen ev.
oppfølger (alternativene dokumenteres i PR-body); ingen spillerfotos; ingen
tredjeparts-CDN/eksterne bilder i klienten. **Aksept:** rad med flagg
(landslag/utøver) + rad med monogram (klubb) på BEGGE flater,
dark/light-skjermbilder (maks ~4 per flate); registerskjema utvidet + validert
+ koherens-test; grasiøs degradering uten metadata bevist i test; suiter
grønne, gylne vektorer urørt (ren presentasjon).

---

### WP-186 · Ekte klubblogoer — policy-styrt kilde med proveniens (bølge 3, eierbeslutning 22.07)
**Bakgrunn (juridisk grunnlag — les hele, den er skrevet for å kunne stoles på):**
et klubbmerke bærer TO rettigheter samtidig. **Varemerke** — å bruke merket for å
IDENTIFISERE klubben (referansebruk, slik medier og FotMob-klassen gjør) er
normalt lovlig; varemerkeretten verner mot forveksling om opphav/tilknytning,
ikke mot henvisning. Derfor er den ene tingen vi aldri gjør, å antyde
tilknytning, sponsing eller godkjenning. **Opphavsrett til selve tegningen** —
her er bildet ærligere sagt slik: USA har `fair use`, en åpen doktrine der
redaksjonell/identifiserende bruk står sterkt. Norge og EU har INGEN tilsvarende
generell doktrine — sitatretten og de spesifikke lånereglene dekker ikke uten
videre en app som viser et crest ved siden av en kampstart, og kommersialisering
svekker argumentet ytterligere. Wikipedia hoster nesten alle crester som
`non-free`/fair use, EKSPLISITT ikke gjenbrukbart kommersielt — altså ingen
kilde. Wikimedia Commons oppgir derimot lisensen MASKINELT (`imageinfo`), så
«beviselig fritt» kan AVGJØRES i pipelinen i stedet for å antas.
**Eieren har fått den korreksjonen og står på sitt** (22.07): han vil ha ekte
klubbemblemer og vurderer bruken som redaksjonell/identifiserende. Det er hans
beslutning. Praktisk risiko vurderes som lav (referansebruk, ingen
merch/salg av merkene, marginal målgruppe, normalreaksjonen fra en klubb er en
høflig henvendelse, ikke søksmål) — men den er ikke null, og pakken later ikke
som noe annet. **Bryteren + proveniensen ER risikohåndteringen:** hvert merke sier
hvor det kom fra og på hvilket grunnlag, og ett konfigurasjonsfelt fjerner en hel
kategori mekanisk — så en takedown, en App Store-review eller en endret vurdering
besvares på minutter, ikke ved arkeologi.
**Mål:** ekte merke der vi kan stå for det, monogram ellers — og en BRYTER som
gjør standpunktet reverserbart uten å røre klientene.
**Innhold:** (1) `scripts/config/logo-policy.json` med `policy: free-only |
editorial` (aktiv verdi: `editorial`); ukjent/ødelagt/manglende verdi ⇒
`free-only` (fail-closed); (2) fri-kilden: for hver register-entitet med
`external.wikidata` (eller en KONSERVATIV navne-oppslag som avstår ved tvetydighet)
hentes `P154` → Commons `imageinfo` → **lisens-whitelist** (`CC0`, `PD`/public
domain, `PD-textlogo`/under verkshøyde, `CC BY`, `CC BY-SA`); alt annet
(non-free, fair use, NC, ND, ukjent, manglende felt, CC BY(-SA) uten navngitt
opphavsperson) avvises — aldri «antatt fritt»; (3) editorial-kilden: ESPNs
lag-logoer via registerets `external.espnId` (samme leverandør som kampdataene),
hentet ved BYGGETID til innsjekkede assets — fri lisens har alltid FORRANG, ESPN
fyller kun hullene; (4) proveniens per merke: `logo: { file, source, basis,
license?, attribution?, sourceUrl }` i registeret + `registry.schema.json`; et
merke uten fullstendig proveniens shippes ALDRI; (5) asset-pipeline: ~96 px PNG
under `docs/logos/` + `npm run seed:logos` (null-infra: ALDRI hotlinking fra
klienten); (6) klient: avatar-stigen i `docs/js/entity-avatar.js` +
`ios/.../EntityAvatarView.swift` får et NYTT ØVERSTE TRINN — ekte merke → flagg →
monogram → sportglyf; samme størrelse/plassering som WP-185 (ingen layout-endring,
ingen ny aksent); landslag beholder bevisst flagget; (7) **attribusjonsflate**,
todelt og ærlig (web: «Merker og kilder» under tavla; iOS: Deg › Merker og
kilder): fritt lisensierte merker krediteres med lisens og opphavsperson (CC BY /
CC BY-SA KREVER det), editorial-merkene får den nøkterne linja om at klubbmerker
tilhører sine respektive klubber og vises for å identifisere dem — uten noen
påstand om tilknytning, sponsing eller godkjenning; (8) `build-entities.js` fører
`logo` videre til entities.json OG anvender policyen ved publisering, slik at et
bytte til `free-only` + én pipeline-kjøring fjerner alle editorial-merker fra web,
app og widget uten klientendring; (9) dokumentér i PR-body den MÅLTE dekningen
per liga, splittet på `free-license` vs `editorial-use`, + de tre veiene videre
(lisensiert leverandør, egne geometriske klubbmerker, bli på monogram).
**Ikke-mål (BINDENDE):** **aldri modifisér et merke** — ingen omfarging,
beskjæring, maskering eller tint (share-alike-derivater OG merkeintegritet);
skalering er det eneste inngrepet; ingen hotlinking til tredjepart fra klienten;
ingen spillerfotos; ingen betalt leverandør i denne pakken (egen 💰-beslutning);
ingen påstand om tilknytning/sponsing/godkjenning noe sted i produktet; ingen
endring i feed-predikatene.
**Aksept:** lisensgaten er fail-closed og testet med et non-free-eksempel som MÅ
avvises; en test beviser at `free-only` faktisk utelukker editorial-merkene
(bryteren virker, den er ikke dekorativ); dekningstall rapportert per sport/liga
SPLITTET på grunnlag + byte-kostnad; attribusjonsflaten viser hver brukt lisens;
rad med ekte merke + rad med monogram + rad med flagg i samme skjermbilde-sett
(dark/light, maks ~4 per flate); full iOS-suite + 4 schemes + 13/13 gylne vektorer
bit-like; `npx vitest run --maxWorkers=1` grønn; ingen eksterne requests fra
klienten (grep-bevis).

---

## FASE 0M · Kommersialiseringsfundament: G1 målbar + juss/hosting i rekkefølge — planlagt

Kritikerens hovedfunn: neste port i hele planen (G1: D7-retention etter ~4 uker
TestFlight) kan i dag ikke måles — null eksterne testere, null instrument, og
forutsetningene for å FÅ eksterne testere (Beta App Review) mangler. I tillegg
skalerer tre risikoer med brukere: klient-side ESPN-polling (uoffisielt API,
hver nettlesers IP), tvkampen-scraping som ground truth, og GitHub Pages-ToS
(ikke kommersiell hosting, ~100 GB/mnd soft-cap). Fasen gjør G1 ærlig målbar og
PINNER rekkefølgen på det som må skje FØR brukervekst — det meste er
menneskeoppgaver med små kode-følger.

**Menneskebeslutninger i fasen:** (a) WP-191 juridisk enhet + Apple-org-
overføring (app-transfer er LETTEST før eksterne brukere — selgernavnet i App
Store er i dag eierens private navn) + varemerkesjekk (utsatt med akseptert
risiko siden WP-26 — før kommersiell lansering er den ikke lenger valgfri);
(b) G1-målemetoden (App Store Connect-metrikker + eier-dagbok vs. opt-in-ping);
(c) tidspunkt for repo-splitt (WP-28) — kritikeren påpeker at eierens «private»
interests.json i dag er verdenslesbar i det offentlige repoet (lav reell risiko,
men si det ærlig).

| WP | Tittel | Fase | Avhenger av | Status |
|---|---|---|---|---|
| WP-190 | G1 gjort målbar: personvernerklæring + privacy manifest + ekstern TestFlight + målemetode | 0M | — | ✅ #406 merget natt til 23.07 — branch wp-190-g1-malbar — personvernerklæring (`docs/personvern.html`, ugatet, lenket fra web-foten + Deg › Personvern), `PrivacyInfo.xcprivacy` for app (UserDefaults/CA92.1) + widget (tom, verifisert), G1 omdefinert til et etterprøvbart ASC+dagbok-kriterium med eier-sjekkliste. Beta App Review-innsendingen står igjen som eier-handling |
| WP-191 | 💰 Juridisk fundament: enhet, Apple-org, varemerke (menneskeoppgave, sekvensert) | 0M | — | planlagt |
| WP-192 | Kilde-/hosting-risiko sekvensert FØR vekst (WP-20/21-rekkefølgen pinnet) | 0M | — | ✅ 22.07 (direkte på main, ren plan/dok — hovedsesjonen) — Fase 1-sekvensen pinnet (WP-20/21 = gate for WP-25, ESPN-proxy inn i WP-21), README fikk ærlig «Android & grensene»-avsnitt (PWA-som-Android-stopgap uten push; ESPN-klientpolling; Pages-ToS) |

### WP-190 · G1 gjort målbar (bølge 1)
**Innhold:** (1) personvernerklæring `docs/personvern.html` (norsk, ærlig:
profil i brukerens egen private iCloud, aldri vår server; on-device-metrikk;
ingen sporing) + lenket fra app/web; (2) `PrivacyInfo.xcprivacy` (required-
reason APIs: UserDefaults/fil-tidsstempler) + nutrition-labels-utkast i ASC;
(3) ekstern TestFlight-gruppe + Beta App Review-innsending (WP-96-gaten er
åpnet — portene måles via port-report); (4) definér G1-instrumentet ærlig:
App Store Connect/TestFlight-metrikker (sessions/installs — IKKE D7-kohorter)
+ strukturert eier-/testerdagbok, ELLER omdefiner porten til det målbare
(«brukes appen daglig av N testere uke 3–4? sier de at de ville savnet den?»)
— eier velger (b-beslutningen over). **Aksept:** Beta App Review godkjent;
personvernsiden live; privacy manifest bygger; G1-teksten i denne planen
oppdatert med valgt instrument.
**Levert 22.07 (branch `wp-190-g1-malbar`):** (1) + (2) + (4) er gjort — se
`## 🚪 GATE G1` for det valgte instrumentet, hva det IKKE måler, og den
nummererte eier-sjekklista. (3) **ekstern testergruppe + Beta App Review-
innsending er per definisjon en eier-handling** (Apple-konto-tilgang) og står
som punkt 4 i den sjekklista — agenten forbereder, eieren sender.

### WP-191 · 💰 Juridisk fundament (menneskeoppgave — planen sekvenserer)
**Innhold (sjekkliste for eier, med bistand):** (0) **KLUBBEMBLEMENE — avklares her**
(eierbeslutning 22.07: «kjører på med logoer, finner ut av lisensspørsmål senere» —
dette ER «senere», og det inntreffer FØR betalt lansering, ikke ved første klage).
Grunnlaget som skal prøves: emblemene vises for å IDENTIFISERE klubben i en
agenda-/nyhetskontekst (referansebruk — varemerkerettslig trygt), mens opphavsretten
til selve tegningen hviler på et redaksjonelt argument som er sterkt i USA og svakere
i Norge/EU (ingen åpen fair use-doktrin). Verifisert 22.07: å KJØPE seg ut er ikke et
tilgjengelig alternativ — selv betalte leverandører (Sportmonks €29–249/mnd) leverer
bildestien men skriver eksplisitt at «you have to arrange proof of intellectual
property yourself»; ekte logorettigheter går direkte til klubb/liga, én avtale om
gangen (det Sofascore gjør med EuroLeague/Saudi Pro League). Konkret spørsmål til
advokat: «holder referansebruk-argumentet for emblemer i en betalt norsk sportsapp?»
Risikohåndteringen som ALLEREDE er bygget (WP-186): proveniens per merke
(`basis: free-license | editorial-use`) + en `logoPolicy`-bryter som fjerner én hel
kategori uten klientendring — så et nei fra advokaten er en konfigendring, ikke en
omskriving. NB: kampterminlistene selv — produktets kjerne — er trygge (EU-domstolen,
Football Dataco mot Yahoo!: terminlister er ikke opphavsrettsbeskyttet).
(1) juridisk enhet
(ENK/AS-vurdering — affiliate-avtaler og Apple-org krever det); (2) Apple
Developer personlig → organisasjon (app-transfer FØR eksterne brukere — ellers
flyttes brukerne med); (3) varemerkesøk/-registrering «Sportivista» (NO/EU-
klasser for app/media); (4) affiliate-forutsetningene kartlagt (Viaplay/TV 2/
Discovery+-programmene krever org + utbetalingskonto). **Aksept:** beslutning
per punkt dokumentert her (gjort/utsatt-med-begrunnelse); INGEN kodeendring.

### WP-192 · Kilde-/hosting-risiko sekvensert (bølge 1)
**Mål:** ingen av vekst-risikoene eksploderer FØR migreringene — rekkefølgen
pinnes nå i stedet for å oppdages under lansering. **Innhold:** (1) planfest:
WP-20 (primærkilder: kringkaster-EPG + forbunds-terminlister erstatter
tvkampen-avhengigheten) og WP-21 (Pages → Workers/R2 + API-nøkkel) er GATE for
markedsføring mot fremmede brukere — flytt dem eksplisitt foran WP-25 i Fase
1-sekvensen (radene der oppdateres); (2) ESPN-klientpolling: dokumentér
risikoen (uoffisielt API fra hver klients IP) + reduser flatetrykk (polling kun
i kampvindu for fulgte lag — WP-172 gjør dette); server-proxy-alternativ
skisseres som del av WP-21; (3) PWA-som-Android ærlig rammet inn i README
(halve mobilmarkedet har ingen push i dagens plan — Android er Fase 3, det er
et VALG). **Aksept:** Fase 1-sekvensen oppdatert i denne fila; README-avsnitt;
ingen kodeendring utover ev. kommentarer.

---

## 🚪 GATE G1 · Lakmustesten (dossier P500 Fase 0)

**Beslutning (menneske):** gå til Fase 1, forbli hobbyprodukt, eller avvikle app-sporet.
Alt under denne linjen er skisse som re-planlegges ved gaten.

### Porten, omdefinert til det som faktisk kan måles (WP-190, 22.07.2026)

Den opprinnelige formuleringen — «etter ~4 uker TestFlight: **D7-retention?**» —
er **ikke målbar for dette produktet**, og det er ikke en instrumenterings-mangel
som kan tettes. Tre grunner, i rekkefølge:

1. **Vi har ingen retensjonsdata og skal ikke ha det.** D7-retention forutsetter
   at man kan følge SAMME bruker over syv dager. Det krever en bruker-id og et
   telemetri-endepunkt — nøyaktig **B.3** i «BRUKERDATA → PRODUKTFORBEDRING»,
   som er merket *siste utvei* fordi den bruker opp «dine data rører aldri
   serveren vår» — tillitskapitalen produktet posisjoneres på. Å måle G1 med
   telemetri ville koste mer enn porten er verdt.
2. **App Store Connect gir ikke kohorter for TestFlight.** ASC viser installs,
   sessions, crashes og «Testers» per bygg. Det er *volum*, ikke *retensjon*:
   ingen D1/D7/D30-kurve, ingen per-tester-tidsserie du kan dele i kohorter.
3. **N er encifret.** Med en håndfull testere er enhver prosentsats støy. En
   D7-prosent av 6 personer er teater, ikke en beslutning.

**Den nye porten (BINDENDE — dette er kriteriet G1 måles mot):**

> **G1 er bestått når, ved slutten av uke 4 med minst 5 eksterne TestFlight-testere:**
> **(a) ≥ 3 testere har hatt sessions i minst 5 av de 7 siste dagene** (ASC →
> TestFlight → Sessions, avlest per bygg og notert ukentlig i dagboken),
> **(b) ≥ 3 av 5 svarer 4 eller 5 på «Hvor lei deg ville du blitt om Sportivista**
> **forsvant i morgen?» (1–5)** i uke-4-spørsmålet, og
> **(c) 0 uløste krasj-klynger** i ASC over de to siste ukene.
>
> Bestått ⇒ Fase 1. Delvis (a eller b, ikke begge) ⇒ forleng med 4 uker og
> flere testere FØR beslutningen tas — ikke «bestått med forbehold».
> Ikke bestått ⇒ hobbyprodukt eller avvikling, etter eierens valg.

**Instrumentet — to deler, ingen ny kode, ingen telemetri:**

- **Del 1 · ASC/TestFlight-metrikker (mekanisk, grovt).** Installs, sessions,
  crashes per bygg, avlest i App Store Connect. Måler *at* appen brukes og *at*
  den ikke krasjer. Kan ikke svare på hvem, hvor ofte per person, eller hvorfor.
- **Del 2 · Strukturert testerdagbok (kvalitativ, men fastspikret).** Samme fire
  spørsmål til hver tester i uke 1, 2 og 4 — samme ordlyd hver gang, svar
  noteres ordrett, ikke oppsummert:
  1. «Når åpnet du den sist, og hva så du etter?»
  2. «Hva var feil eller manglet — tid, kanal, eller noe som ikke var der?»
  3. «Hvor lei deg ville du blitt om den forsvant i morgen? (1–5)»
  4. «Har du fortalt noen om den? Hvem, og hva sa du?»
  Spørsmål 3 er porten (b); spørsmål 2 mater dekningsløkkene; spørsmål 4 er det
  eneste ærlige spredningssignalet på denne skalaen.

**Hva instrumentet IKKE kan svare på (skriv det ned, ikke lat som):**
ekte D1/D7/D30-retensjon · hvilke skjermer folk faktisk bruker · hvor de faller
av i onboarding · om varsler blir åpnet · om en tester sluttet fordi appen var
dårlig eller fordi sesongen var død. Del 2 er selvrapportert og har både
høflighets-skjevhet (testerne kjenner eieren) og et utvalg på 5–10 personer —
den *beskriver*, den beviser ikke. Porten er derfor bevisst satt som et
**gulv man enten passerer eller ikke**, ikke som en presisjonsmåling. Trenger
Fase 1 ekte produktanalyse senere, er det en egen, bevisst B.2/B.3-beslutning
(opt-in, dokumentert i `docs/personvern.html` FØR den slås på) — ikke noe som
smugles inn under G1.

### Hva som gjenstår som EIER-HANDLING før klokka på de 4 ukene kan starte

WP-190 har levert forutsetningene (personvernerklæring + privacy manifest +
porten definert). Resten er handlinger bare eieren kan gjøre — i denne rekkefølgen:

1. **Les gjennom `docs/personvern.html`** og bekreft at den stemmer med det du
   mener produktet er. Bytt ev. kontakt-e-posten til en du vil ha offentlig.
   (Anbefalt: ta den samme runden med advokat som WP-191-punktene, inkl.
   klubbemblem-spørsmålet — én gjennomgang, ikke tre.)
2. **App Store Connect → App Privacy:** sett personvern-URL til
   `https://sportivista.com/personvern.html` og fyll «nutrition labels» som
   **Data Not Collected** (utkastet ligger i WP-190s PR-beskrivelse).
3. **Verifiser at neste TestFlight-bygg bærer privacy-manifestene** — last opp
   via release-lanen og sjekk at ASC ikke flagger manglende manifest.
4. **Opprett en ekstern testergruppe** i TestFlight («Uke 1–4») og send bygget
   til **Beta App Review**. Dette er innsendingen agenten ikke gjør.
5. **Verv 5–10 testere** som faktisk følger norsk sport (ikke bare venner som
   sier ja). Under 5 er porten ikke målbar — da forlenges vervingen, ikke porten.
6. **Start dagboken** (ett dokument, én seksjon per tester): noter startdato,
   still de fire spørsmålene i uke 1, 2 og 4, skriv svarene ordrett.
7. **Les av ASC ukentlig** (installs/sessions/crashes per bygg) og skriv tallet
   inn i samme dokument samme dag — ASC-vinduer ruller, tall du ikke noterte er borte.
8. **Ved slutten av uke 4: avgjør mot (a)/(b)/(c) over**, og skriv beslutningen
   + begrunnelsen inn i denne seksjonen. Porten er ikke bestått før den er skrevet ned.

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
- **Fase A.5 (eier-beslutning 18.07, utviklings-perioden):** DEDIKERT Max-sub
  til prosjektet — billigste broen (~1–2k kr/mnd for ~11k API-ekvivalent
  løkke-arbeid), og løser «eierens egen bruk skaper røde vinduer»-problemet.
  Bytte = nytt CLAUDE_CODE_OAUTH_TOKEN-secret i repoet, ingenting annet.
- **Fase B (TestFlight):** SPLITT tokens — pipeline-løkkene over på API-nøkkel
  (ToS-rent, forutsigbart, uavhengig av eierens interaktive bruk) med hard
  budsjett-cap + per-løkke kost-telemetri (utvid usage-monitor); dev forblir
  på Max. Dette fjerner også «eieren jobber mye ⇒ motoren stopper»-koblingen.
- **Fase C (lansering, WP-21):** serverless cron + batch-API (50 % rabatt på
  ikke-hastende research/verify-sveip), prompt-caching, formalisert modell-
  tiering per løkke (scout er alt Haiku; mer av dette).


**MÅLT KOST (18.07.2026, faktiske `total_cost_usd` fra kjøre-logger × kjøringer/uke):**

| Løkke | $/kjøring | Kjøringer/uke | $/uke |
|---|---|---|---|
| research (Opus) | 2,59 | 45 | ~117 |
| self-repair (Opus) | 4,00 | 8 | ~32 |
| ui-fix (Opus, est.) | ~3 | 8 | ~24 |
| coverage-critic (Opus) | 2,55 | 8 | ~20 |
| editorial (Opus) | 1,17 | 15 | ~18 |
| verify (Opus) | 2,13 | 8 | ~17 |
| scout (Haiku) | 0,10 | 72 | ~7 |
| visual-qa (Sonnet) | 0,84 | 8 | ~7 |
| improve (Opus, est.) | ~4 | 1 | ~4 |
| **SUM** | | ~173 | **~246 $/uke ≈ 1 050 $/mnd** |

(Enkelt-kjøring-samples → varians; listepris-ekvivalent.) Dvs.: løkkene brenner
i dag ~10–11 000 kr/mnd i API-ekvivalent innenfor Max-abonnementet — derfor
kvote-presset. Rå API-bytte ved dagens scope ≈ 1 050 $/mnd; INGENIØRERT
API-kost (batch-API −50 % på verify/critic/sveip, prompt-caching, tiering ned
der korrekthet tåler det, redusert research-kadens i lavsesong, AI→kode-
krymping) realistisk **300–500 $/mnd**. FASE 2-kalibrering: ~100–200
Pro-abonnenter à 59 kr dekker ingeniørert kost — unit-økonomien holder.


**KOST-KURVEN (eier-presisering 18.07):** målt kost er OPPDAGELSES-kost, ikke
steady-state. Løkkens hovedjobb er å BYGGE datagrunnlaget: hver research-
oppdagelse av en stabil kilde (forbunds-terminliste, EPG, ICS) skal bli
fetcher-kode (WP-20 primærkilder = kost-kurvens viktigste fiks). Steady-state-
mål: 80–90 % av events fra gratis strukturerte kilder; AI = QA + gap-filler +
delta (endringer/nye turneringer/breaking). Kost per dekningsenhet skal falle
måned for måned. «AI oppdager, kode håndhever» gjelder INNHOLD, ikke bare bugs.

**WP-101 · Dekningsplanleggeren (prediktiv katalog) — etter G1:** billig
månedlig/sesongvis løkke (Sonnet-klasse) som ser 1–3 mnd frem i sports-
kalenderen og pre-utvider catalog.json FØR etterspørselen («VM i skiskyting om
6 uker → kilder+entiteter klare»). Komplementær til WP-23 (etterspørsels-
aggregat = reaktivt signal; planleggeren = proaktivt). Popularitets-priors
vedlikeholdes mot kalenderen.

**WP-102 · Forslags-pills (interesse-friksjon ned) — etter G1:** eier-funn:
dagens oppsett krever for mye spesifisering. StarterPacks ER pills-mønsteret —
evolusjon: (1) pakker/pills genereres dynamisk fra catalog.json + popularitet
(kuratert først, WP-23-aggregat senere); (2) kontekstuelle forslag («følger du
Hovland → Ryder Cup») fra samfølge-mønstre; (3) forslags-pills i Deg + etter
onboarding (sveip-Følg på rader finnes); (4) chat beholdes for presisjonen
(«bare når Carlsen spiller klassisk») — pills tar de vanlige 80 %.
Personvern: forslag bygges av ANONYME aggregat-tellinger/kuratering — aldri
individdata (arkitekturprinsippet står).

**VENDOR-AGNOSTISME (eier-bekymring 18.07):** Porteringsprinsippet (CLAUDE.md)
står: lock-in er BEGRENSET til workflow-filene (runneren); promptene er
kapabilitets-beskrevet; iOS-assistenten er bak `InterestAssistant`-protokollen
(og er Apple FM, ikke Anthropic). Strategi: **billig exit fremfor multi-vendor
nå** — (1) promptene holdes kapabilitets-beskrevet (håndhevet vane), (2) ved
Fase B rutes API-kall gjennom tynn gateway (LiteLLM-klasse) slik at leverandør
= konfig, (3) løkke-evals (research-rubrikken er én; tilsvarende for verify)
gjør modell-/leverandørbytte MÅLBART i stedet for vibes (FM-eval-mønsteret fra
iOS), (4) «AI oppdager, kode håndhever» krymper eksponeringen strukturelt.
Ærlig motvekt: korrekthetsløftet avhenger av frontier-kvalitet — ikke bytt
produktkvalitet mot teoretisk portabilitet; hold exiten billig i stedet.

**Kost-disiplinen som monner mest:** ukens gjennomgående lærdom — **AI
oppdager, KODE håndhever.** Hver løkke som mekaniseres (WP-90: verify fant
golf-buggen 5×, fiksen var kode; WP-93: vaktene ble deterministiske sjekker)
er kvote frigjort permanent. Prinsipp: en AI-løkke som gjentar samme funn ≥3×
skal produsere en kode-/skjema-endring, ikke flere AI-kjøringer.

## BRUKERDATA → PRODUKTFORBEDRING (eier-drøfting 20.07.2026) · dossier-tillegg

Eier-instinkt: profil-data (hva folk følger/preferanser) er verdifullt for å
forbedre appen når massen vokser; E2E på en sport-følgeliste er unødvendig. Begge
deler stemmer — men de er ULIKE spørsmål, og ett teknisk faktum avgjør rammen:

**Bærende faktum:** profilen ligger i brukerens EGEN private CloudKit-DB. Den er
usynlig for oss som utvikler — uansett kryptering. Å fjerne E2E (gjort 20.07,
`cleanup-profile-plaintext`) ga web-lesbarhet, IKKE utvikler-innsyn. «Bruk dataen»
krever derfor en egen, bevisst innsamlingsvei; det er ikke en krypterings-spak.

**To akser (vidt ulik kostnad):**

- **A · Forbedre FOR den enkelte** (appen tilpasser seg deg) — allerede støttet
  on-device: `BehaviorCounter` (G-counter i profilen) + `MemoryFact` +
  assistentens minne. Null personvern-kost, ingen infra, ingen samtykke. **Den
  umiddelbare gevinsten — utvid her først** (adaptive defaults, assistent-minne,
  «du åpner alltid golf → løft det»). Alt beregnet lokalt, ett byte forlater aldri
  enheten. Passer eksakt to-lags-arkitekturen (kost skalerer med dekning, ikke
  brukere).

- **B · Lære PÅ TVERS av brukere** (aggregat → bedre defaults/dekning/onboarding)
  — krever innsamlingsvei siden privat-DB er usynlig. Rangert etter risiko:
  1. **Mine follow-requestene** (`follow.yml` → GitHub-issues) — allerede
     OFFENTLIGE. «Hva ber folk om å følge» er gratis, ikke-personlig, i dag.
     Kobler til WP-23 gap-voting + WP-96 etterspørselsmodell.
  2. **Opt-in anonymt aggregat via CloudKit PUBLIC database** — null-infra
     (Apple hoster), utvikler-lesbar (ulikt privat-DB), gratis på denne skalaen,
     blir i Apple-økosystemet. Bruker skriver frivillig «anon følger entitet X»;
     vi spør public-DB om popularitet. Den elegante på-merket-veien når (1) ikke
     rekker.
  3. **Ekte telemetri/backend** — siste utvei; bryter null-infra + personvern-
     posisjonen («dine data rører aldri serveren vår» er tillitskapital, brukes
     opp én gang) + GDPR-plikter (samtykke, personvernerklæring, databehandler).

**Anbefaling:** start med **A (on-device) + B.1 (offentlige follow-requests)** —
null risiko, null infra, verdi i dag. **B.2** når tverr-bruker-signal faktisk
trengs. **B.3** kun ved bevisst posisjons-skifte. Personvern-linjen, om noen, hold
den på ASSISTENT-MINNET (litt mer personlig enn følge-lista), aldri på følges.
Status: rammeverk besluttet; ingen innsamling bygget. NESTE når prioritert:
skissere A-utvidelsen (adaptive defaults fra `BehaviorCounter`) som egen WP.

## FASE 1 · Norge-lansering (Q4 2026, dossier P400/P500) — skisse

**Sekvens-pinning (WP-192, 22.07):** WP-20 + WP-21 er GATE for markedsføring mot
fremmede brukere — de ligger FØR WP-25 i rekkefølgen, ikke parallelt med lansering.
Begrunnelse (kritiker-funn 21.07, verifisert): (a) hver web-klients nettleser
poller i dag ESPNs uoffisielle API direkte (`docs/js/live.js` — WP-172 reduserer
flatetrykket til kampvindu-polling, men modellen skalerer ikke til fremmede
brukere; server-proxy skisseres som del av WP-21); (b) tvkampen-scraping er
streaming-grunnsannhet uten avtale; (c) GitHub Pages' vilkår tillater ikke
kommersiell hosting (~100 GB/mnd soft-cap). Alle tre er ufarlige på dogfood-skala
og uforsvarlige å MARKEDSFØRE seg til vekst på.

- **WP-20 · Kildemigrering til primærkilder** (P400 regel #1) — **FØR WP-25**:
  erstatt tvkampen-scraperen med kringkaster-EPG-er (NRK/TV 2/Viaplay/Discovery+);
  forbunds-terminlister (NHF, FIS, IBU, UCI) som nye fetchere. *Angrefri — styrker
  hobbyversjonen også.*
- **WP-21 · 💰 Serverlag → SLA** — **FØR WP-25**: GitHub Actions → Cloudflare
  Workers cron + R2; Max-abonnement → API-nøkkel. Samme statiske JSON-kontrakt
  (WP-03-manifestet er porten). Inkluderer ESPN-proxy-vurderingen (flytt
  live-pollingen bak vår kant i stedet for hver klients IP).
- **WP-22 · CloudKit profil-sync** (P360): SwiftData-speiling, merge-strategiene,
  E2E-felter.
- **WP-23 · Gap-voting v1** (P330): anonymt signal + server-kø under budsjett.
  (v0 skipet som WP-165 — offentlige coverage-request-issues + demand[].)
- **WP-24 · Live Activities** via broadcast-kanaler (P340) — krever WP-17.
- **WP-25 · Lansering ved vintersesongstart** — Gate G2: 5 000 brukere, D30 > 30 %.
  **Forutsetter WP-20 + WP-21 grønne.**

## FASE 2 · Inntekt (vår 2027) — skisse
Affiliate-avtaler (Viaplay/TV 2/Discovery+) → Pro-tier 59 kr/mnd (frontier-brief,
Live Activities, ubegrensede interesser). Gate G3 / kill-kriterium: affiliate + Pro
dekker serverkost innen 12 mnd.

## FASE 3 · Skalering (2028) — skisse
Land-playbook (Sverige først), Android (zero-knowledge profil-blob), ev. B2B.

---

*Opprettet 13.07.2026 fra kommersialiserings-dossieret v3 + kontraktkartlegging av repoet.
Vedlikeholdes av agentene som jobber på pakkene (regel 6).*### WP-131 · Interests-arv-sanering (eierbestilling 20.07 morgen)
**Mål:** siden WP-96 lever personlig presisjon på hver enkelt enhet — men eierens
private interesser lekker fortsatt inn i GLOBALT publiserte artefakter. Verifisert:
`mustWatch` stemples i publiserte events.json (35 events i dag) fra eierens
interests. **Innhold:** (1) `scripts/build-events.js`: slutt å stemple
`mustWatch` i publiserte events.json — ICS-bygget (eier-artefaktet) beregner det
selv fra interests ved byggetid (`mustWatchEntity` finnes alt i build-ics.js:133
som fallback — gjør den til eneste vei); verifiser at INGEN klient (docs/js,
iOS FeedCompiler/NotificationPlanner) leser `mustWatch`-feltet — hver klients
must-see/varsler skal komme fra brukerens egen profil/linse; (2) full lekkasje-
audit av øvrige publiserte filer: `isFavorite`/favoritter-først-sortering i
recent-results (WP-44-komparatoren — eierens favoritter?), fetch/football.js-
interests-bruk, andre eier-flagg i docs/data — fjern eller flytt til
eier-artefakter; (3) docs/js: rydd de døde `this.interests`-grenene i
dashboard.js (permanent null siden WP-96 — auditfunn) og evt. mustWatch-lesing;
(4) dokumentér i CLAUDE.md hvilke artefakter som ER bevisst eier-scopet
(events.ics + interests.json som katalog-frø) — og at ALT annet publisert skal
være bruker-nøytralt. **Ikke-mål:** ingen endring i interests.json selv,
follow-request-flyten eller katalog-mekanismen. **Aksept:** publisert events.json
uten mustWatch (sandbox-diff), ICS byte-ekvivalent (samme VALARM-sett),
vitest + golden-vektorer (re-frys IKKE forventet — verifiser), skjermer urørt.

### WP-132 · Onboarding: quick-picks-først + generiske pakker + assistent-intro
**Mål (eierbestilling 20.07 morgen):** enklest mulig onboarding — quick-picks
som gir mening for ALLE norske sportsinteresserte (ikke eierens personlige valg)
+ en god innføring i hvordan assistenten hjelper deg; den store verdien —
**dyp personalisering** — skal komme tydelig frem. **Innhold:** (1) INNGANGSSTEG-
FLIPP (WP-129s flaggede valg, nå besluttet): quick-picks er første steg for alle;
samtale-veien er en tydelig men sekundær «eller fortell med egne ord»-inngang
(Apple Intelligence-gatet som i dag); (2) PAKKE-KURATERING (StarterPacks.swift):
erstatt eier-spesifikke valg med bredt meningsfulle — «Norsk fotball» =
Eliteserien + landslagene (IKKE Lyn); golf = Hovland + majors (nasjonalt
meningsfull — behold); sjakk = Carlsen; sykkel = TdF + norske ryttere; friidrett
= Warholm/Ingebrigtsen; tennis = Ruud + Grand Slams; CS2-pakken generaliseres
(store turneringer, ikke 100T/rain) eller merkes nisje; vintersport-pakke INN
(sesongstart nov — skiskyting/langrenn/alpint/hopp); (3) ASSISTENT-INTRO etter
quick-picks: ett rolig steg/øyeblikk som VISER dyp personalisering med 2–3
konkrete eksempler i klarspråk («Si: 'bare de norske i Tour de France'», «'ikke
vis resultater før jeg har sett kampen'», «'følg alt Warholm gjør'») + trykkbar
prøv-nå som åpner assistenten. Progressive disclosure: den ikke-tekniske kan
hoppe over alt og ha en fungerende app; entusiasten ser dybden. **Ikke-mål:**
ingen endring i assistent-armene/FM-prompter; ingen serverendring. **Aksept:**
onboarding-UI-flyt grønn (quick-picks-først), pakkene grunnfester mot
entities.json-id-er som finnes, eval-corpus-case for ett intro-eksempel
(0E-regelen), full unit-suite + 4 schemes + vektorer, skjermbilder begge temaer.

### WP-133 · Entitets-dekning: Eliteserien + Ingebrigtsen + Norge-dedup + pakke-repek
**Bakgrunn (WP-132-oppfølging):** WP-132 grunnfestet startpakkene mot
`entities.json`, men to entiteter manglet selv om `catalog.json` dekker dem:
**Eliteserien** (tier2.tournaments) hadde ingen entitet — kun `obos-ligaen-2026`
(eierens Lyn-nivå) — så «Norsk fotball»-pakken falt tilbake til bare landslaget;
og **Jakob Ingebrigtsen** (tier2.athletes) manglet helt (kun Warholm fantes), så
«Friidrett» måtte rute gjennom EM-turneringen. Årsak: `build-entities.js` bygger
entities.json fra tracked.json/sports-config.js/norwegian-golfers.json — IKKE fra
katalogen. I tillegg lå landslaget som DUBLETT `norway` + `norge` (sports-config
lister begge stavemåter; WP-125s `isNicknameForm` folder dem ikke siden ingen er
initialform av den andre) → samme lens-miss-klasse som 100T.
**Innhold:** (1) SEED (manuell seeding tillatt ved launch): `scripts/config/tracked.json`
får en `leagues`-entry `eliteserien-2026` (Eliteserien, football) + en `athletes`-entry
`jakob-ingebrigtsen` (athletics), begge med `addedBy: "manual-seed WP-133"` og
evidens som siterer `catalog.json#tier2.*`; research-agenten reconcilierer mot
katalogen senere. Seedet bor i `scripts/config/` (kilden build-entities leser),
IKKE i `docs/data/` (pipeline-eid, publisert) — pipelinen republiserer entities/
tracked på neste kjøring. (2) NORGE-DEDUP: kuratert **known-alias-tabell** i
build-entities (`KNOWN_ALIAS_GROUPS = [["norway","norge"]]` → `isKnownAlias` inn i
`termsOverlap`) — bevisst valgt over en generisk kryss-språk-heuristikk fordi den
er kirurgisk (bare de listede stavemåtene folder, kan aldri over-merge to reelle
lag; same-sport+same-type håndheves fortsatt av upsert). sports-config reordnet
`["…","Norge","Norway"]` så den konsoliderte entiteten blir `norge` (norsk
visningsnavn), «Norway» folder inn som alias. (3) PAKKE-REPEK (StarterPacks.swift):
«Norsk fotball» → Eliteserien + landslaget (`eliteserien-2026`, `norge`);
«Friidrett» → Warholm + Ingebrigtsen (dropper `em-friidrett-2026`-omveien).
(4) FIXTURE-REFRYS: iOS `Fixtures/entities.json` (+`manifest.json` sha/bytes) får
de tre entitets-endringene konsistent. **Ikke-mål:** ingen konkrete events legges
til (research/fetchere dekker terminlistene); ingen katalogendring (den dekket
allerede begge); ingen berøring av `docs/data/`, interests.json eller beskyttede
stier. **Aksept:** vitest grønn (build-entities-regresjonstester for Norge-dedup +
produksjonsvakt, tracked-schema, feed-vectors, manifest); sandbox
`build-entities → build-events → validate-events` rent (/tmp, ikke docs/data);
full iOS unit-suite + 4 schemes + gylne vektorer bit-like etter fixture-refrys
(`test_starterPacks_areGroundedAndUnique` fortsatt grønn — pakkene grunnfester mot
de nye id-ene).

### WP-138B · Adaptiv personalisering on-device (akse A — «forbedre FOR brukeren») — omnummerert fra WP-138 21.07 (nummerkollisjon med pre-merge-arkivvalideringen i 0I+)
**Bakgrunn (data-strategi 20.07, seksjonen «BRUKERDATA → PRODUKTFORBEDRING»):**
akse A er den umiddelbare, personvern-frie gevinsten — appen tilpasser seg DEG
lokalt, null byte forlater enheten. Signalet finnes ALLEREDE: `BehaviorCounter`
(G-counter i profilen, synkes E2E-fritt via CloudKit-snapshot) sporer
`open`/`expand`/`dismiss` per entitet OG per sport (`behavior|open|<entityId>` /
`behavior|open|s:<sport>`, `MemoryModels.swift:154-187`). I dag KONSUMERES det bare
passivt — vist i «Hva jeg vet om deg» (`WhatIKnowView`) og lett brukt av
assistenten — men INGENTING ordner eller løfter feeden ut fra det. WP-138 lukker
den løkka: observert atferd → en mild, deterministisk affinitets-vekt.
**Innhold:** (1) AFFINITET (ny ren funksjon, testbar, `Feed/` el. `Profile/`):
`affinity(entityId|sport) = w_open·open + w_expand·expand − w_dismiss·dismiss`,
mettet/normalisert (unngå at én tung bruker-dag dominerer); bygd fra
`MemoryState.behavior`. Ren verdi-funksjon → golden-testbar. (2) BRUK — bevisst
LAV-MÆLT (ro-løftet): IKKE en re-sortering av agendaen (kronologien er hellig),
men et **tie-break/løft-signal** der rekkefølge ellers er vilkårlig — must-see-
kandidater innen samme dag, «Neste opp»-utvalget, quick-pick-rekkefølgen i
onboarding (WP-132), og assistent-defaults («du åpner alltid golf» → golf først når
et spørsmål er tvetydig). Aldri skjule noe, aldri overstyre eksplisitte føl/-
importance-signaler. (3) FORKLARBARHET: affiniteten er synlig i `WhatIKnowView`
(«du åpner golf oftest») så tilpasningen er gjennomsiktig, aldri en svart boks.
(4) GJENBRUK PÅ WEB (valgfritt, senere): samme signal finnes i den web-syncede
profilen (counters) → `docs/js` kan speile affiniteten med samme formel (ny
`ss`-funksjon, feed-vektor-mønsteret) om ønskelig. **Ikke-mål:** ingen ny
datainnsamling, ingen server, ingen aggregering på tvers av brukere (det er akse
B, separat); ingen endring i `isRelevant`/`mustWatch`-semantikken (affinitet er et
tillegg PÅ toppen, ikke en ny relevans-gate — feed-vektorene skal forbli bit-like);
ingen re-sortering av den kronologiske agendaen. **Aksept:** ren `affinity`-funksjon
med unit-tester (monotoni, metning, dismiss-dominans); feed-vektorer bit-like
(affinitet endrer ikke relevans/bell/must-see-SETTENE, kun tie-break-rekkefølge
innen et sett — pin med en egen ordnings-test); `WhatIKnowView` viser topp-
affinitet; full iOS-suite + 4 schemes; eval-corpus-case hvis assistent-default
endres (0E-regelen). **Avhengighet:** ingen (signalet er allerede der); komplementær
til WP-132 (quick-pick-rekkefølge) og WP-30 (minne-sync). Akse B (offentlige
follow-requests → opt-in public-DB) er egen, senere WP når brukermassen finnes.


