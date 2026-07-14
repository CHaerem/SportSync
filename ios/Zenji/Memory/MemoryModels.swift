//
//  MemoryModels.swift
//  Zenji
//
//  WP-30 — the PERSONAL-MEMORY value types (dossier P350). The whole point of
//  P350 is the split between PERSONAL context (how YOU relate to what you
//  follow — taste, knowledge level, spoiler preference, notification tolerance;
//  small, private, ON THE DEVICE) and WORLD context (form, storylines — large,
//  shared, server-produced). Our server NEVER gathers personal context. These
//  types are the personal side, and — like everything else the assistant
//  touches — they are plain, FoundationModels-FREE Swift so the whole memory
//  pipeline (distillation, retrieval, spoiler-masking) and its tests run on the
//  Simulator / in CI without Apple Intelligence.
//
//  THREE MEMORY LAYERS, all local, all riding the WP-19 sync model (P360:
//  `ProfileSyncState` already carries `episodic` + `counters`; WP-30 EXTENDS it
//  with `facts` rather than standing up a competing store — so memory syncs
//  through the user's OWN iCloud / a QR bridge for free, and never our server):
//
//    1. STRUCTURED  `MemoryFact` — relationship metadata per entity/sport beyond
//                   the profile's follow-rules ("nybegynner i sjakk — forklar
//                   termer", "ser F1 på OPPTAK — ALDRI spoile resultat", "ikke
//                   varsle før 08:00"). Editable + deletable → LAST-WRITER-WINS
//                   on `updatedAt` + tombstones, exactly like `SyncedRule`.
//    2. EPISODIC    a compact, DISTILLED note per assistant conversation
//                   (never a raw transcript) → `EpisodicNote` (WP-19),
//                   append-only union.
//    3. BEHAVIOUR   opens / expansions / dismissals per entity → `Counter`
//                   (WP-19), grow-only. PURE code, no AI.
//
//  `MemoryState` is the read-only LIVE projection (tombstones dropped) the UI
//  and the retrieval digest consume — the memory analogue of
//  `ProfileSyncState.profile`.
//

import Foundation

// MARK: - Structured memory (MemoryFact)

/// What KIND of relationship metadata a `MemoryFact` records. Each maps to a
/// concrete behaviour the assistant / rendering layer reads:
///
///   • `knowledgeLevel` — how much the user knows about a sport/entity, so the
///     Q&A arm can explain or skip fagtermer ("nybegynner i sjakk").
///   • `spoilerPolicy`  — the P350 signature: the user watches on tape/delay and
///     must NEVER be told the outcome (drives `SpoilerShield`).
///   • `notifyWindow`   — notification tolerance ("ikke før 08:00").
///   • `preference`     — a generic like/dislike the model can honour.
///   • `note`           — a free-text durable note that fits none of the above.
enum MemoryKind: String, Codable, Equatable, Sendable, CaseIterable {
    case knowledgeLevel
    case spoilerPolicy
    case notifyWindow
    case preference
    case note

    /// Norwegian label for the "Hva jeg vet om deg" page.
    var label: String {
        switch self {
        case .knowledgeLevel: return "Kunnskapsnivå"
        case .spoilerPolicy: return "Spoilervern"
        case .notifyWindow: return "Varselsvindu"
        case .preference: return "Preferanse"
        case .note: return "Notat"
        }
    }
}

/// One piece of structured personal context. Scoped to an entity (`entityId`),
/// a whole sport (`sport`), or neither (a GLOBAL fact — e.g. a notify window
/// that applies everywhere). Carries the WP-19 sync metadata last-writer-wins
/// needs (`updatedAt`, `deviceID`, `deleted`), so a fact edits/deletes and
/// replicates cross-device exactly like a follow-rule (`SyncedRule`).
struct MemoryFact: Codable, Equatable, Identifiable, Sendable {
    /// Stable id (a UUID string), identical across devices for the same fact.
    var id: String
    /// Optional entity scope (a WP-05 stable id). Nil ⇒ not entity-scoped.
    var entityId: String?
    /// Optional sport scope (canonical English tag, e.g. "chess"). Nil ⇒ not
    /// sport-scoped. A fact with BOTH nil is a global preference.
    var sport: String?
    var kind: MemoryKind
    /// The value, e.g. "nybegynner", "opptak", "08:00", or free text.
    var value: String
    /// Always-filled Norwegian rationale — the same transparency contract the
    /// profile's rules carry ("AI decides … writes a defensible reason").
    var reason: String
    /// The LWW clock — when this fact was last written on some device.
    var updatedAt: Date
    /// The device that last wrote it — the deterministic clock-skew tie-break.
    var deviceID: String
    /// A tombstone: the fact was forgotten. Kept (not dropped) so the deletion
    /// replicates and a peer can't revive it from a stale copy.
    var deleted: Bool

