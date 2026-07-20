//
//  Affinity.swift
//  Sportivista
//
//  WP-134 — on-device adaptive personalisation (axis A: "improve FOR the user").
//  Turns the observed `BehaviorStat` signal (open / expand / dismiss per entity
//  and per sport — already recorded, already synced E2E-free via the CloudKit
//  snapshot) into a mild, deterministic per-subject affinity score.
//
//  DESIGN CONTRACT (the whole point of keeping it "mild"):
//   • It is a TIE-BREAK / LIFT, never a relevance gate. It changes nothing about
//     WHICH events are relevant / must-watch / must-see — only the order where
//     order is otherwise arbitrary. The golden feed-vectors must stay bit-like.
//   • It never re-sorts the chronological agenda (time is sacred) and never hides
//     anything. A dismiss lowers a lift; it never removes.
//   • It is explainable (surfaced in "Hva jeg vet om deg"), never a black box.
//   • Pure + Foundation-only → fully unit-tested with no store/UI in sight.
//

import Foundation

struct Affinity: Equatable, Sendable {

    /// A dismiss is a stronger (negative) signal than a glance-open is positive,
    /// and an expand ("hvorfor vises denne" / open a series) is a deeper positive
    /// than a plain open. Asymmetric on purpose.
    static let weightOpen = 1.0
    static let weightExpand = 1.5
    static let weightDismiss = 2.0

    /// Saturation constant for the bounded squash: the raw score is squashed into
    /// (-1, 1) so one heavy-usage day can never dominate the ranking.
    static let saturation = 20.0

    private let rawByEntity: [String: Double]
    private let rawBySport: [String: Double]

    /// Build from the behaviour stats a `MemoryState` already exposes.
    init(behavior: [BehaviorStat]) {
        var entity: [String: Double] = [:]
        var sport: [String: Double] = [:]
        for stat in behavior {
            let contribution = Self.weight(stat.kind) * Double(stat.total)
            if stat.isSport {
                sport[stat.token, default: 0] += contribution
            } else {
                entity[stat.token, default: 0] += contribution
            }
        }
        rawByEntity = entity
        rawBySport = sport
    }

    private static func weight(_ kind: BehaviorKind) -> Double {
        switch kind {
        case .open: return weightOpen
        case .expand: return weightExpand
        case .dismiss: return -weightDismiss
        }
    }

    /// Raw (un-squashed) accumulation for a subject — 0 for an unseen one.
    func rawScore(entityId: String? = nil, sport: String? = nil) -> Double {
        var raw = 0.0
        if let id = entityId { raw += rawByEntity[id] ?? 0 }
        if let s = sport { raw += rawBySport[s] ?? 0 }
        return raw
    }

    /// The affinity in (-1, 1): a bounded, monotone, deterministic squash of the
    /// raw score. 0 for an unseen subject; negative when dismissals dominate.
    /// Combining an event's entity AND sport sums their raw scores, then squashes.
    func score(entityId: String? = nil, sport: String? = nil) -> Double {
        Self.squash(rawScore(entityId: entityId, sport: sport))
    }

    /// `x / (k + |x|)` — monotone increasing, odd (so dismissals go negative),
    /// bounded in (-1, 1), 0 at 0. No `tanh`/Foundation-math surprises.
    static func squash(_ x: Double) -> Double {
        x / (saturation + Swift.abs(x))
    }

    /// The subjects with the STRONGEST positive affinity, most-engaged first —
    /// for the "du åpner golf oftest" explainability line and any tie-break lift.
    /// Ties broken by token for determinism. Non-positive scores are excluded.
    func topSubjects(limit: Int = 3) -> [(token: String, isSport: Bool, score: Double)] {
        var all: [(token: String, isSport: Bool, score: Double)] = []
        for (id, raw) in rawByEntity where raw > 0 { all.append((id, false, Self.squash(raw))) }
        for (s, raw) in rawBySport where raw > 0 { all.append((s, true, Self.squash(raw))) }
        all.sort { a, b in
            if a.score != b.score { return a.score > b.score }
            return a.token < b.token
        }
        return Array(all.prefix(max(0, limit)))
    }

    var isEmpty: Bool { rawByEntity.isEmpty && rawBySport.isEmpty }
}
