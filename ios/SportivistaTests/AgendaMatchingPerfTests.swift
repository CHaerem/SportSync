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

    /// Best-of-`iterations` wall time for one `buildSections` (min discards
    /// scheduler noise — the standard way to read a micro-benchmark).
    private func minBuildSectionsTime(events: [Event], index: EntityIndex, iterations: Int = 5) -> TimeInterval {
        let interests = Interests(followBroadly: ["football"])
        var best = Double.infinity
        for _ in 0..<iterations {
            let start = DispatchTime.now().uptimeNanoseconds
            let sections = AgendaViewModel.buildSections(
                events: events, interests: interests, now: Self.now, index: index, followedIds: []
            )
            let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000_000
            XCTAssertFalse(sections.isEmpty, "the synthetic fixture must compile into a non-empty board")
            best = min(best, elapsed)
        }
        return best
    }

    // MARK: - The O(n²) guard (machine-independent)

    func test_buildSections_scalesLinearly_notQuadratically() {
        // Small and 2× scales. With the fast path each is O(events); the 2× scale
        // roughly doubles the time. A regression to the per-name scan makes it
        // O(events × entities): the 2× scale would ~QUADRUPLE. The 3.0 ceiling
        // sits above linear-plus-noise and well below the ~4× of a quadratic.
        let smallEvents = makeEvents(eventCount: 250, entityCount: 1_000)
        let smallIndex = makeIndex(entityCount: 1_000)
        let largeEvents = makeEvents(eventCount: 500, entityCount: 2_000)
        let largeIndex = makeIndex(entityCount: 2_000)

        // Warm caches / JIT-equivalent first pass, then measure.
        _ = minBuildSectionsTime(events: smallEvents, index: smallIndex, iterations: 1)
        _ = minBuildSectionsTime(events: largeEvents, index: largeIndex, iterations: 1)

        let small = minBuildSectionsTime(events: smallEvents, index: smallIndex)
        let large = minBuildSectionsTime(events: largeEvents, index: largeIndex)
        let ratio = large / max(small, 1e-9)

        print("WP-61 buildSections: small(250ev/1000ent)=\(String(format: "%.2f", small * 1000)) ms, large(500ev/2000ent)=\(String(format: "%.2f", large * 1000)) ms, ratio=\(String(format: "%.2f", ratio))")

        XCTAssertLessThan(ratio, 3.0, "doubling scale must stay ~linear (got \(String(format: "%.2f", ratio))×) — a quadratic regression in matching would be ~4×")
        // Generous absolute sanity cap so a catastrophic regression fails even if
        // the ratio test somehow doesn't. The tight < 50 ms acceptance target is
        // read from the printed figure above and documented in the PR (a hard
        // 50 ms CI assertion would flake under concurrent xcodebuild load).
        XCTAssertLessThan(large, 0.15, "scaled compile ran in \(String(format: "%.1f", large * 1000)) ms — far above the < 50 ms target, likely a matching regression")
    }

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
