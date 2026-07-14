//
//  MisunderstoodLog.swift
//  Zenji
//
//  WP-16.3 — the "forsto ikke"-loggen: the improvement loop the FM-lekegrind
//  had been missing. P310's dossier on the feature's own proposal loop put it
//  plainly — every utterance the assistant does NOT manage to turn into an
//  applied mutation is raw material for the next iteration (a prompt tweak, a
//  missing entity, a scope the schema can't express yet). Today that signal
//  was thrown away the moment `explanation`/`rejected` got reset by the next
//  `submit()`. This file makes it durable, locally.
//
//  Hard privacy contract: this log is LOCAL AND PRIVATE. There is no network
//  code anywhere in this file or in how `AssistantViewModel` uses it — the
//  only way any of it leaves the device is the user tapping "Del rapport"
//  (the iOS share sheet), and even then only the anonymised
//  `MisunderstoodLogStore.exportPayload()` fields go out (utterance / outcome
//  / explanation / note / timestamp / resolved — no device id, no account,
//  nothing else). Same "enkleste robuste" persistence choice as
//  `ProfileStore`: one JSON file in Application Support, no App Group
//  dependency (works on the free-account `ZenjiDeviceDev` build too).
//

import Foundation

/// Why a submitted utterance ended WITHOUT any mutation being applied to the
/// profile. Four distinct, machine-observable triggers (see
/// `AssistantViewModel` for exactly where each fires):
///
///   • `.rejectedEntity`     — every proposal's entity was rejected by
///                             `MutationGrounder` (nothing in the index matched).
///   • `.inexpressible`      — `AssistantError.generationFailed`: the model had
///                             an utterance but could not turn it into a valid
///                             structured mutation at all (never
///                             `.unavailable` — that's a device-state gate,
///                             not a misunderstood utterance, so it is not
///                             logged).
///   • `.allRejectedByUser`  — grounding DID produce a confirmable diff, but
///                             the user rejected every mutation in it without
///                             confirming any.
///   • `.emptyModelResponse` — the model returned zero proposals for the
///                             utterance (nothing to ground at all).
enum MisunderstoodOutcome: String, Codable, Equatable, Sendable, CaseIterable {
    case rejectedEntity
    case inexpressible
    case allRejectedByUser
    case emptyModelResponse

    /// Norwegian label for the log list ("Det jeg ikke forsto").
    var label: String {
        switch self {
        case .rejectedEntity: return "Fant ikke det du nevnte"
        case .inexpressible: return "Klarte ikke å uttrykke det som en endring"
        case .allRejectedByUser: return "Du avviste det jeg foreslo"
        case .emptyModelResponse: return "Fikk ikke noe forslag fra modellen"
        }
    }
}

/// One entry in the local "forsto ikke"-log: an utterance that ended without
/// any applied mutation, plus the honest `AssistantExplanation` the user was
/// shown (or would have been shown) at the time. `note` is the user's own,
/// optional account of what they actually meant — added later from the UI, so
/// a resolved/unresolved entry still carries the human correction alongside
/// the model's miss.
struct MisunderstoodEntry: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    /// The utterance, verbatim, as typed.
    var utterance: String
    var outcome: MisunderstoodOutcome
    /// The same understood/reason pair the UI shows for the always-explain
    /// contract (WP-16.1) — stored so the log is self-contained even after
    /// the live `AssistantViewModel.explanation` has moved on.
    var explanation: AssistantExplanation
    var timestamp: Date
    /// The user's optional note on what they actually meant.
    var note: String?
    /// Set once a later "mente du" flow that traces back to THIS utterance
    /// gets confirmed (WP-16.3 §3) — a success case worth keeping (and
    /// exporting), but excluded from the "N unresolved" count shown in the UI.
    var resolvedAt: Date?

    var isResolved: Bool { resolvedAt != nil }

    init(
        id: UUID = UUID(),
        utterance: String,
        outcome: MisunderstoodOutcome,
        explanation: AssistantExplanation,
        timestamp: Date,
        note: String? = nil,
        resolvedAt: Date? = nil
    ) {
        self.id = id
        self.utterance = utterance
        self.outcome = outcome
        self.explanation = explanation
        self.timestamp = timestamp
        self.note = note
        self.resolvedAt = resolvedAt
    }
}

