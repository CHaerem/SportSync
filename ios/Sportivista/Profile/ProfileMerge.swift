//
//  ProfileMerge.swift
//  Sportivista
//
//  WP-19 — THE HEART of profile-sync, and the one piece that is fully testable
//  with no iCloud account. A pure, deterministic, CRDT-like function:
//
//      merge(local, remote) → (merged state, the push set the remote is behind on)
//
//  It has the three properties a conflict-free replicated merge needs, and the
//  tests pin all three (ProfileMergeTests):
//
//    • COMMUTATIVE   merge(a, b).merged == merge(b, a).merged
//    • IDEMPOTENT    merge(a, a).merged == a.deduplicated()
//    • CONVERGENT    two devices that exchange states in ANY order reach the
//                    same merged state (no last-network-packet race)
//
//  Per data category:
//
//    • rules     LAST-WRITER-WINS on `modifiedAt`, tombstones RESPECTED (a
//                delete with a newer clock beats a stale live edit and is not
//                revived; a genuinely newer live edit legitimately un-deletes).
//                Clock skew (equal `modifiedAt`) breaks deterministically:
//                delete-wins, then higher deviceID, then a stable payload key —
//                so the tie-break is symmetric.
//    • episodic  append-only UNION on id (EpisodicNote.reconcile).
//    • counters  grow-only G-Counter (Counter.merge — max per device, sum total).
//
//  No I/O, no clock read, no framework beyond Foundation — so it is exercised
//  directly, without CloudKit, an iCloud account, or a network.
//

import Foundation

enum ProfileMerge {

    /// Merge a local state with a remote/imported one. Both inputs are first
    /// deduplicated (one record per id) so the function is total even on a
    /// malformed input, then merged category by category.
    static func merge(local rawLocal: ProfileSyncState, remote rawRemote: ProfileSyncState) -> MergeOutcome {
        let local = rawLocal.deduplicated()
        let remote = rawRemote.deduplicated()

        // --- rules: LWW + tombstone -----------------------------------------
        var localRule: [String: SyncedRule] = [:]
        for r in local.rules { localRule[r.entityId] = r }
        var remoteRule: [String: SyncedRule] = [:]
        for r in remote.rules { remoteRule[r.entityId] = r }

        var mergedRules: [SyncedRule] = []
        var pushRules: [SyncedRule] = []
        for id in Set(localRule.keys).union(remoteRule.keys) {
            let l = localRule[id]
            let r = remoteRule[id]
            let winner = pick(l, r)!            // union guarantees at least one side
            mergedRules.append(winner)
            // The remote is behind unless it already HOLDS the winner verbatim.
            if r != winner { pushRules.append(winner) }
        }

        // --- episodic: append-only union ------------------------------------
        var localNote: [String: EpisodicNote] = [:]
        for n in local.episodic { localNote[n.id] = n }
        var remoteNote: [String: EpisodicNote] = [:]
        for n in remote.episodic { remoteNote[n.id] = n }

        var mergedNotes: [EpisodicNote] = []
        var pushNotes: [EpisodicNote] = []
        for id in Set(localNote.keys).union(remoteNote.keys) {
            let l = localNote[id]
            let r = remoteNote[id]
            let winner: EpisodicNote
            switch (l, r) {
            case let (x?, y?): winner = EpisodicNote.reconcile(x, y)
            case let (x?, nil): winner = x
            case let (nil, y?): winner = y
            case (nil, nil): continue
            }
            mergedNotes.append(winner)
            if r != winner { pushNotes.append(winner) }
        }

        // --- counters: grow-only G-Counter ----------------------------------
        var localCounter: [String: Counter] = [:]
        for c in local.counters { localCounter[c.key] = c }
        var remoteCounter: [String: Counter] = [:]
        for c in remote.counters { remoteCounter[c.key] = c }

        var mergedCounters: [Counter] = []
        var pushCounters: [Counter] = []
        for key in Set(localCounter.keys).union(remoteCounter.keys) {
            let l = localCounter[key]
            let r = remoteCounter[key]
            let winner: Counter
            switch (l, r) {
            case let (x?, y?): winner = Counter.merge(x, y)
            case let (x?, nil): winner = x
            case let (nil, y?): winner = y
            case (nil, nil): continue
            }
            mergedCounters.append(winner)
            if r != winner { pushCounters.append(winner) }
        }

        // --- facts: LWW + tombstone (WP-30, same strategy as rules) ---------
        var localFact: [String: MemoryFact] = [:]
        for f in local.facts { localFact[f.id] = f }
        var remoteFact: [String: MemoryFact] = [:]
        for f in remote.facts { remoteFact[f.id] = f }

        var mergedFacts: [MemoryFact] = []
        var pushFacts: [MemoryFact] = []
        for id in Set(localFact.keys).union(remoteFact.keys) {
            let l = localFact[id]
            let r = remoteFact[id]
            let winner = pickFact(l, r)!        // union guarantees at least one side
            mergedFacts.append(winner)
            if r != winner { pushFacts.append(winner) }
        }

        let merged = ProfileSyncState(rules: mergedRules, episodic: mergedNotes, counters: mergedCounters, facts: mergedFacts).normalized()
        let push = PushSet(
            rules: pushRules.sorted { $0.entityId < $1.entityId },
            episodic: pushNotes.sorted { $0.id < $1.id },
            counters: pushCounters.sorted { $0.key < $1.key },
            facts: pushFacts.sorted { $0.id < $1.id }
        )
        return MergeOutcome(merged: merged, toPush: push)
    }

