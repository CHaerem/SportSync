//
//  StarterPacks.swift
//  Sportivista
//
//  WP-31 — the quick-picks fallback for onboarding: a small, curated set of
//  Norwegian "startpakker" a first-time user can tap to build a profile without
//  Apple Intelligence. This is the path that must give FULL value on a cold
//  start (dossier P310) — so each pack carries its own entity data (id, name,
//  sport, type, lens) and grounds against the real WP-05 index when it has
//  synced, but falls back to a synthesised `Entity` from the curated data when
//  it hasn't yet. Tapping a pack is itself the confirmation (no diff round-trip)
//  — it upserts the pack's rules straight into the SAME `InterestProfile` the
//  conversation edits, through the SAME `InterestProfile.applying` core, so the
//  two paths converge on one profile.
//
//  The packs are grounded in real, in-season entity ids (entities.json) so the
//  agenda reflects a tap immediately (the WP-16.4 «umiddelbar konsekvens»
//  contract). Sensible lenses are baked in where the task calls for them: the
//  golf pack follows The Open `throughNorwegians`, and the cycling pack follows
//  the Tour the same way — so those events render through the Norwegians you'd
//  actually watch (WP-18), not as a flat foreign leaderboard. Winter sport
//  (langrenn/skiskyting/hopp) is deliberately absent while off-season: it has no
//  entities yet, and a pack that matched nothing would break "ærlighet over
//  fylde" — the research agent adds those at season start, and a later onboarding
//  run would surface them.
//

import Foundation

/// One entity a starter pack follows, with the perspective it's followed
/// through. Plain value type — no index dependency — so a pack is fully
/// self-describing at cold start.
struct StarterRule: Equatable, Sendable {
    var entityId: String
    var entityName: String
    var sport: String
    /// "athlete" | "team" | "tournament" | "league".
    var type: String
    var lens: Lens
    var scope: String?

    init(_ entityId: String, _ entityName: String, sport: String, type: String, lens: Lens = .sportAsSuch, scope: String? = nil) {
        self.entityId = entityId
        self.entityName = entityName
        self.sport = sport
        self.type = type
        self.lens = lens
        self.scope = scope
    }
}

/// A tappable curated bundle of follow-rules.
struct StarterPack: Identifiable, Equatable, Sendable {
    var id: String
    /// Short Tekst-TV title ("Norske golfere").
    var title: String
    /// One dempet line under it — what the pack covers.
    var subtitle: String
    /// The shared Norwegian rationale stamped on every rule the pack adds
    /// (the same always-filled `reason` transparency contract the assistant
    /// uses — so "Hva jeg følger" reads sensibly for a tapped pack too).
    var reason: String
    var rules: [StarterRule]

    /// The entity ids this pack follows — used to show an "applied" state and
    /// to toggle the pack off.
    var entityIds: [String] { rules.map(\.entityId) }

    /// Grounded mutations that ADD every rule. Uses the real index entity when
    /// present (authoritative aliases/type), else a synthesised `Entity` from
    /// the curated data — so the pack still applies before entities.json has
    /// synced. `previousRule` is carried so an already-followed entity is a
    /// clean upsert rather than a duplicate.
    func addMutations(index: EntityIndex, profile: InterestProfile) -> [GroundedMutation] {
        rules.map { rule in
            let entity = index.entity(id: rule.entityId)
                ?? Entity(id: rule.entityId, name: rule.entityName, aliases: [], sport: rule.sport, type: rule.type)
            return GroundedMutation(
                kind: .add,
                entity: entity,
                scope: rule.scope,
                weight: InterestProfile.defaultWeight,
                reason: reason,
                previousRule: profile.rule(for: rule.entityId),
                lens: rule.lens
            )
        }
    }

    /// Remove mutations for every rule — lets a tap toggle a pack back off.
    func removeMutations(index: EntityIndex, profile: InterestProfile) -> [GroundedMutation] {
        rules.compactMap { rule in
            guard let existing = profile.rule(for: rule.entityId) else { return nil }
            let entity = index.entity(id: rule.entityId)
                ?? Entity(id: rule.entityId, name: rule.entityName, aliases: [], sport: rule.sport, type: rule.type)
            return GroundedMutation(
                kind: .remove, entity: entity, scope: nil,
                weight: existing.weight, reason: "Fjernet fra startpakke.", previousRule: existing
            )
        }
    }
}

