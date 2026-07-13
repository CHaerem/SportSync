//
//  FoundationModelsInterestAssistant.swift
//  Zenji
//
//  WP-16 — the REAL model, on-device Apple Intelligence via the FoundationModels
//  framework (iOS 26+). This is the ONLY file in the app that imports
//  FoundationModels; everything else (grounding, diff, persistence, UI, tests)
//  depends solely on the FM-free `InterestAssistant` protocol, so the vendor
//  surface is confined to one layer (CLAUDE.md's portability principle applied
//  to the client).
//
//  It runs, in practice, only on the physical device (the DeviceDev build): the
//  Simulator and CI report `SystemLanguageModel.default.availability ==
//  .unavailable`, which this maps to a calm, honest Norwegian message rather
//  than a crash or an empty result. The on-device conversations themselves are
//  verified by a human against the manual checklist in the PR — the automated
//  tests all run against `MockInterestAssistant`.
//
//  How grounding stays airtight even with a free-generating model: the model is
//  given a `searchEntities` tool over the real index and instructed to only
//  ever cite ids it returned — but its output is STILL passed through
//  `MutationGrounder` downstream (AssistantViewModel), which re-checks every id.
//  A hallucinated id is rejected there, identically to the mock's path.
//

#if canImport(FoundationModels)
import Foundation
import FoundationModels

// MARK: - @Generable output schema

/// One structured mutation the model emits. `action`/`entityId`/`entityQuery`/
/// `scope`/`weight`/`reason` map straight onto `ProposedMutation`. Kept as
/// plain `String`/`Double` (no closed enums, no optionals) to keep the generated
/// schema simple and robust; the conversion below normalises them.
@Generable
struct GeneratedMutation {
    @Guide(description: "Handlingen: 'add' for å begynne å følge, 'remove' for å slutte å følge, 'update' for å endre vekt eller omfang på noe du allerede følger.")
    var action: String

    @Guide(description: "entityId fra searchEntities-verktøyet. MÅ være en id verktøyet faktisk returnerte — aldri finn på en id. Tom streng hvis du ikke fant noe.")
    var entityId: String

    @Guide(description: "Ordet eller navnet brukeren brukte, ordrett (f.eks. 'Ruud', 'tennis', 'sykkel').")
    var entityQuery: String

    @Guide(description: "Valgfri norsk avgrensning, f.eks. 'bare i Grand Slams' eller 'i juli'. Tom streng hvis ingen avgrensning.")
    var scope: String

    @Guide(description: "Hvor viktig dette er, fra 0 til 1. Bruk 0.5 som standard, høyere hvis brukeren vil prioritere det.")
    var weight: Double

    @Guide(description: "Kort begrunnelse på norsk for hvorfor denne endringen foreslås. Skal alltid fylles ut.")
    var reason: String
}

/// The top-level structure the session generates for a single utterance.
@Generable
struct GeneratedMutationList {
    @Guide(description: "Alle foreslåtte endringer utledet fra ytringen. Tom liste hvis ingenting kan utledes.")
    var mutations: [GeneratedMutation]
}

// MARK: - searchEntities tool

/// The grounding tool the model calls to look up real entities. It reads the
/// live `EntityIndex`, so the model can only ever surface ids that exist —
/// the first line of defence for the hard grounding rule (the second being
/// `MutationGrounder`, which re-checks the model's output regardless).
struct EntitySearchTool: Tool {
    let name = "searchEntities"
    let description = "Søk i indeksen over utøvere, lag og turneringer brukeren kan følge. Returnerer ekte entityId-er. Bruk dette FØR du foreslår en mutasjon, og bruk kun id-er herfra."

    let index: EntityIndex

    @Generable
    struct Arguments {
        @Guide(description: "Navn, lag, turnering eller idrett å søke etter, f.eks. 'Ruud', 'Lyn', 'tennis', 'sykkel'.")
        var query: String
    }

    func call(arguments: Arguments) async throws -> String {
        let hits = index.search(arguments.query, limit: 8)
        guard !hits.isEmpty else {
            return "Ingen treff for «\(arguments.query)». Ikke foreslå en mutasjon for dette."
        }
        let lines = hits.map { "\($0.id) | \($0.name) | \($0.sport) | \($0.type)" }
        return "Treff (bruk kolonne 1 som entityId):\n" + lines.joined(separator: "\n")
    }
}

// MARK: - The assistant

struct FoundationModelsInterestAssistant: InterestAssistant {

    func availability() -> AssistantAvailability {
        Self.map(SystemLanguageModel.default.availability)
    }