    init(
        id: String = UUID().uuidString,
        entityId: String? = nil,
        sport: String? = nil,
        kind: MemoryKind,
        value: String,
        reason: String,
        updatedAt: Date,
        deviceID: String = "",
        deleted: Bool = false
    ) {
        self.id = id
        self.entityId = entityId
        self.sport = sport
        self.kind = kind
        self.value = value
        self.reason = reason
        self.updatedAt = updatedAt
        self.deviceID = deviceID
        self.deleted = deleted
    }

    private enum CodingKeys: String, CodingKey {
        case id, entityId, sport, kind, value, reason, updatedAt, deviceID, deleted
    }

    /// Forward-compatible decode (same convention as the WP-11 models): unknown
    /// keys ignored, missing optionals defaulted, an unrecognised `kind`
    /// demotes to `.note` rather than failing the whole state's decode.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        entityId = try c.decodeIfPresent(String.self, forKey: .entityId)
        sport = try c.decodeIfPresent(String.self, forKey: .sport)
        // Unrecognised `kind` demotes to `.note` rather than failing the decode.
        let rawKind = try c.decodeIfPresent(String.self, forKey: .kind)
        kind = rawKind.flatMap(MemoryKind.init(rawValue:)) ?? .note
        value = try c.decodeIfPresent(String.self, forKey: .value) ?? ""
        reason = try c.decodeIfPresent(String.self, forKey: .reason) ?? ""
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt) ?? Date(timeIntervalSince1970: 0)
        deviceID = try c.decodeIfPresent(String.self, forKey: .deviceID) ?? ""
        deleted = try c.decodeIfPresent(Bool.self, forKey: .deleted) ?? false
    }

    /// A stable, total-order key over the payload — the final merge tie-break, so
    /// two devices that wrote different values at the same instant still
    /// converge deterministically (mirrors `ProfileMerge.payloadKey` for rules).
    var payloadKey: String {
        [entityId ?? "", sport ?? "", kind.rawValue, value, reason]
            .joined(separator: "\u{1F}")
    }
}

// MARK: - Behaviour statistics (pure, no AI)

/// The three behaviour signals WP-30 tracks per entity/sport, rolling. Stored as
/// grow-only `Counter`s in `ProfileSyncState.counters` (WP-19) under a namespaced
/// key so they never collide with any other counter.
enum BehaviorKind: String, Codable, Equatable, Sendable, CaseIterable {
    case open       // opened an event's detail sheet
    case expand     // expanded a collapsed series / "hvorfor vises denne"
    case dismiss    // dismissed/rejected something about the entity

    var label: String {
        switch self {
        case .open: return "Åpnet"
        case .expand: return "Utvidet"
        case .dismiss: return "Avvist"
        }
    }
}

enum BehaviorCounter {
    /// The reserved counter-key prefix for behaviour stats.
    static let prefix = "behavior"

    /// The counter key for a behaviour on a specific entity ("behavior|open|casper-ruud").
    static func key(_ kind: BehaviorKind, entityId: String) -> String {
        "\(prefix)|\(kind.rawValue)|e:\(entityId)"
    }

    /// The counter key for a behaviour on a whole sport ("behavior|open|s:chess").
    static func key(_ kind: BehaviorKind, sport: String) -> String {
        "\(prefix)|\(kind.rawValue)|s:\(sport)"
    }

    /// True for a key this namespace owns.
    static func owns(_ key: String) -> Bool { key.hasPrefix(prefix + "|") }

