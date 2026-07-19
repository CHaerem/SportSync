//
//  AgendaMatchingPerfTests.swift
//  SportivistaTests
//
//  WP-61 — ytelse blir en testport. Before this package `followableEntities`
//  called `EntityIndex.resolve` (a full entity scan + Levenshtein per one) three
//  times per agenda row, so a compile was O(events × entities) — fine at the 52-
//  entity fixture, quadratic at commercial scale. The fast `servedEntity`
//  (exact/initials maps, fuzzy only on a miss) makes each name lookup O(1) on the
//  common path, so a compile is O(events).
//
//  These tests are the guard. The synthetic fixture (~500 events / 2000 entities)
//  is generated deterministically IN CODE — never a checked-in megabyte of JSON.
//  `test_buildSections_scalesLinearly…` is the machine-independent O(n²) catch:
//  doubling BOTH events and entities must roughly DOUBLE the time (linear), not
//  quadruple it (quadratic), so a regression that restores the per-name scan
//  fails here regardless of how fast the host is. The `measure {}` blocks record
//  the wall-clock baselines the acceptance target (< 50 ms for the scaled compile
//  on the dev Mac) is read against; the measured figure is documented in the PR.
//

import XCTest

final class AgendaMatchingPerfTests: XCTestCase {

    /// A fresh ISO formatter — `ISO8601DateFormatter` is not `Sendable`, so it is
    /// never held in shared static state (Swift 6 strict concurrency).
    private static func isoFormatter() -> ISO8601DateFormatter {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f
    }

    // Fixed clock so the whole synthetic fixture is deterministic and inside the
    // relevance window (events are spread across the next 10 days).
    private static let now: Date = isoFormatter().date(from: "2026-07-13T08:00:00Z")!

    /// `entityCount` entities with distinct, exactly-matchable names + aliases —
    /// the realistic case where an event's team/tournament name IS a known
    /// entity, so the exact fast path carries it (and a regression to the scan
    /// pays the full O(entities) cost per name).
    private func makeIndex(entityCount: Int) -> EntityIndex {
        var entities: [Entity] = []
        entities.reserveCapacity(entityCount)
        for i in 0..<entityCount {
            entities.append(Entity(
                id: "klubb-\(i)", name: "Klubb Nummer \(i)", aliases: ["KN\(i)"],
                sport: "football", type: "team"
            ))
        }
        return EntityIndex(entities)
    }

    /// `eventCount` relevant football events, each referencing three entity NAMES
    /// (home / away / tournament) so every row exercises `followableEntities`.
    private func makeEvents(eventCount: Int, entityCount: Int) -> [Event] {
        var events: [Event] = []
        events.reserveCapacity(eventCount)
        let iso = Self.isoFormatter()
        for i in 0..<eventCount {
            let home = i % entityCount
            let away = (i * 7 + 3) % entityCount
            let tour = (i * 3 + 1) % entityCount
            let dayOffset = Double(i % 10)
            let hour = Double(10 + (i % 9))
            let time = Self.now.addingTimeInterval(dayOffset * 86_400 + hour * 3_600)
            events.append(EventBuilder.make(
                sport: "football",
                title: "Kamp \(i)",
                time: iso.string(from: time),
                homeTeam: "Klubb Nummer \(home)",
                awayTeam: "Klubb Nummer \(away)",
                tournament: "Klubb Nummer \(tour)"
            ))
        }
        return events
    }

    /// Wall time for ONE `buildSections`, asserting the fixture compiled.
    private func oneBuildSectionsTime(events: [Event], index: EntityIndex, interests: Interests) -> TimeInterval {
        let start = DispatchTime.now().uptimeNanoseconds
        let sections = AgendaViewModel.buildSections(
            events: events, interests: interests, now: Self.now, index: index, followedIds: []
        )
        let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000_000
        XCTAssertFalse(sections.isEmpty, "the synthetic fixture must compile into a non-empty board")
        return elapsed
    }

    /// One scale to benchmark — its events + the matching index.
    private struct Scale { let events: [Event]; let index: EntityIndex }

    /// Best-of-`iterations` wall times for the small and large scales, measured
    /// **INTERLEAVED**: within each iteration the small compile is timed and then
    /// IMMEDIATELY the large one, and `min` is taken per scale across iterations
    /// (min discards scheduler noise — the standard way to read a micro-benchmark).
    ///
    /// Why interleave instead of two separate 5-iteration blocks (the WP-61
    /// original): on a SHARED CI runner a burst of neighbour load can land during
    /// one measurement block and not the other, inflating only that block's `min`
    /// and skewing the ratio. Timing both scales back-to-back each iteration makes
    /// them share the same instantaneous machine state, so transient load lifts
    /// BOTH and the ratio stays honest — while a genuine O(n²) regression makes
    /// the large scale ~4× the small in EVERY iteration regardless of load. (See
    /// the 19.07 incident documented in the ratio test below.)
    private func interleavedMinTimes(small: Scale, large: Scale, iterations: Int = 5) -> (small: TimeInterval, large: TimeInterval) {
        let interests = Interests(followBroadly: ["football"])
        var bestSmall = Double.infinity
        var bestLarge = Double.infinity
        for _ in 0..<iterations {
            bestSmall = min(bestSmall, oneBuildSectionsTime(events: small.events, index: small.index, interests: interests))
            bestLarge = min(bestLarge, oneBuildSectionsTime(events: large.events, index: large.index, interests: interests))
        }
        return (bestSmall, bestLarge)
    }

