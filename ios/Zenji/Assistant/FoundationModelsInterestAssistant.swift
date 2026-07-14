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

    @Guide(description: "Linse — hvilket perspektiv brukeren vil følge dette gjennom. Gjelder kun 'add' og 'update'. Bruk 'sport' for hele sporten/turneringen (standard), 'norwegians' når brukeren sier «med fokus på norske», «bare de norske» e.l., eller 'athletes' når brukeren vil følge bestemte utøvere (f.eks. «bare når Ruud spiller») — da MÅ du fylle lensAthleteIds.")
    var lens: String

    @Guide(description: "Kun når lens = 'athletes': entityId-ene (fra searchEntities) til utøverne brukeren vil følge dette gjennom. Ellers tom liste. Bruk kun ekte id-er fra verktøyet — aldri oppdiktede.")
    var lensAthleteIds: [String]
}

/// The top-level structure the session generates for a single utterance
/// (WP-16.4). It carries a routing `intent` plus BOTH possible payloads; the
/// conversion below reads only the one the intent selects. Kept flat (no nested
/// enums/optionals) for a simple, robust generated schema.
@Generable
struct GeneratedTurn {
    @Guide(description: "Intent: 'mutations' hvis brukeren vil ENDRE hva som følges (følg/slutt/prioriter), 'answer' hvis brukeren STILLER ET SPØRSMÅL om hva/når/hvor (f.eks. «hva bør jeg se i kveld?», «når går neste etappe?»).")
    var intent: String

    @Guide(description: "Kun når intent = 'mutations': alle foreslåtte endringer utledet fra ytringen. Tom liste ellers.")
    var mutations: [GeneratedMutation]

    @Guide(description: "Kun når intent = 'answer': et rolig, kort svar på norsk. Bruk searchEvents for å finne hva som faktisk står på agendaen, og referer til radene med tid, tittel og kanal. Ikke finn på hendelser. Tom streng ellers.")
    var answer: String

    @Guide(description: "Kun når intent = 'answer': eventId-ene (kolonne 1 fra searchEvents) til radene svaret refererer til. Bruk kun ekte id-er fra verktøyet. Tom liste ellers.")
    var referencedEventIds: [String]
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

// MARK: - searchEvents tool (WP-16.4 — the answer arm's LOCAL data)

/// The tool the model calls to answer a question over the agenda. It reads the
/// same `FeedQuery` the app compiled from cache — on-device only, no network —
/// so the model can only ever cite events the user can actually see. Column 1
/// is the eventId the model must put in `referencedEventIds`.
struct EventSearchTool: Tool {
    let name = "searchEvents"
    let description = "Søk i brukerens agenda (det som er på i dag/kommende dager). Bruk 'i kveld' eller 'i dag' for de spørsmålene, ellers et navn/idrett (f.eks. 'Tour de France', 'fotball'). Tom spørring gir det neste som kommer. Returnerer ekte eventId-er du MÅ bruke i referencedEventIds."

    let feed: FeedQuery

    @Generable
    struct Arguments {
        @Guide(description: "Hva du vil finne: 'i kveld', 'i dag', et navn/en turnering/en idrett, eller tom for det neste som kommer.")
        var query: String
    }

    func call(arguments: Arguments) async throws -> String {
        let q = arguments.query.trimmingCharacters(in: .whitespacesAndNewlines)
        let n = " " + TextMatch.normalize(q) + " "
        let hits: [FeedQueryEvent]
        if q.isEmpty {
            hits = Array(feed.upcoming().prefix(6))
        } else if n.contains(" kveld ") {
            hits = feed.tonight()
        } else if n.contains(" i dag ") || n.contains(" idag ") {
            hits = feed.today()
        } else {
            hits = feed.search(q)
        }
        return FeedQuery.toolLines(for: hits)
    }
}

// MARK: - getProfile tool (WP-16.4 — what the user already follows)

/// A read-only tool exposing the current interest profile, so an answer can be
/// grounded in what the user actually follows ("du følger allerede …") without
/// stuffing the whole profile into the instructions.
struct ProfileTool: Tool {
    let name = "getProfile"
    let description = "Hent hva brukeren følger nå (utøvere, lag, turneringer). Nyttig for å svare på hva brukeren bør se."

    let profile: InterestProfile

    @Generable
    struct Arguments {}

    func call(arguments: Arguments) async throws -> String {
        guard !profile.rules.isEmpty else { return "Brukeren følger ingenting ennå." }
        let lines = profile.rules.map { rule -> String in
            let scope = rule.scope.map { " (\($0))" } ?? ""
            return "\(rule.entityName) | \(rule.sport)\(scope)"
        }
        return "Følger:\n" + lines.joined(separator: "\n")
    }
}

// MARK: - The assistant

struct FoundationModelsInterestAssistant: InterestAssistant {

