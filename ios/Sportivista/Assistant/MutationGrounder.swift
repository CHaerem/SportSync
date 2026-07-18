//
//  MutationGrounder.swift
//  Sportivista
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
            if let entity = index.entity(id: proposal.entityId) {
                grounded.append(build(proposal, on: entity, index: index, profile: profile))
                continue
            }
            // WP-16.2: the id didn't resolve exactly — hand the query to the
            // fuzzy resolver. An UNAMBIGUOUS, confident top hit ("tour de
            // france", "tdf", the typo "Tour de Farnce") is SERVED directly:
            // the correction happens deterministically in the lookup, never by
            // turning the model's free text loose. Anything ambiguous or
            // genuinely absent is rejected — now with the resolver's ranked
            // candidates as the (tappable) "mente du …?" suggestions.
            let resolution = index.resolve(resolutionQuery(for: proposal))
            if let served = resolution.served {
                grounded.append(build(proposal, on: served, index: index, profile: profile))
            } else {
                rejected.append(reject(proposal, resolution: resolution))
            }
        }

        return GroundingResult(grounded: grounded, rejected: rejected)
    }

    /// Assemble a grounded mutation from a proposal + the entity it resolved to
    /// (exactly or via the fuzzy resolver). Scope/weight/lens carry over from
    /// the existing rule for an unspecified `.update`, exactly as before.
    private static func build(_ proposal: ProposedMutation, on entity: Entity, index: EntityIndex, profile: InterestProfile) -> GroundedMutation {
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

        return GroundedMutation(
            kind: proposal.kind,
            entity: entity,
            scope: scope,
            weight: weight,
            reason: proposal.reason,
            previousRule: previous,
            lens: lens
        )
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

    /// The phrase a failed proposal is resolved/explained against: the user's
    /// verbatim words when present, else the (bogus) id it carried.
    private static func resolutionQuery(for proposal: ProposedMutation) -> String {
        let phrase = proposal.entityQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return phrase.isEmpty ? proposal.entityId : phrase
    }

    private static func reject(_ proposal: ProposedMutation, resolution: EntityIndex.Resolution) -> RejectedMutation {
        let query = resolutionQuery(for: proposal)
        let suggestions = resolution.candidates.map(\.entity)
        return RejectedMutation(
            query: query,
            explanation: rejectionText(query: query, suggestions: suggestions),
            suggestions: suggestions,
            proposal: proposal
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
