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
| `relevant` | In the feed at all?      | server `isRelevant` + 14-day cutoff    | sport, norwegian, isFavorite, importance≥4, ai-research, any tracked entity (unscoped) |
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

## 4. `confidence` does not gate feed inclusion

`source == "ai-research"` makes an event `relevant` regardless of `confidence`
(`build-events.js:479`) — a `confidence: "low"` research event in an
otherwise-unfollowed sport still reaches the board.

**Pinned by** `12-edge-airesearch-lowconf-empty-streaming.json` (`ai-low-tennis`:
low-confidence, tennis, no tracked player → `relevant: true`).

This is not a server/client divergence, but it is a semantic the port must not
"tighten" by reflex: the WP-15 NotificationPlanner may withhold notifications for
`confidence: low` without a fresh re-fetch, but the **feed** does not filter on
confidence today.

---

## Summary for the porter

- Implement **three** predicates, not one. Keep the bell sport-scoped +
  word-boundary; keep relevance unscoped; keep the accent's naive-substring
  behaviour (or change it *deliberately*, with a vector update + note).
- `isEventInWindow` is the shared truth — port it once, use it everywhere.
- Reproduce §1, §2, §4 exactly to pass WP-13; if any is later judged a real bug,
  fix it in one place and update the affected vector in the same change.