    func availability() -> AssistantAvailability {
        Self.map(SystemLanguageModel.default.availability)
    }

    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery) async throws -> AssistantTurn {
        let model = SystemLanguageModel.default
        guard case .available = model.availability else {
            throw AssistantError.unavailable(message: Self.map(model.availability).message ?? Self.genericUnavailable)
        }

        let session = LanguageModelSession(
            model: model,
            tools: [EntitySearchTool(index: index), EventSearchTool(feed: feed), ProfileTool(profile: profile)],
            instructions: Self.instructions(profile: profile)
        )

        do {
            let turn = try await session.respond(to: utterance, generating: GeneratedTurn.self).content
            if turn.intent.lowercased().contains("answer") {
                return .answer(AssistantAnswer(
                    text: turn.answer.trimmingCharacters(in: .whitespacesAndNewlines),
                    referencedEventIds: turn.referencedEventIds
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                ))
            }
            return .mutations(turn.mutations.compactMap(Self.convert))
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
            reason: reason.isEmpty ? "Foreslått fra ytringen din." : reason,
            lens: lens(from: g)
        )
    }

    /// GeneratedMutation → Lens. The raw athlete ids are left UNTRUSTED here —
    /// `MutationGrounder` re-checks them (and fills the canonical display name),
    /// exactly like the top-level entityId. An unrecognised lens string, or a
    /// `.remove`, falls back to `.sportAsSuch`.
    static func lens(from g: GeneratedMutation) -> Lens {
        switch g.lens.lowercased().trimmingCharacters(in: .whitespaces) {
        case "norwegians", "norske", "norsk", "norway", "norge":
            return .throughNorwegians
        case "athletes", "athlete", "utovere", "utøvere", "utover", "utøver":
            let athletes = g.lensAthleteIds
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .map { LensAthlete(entityId: $0, name: $0) }
            return athletes.isEmpty ? .sportAsSuch : .throughAthletes(athletes)
        default:
            return .sportAsSuch
        }
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
        Du er en rolig, presis assistent som hjelper en norsk sportsfan. Brukeren skriver på norsk.
        Først: avgjør INTENT.
          • intent = 'mutations' når brukeren vil ENDRE hva som følges (følg, slutt, prioriter, mer/mindre).
          • intent = 'answer' når brukeren STILLER ET SPØRSMÅL om agendaen (hva/når/hvor — «hva bør jeg
            se i kveld?», «når går neste etappe?», «hvor kan jeg se X?»).

        NÅR intent = 'answer':
        - Bruk verktøyet searchEvents for å finne hva som faktisk står på agendaen (i dag/kommende).
        - Bruk getProfile hvis det hjelper å vite hva brukeren allerede følger.
        - Skriv et kort, rolig svar på norsk som refererer til radene med tid, tittel og kanal.
        - Fyll referencedEventIds med eventId-ene (kolonne 1 fra searchEvents) du refererer til.
        - Ikke finn på hendelser. Finner du ingenting, si det ærlig. La mutations være tom.

        NÅR intent = 'mutations':
        - Bruk ALLTID verktøyet searchEntities for å finne ekte entityId-er før du foreslår noe.
        - Foreslå KUN mutasjoner med entityId-er verktøyet returnerte. Aldri finn på id-er eller navn.
        - Hvis du ikke finner noe som passer, ikke foreslå en mutasjon for det.
        - «slutt med <idrett>» betyr å fjerne det brukeren allerede følger i den idretten.
        - Sett en kort, ærlig begrunnelse på norsk i reason på hver mutasjon.
        - Vær konservativ: foreslå bare det ytringen faktisk ber om. La answer være tom.

        LINSE (perspektivet brukeren vil følge noe gjennom — felt: lens):
        - «Følg Tour de France med fokus på norske utøvere» → add på Tour de France med lens = 'norwegians'.
        - «Følg VM i friidrett, bare de norske» → add på turneringen med lens = 'norwegians'.
        - «Følg Tour de France bare når Kristoff er med» → add på Tour de France med lens = 'athletes' og lensAthleteIds = [Kristoffs entityId fra searchEntities].
        - «Følg hele Premier League» / uten noe fokus-uttrykk → lens = 'sport' (standard).
        - Linse endrer ALDRI hvilken entitet du følger — den sier bare hvordan. Entiteten (turneringen/laget) må fortsatt være en ekte id fra verktøyet, og utøverne i 'athletes' likeså.

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

    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery) async throws -> AssistantTurn {
        throw AssistantError.unavailable(message: "Apple Intelligence er ikke tilgjengelig i denne byggevarianten.")
    }
}

#endif
