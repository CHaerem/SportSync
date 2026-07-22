# Divergences (WP-06)

WP-06 froze the personalisation semantics as golden vectors and ran them against
**both** implementations wherever the logic exists on both sides. This file
records where the server (`scripts/build-events.js` + `scripts/lib/helpers.js`)
and the client (`docs/js/dashboard.js` + `docs/js/shared-constants.js`) behave
differently.

**Binding non-goal:** WP-06 does **not** fix any of these — the vectors pin
*today's actual behaviour per side*, and the JS test asserts each side against its
own expected set. Consolidation is separate work; when the Swift `FeedCompiler`
(WP-13) is written it should reproduce these behaviours, not silently "correct"
them.

---

## 0. Structural finding: there is no single shared "special?" predicate

The premise "the personalisation logic is duplicated between server and client"
is only half true. There is **no one predicate** computed on both sides. There
are **three distinct predicates**, each answering a different product question,
and they are *intended* to differ:

| Predicate  | Product question         | Where it lives                         | Inputs it keys off                                            |
|------------|--------------------------|----------------------------------------|---------------------------------------------------------------|
| `relevant` | In the feed at all?      | server `isRelevant` + 14-day cutoff    | sport (followBroadly), the entity-gate for chess/esports, norwegian, isFavorite, importance≥4, any tracked entity (unscoped). **WP-92:** `ai-research` is no longer a standalone pass; chess/esports need a sport-scoped entity match (see §5) |
| `mustWatch`| Reminder bell 🔔?        | server `mustWatchEntity`               | interests notify-set only (teams+athletes, tournaments if notify:true), **sport-scoped** |
| `mustSee`  | Visual accent?           | client `isMustSee`                     | isFavorite, importance≥4, norwegian+players, national team, tracked team/athlete (substring) |

So `mustWatch != mustSee` is the norm, not a bug. The only genuinely mirrored
function is `isEventInWindow`. Everything below follows from this.

The single always-both-sides function, `isEventInWindow`, is **byte-identical**
between `scripts/lib/helpers.js` and `docs/js/shared-constants.js`. Every
`inWindow` vector runs against both and the test asserts they agree — **no
divergence found**, and the assertion now guards against a future one-sided edit.

---

## 1. Relevance is NOT sport-scoped; the bell IS

- Server `isRelevant` calls `matchInterest(hay, trackedEntities)` **without** a
  `sport` option (`build-events.js:483`).
- Server `mustWatchEntity` calls `matchInterest(hay, notifyEntities, { sport: event.sport })`
  (`helpers.js:141`).

**Consequence.** A tracked entity from one sport can pull an unrelated sport's
event onto the board, while the (scoped) bell correctly ignores it.

**Pinned by** `13-edge-sportscope-and-substring.json`, event `barca-open-tennis`
(the ATP "Barcelona Open", a tennis event, `sport` not in `followBroadly`):

| Predicate  | Result | Why                                                                 |
|------------|--------|---------------------------------------------------------------------|
| `relevant` | `true` | unscoped match: the football club "Barcelona" is found in the title |
| `mustWatch`| `false`| scoped: Barcelona is `sport:"football"`, event is tennis → skipped  |
| `mustSee`  | `false`| the accent only checks tracked *teams* against homeTeam/awayTeam (a tennis event has neither), never the title |

Net effect: the event appears on the board with **neither** a bell nor an accent
— a mild false-positive in relevance that the other two predicates do not share.

---

## 2. The accent uses naive substring; the bell uses word boundaries

- Client `isMustSee` matches tracked teams with
  `homeTeam.toLowerCase().includes(term.toLowerCase())` and tracked athletes with
  `haystack.toLowerCase().includes(term.toLowerCase())` (`dashboard.js:134,137`).
  Plain substring, plain lowercase — **no** word boundaries, **no** diacritic
  folding.
- Server matching (`containsName`, used by both relevance and the bell) is
  **word-boundary** and **diacritic-insensitive** (`helpers.js:61`).

**Consequence.** The accent fires on substrings the server rejects.

**Pinned by** `13-edge-sportscope-and-substring.json`, event `brooklyn`
(homeTeam `"Brooklyn FC"`):

| Predicate  | Result | Why                                                                        |
|------------|--------|----------------------------------------------------------------------------|
| `mustSee`  | `true` | `"brooklyn fc".includes("lyn")` → matches the tracked club **Lyn**         |
| `mustWatch`| `false`| word-boundary `containsName("Brooklyn FC", "Lyn")` → no boundary → no match|

The control event `valerenga-lyn` (a real Vålerenga–Lyn derby) matches on **both**
sides — so the divergence is specifically the substring false-positive, not Lyn
matching in general. (The reverse risk — the server's diacritic folding matching
`"Barça"`≡`"Barca"` where the client's plain lowercase would not — is not
currently exercised by a vector because the aliases list already carries both
spellings; noted here for the port.)

