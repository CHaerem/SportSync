# Web ↔ app parity — how the two stay in sync

The personalization domain is implemented on both platforms: **iOS Swift** (native,
the primary) and **web JS** (a calm secondary surface). A native SwiftUI app and an
HTML/DOM web app cannot share one runtime — and the WidgetKit extension (30MB, no
JSCore) forces a native Swift lens to exist regardless — so a small algorithm
surface is deliberately **twinned**. The discipline: **single-source the DATA,
twin the ALGORITHMS, machine-guard the drift.**

## Single-sourced (edit ONE file, both platforms follow)

| Data | File | iOS reads via | Web reads via |
|---|---|---|---|
| Lens tunables | `docs/config/lens-config.json` | `Feed/LensConfig.swift` (bundled, incl. widget) | `docs/js/lens.js` (fetch + baked-in fallback) |
| Assistant vocabulary | `docs/config/assistant-vocab.json` | `Assistant/AssistantVocab.swift` (bundled, app+tests, NOT widget) | `docs/js/assistant.js` (fetch + baked-in fallback) |
| Golden feed vectors | `tests/fixtures/feed-vectors/*.json` | `FeedVectorTests` | `tests/feed-vectors.test.js` |
| Profile CRDT vectors | `tests/fixtures/profile-payloads/*` + `tests/profile-vectors.test.js` | `ProfileCodecGoldenTests` | `tests/profile-codec-golden.test.js` |

Both platforms carry a **baked-in fallback** identical to the JSON (so a missing
bundle degrades, never crashes) — pinned by coherence tests
(`tests/assistant-vocab.test.js` + `AssistantVocabTests.swift`).

## Twinned + pinned (edit TWO files, CI catches a forgotten side)

- **Lens predicates** — `docs/js/lens.js` ↔ `ios/Sportivista/Feed/FeedCompiler.swift`.
  Pinned bit-for-bit by the 14 feed-vectors replayed on both sides. Deliberate
  divergences live in `tests/fixtures/feed-vectors/DIVERGENCES.md` (e.g. must-see
  naive-substring vs word-boundary — do NOT "unify").
- **Profile CRDT + codec** — `docs/js/profile-sync.js` ↔ `ProfileMerge.swift` /
  `ProfileSyncModel.swift` / `ProfileShareCodec.swift`. Pinned by the cross-platform
  codec golden. Contract is **decode-compatibility, not byte-identity** (Apple `.zlib`
  and Node `deflate-raw` emit different valid bytes).
- **Deterministic assistant** — `docs/js/assistant.js` ↔ `Assistant/AgendaFilter.swift`
  + `FeedQuery.swift` + parsers. The web is a deliberate SUBSET (a calm floor); iOS is
  the superset (EntityIndex fuzzy resolution, the Foundation-Models path, memory).

## The maintenance rules

- **Tunable / vocabulary change** → edit ONE json in `docs/config/`. Both follow. No
  code. (Update the baked-in fallback + the coherence test if you add a field.)
- **Lens algorithm change** → edit `lens.js` **and** `FeedCompiler.swift` in the same
  commit; add/update a feed-vector. Either suite alone failing = a forgotten side.
- **Assistant semantic change** → edit `assistant.js` **and** the Swift parser; add a
  case to `eval-corpus.json` first (corpus-driven).
- **Codec change** → regenerate the Swift golden (`TEST_RUNNER_DUMP_GOLDEN=1`, see
  `profile-codec-golden.test.js`) + both fixtures. Decode-compat is the contract.

## The tripwire (when to reconsider a shared runtime)

Consolidation to a single runtime was evaluated (SwiftWasm, JavaScriptCore) and
rejected: the widget keeps a native Swift lens forever, the web has no build step,
and "same semantics, mechanically pinned" is already the real invariant. BUT — **if
the web assistant is ever promoted to a first-class, feature-parity surface** (full
FeedQuery search + entity resolution + memory), the duplicated deterministic surface
would grow from ~180 to ~1500+ lines and churn per feature. At that point, revisit a
single JS deterministic-assistant core run via `JSContext` in the **main app only**
(widget + Foundation-Models path untouched; lens/CRDT stay twinned). The shared
`eval-corpus.json` gate is the safety net that migration would need.
