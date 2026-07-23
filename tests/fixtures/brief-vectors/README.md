# Golden brief vectors (WP-174)

These fixtures freeze the **composition** of «Min brief» — the deterministic,
on-device personal brief («I din verden i dag …») — as pure declarative JSON.
They are the contract the brief composer must satisfy **bit-for-bit on both
platforms**:

- web: `docs/js/brief.js` → `ssComposeBrief(context)`
- iOS: `ios/Sportivista/News/MinBrief.swift` → `MinBrief.compose(context:)`

`tests/brief.test.js` (JS) and `ios/SportivistaTests/MinBriefTests.swift` (Swift)
each decode the **same** files and assert the **same** expected string. This is
the same twin discipline as the feed-vectors (`../feed-vectors/`): the two
implementations can never drift, because a drift fails one runner against the
frozen fasit.

> **These vectors pin the COMPOSER, not the SELECTION.** The composer turns an
> already-selected *semantic context* into text. Which events/results/news land
> in that context is each platform's own job (it reuses the already-twinned
> relevance lens, result rows, and news lens), tested per platform and noted in
> [`DIVERGENCES.md`](./DIVERGENCES.md). Freezing the composer is what makes the
> USER-VISIBLE text identical for identical input.

## Layout

```
tests/fixtures/brief-vectors/
  NN-slug.json      one vector = one self-contained { input, expected } case
  README.md         this file
  DIVERGENCES.md    the one platform difference (web has no spoiler shield)
```

Each `NN-slug.json` is standalone: `input` is a full `BriefContext`, `expected`
is the composed string. Decode one file, run `compose(input)`, compare to
`expected.brief`.

## Fixture schema

```jsonc
{
  "name": "short human title",
  "description": "what this vector proves",
  "input": {
    // The SEMANTIC context the composer consumes. Nearest-first / newest-first
    // is the platform's job; the composer caps the DISPLAY (2 upcoming, 2
    // results).
    "upcoming": [
      {
        "title":   "Lyn – Sogndal",         // plain (un-escaped) event title
        "day":     "today",                  // "today" | "tomorrow" | "later"
        "evening": true,                     // today AND Oslo start hour ≥ 18
        "time":    "19:00",                  // Oslo "HH:mm", or "" for multi-day
        "weekday": ""                        // Norwegian weekday, used when day=="later"
      }
    ],
    "results": [
      {
        "title":   "Lyn – Sogndal",          // OUTCOME-NEUTRAL (never "winner – loser")
        "outcome": "2–1",                    // the spoiler-carrying payload
        "kind":    "score",                  // "score" (football) | "winner" (golf/F1/…)
        "spoiler": false,                    // a screened entity → outcome hidden
        "day":     "yesterday"               // "yesterday" | "today" | "earlier"
      }
    ],
    "newsCount": 0                            // count of lens-matched news items
  },
  "expected": { "brief": "I din verden i dag: …" }   // "" ⇒ nothing to say → fallback
}
```

## The composition (exact semantics)

Priority order of GROUPS: **upcoming → results → news**. The first present group
attaches to the frame with `": "`; each later group is its own sentence
(first-letter capitalised). Empty context ⇒ `""` (the caller falls back to the
editorial line — never an empty «I din verden»).

- **Frame.** `«I din verden i kveld»` when the first upcoming item is today AND
  `evening`, else `«I din verden i dag»`.
- **Upcoming fragment.**
  - today → `"{title} {time}"` (or just `"{title}"` when `time == ""`)
  - tomorrow → `"{title} i morgen {time}"` (or `"{title} i morgen"`)
  - later → `"{title} {weekday}"` (or `"{title}"`)
- **Result fragment.** `suffix` = `" i går"` / `" i dag"` / `""` by `day`.
  - `spoiler` → `"resultatet fra {title}{suffix} venter på deg"` (NO outcome)
  - `kind == "score"` → `"{title} endte {outcome}{suffix}"`
  - `kind == "winner"` → `"{title} ble vunnet av {outcome}{suffix}"`
- **News fragment.** `"én nyhet om det du følger"` (n==1) / `"{n} nyheter om det du følger"`.
- **List join.** `"a"` / `"a og b"` / `"a, b og c"` (Norwegian «og»).
- **Max length.** The whole brief is clamped to **220 characters**: keep whole
  sentences from the front while they fit; if even the first sentence alone
  overflows, truncate it at a word boundary and append `«…»`.

## Running

```
npx vitest run brief          # JS composer against these vectors
# iOS: the MinBriefTests target decodes the same files (project.yml folder ref)
```
