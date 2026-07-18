//
//  MetricSubscriber.swift
//  Sportivista
//
//  WP-63 — the `MXMetricManager` subscriber that turns MetricKit's daily
//  payloads into the compact, local `MetricLogStore` records (MetricLog.swift).
//  Started once from `SportivistaApp.init` (collection runs in Release too — that is
//  the whole point: catch REAL on-device hangs / slow launches); the export UI
//  is DEBUG-only and lives on the eval surface (EvalView).
//
//  Testability note: MetricKit does NOT deliver payloads in the Simulator, and
//  `MXMetricPayload` / `MXHistogram` have no public initializers — so a real
//  payload cannot be synthesized in a unit test. The design splits accordingly:
//  the thin MX → value-type extraction below is NOT unit-tested (nothing to
//  feed it), while everything it feeds — `HistogramSummary.summarize`, the
//  store's capping/persistence, the anonymised export, and this subscriber's
//  own `ingest(launches:hangs:)` persistence path — IS unit-tested with
//  SYNTHETIC value-type payloads (see MetricSubscriberTests / MetricLogStoreTests).
//

import Foundation
#if canImport(MetricKit)
import MetricKit
#endif

/// Subscribes to `MXMetricManager` and persists launch + hang summaries locally.
/// `@unchecked Sendable`: MetricKit may call back on a background queue; the only
/// mutable state is the value-type `MetricLogStore`, whose writes are atomic
/// file writes, so there is nothing to race.
final class MetricSubscriber: NSObject, @unchecked Sendable {
    private let store: MetricLogStore

    init(store: MetricLogStore = MetricLogStore()) {
        self.store = store
        super.init()
    }

    /// Register with the shared metric manager (idempotent per Apple's contract).
    /// A no-op where MetricKit is unavailable.
    func start() {
        #if canImport(MetricKit)
        MXMetricManager.shared.add(self)
        #endif
    }

    /// Unregister — mainly for symmetry / tests; the app keeps one subscriber
    /// alive for its whole lifetime.
    func stop() {
        #if canImport(MetricKit)
        MXMetricManager.shared.remove(self)
        #endif
    }

    /// The TESTABLE core: persist already-extracted summaries. The real
    /// `didReceive` extracts these from MX payloads and calls this; tests call it
    /// directly with synthetic value-type summaries (there is no way to build a
    /// real MX payload — see the file header).
    func ingest(launches: [LaunchMetricSummary], hangs: [HangDiagnosticSummary]) {
        store.recordLaunches(launches)
        store.recordHangs(hangs)
    }
}

#if canImport(MetricKit)
extension MetricSubscriber: MXMetricManagerSubscriber {
    /// Regular daily metrics — we keep the app-launch histograms.
    func didReceive(_ payloads: [MXMetricPayload]) {
        let launches = payloads.flatMap { Self.launchSummaries(from: $0) }
        ingest(launches: launches, hangs: [])
    }

    /// Diagnostics (iOS 14+) — we keep hangs.
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let hangs = payloads.flatMap { Self.hangSummaries(from: $0) }
        ingest(launches: [], hangs: hangs)
    }

    // MARK: - MX → value-type extraction (thin glue; not unit-tested, see header)

    /// Extract time-to-first-draw + resume-time launch summaries from one payload.
    static func launchSummaries(from payload: MXMetricPayload) -> [LaunchMetricSummary] {
        // `applicationLaunchMetrics` is a single (nullable) MXAppLaunchMetric —
        // the plural name is Apple's, not an array.
        guard let launch = payload.applicationLaunchMetrics else { return [] }
        let version = payload.latestApplicationVersion
        let end = payload.timeStampEnd
        var out: [LaunchMetricSummary] = []
        let firstDraw = buckets(launch.histogrammedTimeToFirstDraw)
        if !firstDraw.isEmpty {
            out.append(LaunchMetricSummary(kind: .timeToFirstDraw, histogram: .summarize(firstDraw), appVersion: version, timestamp: end))
        }
        let resume = buckets(launch.histogrammedApplicationResumeTime)
        if !resume.isEmpty {
            out.append(LaunchMetricSummary(kind: .resumeTime, histogram: .summarize(resume), appVersion: version, timestamp: end))
        }
        return out
    }

    /// Extract one summary per hang in a diagnostic payload.
    static func hangSummaries(from payload: MXDiagnosticPayload) -> [HangDiagnosticSummary] {
        guard let hangs = payload.hangDiagnostics else { return [] }
        return hangs.map { hang in
            HangDiagnosticSummary(
                hangDurationSeconds: hang.hangDuration.converted(to: .seconds).value,
                appVersion: hang.metaData.applicationBuildVersion,
                timestamp: payload.timeStampEnd
            )
        }
    }

    /// Flatten an `MXHistogram<UnitDuration>` into the plain `Bucket` values the
    /// pure summarizer consumes (milliseconds).
    private static func buckets(_ histogram: MXHistogram<UnitDuration>) -> [HistogramSummary.Bucket] {
        var out: [HistogramSummary.Bucket] = []
        let enumerator = histogram.bucketEnumerator
        while let bucket = enumerator.nextObject() as? MXHistogramBucket<UnitDuration> {
            out.append(HistogramSummary.Bucket(
                startMs: bucket.bucketStart.converted(to: .milliseconds).value,
                endMs: bucket.bucketEnd.converted(to: .milliseconds).value,
                count: bucket.bucketCount
            ))
        }
        return out
    }
}
#endif
