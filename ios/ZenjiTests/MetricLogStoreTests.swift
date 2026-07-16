//
//  MetricLogStoreTests.swift
//  ZenjiTests
//
//  WP-63 acceptance — the local MetricKit log's persistence + the anonymised
//  export contract, plus the pure histogram summarizer. Mirrors
//  MisunderstoodLogStoreTests: round-trip, most-recent-first ordering, the
//  per-kind capacity cap (oldest dropped first), corrupt/empty degradation, and
//  the privacy contract — the export carries ONLY durations / launch summaries /
//  app build / timestamp, never a device-generated id.
//
//  NOTE: MetricKit does NOT deliver payloads in the Simulator and its payload
//  types (MXMetricPayload / MXHistogram) have no public initializers, so these
//  tests drive the store + summarizer with SYNTHETIC value-type payloads — the
//  same shapes MetricSubscriber's MX-extraction produces. See MetricSubscriber's
//  header for the split.
//

import XCTest

final class MetricLogStoreTests: XCTestCase {

    private func tempStore() -> MetricLogStore {
        MetricLogStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("zenji-tests-\(UUID().uuidString)", isDirectory: true))
    }

    private func launch(_ kind: LaunchMetricSummary.Kind = .timeToFirstDraw, avg: Double = 250, version: String = "1", at t: TimeInterval = 1_700_000_000) -> LaunchMetricSummary {
        LaunchMetricSummary(
            kind: kind,
            histogram: HistogramSummary(sampleCount: 3, averageMs: avg, minMs: 100, maxMs: 400),
            appVersion: version,
            timestamp: Date(timeIntervalSince1970: t)
        )
    }

    private func hang(seconds: Double = 1.5, version: String = "1", at t: TimeInterval = 1_700_000_000) -> HangDiagnosticSummary {
        HangDiagnosticSummary(hangDurationSeconds: seconds, appVersion: version, timestamp: Date(timeIntervalSince1970: t))
    }

    // MARK: - Round trip

    func test_record_thenLoad_roundTripsBothKinds() {
        let store = tempStore()
        store.recordLaunches([launch(.timeToFirstDraw, avg: 300)])
        store.recordHangs([hang(seconds: 2.0)])

        let log = store.load()
        XCTAssertEqual(log.launches.count, 1)
        XCTAssertEqual(log.launches[0].kind, .timeToFirstDraw)
        XCTAssertEqual(log.launches[0].histogram.averageMs, 300)
        XCTAssertEqual(log.hangs.count, 1)
        XCTAssertEqual(log.hangs[0].hangDurationSeconds, 2.0)
    }

    func test_load_fromEmptyDirectory_isEmptyLog() {
        let log = tempStore().load()
        XCTAssertTrue(log.launches.isEmpty)
        XCTAssertTrue(log.hangs.isEmpty)
    }

    func test_load_corruptFile_isEmptyLog() throws {
        let store = tempStore()
        try Data("{ not json".utf8).write(to: store.directoryURL.appendingPathComponent(MetricLogStore.filename))
        let log = store.load()
        XCTAssertTrue(log.launches.isEmpty && log.hangs.isEmpty, "corrupt log must degrade to empty, never crash")
    }

    func test_emptyBatch_isNoOp() {
        let store = tempStore()
        store.recordLaunches([])
        store.recordHangs([])
        XCTAssertTrue(store.load().launches.isEmpty)
    }

    // MARK: - Ordering (most-recent first)

    func test_record_prependsMostRecentFirst() {
        let store = tempStore()
        store.recordHangs([hang(seconds: 1.0)])
        store.recordHangs([hang(seconds: 9.0)])
        XCTAssertEqual(store.load().hangs.map(\.hangDurationSeconds), [9.0, 1.0])
    }

    // MARK: - Capacity (per-kind, oldest dropped first)

    func test_capacity_dropsOldestBeyondCap_perKind() {
        let store = tempStore()
        for i in 0..<(MetricLogStore.capacity + 10) {
            store.recordHangs([hang(seconds: Double(i))])
        }
        let hangs = store.load().hangs
        XCTAssertEqual(hangs.count, MetricLogStore.capacity)
        // newest (cap+9) at the front; the oldest kept is index 10 (0...9 evicted).
        XCTAssertEqual(hangs.first?.hangDurationSeconds, Double(MetricLogStore.capacity + 9))
        XCTAssertEqual(hangs.last?.hangDurationSeconds, 10.0)
        XCTAssertFalse(hangs.contains { $0.hangDurationSeconds == 0.0 }, "the oldest entries are evicted first")
    }

    func test_capacity_launchesAndHangsAreIndependent() {
        let store = tempStore()
        for _ in 0..<(MetricLogStore.capacity + 5) { store.recordLaunches([launch()]) }
        store.recordHangs([hang()])
        let log = store.load()
        XCTAssertEqual(log.launches.count, MetricLogStore.capacity)
        XCTAssertEqual(log.hangs.count, 1, "capping one list must not touch the other")
    }

    func test_deleteAll_empties() {
        let store = tempStore()
        store.recordLaunches([launch()])
        store.recordHangs([hang()])
        store.deleteAll()
        let log = store.load()
        XCTAssertTrue(log.launches.isEmpty && log.hangs.isEmpty)
    }

    // MARK: - Export (the anonymised "Del telemetri" privacy contract)

    func test_exportPayload_carriesOnlyAllowedFields_neverAnId() throws {
        let store = tempStore()
        store.recordLaunches([launch(.resumeTime, avg: 120, version: "42")])
        store.recordHangs([hang(seconds: 3.25, version: "42")])

        let data = store.exportPayload()
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(root.keys), ["launches", "hangs"])

        let launches = try XCTUnwrap(root["launches"] as? [[String: Any]])
        XCTAssertEqual(Set(launches[0].keys), ["kind", "histogram", "appVersion", "timestamp"],
                       "a launch export carries no device-generated id")
        XCTAssertEqual(launches[0]["kind"] as? String, "resumeTime")
        XCTAssertEqual(launches[0]["appVersion"] as? String, "42")
        XCTAssertNil(launches[0]["id"], "the device-generated UUID never leaves the device")

        let hangs = try XCTUnwrap(root["hangs"] as? [[String: Any]])
        XCTAssertEqual(Set(hangs[0].keys), ["hangDurationSeconds", "appVersion", "timestamp"],
                       "a hang export carries no id and no call-stack")
        XCTAssertEqual(hangs[0]["hangDurationSeconds"] as? Double, 3.25)
        XCTAssertNil(hangs[0]["id"])
    }

    func test_exportPayload_emptyLog_isEmptyArrays() throws {
        let data = tempStore().exportPayload()
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual((root["launches"] as? [Any])?.count, 0)
        XCTAssertEqual((root["hangs"] as? [Any])?.count, 0)
    }

    // MARK: - HistogramSummary (pure summarizer, synthetic buckets)

    func test_histogramSummary_countWeightedAverageAndBounds() {
        // Two buckets: 3 samples around 150ms, 1 sample around 950ms.
        let buckets = [
            HistogramSummary.Bucket(startMs: 100, endMs: 200, count: 3),   // mid 150
            HistogramSummary.Bucket(startMs: 900, endMs: 1000, count: 1),  // mid 950
        ]
        let s = HistogramSummary.summarize(buckets)
        XCTAssertEqual(s.sampleCount, 4)
        // (150*3 + 950*1) / 4 = 350
        XCTAssertEqual(s.averageMs, 350, accuracy: 0.0001)
        XCTAssertEqual(s.minMs, 100)
        XCTAssertEqual(s.maxMs, 1000)
    }

    func test_histogramSummary_emptyOrZeroCount_isZeros() {
        XCTAssertEqual(HistogramSummary.summarize([]), HistogramSummary(sampleCount: 0, averageMs: 0, minMs: 0, maxMs: 0))
        let zero = [HistogramSummary.Bucket(startMs: 10, endMs: 20, count: 0)]
        XCTAssertEqual(HistogramSummary.summarize(zero), HistogramSummary(sampleCount: 0, averageMs: 0, minMs: 0, maxMs: 0))
    }

    func test_histogramSummary_ignoresZeroCountBucketsForBounds() {
        let buckets = [
            HistogramSummary.Bucket(startMs: 0, endMs: 5, count: 0),      // ignored
            HistogramSummary.Bucket(startMs: 100, endMs: 200, count: 2),
        ]
        let s = HistogramSummary.summarize(buckets)
        XCTAssertEqual(s.sampleCount, 2)
        XCTAssertEqual(s.minMs, 100, "a zero-count bucket must not drag min down")
        XCTAssertEqual(s.maxMs, 200)
    }
}