/// Local, private persistence + the anonymised export shape. No network code
/// anywhere in this type — every method is a pure local file read/write.
struct MisunderstoodLogStore: Sendable {
    static let filename = "misunderstood-log.json"
    /// Oldest entries are dropped first once the log holds more than this —
    /// keeps the file (and the on-device history) bounded forever.
    static let capacity = 200

    let directoryURL: URL

    /// Default location: the SAME `ZenjiProfile` directory `ProfileStore`
    /// uses in Application Support — one small user-owned document store, no
    /// App Group dependency (matters for the free-account `ZenjiDeviceDev`
    /// build, exactly like `ProfileStore`'s own rationale).
    init(fileManager: FileManager = .default) {
        let base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? fileManager.temporaryDirectory
        self.init(directory: base.appendingPathComponent("ZenjiProfile", isDirectory: true))
    }

    /// Explicit-directory initializer — tests use a throwaway temp directory.
    init(directory: URL) {
        self.directoryURL = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private var fileURL: URL { directoryURL.appendingPathComponent(Self.filename) }

    /// All entries, most-recent first. Never throws — a missing or corrupt
    /// file is an empty log, matching `ProfileStore.load()`'s robustness
    /// contract.
    func load() -> [MisunderstoodEntry] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? Self.decoder.decode([MisunderstoodEntry].self, from: data)) ?? []
    }

    private func save(_ entries: [MisunderstoodEntry]) {
        guard let data = try? Self.encoder.encode(entries) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Appends one entry (most-recent-first), capped to `capacity` — the
    /// OLDEST entries are dropped first once the cap is hit. Returns the new
    /// entry's id so a caller can later `markResolved(_:)` it.
    @discardableResult
    func record(utterance: String, outcome: MisunderstoodOutcome, explanation: AssistantExplanation, now: Date = Date()) -> UUID {
        var entries = load()
        let entry = MisunderstoodEntry(utterance: utterance, outcome: outcome, explanation: explanation, timestamp: now)
        entries.insert(entry, at: 0)
        if entries.count > Self.capacity {
            entries.removeLast(entries.count - Self.capacity)
        }
        save(entries)
        return entry.id
    }

    /// Marks an entry resolved — a later "mente du" flow it produced was
    /// confirmed. No-op if the id is unknown (e.g. already deleted).
    func markResolved(_ id: UUID, now: Date = Date()) {
        var entries = load()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].resolvedAt = now
        save(entries)
    }

    /// Sets (or clears, via nil/empty) the user's own note on what they meant.
    func setNote(_ note: String?, for id: UUID) {
        var entries = load()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        entries[index].note = (trimmed?.isEmpty ?? true) ? nil : trimmed
        save(entries)
    }

    func delete(_ id: UUID) {
        var entries = load()
        entries.removeAll { $0.id == id }
        save(entries)
    }

    func deleteAll() {
        save([])
    }

    // MARK: - Export ("Del rapport" — the anonymised share-sheet payload)

    /// The exact shape shared via the share sheet: the linguistic raw
    /// material only — utterance, outcome, the explanation, the user's own
    /// note, timestamp, resolved. Deliberately NOT the full `MisunderstoodEntry`
    /// (no stable `id`/UUID — a device-generated identifier — leaves the
    /// device either).
    struct ExportEntry: Codable, Equatable, Sendable {
        var utterance: String
        var outcome: MisunderstoodOutcome
        var understood: String
        var reason: String
        var note: String?
        var timestamp: Date
        var resolved: Bool
    }

    /// Builds the exportable JSON for every entry currently on disk
    /// (most-recent first). Pure formatting — the UI's "Del rapport" button is
    /// what actually triggers the (user-initiated, one-shot) share sheet.
    func exportPayload() -> Data {
        let entries = load().map { entry in
            ExportEntry(
                utterance: entry.utterance,
                outcome: entry.outcome,
                understood: entry.explanation.understood,
                reason: entry.explanation.reason,
                note: entry.note,
                timestamp: entry.timestamp,
                resolved: entry.isResolved
            )
        }
        return (try? Self.encoder.encode(entries)) ?? Data("[]".utf8)
    }

    // MARK: - Codec (ISO 8601 dates, matching ProfileStore)

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
