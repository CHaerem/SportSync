//
//  ProfileSyncModel.swift
//  Sportivista
//
//  WP-19 — the mergeable transport shape of the interest profile, and the pure
//  value types the merge (ProfileMerge.swift) operates on. This is the P360
//  "dossier" sync model made concrete, and it is testable to the bone WITHOUT
//  any iCloud account: the merge is a deterministic, order-independent,
//  CRDT-like function over these plain Codable structs.
//
//  Three data categories, three merge strategies (see ProfileMerge):
//
//    • rules      discrete follow-rules with a STABLE id (entityId) → per-rule
//                 LAST-WRITER-WINS on `modifiedAt`, plus TOMBSTONES for
//                 deletions (a removal is a fact to replicate, never a silent
//                 absence — so a peer can't revive it from a stale copy).
//    • episodic   append-only memory notes (e.g. the "forsto ikke"-log) →
//                 UNION on a stable id; mutable fields reconcile deterministically
//                 so the union is order-independent.
//    • counters   behaviour statistics → a grow-only G-Counter: per-device
//                 sub-counts merge by MAX, the value is the SUM across devices.
//    • facts      WP-30 structured personal-memory facts → per-fact
//                 LAST-WRITER-WINS on `updatedAt`, plus TOMBSTONES for
//                 forgotten facts (same strategy as rules). This is the
//                 EXTENSION WP-30 adds — memory rides the SAME sync model
//                 rather than a competing store, so it syncs via iCloud / QR
//                 for free (P350/P360).
//
//  `ProfileStore` persists this shape (a backward-compatible SUPERSET of the
//  WP-16…WP-18 flat `{ rules: [InterestRule] }` file — old profiles migrate on
//  read, see `SyncedRule.init(from:)`). The live "Hva jeg følger" view the rest
//  of the app consumes is `state.profile` — tombstones filtered, sorted exactly
//  the way `InterestProfile.applying` sorts, so the two representations agree.
//

import Foundation

// MARK: - Rules (LWW + tombstone)

/// One follow-rule in the cross-device profile: the `InterestRule` payload plus
/// the sync metadata last-writer-wins needs — WHEN it last changed, on WHICH
/// device, and whether it's a `deleted` tombstone.
struct SyncedRule: Codable, Equatable, Sendable, Identifiable {
    /// The follow-rule this record carries (its own `entityId` is the stable key).
    var rule: InterestRule
    /// When this record was last written on some device — the LWW clock.
    var modifiedAt: Date
    /// The device that last wrote it — the deterministic tie-break on a clock skew.
    var deviceID: String
    /// A tombstone: the entity was UNFOLLOWED. Kept (not dropped) so the deletion
    /// replicates and a peer holding a stale live copy can't resurrect it.
    var deleted: Bool

    /// Keyed on the stable entity id — one record per entity, like the server's
    /// `tracked.json`.
    var id: String { rule.entityId }
    var entityId: String { rule.entityId }

    init(rule: InterestRule, modifiedAt: Date, deviceID: String, deleted: Bool = false) {
        self.rule = rule
        self.modifiedAt = modifiedAt
        self.deviceID = deviceID
        self.deleted = deleted
    }

    private enum CodingKeys: String, CodingKey { case rule, modifiedAt, deviceID, deleted }

    /// Forward- AND backward-compatible decode. A WP-19 record nests the rule
    /// under `rule` with its sync metadata; a legacy WP-16…WP-18 profile stored
    /// each rule FLAT (an `InterestRule` with a top-level `entityId`). When the
    /// `rule` key is absent we decode the container itself as an `InterestRule`
    /// and synthesise neutral metadata (modifiedAt = its addedAt, no device, not
    /// deleted) — so an existing on-disk profile upgrades transparently.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let nested = try c.decodeIfPresent(InterestRule.self, forKey: .rule) {
            rule = nested
            modifiedAt = try c.decodeIfPresent(Date.self, forKey: .modifiedAt) ?? nested.addedAt
            deviceID = try c.decodeIfPresent(String.self, forKey: .deviceID) ?? ""
            deleted = try c.decodeIfPresent(Bool.self, forKey: .deleted) ?? false
        } else {
            let flat = try InterestRule(from: decoder)
            rule = flat
            modifiedAt = flat.addedAt
            deviceID = ""
            deleted = false
        }
    }
}

