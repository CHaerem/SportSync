//
//  MetricLog.swift
//  Sportivista
//
//  WP-63 — the LOCAL, PRIVATE MetricKit log: compact summaries of the two
//  signals worth keeping on device — app-launch times (`MXAppLaunchMetric`) and
//  hangs (`MXHangDiagnostic`). Persisted exactly like `MisunderstoodLogStore`:
//  one JSON file in Application Support, capped (oldest dropped first), no App
//  Group dependency (works on the free-account `SportivistaDeviceDev` build too).
//
//  Hard privacy contract, identical to MisunderstoodLog: this log is LOCAL AND
//  PRIVATE. There is no network code anywhere in this file — the only way any
//  of it leaves the device is the owner tapping "Del telemetri" on the DEBUG
//  eval surface, and even then only the anonymised `exportPayload()` fields go
//  out (durations / launch-time summaries / app build / timestamp — never a
//  device-generated id, never a raw call-stack, never anything identifying).
//
//  These are deliberately compact SUMMARIES, not raw MetricKit payloads: the
//  fine-grained call stacks that pinpoint WHERE a hang happened come from the
//  os_signpost intervals in Instruments (PerfSignpost.swift) and Xcode's
//  Organizer; this log just answers "did a hang/slow-launch happen, how long,
//  on which build" so a real on-device regression is visible without repro.
//

import Foundation

/// A compact, anonymised summary of one MetricKit duration histogram (used for
/// the launch-time metrics). Reduced to plain numbers so the summarizer is
/// testable WITHOUT a real `MXHistogram` — which has no public initializer and
/// which MetricKit never delivers in the Simulator anyway (see MetricSubscriber).
struct HistogramSummary: Codable, Equatable, Sendable {
    /// Total samples across all buckets.
    var sampleCount: Int
    /// Count-weighted mean, using each bucket's midpoint as its representative
    /// value (MetricKit gives bucketed data, not raw samples).
    var averageMs: Double
    /// Lowest bucket start / highest bucket end with any samples.
    var minMs: Double
    var maxMs: Double

    /// One histogram bucket reduced to plain numbers — the value type the pure
    /// summarizer consumes and the tests synthesize.
    struct Bucket: Equatable, Sendable {
        var startMs: Double
        var endMs: Double
        var count: Int
    }

    /// Reduce buckets to count + count-weighted average + min/max. An empty or
    /// all-zero-count input summarizes to zeros (a legitimate "no samples" state).
    static func summarize(_ buckets: [Bucket]) -> HistogramSummary {
        let total = buckets.reduce(0) { $0 + $1.count }
        guard total > 0 else { return HistogramSummary(sampleCount: 0, averageMs: 0, minMs: 0, maxMs: 0) }
        var weighted = 0.0
        var minMs = Double.greatestFiniteMagnitude
        var maxMs = 0.0
        for b in buckets where b.count > 0 {
            let mid = (b.startMs + b.endMs) / 2
            weighted += mid * Double(b.count)
            minMs = min(minMs, b.startMs)
            maxMs = max(maxMs, b.endMs)
        }
        return HistogramSummary(sampleCount: total, averageMs: weighted / Double(total), minMs: minMs, maxMs: maxMs)
    }
}

/// One persisted app-launch metric summary (`MXAppLaunchMetric`). `id` is a
/// device-generated UUID kept ONLY for local list identity — it is deliberately
/// dropped from the export (see `MetricLogStore.Export`).
struct LaunchMetricSummary: Codable, Equatable, Identifiable, Sendable {
    /// Which launch phase this histogram measures.
    enum Kind: String, Codable, Sendable {
        case timeToFirstDraw
        case resumeTime
    }
    var id: UUID
    var kind: Kind
    var histogram: HistogramSummary
    /// The app build the metric was gathered on (`MXMetaData` / payload version).
    var appVersion: String
    /// The MetricKit reporting window's end (payloads arrive ~daily, aggregated).
    var timestamp: Date

    init(id: UUID = UUID(), kind: Kind, histogram: HistogramSummary, appVersion: String, timestamp: Date) {
        self.id = id
        self.kind = kind
        self.histogram = histogram
        self.appVersion = appVersion
        self.timestamp = timestamp
    }
}

/// One persisted hang summary (`MXHangDiagnostic`). Just the fact + duration +
/// build — the "where" is read from the os_signpost intervals in Instruments,
/// not stored here (privacy + boundedness).
struct HangDiagnosticSummary: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    var hangDurationSeconds: Double
    var appVersion: String
    var timestamp: Date

    init(id: UUID = UUID(), hangDurationSeconds: Double, appVersion: String, timestamp: Date) {
        self.id = id
        self.hangDurationSeconds = hangDurationSeconds
        self.appVersion = appVersion
        self.timestamp = timestamp
    }
}

