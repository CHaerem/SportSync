//
//  ProfileIdMigration.swift
//  Sportivista
//
//  WP-162 — the one-time RE-GROUNDING of edition-stamped rule ids.
//
//  A follow rule freezes `entityId` + `entityName` at follow time. Competition
//  ids used to carry the edition (`premier-league-2026-27`), so when the next
//  season's bookkeeping published a new id the old rule matched nothing — and
//  the stored NAME could not save it either ("Premier League 2026/27" never
//  word-boundary-matches a 2027/28 title). The follow died SILENTLY.
//
//  WP-162 makes the published ids seasonless and keeps every former id on the
//  entity as `altIds`. This type moves existing rules across, with a deliberately
//  conservative contract:
//
//    • LOSSLESS   — a rule that cannot be re-grounded is left EXACTLY as it is.
//                   It keeps working as a name-based (soft) follow; nothing is
//                   ever dropped because we failed to resolve it.
//    • IDEMPOTENT — a second run finds nothing to do and returns nil (no write,
//                   no merge churn).
//    • CONVERGENT — the move is expressed the CRDT's own way: the old id is
//                   tombstoned and the canonical id written, both stamped
//                   (now, deviceID). The web twin (`ssMigrateProfileIds` in
//                   docs/js/profile-sync.js) performs the byte-same move, so two
//                   devices converge on ONE rule instead of duplicating.
//    • MERGING    — if the canonical id is already followed, the stale rule is
//                   only tombstoned; the existing follow is kept untouched.
//
//  Pure and clock-injected, so ProfileIdMigrationTests drives every branch with
//  no disk and no app.
//

import Foundation

enum ProfileIdMigration {

    /// Former id → the entity that now carries it (built from `altIds`).
    static func canonicalMap(index: EntityIndex) -> [String: Entity] {
        var map: [String: Entity] = [:]
        let live = Set(index.entities.map(\.id))
        for e in index.entities {
            for alt in e.altIds where !live.contains(alt) && map[alt] == nil { map[alt] = e }
        }
        return map
    }

    /// Re-ground `state`'s live rules against `index`. Returns the new state, or
    /// nil when nothing needed moving (the common case — call it freely).
    static func migrate(_ state: ProfileSyncState, index: EntityIndex, now: Date, deviceID: String) -> ProfileSyncState? {
        let canonical = canonicalMap(index: index)
        guard !canonical.isEmpty else { return nil }
        let live = state.profile.rules
        guard !live.isEmpty else { return nil }

        var liveIds = Set(live.map(\.entityId))
        var next: [InterestRule] = []
        var changed = false
        for rule in live {
            guard let target = canonical[rule.entityId] else { next.append(rule); continue }
            changed = true
            // Already followed under the canonical id → drop the stale duplicate
            // (its tombstone is written by `updatingRules`), keep what's there.
            guard !liveIds.contains(target.id) else { continue }
            var moved = rule
            moved.entityId = target.id
            moved.entityName = target.name
            if !target.sport.isEmpty { moved.sport = target.sport }
            next.append(moved)
            liveIds.insert(target.id)
        }
        guard changed else { return nil }
        return state.updatingRules(to: InterestProfile(rules: next), now: now, deviceID: deviceID)
    }
}