    /// Parse a behaviour key back to its parts for display. Returns nil for a
    /// key we don't own or can't parse.
    static func parse(_ key: String) -> (kind: BehaviorKind, token: String, isSport: Bool)? {
        let parts = key.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 3, parts[0] == prefix, let kind = BehaviorKind(rawValue: parts[1]) else { return nil }
        let raw = parts[2]
        if raw.hasPrefix("s:") { return (kind, String(raw.dropFirst(2)), true) }
        if raw.hasPrefix("e:") { return (kind, String(raw.dropFirst(2)), false) }
        return (kind, raw, false)
    }
}

/// One behaviour stat, ready for the "Hva jeg vet om deg" page: a kind, the
/// subject it's about (entity id or sport tag), and the rolling total.
struct BehaviorStat: Equatable, Identifiable, Sendable {
    var key: String
    var kind: BehaviorKind
    /// The entity id or sport tag the count is about.
    var token: String
    var isSport: Bool
    var total: Int

    var id: String { key }
}

// MARK: - Distilled episodic note (the @Generable shape, FM-free)

/// The COMPACT structured note a Foundation Model distils from an assistant
/// conversation — NEVER the raw transcript (the P350 rule). This is the FM-free
/// mirror of the `@Generable` shape (see `FoundationModelsMemoryDistiller`): a
/// one-line summary, the entities/sports it is about, a `kind` hint, and an
/// optional expiry (so an ephemeral "i kveld" note ages out of the digest).
struct DistilledNote: Codable, Equatable, Sendable {
    /// One calm Norwegian line, e.g. "Skal se Tour-etappen i opptak i kveld."
    var summary: String
    /// Entity ids and/or sport tags the note is about (grounded through the index).
    var entityRefs: [String]
    /// A `MemoryKind` hint for how to file this ("spoilerPolicy", "note", …).
    var kind: MemoryKind
    /// When this note stops being relevant (ephemeral notes), if ever.
    var expiresAt: Date?

    init(summary: String, entityRefs: [String] = [], kind: MemoryKind = .note, expiresAt: Date? = nil) {
        self.summary = summary
        self.entityRefs = entityRefs
        self.kind = kind
        self.expiresAt = expiresAt
    }
}

// MARK: - EpisodicNote ⇄ DistilledNote

extension EpisodicNote {
    /// The `EpisodicNote.kind` tag WP-30 memory notes carry (distinct from the
    /// misunderstood-log's own notes, which live in a SEPARATE file, not in
    /// `ProfileSyncState.episodic`).
    static let memoryKind = "memory"

    /// Build an append-only episodic memory note from a distilled note. The
    /// distilled fields ride in the opaque `payload` (the merge never inspects
    /// them); `id` is a fresh UUID so the union keeps every distinct note.
    init(distilled: DistilledNote, now: Date, id: String = UUID().uuidString) {
        var payload: [String: String] = [
            "summary": distilled.summary,
            "kind": distilled.kind.rawValue,
            "entityRefs": distilled.entityRefs.joined(separator: ","),
        ]
        if let expiresAt = distilled.expiresAt {
            payload["expiresAt"] = ISO8601DateFormatter().string(from: expiresAt)
        }
        self.init(id: id, kind: EpisodicNote.memoryKind, createdAt: now, payload: payload)
    }

    /// True for a WP-30 memory note (as opposed to any other episodic record).
    var isMemory: Bool { kind == EpisodicNote.memoryKind }

    var summary: String { payload["summary"] ?? "" }

    var entityRefs: [String] {
        (payload["entityRefs"] ?? "").split(separator: ",").map(String.init).filter { !$0.isEmpty }
    }

    var memoryKindHint: MemoryKind {
        payload["kind"].flatMap(MemoryKind.init(rawValue:)) ?? .note
    }

    var expiresAt: Date? {
        payload["expiresAt"].flatMap { ISO8601DateFormatter().date(from: $0) }
    }

    /// Whether this note is still relevant at `now` (unexpired). A note with no
    /// expiry never ages out.
    func isFresh(at now: Date) -> Bool {
        guard let expiresAt else { return true }
        return expiresAt >= now
    }
}

