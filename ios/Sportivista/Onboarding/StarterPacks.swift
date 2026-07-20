//
//  StarterPacks.swift
//  Sportivista
//
//  WP-31 — the quick-picks step for onboarding: a small, curated set of
//  Norwegian "startpakker" a first-time user can tap to build a profile without
//  Apple Intelligence. Since WP-132 this is the FIRST step for everyone (not a
//  fallback) — the path that must give FULL value on a cold start (dossier
//  P310) — so each pack carries its own entity data (id, name, sport, type,
//  lens) and grounds against the real WP-05 index when it has synced, but falls
//  back to a synthesised `Entity` from the curated data when it hasn't yet.
//  Tapping a pack is itself the confirmation (no diff round-trip) — it upserts
//  the pack's rules straight into the SAME `InterestProfile` the conversation
//  edits, through the SAME `InterestProfile.applying` core, so the two paths
//  converge on one profile.
//
//  WP-132 — the packs are now GENERIC (broadly meaningful to any Norwegian
//  sports fan), not the owner's personal picks: national teams over the owner's
//  club, big competitions over one favourite. Every id is grounded in a real
//  entity in the index (entities.json) — enforced by
//  `OnboardingTests.test_starterPacks_areGroundedAndUnique` — so the agenda
//  reflects a tap immediately (the WP-16.4 «umiddelbar konsekvens» contract).
//  Sensible lenses are baked in where a competition should be seen "through the
//  Norwegians" (WP-18): golf's The Open, cycling's Tour, and athletics' EM —
//  so those render as the Norwegian names you'd actually watch, not a flat
//  foreign leaderboard.
//
//  Grounding notes (why some owner-named entities aren't literal ids):
//    • Eliteserien has no entity server-side yet (only OBOS-ligaen is grounded,
//      which is the owner's own tier) — so "Norsk fotball" grounds on the
//      broadly-meaningful national team. Adding Eliteserien to the catalog is a
//      server change, out of WP-132's scope.
//    • Jakob Ingebrigtsen has no athlete entity yet — "Friidrett" grounds on
//      Warholm + EM friidrett `throughNorwegians`, which surfaces every Norwegian
//      (Ingebrigtsen included) when they compete.
//    • Grand Slams / golf majors beyond The Open have no entities — following
//      Ruud/Hovland already surfaces their matches in those tournaments.
//    • Winter sport (skiskyting/langrenn/alpint/hopp) grounds on the four
//      sport-level entities (WP-64/116). It is OFF-SEASON in July, so it matches
//      nothing yet — honest and expected; the rows appear at season start (Nov).
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
    /// Short title ("Norske golfere").
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
    /// The curated list — broadly-meaningful Norwegian interests first, niche
    /// last (WP-132). Every id is a real WP-05 entity (entities.json) so a tap
    /// has immediate consequence on the board.
    static let all: [StarterPack] = [
        StarterPack(
            id: "norsk-fotball",
            title: "Norsk fotball",
            subtitle: "Landslaget — herrer og kvinner",
            reason: "Lagt til fra startpakken «Norsk fotball» — det norske landslaget.",
            rules: [
                // The national team is the one broadly-meaningful Norwegian
                // football follow (not the owner's club). Eliteserien has no
                // grounded entity yet (server-side), so the pack lands on it.
                StarterRule("norge", "Norge", sport: "football", type: "team"),
            ]
        ),
        StarterPack(
            id: "vintersport",
            title: "Vintersport",
            subtitle: "Skiskyting, langrenn, alpint og hopp — fra sesongstart i november",
            reason: "Lagt til fra startpakken «Vintersport».",
            rules: [
                // The four sport-level entities (WP-64/116). Off-season in July —
                // matches nothing yet; the rows appear at season start (honest).
                StarterRule("sport-biathlon", "Skiskyting", sport: "biathlon", type: "sport"),
                StarterRule("sport-cross-country", "Langrenn", sport: "cross-country", type: "sport"),
                StarterRule("sport-alpine", "Alpint", sport: "alpine", type: "sport"),
                StarterRule("sport-ski-jumping", "Hopp", sport: "ski jumping", type: "sport"),
            ]
        ),
        StarterPack(
            id: "friidrett",
            title: "Friidrett",
            subtitle: "Karsten Warholm og norsk friidrett i mesterskapene",
            reason: "Lagt til fra startpakken «Friidrett».",
            rules: [
                StarterRule("karsten-warholm", "Karsten Warholm", sport: "athletics", type: "athlete"),
                // EM through the Norwegians surfaces every Norwegian (Ingebrigtsen
                // included) when they compete — Ingebrigtsen has no own entity yet.
                StarterRule("em-friidrett-2026", "EM friidrett 2026", sport: "athletics", type: "tournament", lens: .throughNorwegians),
            ]
        ),
        StarterPack(
            id: "norsk-sykkel",
            title: "Sykkel",
            subtitle: "Tour de France gjennom de norske · Uno-X",
            reason: "Lagt til fra startpakken «Sykkel».",
            rules: [
                StarterRule("uno-x-mobility", "Uno-X Mobility", sport: "cycling", type: "team"),
                StarterRule("tour-de-france-2026", "Tour de France 2026", sport: "cycling", type: "tournament", lens: .throughNorwegians),
            ]
        ),
        StarterPack(
            id: "norske-golfere",
            title: "Golf",
            subtitle: "Viktor Hovland, Kristoffer Reitan og The Open — gjennom de norske",
            reason: "Lagt til fra startpakken «Golf».",
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
            subtitle: "Magnus Carlsen — når han spiller",
            reason: "Lagt til fra startpakken «Sjakk».",
            rules: [
                StarterRule("magnus-carlsen", "Magnus Carlsen", sport: "chess", type: "athlete"),
            ]
        ),
        StarterPack(
            id: "tennis-ruud",
            title: "Tennis",
            subtitle: "Casper Ruud — også i Grand Slam-turneringene",
            reason: "Lagt til fra startpakken «Tennis».",
            rules: [
                StarterRule("casper-ruud", "Casper Ruud", sport: "tennis", type: "athlete"),
            ]
        ),
        StarterPack(
            id: "internasjonal-fotball",
            title: "Internasjonal toppfotball",
            subtitle: "Premier League, La Liga og VM",
            reason: "Lagt til fra startpakken «Internasjonal toppfotball».",
            rules: [
                StarterRule("premier-league-2026-27", "Premier League 2026/27", sport: "football", type: "league"),
                StarterRule("la-liga-2026-27", "La Liga 2026/27", sport: "football", type: "league"),
                StarterRule("fifa-world-cup-2026", "FIFA World Cup 2026", sport: "football", type: "tournament"),
            ]
        ),
        StarterPack(
            id: "formel1",
            title: "Formel 1",
            subtitle: "Hele sesongen",
            reason: "Lagt til fra startpakken «Formel 1».",
            rules: [
                StarterRule("f1-world-championship-2026", "Formula 1 World Championship 2026", sport: "f1", type: "tournament"),
            ]
        ),
        StarterPack(
            id: "cs2",
            title: "e-sport (CS2)",
            subtitle: "De store CS2-turneringene",
            reason: "Lagt til fra startpakken «e-sport (CS2)».",
            rules: [
                // Generalised (WP-132): the marquee tournament, not the owner's
                // 100 Thieves / rain. Following it shows the whole event.
                StarterRule("esports-world-cup-2026-cs2", "Esports World Cup 2026 – CS2", sport: "esports", type: "tournament"),
            ]
        ),
    ]
}
