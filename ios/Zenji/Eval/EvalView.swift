//
//  EvalView.swift
//  Zenji
//
//  WP-69 — the DEBUG-only eval screen. Reached from the assistant ark's
//  "Det jeg ikke forsto" foot (a quiet "EVAL (DEBUG)" row, compiled only in
//  DEBUG). It runs the versioned corpus through the REAL
//  FoundationModelsInterestAssistant on the physical iPhone — the only place
//  Apple Intelligence actually runs — shows a per-category pass-rate, and
//  exports an anonymised JSON report via the share sheet (the SAME privacy
//  pattern as the MisunderstoodLog export: never any network, no device id).
//
//  It also offers to export the local "forsto ikke"-log as CORPUS CANDIDATES
//  (utterance + note), so real misses become raw material for the next corpus
//  revision — an EXPORT, never an auto-incorporation (the human curates what
//  enters the versioned corpus).
//
//  Whole file is `#if DEBUG`: a Release build contains no eval symbols, exactly
//  like the Mock* / demo-seed files. It builds in DEBUG for the device scheme
//  (which runs the Debug config), which is where the owner runs it.
//

#if DEBUG
import SwiftUI

@MainActor
@Observable
final class EvalScreenModel {
    private(set) var corpus: EvalCorpus?
    private(set) var results: [EvalCaseResult] = []
    private(set) var report: EvalReport?
    private(set) var isRunning = false
    private(set) var progress = 0
    /// Honest state when Apple Intelligence is off / the corpus is missing.
    private(set) var status: String?

    private let assistant: any InterestAssistant
    private let index: EntityIndex
    private let feedProvider: () -> FeedQuery
    private let logStore: MisunderstoodLogStore
    /// WP-63 — the local MetricKit log, exported from this same DEBUG surface
    /// (same privacy pattern as the misunderstood-log / eval-report exports).
    private let metricStore: MetricLogStore

    /// App wiring: the real on-device model + the live index/feed from the WP-12
    /// cache (the same construction `AssistantViewModel`'s app initializer uses),
    /// so the eval reflects exactly what the shipping assistant would see.
    init(
        dataStore: DataStore = DataStore(),
        profileStore: ProfileStore = ProfileStore(),
        assistant: any InterestAssistant = FoundationModelsInterestAssistant(),
        logStore: MisunderstoodLogStore = MisunderstoodLogStore(),
        metricStore: MetricLogStore = MetricLogStore()
    ) {
        self.assistant = assistant
        self.index = EntityIndex(dataStore.loadEntities())
        self.logStore = logStore
        self.metricStore = metricStore
        self.feedProvider = {
            let events = dataStore.loadEvents()
            let base = dataStore.loadInterests() ?? Interests()
            let idx = EntityIndex(dataStore.loadEntities())
            let profile = profileStore.load()
            let effective = EffectiveInterests.merge(profile: profile, into: base, index: idx)
            return FeedQuery.build(events: events, interests: effective, now: Date())
        }
        self.corpus = EvalCorpus.bundled()
        if corpus == nil {
            status = "Fant ikke eval-korpuset i pakken."
        }
    }

    var availabilityMessage: String? { assistant.availability().message }

    /// Run the whole corpus through the real model on this device.
    func run() async {
        guard let corpus, !isRunning else { return }
        isRunning = true
        progress = 0
        results = []
        report = nil
        status = nil
        defer { isRunning = false }

        let available = assistant.availability().isAvailable
        let runner = EvalRunner(assistant: assistant, index: index, feed: feedProvider())
        var scored: [EvalCaseResult] = []
        for c in corpus.cases {
            scored.append(await runner.run(c))
            progress = scored.count
            results = scored
        }
        report = EvalReport.make(
            results: scored,
            corpusVersion: corpus.version,
            assistant: "foundation-models",
            available: available
        )
    }

    /// The anonymised report JSON to share (empty object until a run finishes).
    var reportJSON: String {
        guard let report else { return "{}" }
        return String(data: report.jsonData(), encoding: .utf8) ?? "{}"
    }

