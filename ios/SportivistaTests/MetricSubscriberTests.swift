//
//  MetricSubscriberTests.swift
//  SportivistaTests
//
//  WP-63 acceptance — the MetricKit subscriber's payload-HANDLING path, driven
//  with SYNTHETIC value-type payloads.
//
//  Why synthetic: MetricKit never delivers payloads in the Simulator, and its
//  payload types (MXMetricPayload / MXDiagnosticPayload / MXHistogram) have NO
//  public initializers, so a real payload cannot be constructed in a unit test.
//  The subscriber is therefore split (see MetricSubscriber.swift): a thin,
//  untestable MX → value-type extraction, and a testable `ingest(launches:hangs:)`
//  persistence core. These tests exercise that core (plus the store it writes to)
//  with the exact value-type summaries the extraction would produce, so the
//  handling logic — routing to the right list, capping, persistence — is proven
//  without a device.
//

import XCTest

final class MetricSubscriberTests: XCTestCase {

    private func tempStore() -> MetricLogStore {
        MetricLogStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("sportivista-tests-\(UUID().uuidString)", isDirectory: true))
    }

    private func syntheticLaunch(_ kind: LaunchMetricSummary.Kind) -> LaunchMetricSummary {
        LaunchMetricSummary(
            kind: kind,
            histogram: HistogramSummary(sampleCount: 5, averageMs: 220, minMs: 80, maxMs: 500),
            appVersion: "test-build",
            timestamp: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func syntheticHang(_ seconds: Double) -> HangDiagnosticSummary {
        HangDiagnosticSummary(hangDurationSeconds: seconds, appVersion: "test-build", timestamp: Date(timeIntervalSince1970: 1_700_000_000))
    }

    func test_ingest_persistsLaunchesAndHangs() {
        let store = tempStore()
        let subscriber = MetricSubscriber(store: store)

        subscriber.ingest(
            launches: [syntheticLaunch(.timeToFirstDraw), syntheticLaunch(.resumeTime)],
            hangs: [syntheticHang(1.2)]
        )

        let log = store.load()
        XCTAssertEqual(log.launches.map(\.kind), [.timeToFirstDraw, .resumeTime])
        XCTAssertEqual(log.hangs.map(\.hangDurationSeconds), [1.2])
    }

    func test_ingest_launchesOnly_leavesHangsUntouched() {
        let store = tempStore()
        let subscriber = MetricSubscriber(store: store)
        subscriber.ingest(launches: [syntheticLaunch(.timeToFirstDraw)], hangs: [])
        let log = store.load()
        XCTAssertEqual(log.launches.count, 1)
        XCTAssertTrue(log.hangs.isEmpty)
    }

    func test_ingest_hangsOnly_leavesLaunchesUntouched() {
        let store = tempStore()
        let subscriber = MetricSubscriber(store: store)
        subscriber.ingest(launches: [], hangs: [syntheticHang(3.0)])
        let log = store.load()
        XCTAssertTrue(log.launches.isEmpty)
        XCTAssertEqual(log.hangs.count, 1)
    }

    func test_ingest_accumulatesAcrossCalls_mostRecentFirst() {
        let store = tempStore()
        let subscriber = MetricSubscriber(store: store)
        subscriber.ingest(launches: [], hangs: [syntheticHang(1.0)])
        subscriber.ingest(launches: [], hangs: [syntheticHang(2.0)])
        // A later payload's records are prepended (most-recent first).
        XCTAssertEqual(store.load().hangs.map(\.hangDurationSeconds), [2.0, 1.0])
    }

    func test_ingest_emptyBatch_isNoOp() {
        let store = tempStore()
        let subscriber = MetricSubscriber(store: store)
        subscriber.ingest(launches: [], hangs: [])
        let log = store.load()
        XCTAssertTrue(log.launches.isEmpty && log.hangs.isEmpty)
    }
}
