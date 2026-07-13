//
//  MutationGrounder.swift
//  Zenji
//
//  WP-16 — THE HARD RULE, in one pure function. Every proposal the model makes
//  is checked against the entity index here before it can touch the profile: a
//  proposal is accepted ONLY if its `entityId` resolves to a real entity. A
//  free-text entity the model invented (or an id it hallucinated despite the
//  searchEntities tool) is rejected — never applied — with a calm Norwegian
//  explanation and up to three nearest-match suggestions ("fant ikke «X» i
//  indeksen — mente du …?"). This is the guarantee the whole feature rests on:
//  the model can phrase things freely, but it can only ever change rules about
//  entities that actually exist.
//
//  Pure and side-effect-free (index + profile in, GroundingResult out) so
//  MutationGrounderTests can prove both the accept and the reject path with no
//  model, no disk, no UI.
//

import Foundation

enum MutationGrounder {

    /// Grounds a batch of raw proposals against `index`, using `profile` only to
    /// attach the existing rule (for the DIFF's before/after) and to inherit a
    /// weight/scope an update leaves unspecified.
    static func ground(_ proposals: [ProposedMutation], index: EntityIndex, profile: InterestProfile) -> GroundingResult {
        var grounded: [GroundedMutation] = []
        var rejected: [RejectedMutation] = []

        for proposal in proposals {
            // THE gate: the claimed entityId must exist in the index, verbatim.
            guard let entity = index.entity(id: proposal.entityId) else {
                rejected.append(reject(proposal, index: index))
                continue
            }

            let previous = profile.rule(for: entity.id)
            let weight = proposal.weight
                ?? previous?.weight
                ?? InterestProfile.defaultWeight
            // An update with no new scope keeps the existing one; an add uses
            // whatever it was given (possibly nil = no scope).
            let scope: String?
            switch proposal.kind {
            case .update:
                scope = proposal.scope ?? previous?.scope
            case .add, .remove:
                scope = proposal.scope
            }

            grounded.append(GroundedMutation(
                kind: proposal.kind,
                entity: entity,
                scope: scope,
                weight: weight,
                reason: proposal.reason,
                previousRule: previous
            ))
        }

        return GroundingResult(grounded: grounded, rejected: rejected)
    }

    // MARK: - Rejection

    private static func reject(_ proposal: ProposedMutation, index: EntityIndex) -> RejectedMutation {
        let query = proposal.entityQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? proposal.entityId
            : proposal.entityQuery
        let suggestions = index.nearestMatches(to: query)
        return RejectedMutation(
            query: query,
            explanation: rejectionText(query: query, suggestions: suggestions),
            suggestions: suggestions
        )
    }

    /// The Norwegian rejection message — with a "mente du …?" tail only when
    /// there is a genuine near-match to offer.
    static func rejectionText(query: String, suggestions: [Entity]) -> String {
        let subject = query.isEmpty ? "det" : "«\(query)»"
        if suggestions.isEmpty {
            return "Fant ikke \(subject) i indeksen over det du kan følge. Prøv et navn eller en turnering jeg kjenner."
        }
        let names = suggestions.map { $0.name }.joined(separator: ", ")
        return "Fant ikke \(subject) i indeksen — mente du: \(names)?"
    }
}