    func propose(utterance: String, profile: InterestProfile, index: EntityIndex) async throws -> [ProposedMutation] {
        let model = SystemLanguageModel.default
        guard case .available = model.availability else {
            throw AssistantError.unavailable(message: Self.map(model.availability).message ?? Self.genericUnavailable)
        }

        let session = LanguageModelSession(
            model: model,
            tools: [EntitySearchTool(index: index)],
            instructions: Self.instructions(profile: profile)
        )

        do {
            let response = try await session.respond(to: utterance, generating: GeneratedMutationList.self)
            return response.content.mutations.compactMap(Self.convert)
        } catch {
            throw AssistantError.generationFailed(message: "Klarte ikke å tolke ytringen akkurat nå. Prøv å formulere den enklere.")
        }
    }

    // MARK: - Mapping

    static func map(_ availability: SystemLanguageModel.Availability) -> AssistantAvailability {
        switch availability {
        case .available:
            return .available
        case let .unavailable(reason):
            return .unavailable(message: message(for: reason))
        }
    }

    static func message(for reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .appleIntelligenceNotEnabled:
            return "Apple Intelligence er slått av. Slå det på i Innstillinger for å bruke assistenten."
        case .modelNotReady:
            return "Språkmodellen er ikke lastet ned ennå. Prøv igjen om litt."
        case .deviceNotEligible:
            return "Denne enheten støtter ikke Apple Intelligence, så assistenten er ikke tilgjengelig her."
        @unknown default:
            return genericUnavailable
        }
    }

    static let genericUnavailable = "Assistenten er ikke tilgjengelig akkurat nå."

    /// GeneratedMutation → ProposedMutation. Defensive: an unrecognised action
    /// falls back to `.add`, an empty scope becomes nil, a non-positive weight
    /// becomes nil (grounder default). A hallucinated/empty entityId is left as
    /// is — grounding rejects it downstream with a suggestion.
    static func convert(_ g: GeneratedMutation) -> ProposedMutation? {
        let kind: MutationKind
        switch g.action.lowercased().trimmingCharacters(in: .whitespaces) {
        case "remove", "fjern", "slutt": kind = .remove
        case "update", "endre", "oppdater": kind = .update
        default: kind = .add
        }
        let scope = g.scope.trimmingCharacters(in: .whitespacesAndNewlines)
        let reason = g.reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return ProposedMutation(
            kind: kind,
            entityId: g.entityId.trimmingCharacters(in: .whitespacesAndNewlines),
            entityQuery: g.entityQuery.trimmingCharacters(in: .whitespacesAndNewlines),
            scope: scope.isEmpty ? nil : scope,
            weight: g.weight > 0 ? min(g.weight, 1.0) : nil,
            reason: reason.isEmpty ? "Foreslått fra ytringen din." : reason
        )
    }

    static func instructions(profile: InterestProfile) -> String {
        let following: String
        if profile.rules.isEmpty {
            following = "Brukeren følger ingenting ennå."
        } else {
            following = "Brukeren følger allerede: " + profile.rules.map { rule in
                rule.scope.map { "\(rule.entityName) (\($0))" } ?? rule.entityName
            }.joined(separator: ", ") + "."
        }

        return """
        Du er en rolig, presis assistent som hjelper en norsk sportsfan å styre hva appen følger.
        Brukeren skriver på norsk. Gjør om ytringen til en liste med strukturerte mutasjoner.

        REGLER:
        - Bruk ALLTID verktøyet searchEntities for å finne ekte entityId-er før du foreslår noe.
        - Foreslå KUN mutasjoner med entityId-er verktøyet returnerte. Aldri finn på id-er eller navn.
        - Hvis du ikke finner noe som passer, ikke foreslå en mutasjon for det.
        - «slutt med <idrett>» betyr å fjerne det brukeren allerede følger i den idretten.
        - Sett en kort, ærlig begrunnelse på norsk i reason på hver mutasjon.
        - Vær konservativ: foreslå bare det ytringen faktisk ber om.

        \(following)
        """
    }
}

#else

// FoundationModels not importable (e.g. an older SDK) — provide the same type
// so the app still builds and links; it simply reports unavailable.
import Foundation

struct FoundationModelsInterestAssistant: InterestAssistant {
    func availability() -> AssistantAvailability {
        .unavailable(message: "Apple Intelligence er ikke tilgjengelig i denne byggevarianten.")
    }

    func propose(utterance: String, profile: InterestProfile, index: EntityIndex) async throws -> [ProposedMutation] {
        throw AssistantError.unavailable(message: "Apple Intelligence er ikke tilgjengelig i denne byggevarianten.")
    }
}

#endif
