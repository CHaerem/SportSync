//
//  EffectiveInterests.swift
//  Zenji
//
//  WP-16.4 — the bridge that makes "Bekreft → agendaen re-kompileres synlig med
//  det samme" real. The agenda is compiled from the SYNCED, server-owned
//  `Interests`; the assistant edits a SEPARATE, local, human-owned
//  `InterestProfile` (ProfileStore). Without a bridge, confirming "Følg X"
//  would change the profile but leave the board unchanged — the opposite of
//  "the assistant IS the interface". This folds the local profile into the
//  interests the FeedCompiler keys off, so a just-confirmed follow shows up on
//  recompile immediately.
//
//  Additive by design: every profile rule becomes a tracked entity in the
//  bucket matching its entity type (athlete/team/league → the team & athlete
//  buckets that ring the bell + earn the accent; tournament → the quieter
//  tournament bucket), carrying the entity's real aliases from the index so
//  word-boundary matching still finds it ("Lyn" as well as "FK Lyn Oslo"). It
//  NEVER removes what the server already tracks — a `remove` in the profile
//  simply drops that rule, so it stops being merged in. The local layer sits on
//  top of the server config; it doesn't fight it (a rule can't suppress a sport
//  the server follows broadly — honest, and out of scope for WP-16.4).
//

import Foundation

enum EffectiveInterests {

    /// The interests the agenda should compile against right now: the synced
    /// `base` with the local `profile` folded in. Pure — no disk, no clock — so
    /// the "immediate consequence" contract is unit-testable directly.
    static func merge(profile: InterestProfile, into base: Interests, index: EntityIndex) -> Interests {
        guard !profile.rules.isEmpty else { return base }

        var athletes = base.alwaysTrack.athletes
        var teams = base.alwaysTrack.teams
        var tournaments = base.alwaysTrack.tournaments

        func contains(_ list: [Interests.Entity], _ name: String) -> Bool {
            list.contains { TextMatch.normalize($0.name) == TextMatch.normalize(name) }
        }

        for rule in profile.rules {
            let entity = index.entity(id: rule.entityId)
            let name = entity?.name ?? rule.entityName
            let aliases = entity?.aliases ?? []
            let sport = entity?.sport ?? rule.sport
            let type = entity?.type ?? ""
            let merged = Interests.Entity(name: name, aliases: aliases, sport: sport, notify: nil)

            switch type {
            case "team", "league":
                if !contains(teams, name) { teams.append(merged) }
            case "tournament":
                if !contains(tournaments, name) { tournaments.append(merged) }
            default: // athlete + any unknown type → the athlete bucket
                if !contains(athletes, name) { athletes.append(merged) }
            }
        }

        return Interests(
            followBroadly: base.followBroadly,
            alwaysTrack: Interests.AlwaysTrack(athletes: athletes, teams: teams, tournaments: tournaments),
            notify: base.notify
        )
    }
}