---

## 3. `mustWatch` (bell) and `mustSee` (accent) legitimately diverge

Direct fallout of finding §0. Representative, pinned cases:

| Case                                                   | `mustWatch` | `mustSee` | Vector                                   |
|--------------------------------------------------------|-------------|-----------|------------------------------------------|
| Favorite / importance≥4 event, no tracked entity       | `false`     | `true`    | `04-mustsee-favorite-importance.json`    |
| Norway men's national team (not in interests notify)   | `false`     | `true`    | `06-mustsee-tracked-team-and-national.json` (`norway`) |
| Golf lens — a non-tracked Norwegian in the field       | `false`     | `true`    | `05-mustsee-golf-lens.json` (`lens`)     |
| F1 session (F1 is a notify tournament)                 | `true`      | `false`   | `08-mustwatch-tournament-notify-gating.json` (`f1race`,`f1quali`) |
| Tour de France stage (TdF is a notify tournament)      | `true`      | `false`   | `08-…` (`tdfstage`)                      |

Reading: **the bell follows interests.json; the accent follows the goal's
"someone/something you clearly care about is on screen" heuristic.** They are not
meant to be equal. The Swift port must keep them as two functions.

---

## 4. `confidence` does not gate feed inclusion (but `ai-research` is no longer a free pass — WP-92)

`confidence` never gates the feed: an `ai-research` event that IS relevant reaches
the board whether it is `high` or `low`. The WP-15 NotificationPlanner may withhold
notifications for `confidence: low` without a fresh re-fetch, but the **feed** does
not filter on confidence today — the port must not "tighten" that by reflex.