// MARK: - Episodic notes (append-only union)

/// One append-only episodic memory note — the shape the "forsto ikke"-log (and
/// any future episodic memory) syncs as. Merged by UNION on `id`: a note written
/// on any device is kept everywhere. Its mutable fields (`note`, `resolvedAt`)
/// reconcile deterministically (see `reconcile`) so two copies converge the same
/// regardless of arrival order.
struct EpisodicNote: Codable, Equatable, Sendable, Identifiable {
    /// Stable id (a UUID string), identical across devices for the same note.
    var id: String
    /// What KIND of note this is (e.g. "misunderstood") — opaque to the merge.
    var kind: String
    var createdAt: Date
    /// Small, opaque, stringly-typed body — the merge never inspects it.
    var payload: [String: String]
    /// The user's later note ("hva jeg egentlig mente"), if any.
    var note: String?
    /// When a follow-up resolved it, if ever.
    var resolvedAt: Date?

    init(id: String, kind: String, createdAt: Date, payload: [String: String] = [:], note: String? = nil, resolvedAt: Date? = nil) {
        self.id = id
        self.kind = kind
        self.createdAt = createdAt
        self.payload = payload
        self.note = note
        self.resolvedAt = resolvedAt
    }

    /// Deterministic, symmetric reconciliation of two copies of the SAME note
    /// (same `id`). The earliest resolution wins (a fact, once true, stays true);
    /// a present note beats an absent one (and on a genuine both-present tie the
    /// lexicographically-greater one wins, so a↔b is order-independent); the
    /// earliest `createdAt` is kept.
    static func reconcile(_ a: EpisodicNote, _ b: EpisodicNote) -> EpisodicNote {
        EpisodicNote(
            id: a.id,
            kind: a.kind == b.kind ? a.kind : max(a.kind, b.kind),
            createdAt: min(a.createdAt, b.createdAt),
            payload: a.payload == b.payload ? a.payload : maxPayload(a.payload, b.payload),
            note: reconcileNote(a.note, b.note),
            resolvedAt: earliestNonNil(a.resolvedAt, b.resolvedAt)
        )
    }

    private static func reconcileNote(_ a: String?, _ b: String?) -> String? {
        switch (a, b) {
        case let (x?, y?): return max(x, y)
        case let (x?, nil): return x
        case let (nil, y?): return y
        case (nil, nil): return nil
        }
    }

    private static func earliestNonNil(_ a: Date?, _ b: Date?) -> Date? {
        switch (a, b) {
        case let (x?, y?): return min(x, y)
        case let (x?, nil): return x
        case let (nil, y?): return y
        case (nil, nil): return nil
        }
    }

    /// Deterministic pick between two differing payloads: the one with the
    /// greater sorted "k=v;" serialisation.
    private static func maxPayload(_ a: [String: String], _ b: [String: String]) -> [String: String] {
        serialize(a) >= serialize(b) ? a : b
    }

    private static func serialize(_ p: [String: String]) -> String {
        p.keys.sorted().map { "\($0)=\(p[$0] ?? "")" }.joined(separator: ";")
    }
}

// MARK: - Counters (grow-only G-Counter)

/// A grow-only behaviour counter (CRDT G-Counter). Each device owns a monotonic
/// sub-count; the counter's value is the SUM across devices, and two copies merge
/// by taking the MAX of each device's sub-count. No device ever decrements
/// another's — so the merge is commutative, associative and idempotent.
struct Counter: Codable, Equatable, Sendable, Identifiable {
    var key: String
    var perDevice: [String: Int]

    var id: String { key }
    /// The observed value: the sum of every device's sub-count.
    var total: Int { perDevice.values.reduce(0, +) }

    init(key: String, perDevice: [String: Int] = [:]) {
        self.key = key
        self.perDevice = perDevice
    }

