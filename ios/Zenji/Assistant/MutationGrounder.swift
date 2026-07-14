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
            let lens = groundedLens(for: proposal, previous: previous, index: index)

            grounded.append(GroundedMutation(
                kind: proposal.kind,
                entity: entity,
                scope: scope,
                weight: weight,
                reason: proposal.reason,
                previousRule: previous,
                lens: lens
            ))
        }

        return GroundingResult(grounded: grounded, rejected: rejected)
    }

    // MARK: - Lens grounding

    /// Grounds a proposal's lens the same way the entity id is grounded (WP-16.1):
    ///   • `.remove` never carries a lens — you don't stop-following "through" a
    ///     perspective.
    ///   • `.throughAthletes` ids are re-checked against the index, exactly like
    ///     the top-level entity id. Ids that don't resolve are dropped (and their
    ///     display name is normalised to the index's canonical name); if none
    ///     survive, the lens degrades to `.sportAsSuch`.
    ///   • An `.update` that specifies no lens (`.sportAsSuch`, the default)
    ///     inherits the existing rule's lens, mirroring how scope/weight carry
    ///     over.
    private static func groundedLens(for proposal: ProposedMutation, previous: InterestRule?, index: EntityIndex) -> Lens {
        switch proposal.kind {
        case .remove:
            return .sportAsSuch
        case .add:
            return resolve(proposal.lens, index: index)
        case .update:
            return proposal.lens.isDefault ? (previous?.lens ?? .sportAsSuch) : resolve(proposal.lens, index: index)
        }
    }

    private static func resolve(_ lens: Lens, index: EntityIndex) -> Lens {
        guard case let .throughAthletes(athletes) = lens else { return lens }
        var seen = Set<String>()
        let grounded = athletes.compactMap { athlete -> LensAthlete? in
            guard let entity = index.entity(id: athlete.entityId), seen.insert(entity.id).inserted else { return nil }
            return LensAthlete(entityId: entity.id, name: entity.name)
        }
        return grounded.isEmpty ? .sportAsSuch : .throughAthletes(grounded)
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