    // MARK: - Facts (WP-30)

    /// The per-fact winner given (at most) one record from each side. `nil` only
    /// when BOTH are nil.
    static func pickFact(_ a: MemoryFact?, _ b: MemoryFact?) -> MemoryFact? {
        switch (a, b) {
        case let (x?, y?): return pickNewerFact(x, y)
        case let (x?, nil): return x
        case let (nil, y?): return y
        case (nil, nil): return nil
        }
    }

    /// Resolve two records for the SAME fact id. Symmetric + deterministic,
    /// mirroring `pickNewer` for rules: newer `updatedAt` wins; on a clock-skew
    /// tie a tombstone wins (don't revive on a coin-flip); then higher
    /// `deviceID`; then the greater payload key.
    static func pickNewerFact(_ a: MemoryFact, _ b: MemoryFact) -> MemoryFact {
        if a.updatedAt != b.updatedAt { return a.updatedAt > b.updatedAt ? a : b }
        if a.deleted != b.deleted { return a.deleted ? a : b }
        if a.deviceID != b.deviceID { return a.deviceID > b.deviceID ? a : b }
        return a.payloadKey >= b.payloadKey ? a : b
    }

    /// The per-rule winner given (at most) one record from each side. `nil` only
    /// when BOTH are nil.
    static func pick(_ a: SyncedRule?, _ b: SyncedRule?) -> SyncedRule? {
        switch (a, b) {
        case let (x?, y?): return pickNewer(x, y)
        case let (x?, nil): return x
        case let (nil, y?): return y
        case (nil, nil): return nil
        }
    }

    /// Resolve two records for the SAME entity. Symmetric and deterministic:
    ///   1. newer `modifiedAt` wins (the normal case — incl. delete-vs-update);
    ///   2. on a clock-skew TIE, a tombstone wins (don't revive on a coin-flip);
    ///   3. still tied → higher `deviceID`;
    ///   4. still tied → greater payload key (so a↔b is order-independent even
    ///      when two devices wrote different scope/weight at the same instant).
    static func pickNewer(_ a: SyncedRule, _ b: SyncedRule) -> SyncedRule {
        if a.modifiedAt != b.modifiedAt { return a.modifiedAt > b.modifiedAt ? a : b }
        if a.deleted != b.deleted { return a.deleted ? a : b }
        if a.deviceID != b.deviceID { return a.deviceID > b.deviceID ? a : b }
        return payloadKey(a.rule) >= payloadKey(b.rule) ? a : b
    }

    /// A stable, total-order key over a rule's payload — used only as the final
    /// tie-break, so identical-clock/-device writes still converge deterministically.
    private static func payloadKey(_ r: InterestRule) -> String {
        let lens: String
        switch r.lens {
        case .sportAsSuch: lens = "s"
        case .throughNorwegians: lens = "n"
        case let .throughAthletes(a): lens = "a:" + a.map(\.entityId).sorted().joined(separator: ",")
        }
        return [
            r.entityId, r.entityName, r.sport, r.scope ?? "",
            String(format: "%.6f", r.weight), r.reason, lens
        ].joined(separator: "\u{1F}")
    }
}
