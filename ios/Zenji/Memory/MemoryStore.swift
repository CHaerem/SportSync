//
//  MemoryStore.swift
//  Zenji
//
//  WP-30 — the CRUD facade over the three personal-memory layers. It is a thin
//  wrapper around the SAME `ProfileStore` file the profile lives in (memory
//  rides `ProfileSyncState`, WP-19), NOT a competing store: every operation
//  loads the full synced state, changes one layer, and saves it back through
//  `ProfileStore.saveSyncState`, leaving the other layers (and the profile's
//  rules) untouched. Because it operates on `ProfileSyncState`, all of memory
//  syncs through the user's own iCloud / a QR bridge automatically — no extra
//  sync code (P350/P360).
//
//  Merge strategies (enforced by the write-time stamping + `ProfileMerge`):
//    • facts     LWW + tombstone (editable + deletable) — `updatingFacts`.
//    • episodic  append-only union — a distilled note is appended, capped for
//                local storage; a "forget" removes it locally.
//    • counters  grow-only G-Counter — a behaviour bump increments THIS device's
//                sub-count by one.
//
//  Same robustness contract as `ProfileStore`/`MisunderstoodLogStore`: reads
//  never throw (a missing/corrupt file is empty memory), writes are best-effort
//  and never crash the caller.
//

import Foundation

struct MemoryStore: MemorySink, Sendable {
    /// The shared profile store whose file also carries memory. Injected so the
    /// app hands the SAME instance the profile uses, and tests point at a
    /// throwaway temp directory.
    let profileStore: ProfileStore
    /// Oldest episodic memory notes are dropped past this, keeping the file
    /// bounded (same rationale as the misunderstood-log's cap).
    static let episodicCapacity = 100

    /// The per-install device stamp written onto changed facts / bumped counters.
    var deviceID: String { profileStore.deviceID }

    init(profileStore: ProfileStore = ProfileStore()) {
        self.profileStore = profileStore
    }

    // MARK: - Read

    /// The live memory projection the UI + digest read (tombstones dropped).
    func load() -> MemoryState { MemoryState(from: profileStore.loadSyncState()) }

    // MARK: - Structured facts (LWW + tombstone)

    /// Insert or replace a fact, stamping it `(now, deviceID)`. Keyed on the
    /// fact's own `id`, so editing a fact's value/reason (same id) updates in
    /// place. Pass a fresh-id fact to add a new one.
    func upsertFact(_ fact: MemoryFact, now: Date = Date()) {
        mutateFacts(now: now) { live in
            live.removeAll { $0.id == fact.id }
            live.append(fact)
        }
    }

    /// Tombstone a fact (a real deletion that replicates cross-device).
    func deleteFact(id: String, now: Date = Date()) {
        mutateFacts(now: now) { live in live.removeAll { $0.id == id } }
    }

    /// MemorySink — persist one fact the model learned. Folds onto an existing
    /// live fact with the SAME scope (entityId/sport) + kind rather than
    /// duplicating (a second "spoilerPolicy for F1" refreshes the first), so the
    /// model calling `saveMemory` twice is idempotent-friendly.
    func save(_ command: SaveMemoryCommand) { save(command, now: Date()) }

    func save(_ command: SaveMemoryCommand, now: Date = Date()) {
        mutateFacts(now: now) { live in
            let match = live.firstIndex { $0.kind == command.kind && $0.entityId == command.entityId && $0.sport == command.sport }
            if let match {
                live[match].value = command.value
                live[match].reason = command.reason
            } else {
                live.append(MemoryFact(
                    entityId: command.entityId, sport: command.sport, kind: command.kind,
                    value: command.value, reason: command.reason, updatedAt: now, deviceID: deviceID
                ))
            }
        }
    }

    /// Load → change the LIVE fact list → stamp/tombstone the diff → save.
    private func mutateFacts(now: Date, _ transform: (inout [MemoryFact]) -> Void) {
        let state = profileStore.loadSyncState()
        var live = state.facts.filter { !$0.deleted }
        transform(&live)
        try? profileStore.saveSyncState(state.updatingFacts(to: live, now: now, deviceID: deviceID))
    }

    // MARK: - Episodic memory (append-only union)

    /// Append a distilled note (never a raw transcript). Newest kept; the oldest
    /// memory notes past the cap are dropped for local storage.
    func appendEpisodic(_ distilled: DistilledNote, now: Date = Date()) {
        var state = profileStore.loadSyncState()
        state.episodic.append(EpisodicNote(distilled: distilled, now: now))
        // Bound only the WP-30 memory notes; leave any other episodic record be.
        let memory = state.episodic.filter { $0.isMemory }.sorted { $0.createdAt > $1.createdAt }
        if memory.count > Self.episodicCapacity {
            let keep = Set(memory.prefix(Self.episodicCapacity).map(\.id))
            state.episodic.removeAll { $0.isMemory && !keep.contains($0.id) }
        }
        try? profileStore.saveSyncState(state)
    }

    /// Forget one episodic note (local removal — episodic has no tombstone;
    /// cross-device revival is a WP-22/CloudKit concern, out of scope here).
    func deleteEpisodic(id: String) {
        var state = profileStore.loadSyncState()
        state.episodic.removeAll { $0.id == id }
        try? profileStore.saveSyncState(state)
    }

    // MARK: - Behaviour statistics (grow-only, pure — no AI)

    func record(_ kind: BehaviorKind, entityId: String) { bump(BehaviorCounter.key(kind, entityId: entityId)) }
    func record(_ kind: BehaviorKind, sport: String) { bump(BehaviorCounter.key(kind, sport: sport)) }

    private func bump(_ key: String) {
        var state = profileStore.loadSyncState()
        if let i = state.counters.firstIndex(where: { $0.key == key }) {
            state.counters[i].perDevice[deviceID, default: 0] += 1
        } else {
            state.counters.append(Counter(key: key, perDevice: [deviceID: 1]))
        }
        try? profileStore.saveSyncState(state)
    }

    /// Forget one behaviour stat (local removal of its counter).
    func deleteBehavior(key: String) {
        var state = profileStore.loadSyncState()
        state.counters.removeAll { $0.key == key }
        try? profileStore.saveSyncState(state)
    }

    // MARK: - Forget all (the GDPR "glem alt")

    /// Forget ALL personal memory: tombstone every fact, drop every memory note,
    /// clear every behaviour counter. The follow-profile (rules) is deliberately
    /// LEFT INTACT — "Hva jeg vet om deg" forgets what the app KNOWS about you,
    /// not what you follow (that's "Hva jeg følger").
    func forgetAll(now: Date = Date()) {
        var state = profileStore.loadSyncState()
        state = state.updatingFacts(to: [], now: now, deviceID: deviceID)   // tombstone all facts
        state.episodic.removeAll { $0.isMemory }
        state.counters.removeAll { BehaviorCounter.owns($0.key) }
        try? profileStore.saveSyncState(state)
    }
}