**Changed by WP-92 (this is the deliberate re-freeze):** `source == "ai-research"`
is **no longer** a standalone relevance pass. An AI-found event now reaches the
board only if it *also* is a broadly-followed sport OR matches a tracked entity —
exactly like any other event. The old behaviour ("ai-research alone → relevant,
even in an unfollowed sport with no tracked entity") is gone.

**Pinned by** `12-edge-airesearch-lowconf-empty-streaming.json`:
- `ai-low-tennis` (low-confidence, tennis, no tracked player, `source:"ai-research"`)
  → `relevant: false` — dropped, because ai-research no longer rescues it and tennis
  is not broadly followed. *(Before WP-92 this was `relevant: true`.)*
- `ai-low-norsk` (low-confidence biathlon) → `relevant: true`, because **biathlon**
  is a broadly-followed sport — the AI find is preserved for a sport the owner
  follows wholesale, which is the whole point of keeping ai-research on the board.

---

## 5. Entity-gated sports: chess & esports need a SPORT-SCOPED entity match (WP-92)

The owner's interest in chess and CS2 is **precise, not broad**
(`interests.json`: "Sjakk på elite-nivå (Magnus Carlsen, Norway Chess, World
Championship)" and "CS2 esports KUN når 100 Thieves spiller"). WP-92 removed both
sports from the default `followBroadly` and gates them: a chess/esports event is
relevant **only** if a tracked entity matches it, and — unlike §1 — that match **is
sport-scoped**. The norwegian / favorite / importance / ai-research shortcuts do
**not** apply to a gated sport.

`followBroadly` still wins first, so an owner who explicitly adds `"chess"` to
`interests.json`'s `followBroadly` gets chess wholesale again — the gate only bites
sports that are *not* broadly followed.

**Pinned by** `14-relevance-entity-gated-chess-esports.json`:

| Event                                    | `relevant` | Why                                                                            |
|------------------------------------------|------------|--------------------------------------------------------------------------------|
| `chess-open-norsk` (norwegian:true)      | `false`    | gated: no tracked chess entity; norwegian does NOT rescue it (the live "Sant Martí" case) |
| `chess-barcelona` (title "Barcelona …")  | `false`    | gated + **sport-scoped**: the football club "Barcelona" cannot admit a chess event |
| `chess-carlsen`                          | `true`     | names Magnus Carlsen (tracked chess athlete)                                   |
| `cs2-100t` (homeTeam "100 Thieves")      | `true`     | names 100 Thieves (tracked esports team)                                       |
| `cs2-nygaard` (player "Håvard Nygaard")  | `true`     | names Håvard Nygaard (tracked esports athlete)                                 |
| `cs2-airesearch-other` (ai-research)     | `false`    | gated: two untracked teams; ai-research does NOT rescue it                      |

Contrast with §1: `relevant` stays **unscoped for non-gated sports** (the football
club "Barcelona" still pulls the tennis "Barcelona Open" onto the board). The
sport-scoping is applied *only* on the chess/esports gate — a targeted refinement,
not a reversal of §1.

---

## 6. The interests→catalog split: `relevant` now pins the client LENS (WP-96)

WP-96 (the flerbruker-split) separated two questions that used to be one:

| Question | Predicate | Where it lives (after WP-96) | Keyed off |
|----------|-----------|------------------------------|-----------|
| Does Sportivista **cover** this event? | `isCovered` | **server** `build-events.js` | `scripts/config/catalog.json` (what we cover) |
| Is this relevant to **THIS user**? | `isRelevant` (the lens) | **clients** — iOS `FeedCompiler.isRelevant`; the web board is catalog-wide | the user's personal profile (`interests.json` shape) |

Before WP-96 there was one user, so the server filtered the shared board directly
by that user's `interests.json`. An external tester who followed *other* chess
players / CS2 teams got an empty board — the server dropped the content before
their lens ever saw it. WP-96 makes the server scope to the **catalog** (a
moderate superset) and leaves the personal narrowing entirely to the client lens.

**Decision for these vectors — NOT re-frozen.** The golden vectors pin the
**personal lens** (`f(events, interests) → this user's feed`), and the lens
**algorithm did not change**: `followBroadly` wholesale → chess/esports
sport-scoped entity gate → norwegian/favorite/importance blanket → unscoped
tracked-entity match, over a personal profile (§1, §4, §5 all still hold verbatim).
What changed is only *where* that algorithm runs (server → clients) and *what
reaches it* (a catalog-scoped feed instead of a raw superset). So:

- The `relevant` expectation sets are **bit-identical** — they describe the lens,
  which is unchanged. iOS `FeedCompiler.isRelevant` and the JS `lensRelevant`
  reference (in `feed-vectors.test.js`, formerly `serverRelevant`) both still
  reproduce them.
- The JS reference does **not** share code with the new server `isCovered`
  (`isCovered` is a separate function keyed off `catalog.json`, tested in
  `tests/build-events.test.js` — including the WP-96 two-profile acceptance).
  So there is no coupling that would force a re-freeze.
- Practically: the two-profile test proves that ONE catalog-scoped server feed,
  passed through TWO disjoint client lenses, yields two disjoint meaningful feeds
  — and the owner's own lens yields exactly his historical feed.

The porter's contract is unchanged: reproduce `relevant` as the personal lens.
`isCovered` has no client mirror (clients never see the catalog) and is not part
of the cross-platform vector suite.

## 7. WP-162 — edition-stripped matching terms; the vectors are NOT re-frozen

WP-162 makes a follow survive a season/edition change: a rule frozen on last
season's entity (id `premier-league-2026-27`, name "Premier League 2026/27")
must keep matching next season's edition. Two of its three defences touch the
matching path the vectors pin:

- the term set an interest entity is matched by now ALSO carries the
  edition-stripped form of its name/aliases (JS `ssWithEditionlessTerms` in
  `docs/js/lens.js`, Swift `EffectiveInterests.seasonProof`), and
- the resolver resolves a former id through the published `altIds`.

**Decision: the golden vectors are NOT re-frozen — and a re-freeze here would have
been a red flag, not a fix.** The rule is that the vectors are re-frozen only if
the vector INPUTS actually carry an edition token on the *interest/profile* side,
because that is the only side the new term-stripping reads. They do not:

- No `interests`/profile entity in ANY vector has a `name` (or alias) carrying a
  4-digit year or `YYYY/YY` season token — verified by grep over every fixture.
  (Events carry years in their *titles/tournaments*, but a title is haystack, not
  a matched term, so stripping never runs on it.)
- Edition stripping is strictly ADDITIVE and never *shortens* a name into a
  different entity: "Tour de France Femmes 2026" strips to "Tour de France
  Femmes", never to "Tour de France" (a full word-boundary term, not a
  substring). So it cannot change an existing expected set even in principle.

Consequently every `relevant` / `mustWatch` / `mustSee` expected set is
bit-identical, and `feed-vectors.test.js` passes unchanged against both the
shipped `lens.js` and the Swift `FeedCompiler`. The new behaviour is proven by
its OWN dedicated suite instead — `tests/season-proof-follows.test.js` and
`SportivistaTests/SeasonProofFollowsTests.swift` ("a 2026 rule matches the 2027
edition") — exactly because it is a *new* capability over *new* inputs, not a
change to the frozen semantics.

## Summary for the porter

- Implement **three** predicates, not one. Keep the bell sport-scoped +
  word-boundary; keep relevance unscoped **except** the chess/esports gate (§5,
  sport-scoped); keep the accent's naive-substring behaviour (or change it
  *deliberately*, with a vector update + note).
- `isEventInWindow` is the shared truth — port it once, use it everywhere.
- Reproduce §1, §2, §4, §5 exactly to pass WP-13; if any is later judged a real
  bug, fix it in one place and update the affected vector in the same change.