// MARK: - The live projection the UI + digest read

/// The read-only LIVE view of everything remembered: structured facts (tombstones
/// dropped, sorted), episodic memory notes (newest first), and behaviour stats
/// (derived from the grow-only counters). The memory analogue of
/// `ProfileSyncState.profile`.
struct MemoryState: Equatable, Sendable {
    var facts: [MemoryFact]
    var episodic: [EpisodicNote]
    var behavior: [BehaviorStat]

    init(facts: [MemoryFact] = [], episodic: [EpisodicNote] = [], behavior: [BehaviorStat] = []) {
        self.facts = facts
        self.episodic = episodic
        self.behavior = behavior
    }

    var isEmpty: Bool { facts.isEmpty && episodic.isEmpty && behavior.isEmpty }

    /// The total number of individual remembered items — the count shown next to
    /// "HVA JEG VET OM DEG".
    var itemCount: Int { facts.count + episodic.count + behavior.count }

    /// Project a synced state into the live memory view: drop tombstoned facts,
    /// keep only WP-30 memory episodic notes, turn behaviour counters into stats.
    init(from state: ProfileSyncState) {
        facts = state.facts
            .filter { !$0.deleted }
            .sorted { lhs, rhs in
                if lhs.kind != rhs.kind { return lhs.kind.rawValue < rhs.kind.rawValue }
                return (lhs.sport ?? lhs.entityId ?? "") < (rhs.sport ?? rhs.entityId ?? "")
            }
        episodic = state.episodic
            .filter { $0.isMemory }
            .sorted { $0.createdAt > $1.createdAt }
        behavior = state.counters
            .filter { BehaviorCounter.owns($0.key) && $0.total > 0 }
            .compactMap { counter -> BehaviorStat? in
                guard let parsed = BehaviorCounter.parse(counter.key) else { return nil }
                return BehaviorStat(key: counter.key, kind: parsed.kind, token: parsed.token, isSport: parsed.isSport, total: counter.total)
            }
            .sorted { lhs, rhs in
                if lhs.total != rhs.total { return lhs.total > rhs.total }
                return lhs.key < rhs.key
            }
    }
}

// MARK: - saveMemory command (the tool's effect, tested directly)

/// The pure, FM-free payload the `saveMemory` tool asks the store to persist —
/// what the model produces when it decides something is worth remembering. The
/// FoundationModels tool converts its `@Generable` arguments into one of these
/// and hands it to a `MemorySink`; the tests drive the same command straight
/// into `MemoryStore` (the tool's ROUND-TRIP without needing Apple Intelligence).
struct SaveMemoryCommand: Equatable, Sendable {
    var entityId: String?
    var sport: String?
    var kind: MemoryKind
    var value: String
    var reason: String

    init(entityId: String? = nil, sport: String? = nil, kind: MemoryKind, value: String, reason: String) {
        self.entityId = entityId
        self.sport = sport
        self.kind = kind
        self.value = value
        self.reason = reason
    }
}

/// The write side of memory the assistant's `saveMemory` tool targets. A tiny,
/// Sendable seam so `FoundationModelsInterestAssistant` can persist a learned
/// fact WITHOUT importing the store's concrete type (mirrors how the rest of the
/// app depends on protocols, not implementations). `MemoryStore` conforms.
protocol MemorySink: Sendable {
    /// Persist one learned fact. Idempotent-friendly: the store folds a
    /// same-scope/same-kind fact onto the existing one rather than duplicating.
    func save(_ command: SaveMemoryCommand)
}

/// Both halves of memory handed to `InterestAssistant.interpret`: the READ side
/// (`state`, for the injected retrieval digest) and the optional WRITE side
/// (`sink`, wired to the `saveMemory` tool). Defaults to empty/no-op so every
/// existing caller and test is unaffected (they use the memory-free overload).
struct MemoryContext: Sendable {
    var state: MemoryState
    var sink: (any MemorySink)?

    init(state: MemoryState = MemoryState(), sink: (any MemorySink)? = nil) {
        self.state = state
        self.sink = sink
    }
}
