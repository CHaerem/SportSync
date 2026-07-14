//
//  Spoiler.swift
//  Zenji
//
//  WP-30 — SPOILER PROTECTION, the P350 signature trick that is impossible
//  server-side (it needs the personal "I watch this on tape" context that never
//  leaves the device). A `spoilerPolicy` memory fact on an entity/sport means:
//    (a) the assistant phrases answers WITHOUT revealing outcomes — done in the
//        retrieval digest (`MemoryDigest` renders spoilerPolicy as an explicit
//        "avslør ALDRI resultat" instruction, floated to the front so it is
//        never truncated); and
//    (b) a `spoilerSafe` flag the agenda / detail sheet respect to MASK
//        result/score fields for that entity until the user has "seen" it.
//
//  This is a PURE RENDERING/PRESENTATION layer on top of the feed — exactly like
//  the WP-18 lens. It never touches `FeedCompiler`'s five predicates or the
//  golden vectors: the event's data is unchanged; a masked row simply hides the
//  outcome text at display time and offers a tap to reveal.
//

import Foundation

/// The set of sports/entities the user has a spoiler policy on, derived once
/// from memory. Cheap to build and to query per row, and `Sendable` so it can be
/// threaded through the (nonisolated) agenda-building core.
struct SpoilerShield: Equatable, Sendable {
    /// Canonical sport tags with a spoiler policy (e.g. "f1").
    let sports: Set<String>
    /// Entity ids with a spoiler policy.
    let entityIds: Set<String>

    init(sports: Set<String> = [], entityIds: Set<String> = []) {
        self.sports = sports
        self.entityIds = entityIds
    }

    /// Extract the shield from the live memory: every `spoilerPolicy` fact
    /// contributes its sport and/or entity scope. A global (unscoped) spoiler
    /// policy is intentionally ignored here — masking the WHOLE agenda on one
    /// blanket rule would be hostile; spoiler protection is always scoped to a
    /// sport or entity the user named.
    init(memory: MemoryState) {
        var sports = Set<String>()
        var entityIds = Set<String>()
        for fact in memory.facts where fact.kind == .spoilerPolicy {
            if let sport = fact.sport, !sport.isEmpty { sports.insert(sport) }
            if let entityId = fact.entityId, !entityId.isEmpty { entityIds.insert(entityId) }
        }
        self.init(sports: sports, entityIds: entityIds)
    }

    var isEmpty: Bool { sports.isEmpty && entityIds.isEmpty }

    /// True when a result/score for this sport + entity set must be masked.
    func isSpoilerSensitive(sport: String, entityIds eventEntityIds: Set<String>) -> Bool {
        if !isEmpty, sports.contains(sport) { return true }
        return !entityIds.isDisjoint(with: eventEntityIds)
    }

    /// The entity ids an event carries (home/away team + Norwegian players) —
    /// what an entity-scoped spoiler policy is matched against.
    func isSpoilerSensitive(event: Event) -> Bool {
        isSpoilerSensitive(sport: event.sport, entityIds: Self.entityIds(of: event))
    }

    /// Whether it is SAFE to show this event's outcome (the flag the UI exposes).
    func spoilerSafe(event: Event) -> Bool { !isSpoilerSensitive(event: event) }

    /// The stable entity ids an event carries.
    static func entityIds(of event: Event) -> Set<String> {
        var ids = Set<String>()
        if let h = event.homeTeamEntityId, !h.isEmpty { ids.insert(h) }
        if let a = event.awayTeamEntityId, !a.isEmpty { ids.insert(a) }
        for p in event.norwegianPlayers { if let e = p.entityId, !e.isEmpty { ids.insert(e) } }
        return ids
    }
}