enum StarterPacks {
    /// The curated list, Norwegian interests first. Every id is a real WP-05
    /// entity (entities.json) so a tap has immediate consequence on the board.
    static let all: [StarterPack] = [
        StarterPack(
            id: "norsk-fotball",
            title: "Norsk fotball",
            subtitle: "Lyn · OBOS-ligaen · landslaget",
            reason: "Lagt til fra startpakken «Norsk fotball».",
            rules: [
                StarterRule("fk-lyn-oslo", "FK Lyn Oslo", sport: "football", type: "team"),
                StarterRule("obos-ligaen-2026", "OBOS-ligaen 2026", sport: "football", type: "league"),
                StarterRule("norge", "Norge", sport: "football", type: "team"),
            ]
        ),
        StarterPack(
            id: "norske-golfere",
            title: "Norske golfere",
            subtitle: "Hovland · Reitan · The Open — gjennom de norske",
            reason: "Lagt til fra startpakken «Norske golfere».",
            rules: [
                StarterRule("viktor-hovland", "Viktor Hovland", sport: "golf", type: "athlete"),
                StarterRule("kristoffer-reitan", "Kristoffer Reitan", sport: "golf", type: "athlete"),
                // The lens does its work on the tournament: The Open becomes
                // Norwegian-athlete rows rather than a flat leaderboard (WP-18).
                StarterRule("the-open-championship-2026", "The Open Championship 2026", sport: "golf", type: "tournament", lens: .throughNorwegians),
            ]
        ),
        StarterPack(
            id: "sjakk-carlsen",
            title: "Sjakk",
            subtitle: "Magnus Carlsen på elite-nivå",
            reason: "Lagt til fra startpakken «Sjakk».",
            rules: [
                StarterRule("magnus-carlsen", "Magnus Carlsen", sport: "chess", type: "athlete"),
            ]
        ),
        StarterPack(
            id: "norsk-sykkel",
            title: "Norsk sykkel",
            subtitle: "Uno-X · Tour de France gjennom de norske",
            reason: "Lagt til fra startpakken «Norsk sykkel».",
            rules: [
                StarterRule("uno-x-mobility", "Uno-X Mobility", sport: "cycling", type: "team"),
                StarterRule("tour-de-france-2026", "Tour de France 2026", sport: "cycling", type: "tournament", lens: .throughNorwegians),
            ]
        ),
        StarterPack(
            id: "friidrett",
            title: "Friidrett",
            subtitle: "Karsten Warholm",
            reason: "Lagt til fra startpakken «Friidrett».",
            rules: [
                StarterRule("karsten-warholm", "Karsten Warholm", sport: "athletics", type: "athlete"),
            ]
        ),
        StarterPack(
            id: "tennis-ruud",
            title: "Tennis",
            subtitle: "Casper Ruud + Grand Slams",
            reason: "Lagt til fra startpakken «Tennis».",
            rules: [
                StarterRule("casper-ruud", "Casper Ruud", sport: "tennis", type: "athlete"),
            ]
        ),
        StarterPack(
            id: "cs2",
            title: "e-sport (CS2)",
            subtitle: "100 Thieves — rain",
            reason: "Lagt til fra startpakken «e-sport (CS2)».",
            rules: [
                StarterRule("100-thieves", "100 Thieves", sport: "esports", type: "team"),
                StarterRule("havard-rain-nygaard", "Håvard «rain» Nygaard", sport: "esports", type: "athlete"),
            ]
        ),
        StarterPack(
            id: "internasjonal-fotball",
            title: "Internasjonal toppfotball",
            subtitle: "Premier League · La Liga · Barcelona · VM",
            reason: "Lagt til fra startpakken «Internasjonal toppfotball».",
            rules: [
                StarterRule("premier-league-2026-27", "Premier League 2026/27", sport: "football", type: "league"),
                StarterRule("la-liga-2026-27", "La Liga 2026/27", sport: "football", type: "league"),
                StarterRule("fc-barcelona", "FC Barcelona", sport: "football", type: "league"),
                StarterRule("fifa-world-cup-2026", "FIFA World Cup 2026", sport: "football", type: "tournament"),
            ]
        ),
        StarterPack(
            id: "formel1",
            title: "Formel 1",
            subtitle: "hele sesongen",
            reason: "Lagt til fra startpakken «Formel 1».",
            rules: [
                StarterRule("f1-world-championship-2026", "Formula 1 World Championship 2026", sport: "f1", type: "tournament"),
            ]
        ),
    ]
}