    /// Export the local "forsto ikke"-log as CORPUS CANDIDATES — utterance +
    /// outcome + the user's note, anonymised. Not auto-added: the human decides
    /// what enters the versioned corpus.
    var candidatesJSON: String {
        let entries = logStore.load()
        struct Candidate: Codable { var utterance: String; var outcome: String; var note: String? }
        let candidates = entries.map { Candidate(utterance: $0.utterance, outcome: $0.outcome.rawValue, note: $0.note) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = (try? encoder.encode(candidates)) ?? Data("[]".utf8)
        return String(data: data, encoding: .utf8) ?? "[]"
    }

    var candidateCount: Int { logStore.load().count }

    // MARK: - WP-63 — MetricKit telemetry export

    /// The anonymised MetricKit log JSON to share (launch-time summaries + hangs;
    /// never a device id or raw call-stack — see MetricLog.exportPayload).
    var metricLogJSON: String {
        String(data: metricStore.exportPayload(), encoding: .utf8) ?? "{}"
    }

    /// Total records on disk (launches + hangs). Zero on the Simulator — MetricKit
    /// only delivers on a real device, and only after it has gathered a window.
    var metricLogCount: Int {
        let log = metricStore.load()
        return log.launches.count + log.hangs.count
    }

    func clearMetricLog() { metricStore.deleteAll() }
}

/// The DEBUG eval screen — calm Tekst-TV: monospace, amber accent, no charts.
struct EvalView: View {
    @State private var model: EvalScreenModel
    @Environment(\.dismiss) private var dismiss

    init(model: EvalScreenModel = EvalScreenModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    intro
                    if let message = model.availabilityMessage { banner(message) }
                    controls
                    if let report = model.report { summary(report) }
                    if !model.results.isEmpty { caseList }
                    metricSection
                }
                .padding(20)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            .background(ZenjiTokens.background)
            .foregroundStyle(ZenjiTokens.foreground)
            .navigationTitle("EVAL")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .font(.zenjiMono(size: 13))
                        .foregroundStyle(ZenjiTokens.accent)
                }
            }
        }
    }

    // MARK: - Pieces

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("FM-EVAL PÅ ENHET")
                .font(.zenjiMono(size: 12, weight: .bold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
                .tracking(1.5)
            Text("Kjører det versjonerte korpuset gjennom Apple Intelligence på denne enheten og scorer strukturert. Del rapporten når kjøringen er ferdig.")
                .font(.zenjiMono(size: 12))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
            if let corpus = model.corpus {
                Text("Korpus v\(corpus.version) · \(corpus.cases.count) ytringer")
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.muted)
            } else if let status = model.status {
                Text(status)
                    .font(.zenjiMono(size: 12))
                    .foregroundStyle(ZenjiTokens.diffRemove)
            }
        }
    }

    private func banner(_ message: String) -> some View {
        Text(message)
            .font(.zenjiMono(size: 12))
            .foregroundStyle(ZenjiTokens.foreground.opacity(0.8))
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ZenjiTokens.surface)
    }

    private var controls: some View {
        HStack(spacing: 16) {
            Button {
                Task { await model.run() }
            } label: {
                Text(model.isRunning ? "KJØRER … \(model.progress)/\(model.corpus?.cases.count ?? 0)" : "KJØR EVAL")
                    .font(.zenjiMono(size: 13, weight: .bold))
                    .foregroundStyle(model.isRunning ? ZenjiTokens.muted : ZenjiTokens.accent)
            }
            .disabled(model.isRunning || model.corpus == nil)
            .zenjiTapTarget()

            Spacer()

            if model.report != nil {
                ShareLink(item: model.reportJSON, preview: SharePreview("zenji-eval-rapport.json")) {
                    Text("DEL RAPPORT")
                        .font(.zenjiMono(size: 12, weight: .bold))
                        .foregroundStyle(ZenjiTokens.accent)
                }
                .zenjiTapTarget()
            }
        }
    }

    private func summary(_ report: EvalReport) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Rectangle().fill(ZenjiTokens.hairline).frame(height: 1)
            HStack {
                Text("BESTÅTT \(report.totals.passed)/\(report.totals.evaluated)")
                    .font(.zenjiMono(size: 13, weight: .bold))
                Spacer()
                if report.totals.knownGap > 0 {
                    Text("\(report.totals.knownGap) kjente hull\(report.totals.knownGapPassed > 0 ? " · \(report.totals.knownGapPassed) lukket!" : "")")
                        .font(.zenjiMono(size: 11))
                        .foregroundStyle(report.totals.knownGapPassed > 0 ? ZenjiTokens.diffAdd : ZenjiTokens.muted)
                }
            }
            ForEach(report.categories) { cat in
                categoryRow(cat)
            }
        }
    }

    private func categoryRow(_ cat: EvalReport.CategorySummary) -> some View {
        HStack {
            Text(cat.category)
                .font(.zenjiMono(size: 12))
                .frame(width: 110, alignment: .leading)
            if let rate = cat.passRate {
                Text("\(cat.passed)/\(cat.evaluated)")
                    .font(.zenjiMono(size: 12, weight: .bold))
                    .foregroundStyle(cat.passed == cat.evaluated ? ZenjiTokens.diffAdd : ZenjiTokens.accent)
                Text("\(Int((rate * 100).rounded()))%")
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.muted)
            } else {
                Text("— kun kjente hull")
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.muted)
            }
            Spacer()
            if cat.knownGap > 0 {
                Text("(\(cat.knownGap) hull)")
                    .font(.zenjiMono(size: 10))
                    .foregroundStyle(ZenjiTokens.muted)
            }
        }
    }

    private var caseList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(ZenjiTokens.hairline).frame(height: 1)
            ForEach(model.results) { result in
                EvalCaseRow(result: result)
            }
            candidateFooter
        }
    }

    private var candidateFooter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(ZenjiTokens.hairline).frame(height: 1).padding(.top, 8)
            ShareLink(item: model.candidatesJSON, preview: SharePreview("forsto-ikke-kandidater.json")) {
                Text("DEL KORPUS-KANDIDATER (\(model.candidateCount))")
                    .font(.zenjiMono(size: 11, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent)
            }
            .disabled(model.candidateCount == 0)
            .zenjiTapTarget()
            Text("Eksporterer «forsto ikke»-loggen som korpus-kandidater. Du bestemmer selv hva som legges inn.")
                .font(.zenjiMono(size: 10))
                .foregroundStyle(ZenjiTokens.muted)
        }
    }

    /// WP-63 — the local MetricKit telemetry (launch times + hangs), exported
    /// with the SAME privacy pattern (anonymised JSON, no network, owner-initiated
    /// share sheet). Always shown; empty on the Simulator (MetricKit is
    /// device-only), which the honest note states.
    private var metricSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(ZenjiTokens.hairline).frame(height: 1).padding(.top, 8)
            Text("TELEMETRI (METRICKIT)")
                .font(.zenjiMono(size: 12, weight: .bold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
                .tracking(1.5)
            HStack(spacing: 16) {
                ShareLink(item: model.metricLogJSON, preview: SharePreview("zenji-telemetri.json")) {
                    Text("DEL TELEMETRI (\(model.metricLogCount))")
                        .font(.zenjiMono(size: 11, weight: .bold))
                        .foregroundStyle(ZenjiTokens.accent)
                }
                .disabled(model.metricLogCount == 0)
                .zenjiTapTarget()
                Spacer()
                if model.metricLogCount > 0 {
                    Button("Slett") { model.clearMetricLog() }
                        .font(.zenjiMono(size: 11))
                        .foregroundStyle(ZenjiTokens.diffRemove.opacity(0.75))
                        .zenjiTapTarget()
                }
            }
            Text("Lokale MetricKit-sammendrag: app-oppstartstid + heng. Aldri nettverk. Tomt i simulatoren — MetricKit leverer bare på ekte enhet.")
                .font(.zenjiMono(size: 10))
                .foregroundStyle(ZenjiTokens.muted)
        }
    }
}