    // MARK: - The O(n²) guard (machine-independent)

    func test_buildSections_scalesLinearly_notQuadratically() {
        // Small and 2× scales. With the fast path each is O(events); the 2× scale
        // roughly doubles the time. A regression to the per-name scan makes it
        // O(events × entities): the 2× scale would ~QUADRUPLE. The 3.0 ceiling
        // sits above linear-plus-noise and well below the ~4× of a quadratic.
        let small = Scale(events: makeEvents(eventCount: 250, entityCount: 1_000), index: makeIndex(entityCount: 1_000))
        let large = Scale(events: makeEvents(eventCount: 500, entityCount: 2_000), index: makeIndex(entityCount: 2_000))

        // Warm caches / JIT-equivalent first pass, then measure.
        _ = interleavedMinTimes(small: small, large: large, iterations: 1)

        // Robustness on a SHARED runner (19.07 incident): CI read a spurious
        // 6.03× ratio on byte-identical code that measured 2.26× locally — the
        // runner was 2.3× slower AND a load burst fell between the two separate
        // sequential measurement blocks the WP-61 original used. Two changes make
        // the guard immune WITHOUT weakening the O(n²) catch: (a) each measurement
        // is now INTERLEAVED (see `interleavedMinTimes`), so both scales share the
        // same instantaneous load and the ratio is load-independent; and (b) the
        // ratio check runs up to `maxAttempts` times and only FAILS when EVERY
        // attempt breaches the ceiling. A real quadratic regression is
        // deterministic — it breaches on every attempt — whereas a one-off runner
        // hiccup that skews a single attempt is absorbed by the next clean one.
        let maxAttempts = 3
        let ceiling = 3.0
        var attempts: [(small: TimeInterval, large: TimeInterval, ratio: Double)] = []
        for attempt in 1...maxAttempts {
            let (s, l) = interleavedMinTimes(small: small, large: large)
            let ratio = l / max(s, 1e-9)
            attempts.append((s, l, ratio))
            print("WP-61 buildSections attempt \(attempt)/\(maxAttempts): small(250ev/1000ent)=\(ms(s)) ms, large(500ev/2000ent)=\(ms(l)) ms, ratio=\(fmt(ratio))")
            if ratio < ceiling {
                // A clean attempt clears the guard — stop retrying. Also read the
                // generous absolute sanity cap off this clean attempt so a
                // catastrophic regression fails even if the ratio somehow doesn't.
                // The tight < 50 ms acceptance target is read from the printed
                // figure and documented in the PR (a hard 50 ms CI assertion would
                // flake under concurrent xcodebuild load).
                XCTAssertLessThan(l, 0.15, "scaled compile ran in \(ms(l)) ms — far above the < 50 ms target, likely a matching regression")
                return
            }
        }
        // Every attempt breached the ceiling → a real, deterministic regression,
        // not runner noise (which would have produced at least one clean attempt).
        let last = attempts[maxAttempts - 1]
        XCTFail("doubling scale stayed above the ~linear ceiling on all \(maxAttempts) attempts (last \(fmt(last.ratio))×, small=\(ms(last.small)) ms large=\(ms(last.large)) ms) — a quadratic regression in matching would be ~4×")
    }

    private func ms(_ seconds: TimeInterval) -> String { String(format: "%.2f", seconds * 1000) }
    private func fmt(_ ratio: Double) -> String { String(format: "%.2f", ratio) }

    // MARK: - Recorded baselines (measure {})

    func test_measure_buildSections_atScale() {
        let events = makeEvents(eventCount: 500, entityCount: 2_000)
        let index = makeIndex(entityCount: 2_000)
        let interests = Interests(followBroadly: ["football"])
        measure {
            _ = AgendaViewModel.buildSections(
                events: events, interests: interests, now: Self.now, index: index, followedIds: []
            )
        }
    }

    func test_measure_feedProviderBuild_atScale() {
        // The assistant's feed provider (FeedQuery.build) over the same scaled
        // event set — the second hot compile the audit named. It does not touch
        // the entity index, so it is a plain linear baseline, recorded here so a
        // future regression in the relevance/format pass is visible too.
        let events = makeEvents(eventCount: 500, entityCount: 2_000)
        let interests = Interests(followBroadly: ["football"])
        measure {
            _ = FeedQuery.build(events: events, interests: interests, now: Self.now)
        }
    }
}