/// Local, private persistence + the anonymised export shape. No network code
/// anywhere — every method is a pure local file read/write, mirroring
/// `MisunderstoodLogStore`.
struct MetricLogStore: Sendable {
    static let filename = "metric-log.json"
    /// Oldest entries are dropped first once EITHER list holds more than this —
    /// keeps the file (and the on-device history) bounded forever. Per-kind cap.
    static let capacity = 50

    /// The on-disk shape: two independently-capped, most-recent-first lists.
    struct Log: Codable, Equatable, Sendable {
        var launches: [LaunchMetricSummary] = []
        var hangs: [HangDiagnosticSummary] = []
    }

    let directoryURL: URL

    /// Default location: the SAME `SportivistaProfile` directory `ProfileStore` /
    /// `MisunderstoodLogStore` use in Application Support — one small user-owned
    /// document store, no App Group dependency (matters for the free-account
    /// `SportivistaDeviceDev` build, exactly like those stores' own rationale).
    init(fileManager: FileManager = .default) {
        let base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? fileManager.temporaryDirectory
        self.init(directory: base.appendingPathComponent("SportivistaProfile", isDirectory: true))
    }

    /// Explicit-directory initializer — tests use a throwaway temp directory.
    init(directory: URL) {
        self.directoryURL = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private var fileURL: URL { directoryURL.appendingPathComponent(Self.filename) }

    /// The whole log, most-recent-first per list. Never throws — a missing or
    /// corrupt file is an empty log, matching `MisunderstoodLogStore.load()`.
    func load() -> Log {
        guard let data = try? Data(contentsOf: fileURL) else { return Log() }
        return (try? Self.decoder.decode(Log.self, from: data)) ?? Log()
    }

    private func save(_ log: Log) {
        guard let data = try? Self.encoder.encode(log) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Prepend launch summaries (most-recent-first), capping to `capacity` with
    /// the OLDEST dropped first. No-op for an empty batch.
    func recordLaunches(_ summaries: [LaunchMetricSummary]) {
        guard !summaries.isEmpty else { return }
        var log = load()
        log.launches.insert(contentsOf: summaries, at: 0)
        if log.launches.count > Self.capacity {
            log.launches.removeLast(log.launches.count - Self.capacity)
        }
        save(log)
    }

    /// Prepend hang summaries (most-recent-first), capping to `capacity` with the
    /// OLDEST dropped first. No-op for an empty batch.
    func recordHangs(_ summaries: [HangDiagnosticSummary]) {
        guard !summaries.isEmpty else { return }
        var log = load()
        log.hangs.insert(contentsOf: summaries, at: 0)
        if log.hangs.count > Self.capacity {
            log.hangs.removeLast(log.hangs.count - Self.capacity)
        }
        save(log)
    }

    func deleteAll() { save(Log()) }

    // MARK: - Export ("Del telemetri" — the anonymised share-sheet payload)

    /// The exact shape shared via the DEBUG eval surface's share sheet: durations
    /// + launch-time summaries + app build + timestamp. Deliberately NOT the full
    /// records — no device-generated `id` leaves the device (same rule as
    /// `MisunderstoodLogStore.ExportEntry`).
    struct Export: Codable, Equatable, Sendable {
        struct Launch: Codable, Equatable, Sendable {
            var kind: LaunchMetricSummary.Kind
            var histogram: HistogramSummary
            var appVersion: String
            var timestamp: Date
        }
        struct Hang: Codable, Equatable, Sendable {
            var hangDurationSeconds: Double
            var appVersion: String
            var timestamp: Date
        }
        var launches: [Launch]
        var hangs: [Hang]
    }

    /// Builds the exportable JSON for everything currently on disk. Pure
    /// formatting — the DEBUG eval screen's "Del telemetri" button is what
    /// actually triggers the (owner-initiated, one-shot) share sheet.
    func exportPayload() -> Data {
        let log = load()
        let export = Export(
            launches: log.launches.map { Export.Launch(kind: $0.kind, histogram: $0.histogram, appVersion: $0.appVersion, timestamp: $0.timestamp) },
            hangs: log.hangs.map { Export.Hang(hangDurationSeconds: $0.hangDurationSeconds, appVersion: $0.appVersion, timestamp: $0.timestamp) }
        )
        return (try? Self.encoder.encode(export)) ?? Data("{}".utf8)
    }

    // MARK: - Codec (ISO 8601 dates, matching the other local stores)

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()
}
