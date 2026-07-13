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
| WP-04 | Deltakelse-normalisering | 0A | WP-01 | PR åpnet |
| WP-05 | Entitets-indeks | 0A | WP-01 | ✅ merget (#240) |
| WP-06 | Gylne feed-vektorer | 0A | WP-02 | ✅ merget (#238) |
| WP-10 | iOS-scaffold | 0B | – | ✅ merget (#237) + bygg bevist (Xcode 26.6, iOS 26.5-SDK) |
| WP-11 | Codable-modeller | 0B | WP-01, WP-10 | ✅ merget (#241) — TEST SUCCEEDED 11/11 |
| WP-12 | SyncClient | 0B | WP-03, WP-11 | ✅ merget (#242) — 37/37 tester |
| WP-13 | FeedCompiler (Swift) | 0B | WP-06, WP-11 | ✅ merget (#243) — 13/13 vektorer bit-likt |
| WP-14 | Agenda-UI + widget | 0B | WP-13 | ✅ merget (#245) — 102/102 tester + screenshot-bevis |
| WP-15 | NotificationPlanner | 0B | WP-13 | ✅ merget (#244) — 69/69 tester |
| WP-16 | FM-lekegrind (samtale→profil) | 0B | WP-10 | ✅ implementert — 152/152 iOS-tester (mot mock; FM kjøres ikke i CI) + DeviceDev bygget/signert/installert på fysisk iPhone (launch krever engangs manuell utvikler-trust på enheten) |
| WP-17 | 💰 TestFlight-oppsett | 0B | WP-14 | venter på beslutning |
| WP-26 | Nytt navn | 0C | – | ✅ valgt + domene sikret — formell sjekk gjenstår |
| WP-27 | 💰 Domene + DNS-cutover | 0C | WP-26 | ✅ zenji.app live 13.07 (cert + enforce-https + rot-paths) |
| WP-28 | Repo-splitt (privat motor / public site) | ~~0C~~ → Fase 1 | trigger | utsatt — trigger-basert (se WP-28) |
| WP-29 | Self-hosted runner (kun privat repo) | ~~0C~~ → Fase 1 | WP-28 | utsatt — følger WP-28 |

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
- **Ikke-mål:** nøkle om `docs/js/asset-maps.js` til ID-er (fase 1); røre interests.json.
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
