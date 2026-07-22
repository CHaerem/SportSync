# Brief-vector divergences (pinned)

The **composer** (`ssComposeBrief` ↔ `MinBrief.compose`) is a strict twin: same
input context → same string, frozen by every `NN-*.json` here. The only place
the two platforms differ is in how they BUILD the context from raw data — and
there is exactly one such difference worth recording.

## §1 — Web has no spoiler shield

The spoiler shield (`Memory/Spoiler.swift`) is an iOS-only, on-device feature:
it needs the personal "I watch this on tape" memory that never leaves the device
(WP-30). The web has no equivalent — its RESULTAT section already shows scores
openly.

Consequence for the brief:

- **iOS** sets `ResultItem.spoiler` from `SpoilerShield.isSpoilerSensitive`, so a
  screened entity's result is composed as «resultatet fra X venter på deg».
- **Web** always sets `spoiler: false` (`Dashboard.briefResultSpoiler` is a seam
  that returns `false`), so a web result is always composed with its outcome.

This is **not** a composer divergence: the composer's spoiler branch is one
algorithm, pinned by the fixtures (`08-spoiler-result.json`,
`11-full-three-sentences.json`) and exercised by the iOS context-builder tests.
Only the *input flag* is platform-dependent — exactly parallel to the
feed-vectors' server/client matcher differences, and consistent with each
platform's existing result surface.

## §2 — Selection is parallel-by-rule, not fixture-pinned

The composer is pinned by shared fixtures; the SELECTION (which upcoming events /
results / news items reach the context) reuses each platform's already-twinned
machinery:

- upcoming — a follow-match predicate (`Dashboard.briefFollowMatchesEvent` ↔
  `NewsLens.matchesEvent`), upcoming within a 7-day horizon, nearest first, cap 2;
- results — the lens-filtered result rows (`resultItems()` ↔
  `NewsBoard.resultRows`), newest first, cap 2, kept only when they render
  meaningfully (an outcome, or spoiler-screened);
- news — the count of lens-matched news items (`ssNewsRelevant` ↔
  `NewsLens.matches`).

These predicates already have their own twin coverage (news-web / NewsLens
tests, feed-vectors). The per-platform selection tests
(`tests/brief.test.js` web scenarios, `MinBriefTests` build tests) prove each
side assembles a sensible context from raw data; the shared fixtures prove the
composition is identical.