/// One scored case row: the utterance, a pass/fail glyph, and each check's
/// detail. A known-gap case is shown quietly (never as a hard failure).
struct EvalCaseRow: View {
    let result: EvalCaseResult

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(glyph)
                    .font(.zenjiMono(size: 13, weight: .bold))
                    .foregroundStyle(glyphColor)
                Text("«\(result.utterance)»")
                    .font(.zenjiMono(size: 12, weight: .bold))
                Spacer()
                if result.knownGap {
                    Text("KJENT HULL\(result.knownGapRef.map { " · \($0)" } ?? "")")
                        .font(.zenjiMono(size: 9, weight: .bold))
                        .foregroundStyle(ZenjiTokens.muted)
                }
            }
            ForEach(result.checks) { check in
                Text("\(check.passed ? "·" : "✕") \(check.label): \(check.detail)")
                    .font(.zenjiMono(size: 10))
                    .foregroundStyle(check.passed ? ZenjiTokens.foreground.opacity(0.55) : ZenjiTokens.diffRemove.opacity(0.85))
            }
        }
    }

    private var glyph: String { result.passed ? "✓" : (result.knownGap ? "○" : "✕") }
    private var glyphColor: Color {
        if result.passed { return ZenjiTokens.diffAdd }
        return result.knownGap ? ZenjiTokens.muted : ZenjiTokens.diffRemove
    }
}
#endif