    static func merge(_ a: Counter, _ b: Counter) -> Counter {
        var per = a.perDevice
        for (device, value) in b.perDevice {
            per[device] = Swift.max(per[device] ?? 0, value)
        }
        return Counter(key: a.key, perDevice: per)
    }
}

// MARK: - The full syncable state

/// The complete, mergeable profile snapshot — what a backend pulls/pushes and
/// what a QR payload carries. Value-equality is defined on the CANONICAL form
/// (see `normalized()`): sorted records, so equality is independent of arrival
/// order.
struct ProfileSyncState: Codable, Equatable, Sendable {
    var rules: [SyncedRule]
    var episodic: [EpisodicNote]
    var counters: [Counter]
    /// WP-30 — structured personal-memory facts (LWW + tombstone). Backward-
    /// compatible: an older state (or QR payload) with no `facts` key decodes to
    /// an empty array, so every existing merge/round-trip is byte-for-byte
    /// unchanged when no memory is present.
    var facts: [MemoryFact]

    init(rules: [SyncedRule] = [], episodic: [EpisodicNote] = [], counters: [Counter] = [], facts: [MemoryFact] = []) {
        self.rules = rules
        self.episodic = episodic
        self.counters = counters
        self.facts = facts
    }

    private enum CodingKeys: String, CodingKey { case rules, episodic, counters, facts }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rules = try c.decodeIfPresent([SyncedRule].self, forKey: .rules) ?? []
        episodic = try c.decodeIfPresent([EpisodicNote].self, forKey: .episodic) ?? []
        counters = try c.decodeIfPresent([Counter].self, forKey: .counters) ?? []
        facts = try c.decodeIfPresent([MemoryFact].self, forKey: .facts) ?? []
    }

    var isEmpty: Bool { rules.isEmpty && episodic.isEmpty && counters.isEmpty && facts.isEmpty }

    /// The live "Hva jeg følger" projection the rest of the app reads: tombstones
    /// dropped, rules sorted EXACTLY the way `InterestProfile.applying` sorts
    /// (by sport, then entityName) so the synced representation and the in-memory
    /// one are bit-identical.
    var profile: InterestProfile {
        let live = rules.filter { !$0.deleted }.map(\.rule)
        return InterestProfile(rules: live.sorted { lhs, rhs in
            if lhs.sport != rhs.sport { return lhs.sport < rhs.sport }
            return lhs.entityName.localizedCaseInsensitiveCompare(rhs.entityName) == .orderedAscending
        })
    }

    /// A canonical copy: records sorted by their stable id so two states built
    /// from the same facts in different orders compare equal.
    func normalized() -> ProfileSyncState {
        ProfileSyncState(
            rules: rules.sorted { $0.entityId < $1.entityId },
            episodic: episodic.sorted { $0.id < $1.id },
            counters: counters.sorted { $0.key < $1.key },
            facts: facts.sorted { $0.id < $1.id }
        )
    }

    /// Fold this state's records to one-per-id, resolving any accidental
    /// duplicates the SAME way the cross-device merge does — so a single state is
    /// always internally consistent before it is merged with a peer.
    func deduplicated() -> ProfileSyncState {
        var ruleByID: [String: SyncedRule] = [:]
        for r in rules { ruleByID[r.entityId] = ruleByID[r.entityId].map { ProfileMerge.pickNewer($0, r) } ?? r }
        var noteByID: [String: EpisodicNote] = [:]
        for n in episodic { noteByID[n.id] = noteByID[n.id].map { EpisodicNote.reconcile($0, n) } ?? n }
        var counterByKey: [String: Counter] = [:]
        for c in counters { counterByKey[c.key] = counterByKey[c.key].map { Counter.merge($0, c) } ?? c }
        var factByID: [String: MemoryFact] = [:]
        for f in facts { factByID[f.id] = factByID[f.id].map { ProfileMerge.pickNewerFact($0, f) } ?? f }
        return ProfileSyncState(
            rules: Array(ruleByID.values),
            episodic: Array(noteByID.values),
            counters: Array(counterByKey.values),
            facts: Array(factByID.values)
        ).normalized()
    }

    // MARK: - Stamping (the write-time half of the sync model)

    /// Produce a new state whose LIVE rules equal `profile`, stamping ONLY what
    /// changed against `self` with `(now, deviceID)` and TOMBSTONING rules that
    /// were removed. Unchanged rules keep their existing `modifiedAt`/`deviceID`
    /// verbatim, so a no-op save causes no merge churn on peers. `episodic` and
    /// `counters` are carried through untouched (rule edits never disturb them).
    func updatingRules(to profile: InterestProfile, now: Date, deviceID: String) -> ProfileSyncState {
        var existing: [String: SyncedRule] = [:]
        for r in rules { existing[r.entityId] = r }

        var next: [SyncedRule] = []
        var desiredIDs = Set<String>()

        for rule in profile.rules {
            desiredIDs.insert(rule.entityId)
            if let prior = existing[rule.entityId], !prior.deleted, prior.rule == rule {
                next.append(prior)                              // unchanged → keep stamp
            } else {
                next.append(SyncedRule(rule: rule, modifiedAt: now, deviceID: deviceID, deleted: false))
            }
        }

        // Anything we HAD but the desired profile no longer lists: tombstone it
        // (once). Already-tombstoned records for absent ids are kept as-is.
        for (entityId, prior) in existing where !desiredIDs.contains(entityId) {
            if prior.deleted {
                next.append(prior)
            } else {
                next.append(SyncedRule(rule: prior.rule, modifiedAt: now, deviceID: deviceID, deleted: true))
            }
        }

        return ProfileSyncState(rules: next, episodic: episodic, counters: counters, facts: facts).normalized()
    }

    // MARK: - Facts (the WP-30 write-time half — LWW + tombstone, like rules)

    /// Produce a new state whose LIVE facts equal `facts`, stamping ONLY what
    /// changed against `self` with `(now, deviceID)` and TOMBSTONING facts that
    /// were removed. Unchanged facts keep their existing stamp verbatim (a no-op
    /// save causes no merge churn). Rules/episodic/counters pass through untouched.
    func updatingFacts(to liveFacts: [MemoryFact], now: Date, deviceID: String) -> ProfileSyncState {
        var existing: [String: MemoryFact] = [:]
        for f in facts { existing[f.id] = f }

        var next: [MemoryFact] = []
        var desiredIDs = Set<String>()

        for var fact in liveFacts {
            desiredIDs.insert(fact.id)
            let prior = existing[fact.id]
            // Compare on payload only (ignore the sync metadata) to decide if it changed.
            if let prior, !prior.deleted, prior.payloadKey == fact.payloadKey {
                next.append(prior)                                  // unchanged → keep stamp
            } else {
                fact.updatedAt = now
                fact.deviceID = deviceID
                fact.deleted = false
                next.append(fact)
            }
        }

        for (id, prior) in existing where !desiredIDs.contains(id) {
            if prior.deleted {
                next.append(prior)
            } else {
                var tomb = prior
                tomb.deleted = true
                tomb.updatedAt = now
                tomb.deviceID = deviceID
                next.append(tomb)
            }
        }

        return ProfileSyncState(rules: rules, episodic: episodic, counters: counters, facts: next).normalized()
    }
}

// MARK: - Merge outputs

/// The records a peer (remote / imported QR) is BEHIND on — exactly what must be
/// pushed back so it converges. Empty when the remote already has every winner.
struct PushSet: Equatable, Sendable {
    var rules: [SyncedRule]
    var episodic: [EpisodicNote]
    var counters: [Counter]
    var facts: [MemoryFact]

    init(rules: [SyncedRule] = [], episodic: [EpisodicNote] = [], counters: [Counter] = [], facts: [MemoryFact] = []) {
        self.rules = rules
        self.episodic = episodic
        self.counters = counters
        self.facts = facts
    }

    var isEmpty: Bool { rules.isEmpty && episodic.isEmpty && counters.isEmpty && facts.isEmpty }
}

/// The result of merging a local state with a remote one: the converged state
/// plus the push set the remote needs.
struct MergeOutcome: Equatable, Sendable {
    var merged: ProfileSyncState
    var toPush: PushSet
}
