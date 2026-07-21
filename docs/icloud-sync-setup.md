# iCloud-synk mellom web og app — oppsett (eier, engangs)

> **STATUS (21.07.2026): SATT OPP + LIVE i Production.** `ProfileSnapshot`-skjemaet
> er deployet til Production (verifisert med `cktool export-schema`), et origin-låst
> Production web-token ligger i `docs/js/icloud-config.js`, og web-innloggingen er
> bekreftet mot iCloud. Dette dokumentet er nå referanse for re-oppsett / et nytt
> miljø. **Lærdom:** `cktool` kan definere/importere skjema til **Development**, men
> IKKE til Production («endpoint not applicable in the environment 'production'») og
> kan ikke lage web-API-tokens — Production-deploy + token-generering er dashboard-
> only. Skjema-fila `scripts/cloudkit-schema.ckdb` fungerte (7 indekser inkl. den
> påkrevde `recordName`-queryable).

Web-versjonen synker «hva du følger» to veier med iPhone-appen via **CloudKit
JS + Sign in with Apple** — helt uten vår egen server. Til oppsettet er gjort
holder web seg til den lokale profilen + QR/lenke-import — ingenting brekker.

## Hvorfor et «ProfileSnapshot»

Appen synker profilen per-record **ende-til-ende-kryptert** (`encryptedValues`).
CloudKit JS **kan ikke dekryptere E2E-felter**, så nettleseren ville bare sett
metadata. Derfor publiserer appen i tillegg ett **klartekst-snapshot per enhet**
(`ProfileSnapshot`, ett `payload`-felt = hele den flettede staten som
`ProfileShareCodec`-payload). Web leser/fletter/skriver kun snapshots; den native
iOS↔iOS-stien forblir E2E. **Konsekvens:** alt web kan lese er per definisjon ikke
E2E — snapshot-feltet er klartekst i din egen private iCloud-DB (aldri delt, aldri
vår server).

## Rask vei (cktool — skjemaet settes opp fra terminalen)

Skjema-delen kan gjøres med Apples `cktool` (følger med Xcode) i stedet for å
klikke i dashboardet. Da genererer du bare ETT token, og resten kjøres som
kommandoer (`scripts/cloudkit-schema.ckdb` definerer `ProfileSnapshot` + den
påkrevde `recordName`-indeksen):

```bash
# 1. Generer et MANAGEMENT-token i Console (API Access / Tokens) og lagre det
#    lokalt (havner i DIN keychain — deles aldri):
xcrun cktool save-token --type management

# 2. Importer skjemaet til Development, deretter Production:
xcrun cktool import-schema --team-id 9LVCB72DT8 \
  --container-id iCloud.app.sportivista.ios --environment development \
  --validate --file scripts/cloudkit-schema.ckdb
xcrun cktool import-schema --team-id 9LVCB72DT8 \
  --container-id iCloud.app.sportivista.ios --environment production \
  --validate --file scripts/cloudkit-schema.ckdb
```

**Det cktool IKKE kan lage** er web-API-tokenet (med Allowed Origins) — det må
genereres i dashboardet (steg 4 under). Så minimums-arbeidet ditt er: generer to
tokens (management + web-API) i Console; alt annet er kommandoer/kode.

## Full vei (dashboard — Development først, så Production)

CloudKit Console → `icloud.developer.apple.com/dashboard` → container
**`iCloud.app.sportivista.ios`** (under det betalte teamet `9LVCB72DT8`):

1. **Bekreft containeren** ligger under det betalte teamet (ikke grået ut).
2. **Definer record-typen `ProfileSnapshot`** (Schema → Record Types → New):
   - felt **`payload`** — type **String**
   - felt **`updatedAt`** — type **Date/Time**
   - (recordName er systemfeltet; én record per enhet.)
   Tips: kjør `SportivistaDeviceDev`-bygget på iPhone og følg noe én gang — appen
   auto-oppretter typen i Development. Indeksene + Production-deploy er manuelt.
3. **Legg til en Queryable-indeks på systemfeltet `recordName`** for
   `ProfileSnapshot` (Indexes → Add). *Uten den feiler alle web-spørringer med
   `BAD_REQUEST: field recordName is not marked queryable` — den vanligste feilen.*
4. **Generer en CloudKit JS API-token** (Security & API Access → API Tokens →
   New Token). Sett **Allowed Origins** nøyaktig til:
   - `https://sportivista.com`
   - `https://chaerem.github.io`
   Kopier tokenet.
5. **Lim tokenet inn i [`docs/js/icloud-config.js`](js/icloud-config.js)**
   (`apiToken: '<tokenet>'`) og commit. Tokenet er **offentlig og origin-låst —
   trygt å committe** (det gir ingenting fra en annen origin, og hver bruker
   logger inn med sin egen Apple-ID og ser bare sin egen private DB).
6. **Deploy Schema to Production** (Deploy Schema Changes). Sett `environment` i
   `icloud-config.js` til å matche appbygget som kjører: Debug-device →
   `development`, TestFlight/Release → `production`. Generer token for samme miljø.

## Verifisering

- **På enhet (dev):** følg noe i appen → bekreft at en `ProfileSnapshot` dukker
  opp som klartekst i Development-DB-en i zonen `SportivistaProfile`.
- **På web:** åpne `sportivista.com/rediger.html` → seksjonen **«Synk med iCloud»**
  vises når tokenet er satt → logg inn med Apple-ID → lista skal matche telefonen.
  Følg noe på web → dukker opp på telefonen etter neste bakgrunnssynk.

## Feilsøking

| Symptom | Årsak | Fiks |
|---|---|---|
| «Synk med iCloud» vises ikke | tomt `apiToken` | lim inn tokenet (steg 5) |
| `BAD_REQUEST … recordName not queryable` | manglende indeks | steg 3 |
| `AUTHENTICATION_FAILED` / origin | origin-mismatch | eksakt scheme+host (steg 4) |
| Web viser tom/feil profil | miljø-mismatch | hold device-bygg + token på samme `environment` (steg 6) |

Kodesiden: [`icloud-sync.js`](js/icloud-sync.js) (web-klient), `CloudKitProfileSync.swift`
(appens `writeSnapshot`/snapshot-lesing), `sw.js` (slipper CloudKit-kall forbi cachen).
