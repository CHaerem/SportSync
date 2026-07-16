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
    @Guide(description: "'add' (følg), 'remove' (slutt å følge), 'update' (endre vekt/omfang).")
    var action: String

    @Guide(description: "entityId fra searchEntities — kun en id verktøyet faktisk returnerte, aldri oppdiktet. Tom ved ingen treff.")
    var entityId: String

    @Guide(description: "Ordet bruker brukte, ordrett (f.eks. 'Ruud', 'tennis').")
    var entityQuery: String

    @Guide(description: "Valgfri avgrensning ('bare i Grand Slams'). Tom hvis ingen.")
    var scope: String

    @Guide(description: "Viktighet 0–1. Standard 0.5, høyere ved prioritering.")
    var weight: Double

    @Guide(description: "Kort norsk begrunnelse. Alltid fylt.")
    var reason: String

    @Guide(description: "Kun add/update: 'sport' (hele sporten, standard), 'norwegians' («bare de norske»), 'athletes' (bestemte utøvere → fyll lensAthleteIds).")
    var lens: String

    @Guide(description: "Kun lens='athletes': entityId-ene (searchEntities) til utøverne. Ellers tom. Kun ekte id-er.")
    var lensAthleteIds: [String]
}

// WP-71 — the ONE big `GeneratedTurn` (routing intent + every arm's fields on
// one flat schema) was split into a tiny intent classifier plus one focused
// schema PER arm. No single generation carries all four arms' fields anymore,
// which (with the per-arm tool sets) is what brings each generation back inside
// the 4096-token context. See `AssistantInstructions` for the full rationale.

/// Phase 1 — the routing decision, on its own tiny, tool-less generation.
@Generable
struct GeneratedIntent {
    @Guide(description: "Én av: 'mutations' (endre hva som følges), 'answer' (spørsmål om agenda eller app), 'command' (appen skal gjøre noe), 'present' (midlertidig endre hva agendaen viser).")
    var intent: String
}

/// Phase 2 — the mutation arm's output (fan-out over the utterance).
@Generable
struct GeneratedMutations {
    @Guide(description: "Alle foreslåtte endringer, én per ledd i ytringen.")
    var mutations: [GeneratedMutation]
}

/// Phase 2 — the answer arm's output.
@Generable
struct GeneratedAnswer {
    @Guide(description: "Kort, rolig norsk svar.")
    var answer: String

    @Guide(description: "For agendasvar: eventId-ene (kolonne 1 fra searchEvents) svaret refererer. Kun ekte id-er. Tom for app-hjelp.")
    var referencedEventIds: [String]
}

/// Phase 2 — the command arm's output (no tools).
@Generable
struct GeneratedCommand {
    @Guide(description: "Én av theme/reset/onboarding/share/memory/forget/notifications/open.")
    var command: String

    @Guide(description: "Argument: theme→dark/light/system; reset→everything/followed; notifications→on/off; open→hendelsesnavn; forget→hva (alt).")
    var commandArgument: String
}

/// Phase 2 — the present arm's output (no tools).
@Generable
struct GeneratedPresent {
    @Guide(description: "Kort frase for hva agendaen skal vise (idretter/utøvere + evt. vindu). «alt» nullstiller.")
    var presentFilter: String
}

// MARK: - searchEntities tool

/// The grounding tool the model calls to look up real entities. It reads the
/// live `EntityIndex`, so the model can only ever surface ids that exist —
/// the first line of defence for the hard grounding rule (the second being
/// `MutationGrounder`, which re-checks the model's output regardless).
struct EntitySearchTool: Tool {
    let name = "searchEntities"
    let description = "Søk i indeksen over utøvere/lag/turneringer/idretter. Returnerer ekte entityId-er. Kall FØR en mutasjon; bruk kun id-er herfra."

    let index: EntityIndex

    @Generable
    struct Arguments {
        @Guide(description: "Navn/lag/turnering/idrett, f.eks. 'Ruud', 'tennis'.")
        var query: String
    }

    func call(arguments: Arguments) async throws -> String {
        let hits = index.search(arguments.query, limit: 6)
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
    let description = "Søk i brukerens agenda (i dag/kommende). Bruk 'i kveld'/'i dag', et navn/idrett, eller tom for det neste. Returnerer eventId-er du MÅ bruke i referencedEventIds."

    let feed: FeedQuery

    @Generable
    struct Arguments {
        @Guide(description: "'i kveld', 'i dag', et navn/turnering/idrett, eller tom for det neste.")
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
    let description = "Hent hva brukeren følger nå. Nyttig for å svare på hva brukeren bør se."

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

// MARK: - getHelp tool (WP-68 — the curated app-help knowledge)

/// A read-only tool exposing the versioned `AssistantHelp` capability document,
/// so a "hva kan du?" / "hvordan gjør jeg X?" question is answered from CURATED
/// fact (what the app actually does + which action to take), never from
/// guesswork or general world knowledge. The mirror of `getProfile`: the model
/// reads it; the deterministic mock answers from `AssistantHelp.answer(for:)`.
struct HelpTool: Tool {
    let name = "getHelp"
    let description = "Slå opp hva appen/assistenten kan og hvordan brukeren gjør vanlige ting. Bruk ved «hva kan du?»/«hvordan gjør jeg X?» — ikke gjett."

    @Generable
    struct Arguments {}

    func call(arguments: Arguments) async throws -> String {
        AssistantHelp.document()
    }
}

// MARK: - saveMemory tool (WP-30 — persist a durable personal fact)

/// The tool the model calls to remember something DURABLE about the user (their
/// knowledge level, a spoiler policy, a notify window, a preference). It writes
/// through a `MemorySink` (the app's `MemoryStore`); the persistence is proven
/// by `MemoryStoreTests` / `SaveMemoryTool`'s round-trip without needing Apple
/// Intelligence. It never reads the agenda — it only records personal context.
struct SaveMemoryTool: Tool {
    let name = "saveMemory"
    let description = "Lagre noe VARIG om brukeren selv: kunnskapsnivå, spoilervern, varselsvindu eller en preferanse. Kun når bruker uttrykker noe varig om SEG SELV."

    let sink: any MemorySink

    @Generable
    struct Arguments {
        @Guide(description: "'knowledgeLevel', 'spoilerPolicy' (ser på opptak), 'notifyWindow', 'preference' eller 'note'.")
        var kind: String

        @Guide(description: "Valgfri entityId fra searchEntities. Tom hvis hel idrett/generelt.")
        var entityId: String

        @Guide(description: "Valgfri idrett ('chess', 'f1', 'golf'). Tom hvis entitet/generelt.")
        var sport: String

        @Guide(description: "Verdien, kort — 'nybegynner', 'opptak', '08:00'.")
        var value: String

        @Guide(description: "Kort norsk begrunnelse.")
        var reason: String
    }

    func call(arguments: Arguments) async throws -> String {
        let entityId = arguments.entityId.trimmingCharacters(in: .whitespacesAndNewlines)
        let sport = arguments.sport.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = arguments.value.trimmingCharacters(in: .whitespacesAndNewlines)
        let reason = arguments.reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return "Ikke lagret — mangler verdi." }
        let command = SaveMemoryCommand(
            entityId: entityId.isEmpty ? nil : entityId,
            sport: sport.isEmpty ? nil : sport,
            kind: Self.memoryKind(from: arguments.kind),
            value: value,
            reason: reason.isEmpty ? "Lært fra samtalen." : reason
        )
        sink.save(command)
        return "Lagret i minnet (\(command.kind.rawValue)): \(value)."
    }

    /// Map the model's free-text kind string to a `MemoryKind`, defaulting to
    /// `.note` for anything unrecognised.
    static func memoryKind(from raw: String) -> MemoryKind {
        switch raw.lowercased().trimmingCharacters(in: .whitespaces) {
        case "knowledgelevel", "kunnskapsniva", "kunnskap": return .knowledgeLevel
        case "spoilerpolicy", "spoiler", "spoilervern", "opptak": return .spoilerPolicy
        case "notifywindow", "varsel", "varselsvindu", "varsling": return .notifyWindow
        case "preference", "preferanse": return .preference
        default: return .note
        }
    }
}

// MARK: - The assistant

struct FoundationModelsInterestAssistant: InterestAssistant {

    func availability() -> AssistantAvailability {
        Self.map(SystemLanguageModel.default.availability)
    }

    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery, memory: MemoryContext) async throws -> AssistantTurn {
        let model = SystemLanguageModel.default
        guard case .available = model.availability else {
            throw AssistantError.unavailable(message: Self.map(model.availability).message ?? Self.genericUnavailable)
        }

        // WP-30 — retrieval: build the memory digest for what's relevant to this
        // utterance (what the user follows + anything they named) and inject it
        // into the instructions, so the answer/mutation REFLECTS what we know.
        var relevantEntityIds = Set(profile.rules.map(\.entityId))
        var relevantSports = Set(profile.rules.map(\.sport))
        for e in index.detectEntities(in: utterance) { relevantEntityIds.insert(e.id); relevantSports.insert(e.sport) }
        if let sport = EntityIndex.sportKeyword(in: utterance) { relevantSports.insert(sport) }
        let digest = MemoryDigest.build(memory: memory.state, relevantEntityIds: relevantEntityIds, relevantSports: relevantSports, now: Date())

        let canSaveMemory = memory.sink != nil

        do {
            // WP-71 — PHASE 1: classify the intent on a tiny, tool-less session.
            // A few hundred tokens total, so it never strains the context and the
            // routing decision is made before any heavy schema/tools are loaded.
            let classifier = LanguageModelSession(model: model, instructions: AssistantInstructions.classifier)
            let intent = try await classifier.respond(to: utterance, generating: GeneratedIntent.self).content.intent.lowercased()

            // WP-71 — PHASE 2: run ONLY the chosen arm, with ONLY its prompt, its
            // own small schema, and the tools it actually needs. This is what
            // keeps each generation inside the 4096-token on-device context.
            if intent.contains("command") || intent.contains("kommando") {
                let session = LanguageModelSession(model: model, instructions: AssistantInstructions.command)
                let out = try await session.respond(to: utterance, generating: GeneratedCommand.self).content
                if let command = Self.command(name: out.command, argument: out.commandArgument) {
                    return .command(command)
                }
                // An unrecognised command falls through to the mutation arm rather
                // than doing nothing (same defence-in-depth as before).
                return try await self.mutate(utterance, model: model, profile: profile, index: index, digest: digest, canSaveMemory: canSaveMemory, memory: memory)
            }
            if intent.contains("present") {
                let session = LanguageModelSession(model: model, instructions: AssistantInstructions.present)
                let out = try await session.respond(to: utterance, generating: GeneratedPresent.self).content
                // WP-67 — parse the model's short present phrase into an ephemeral
                // filter (prepend the «vis» cue the parser anchors on), falling
                // back to the raw utterance, then to an empty filter (reset). The
                // filter never touches the profile — it is a pure view change.
                let raw = out.presentFilter.trimmingCharacters(in: .whitespacesAndNewlines)
                let filter = AgendaFilterParser.parse("vis \(raw)", index: index)
                    ?? AgendaFilterParser.parse(utterance, index: index)
                    ?? AgendaFilter()
                return .present(filter)
            }
            if intent.contains("answer") || intent.contains("spør") {
                var tools: [any Tool] = [EventSearchTool(feed: feed), ProfileTool(profile: profile), HelpTool()]
                if let sink = memory.sink { tools.append(SaveMemoryTool(sink: sink)) }
                let session = LanguageModelSession(
                    model: model, tools: tools,
                    instructions: AssistantInstructions.answer(profile: profile, digest: digest, canSaveMemory: canSaveMemory)
                )
                let out = try await session.respond(to: utterance, generating: GeneratedAnswer.self).content
                return .answer(AssistantAnswer(
                    text: out.answer.trimmingCharacters(in: .whitespacesAndNewlines),
                    referencedEventIds: out.referencedEventIds
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                ))
            }
            // Default: mutations (the most common intent).
            return try await self.mutate(utterance, model: model, profile: profile, index: index, digest: digest, canSaveMemory: canSaveMemory, memory: memory)
        } catch {
            throw AssistantError.generationFailed(message: "Klarte ikke å tolke ytringen akkurat nå. Prøv å formulere den enklere.")
        }
    }

    /// Phase 2, mutation arm: a focused session carrying only the searchEntities
    /// (+ optional saveMemory) tool and the mutation schema.
    private func mutate(_ utterance: String, model: SystemLanguageModel, profile: InterestProfile, index: EntityIndex, digest: String, canSaveMemory: Bool, memory: MemoryContext) async throws -> AssistantTurn {
        var tools: [any Tool] = [EntitySearchTool(index: index)]
        if let sink = memory.sink { tools.append(SaveMemoryTool(sink: sink)) }
        let session = LanguageModelSession(
            model: model, tools: tools,
            instructions: AssistantInstructions.mutations(profile: profile, digest: digest, canSaveMemory: canSaveMemory)
        )
        let out = try await session.respond(to: utterance, generating: GeneratedMutations.self).content
        return .mutations(out.mutations.compactMap(Self.convert))
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

    /// GeneratedTurn(command,commandArgument) → AssistantCommand (WP-66).
    /// Defensive/normalising, like `convert`: an unrecognised name/argument
    /// returns nil (so the turn falls through to the mutation arm rather than
    /// doing nothing). AssistantViewModel still validates every command
    /// downstream (an openEvent phrase against the agenda, a forget against
    /// memory) — the same defence-in-depth as MutationGrounder for mutations.
    static func command(name: String, argument: String) -> AssistantCommand? {
        let arg = argument.trimmingCharacters(in: .whitespacesAndNewlines)
        let a = arg.lowercased()
        switch name.lowercased().trimmingCharacters(in: .whitespaces) {
        case "theme", "tema":
            if a.contains("system") || a.contains("auto") { return .setTheme(.system) }
            if a.contains("dark") || a.contains("mørk") || a.contains("mork") { return .setTheme(.dark) }
            if a.contains("light") || a.contains("lys") { return .setTheme(.light) }
            return nil
        case "reset", "nullstill":
            let everything = a.contains("everything") || a.contains("alt") || a.contains("meg") || a.contains("minne")
            return .resetProfile(everything ? .everything : .followedOnly)
        case "onboarding":
            return .rerunOnboarding
        case "share", "del", "qr":
            return .shareProfile
        case "memory", "minne":
            return .showMemory
        case "forget", "glem":
            let all = arg.isEmpty || a.contains("alt") || a.contains("alle")
            return .forgetMemory(query: all ? "" : arg)
        case "notifications", "notify", "varsel", "varsling":
            let off = a.contains("off") || a.contains("av") || a.contains("ingen") || a.contains("uten")
            return .setNotificationLeadTime(enabled: !off)
        case "open", "vis", "apne", "åpne":
            return arg.isEmpty ? nil : .openEvent(query: arg)
        default:
            return nil
        }
    }

}

// MARK: - Episodic distiller (WP-30 — conversation → compact note)

/// The `@Generable` note the model distils from one exchange. Plain
/// String/[String] fields keep the generated schema simple; the conversion
/// below normalises them into a `DistilledNote`.
@Generable
struct DistilledMemoryNote {
    @Guide(description: "Én rolig norsk setning som oppsummerer det varige du lærte, f.eks. «Skal se Tour-etappen i opptak i kveld.» Tom streng hvis ingenting varig ble sagt.")
    var summary: String

    @Guide(description: "entityId-er eller idrettskoder (f.eks. 'chess', 'f1') notatet handler om. Tom liste hvis generelt.")
    var entityRefs: [String]

    @Guide(description: "Type: 'knowledgeLevel', 'spoilerPolicy', 'notifyWindow', 'preference' eller 'note'.")
    var kind: String

    @Guide(description: "Sant hvis notatet kun gjelder i dag/i kveld (skal utløpe ved døgnets slutt), ellers usant.")
    var ephemeral: Bool
}

/// The REAL, on-device distiller. Asks Apple Intelligence to produce a compact
/// note — never a transcript. Returns nil when the model has nothing durable to
/// record (empty summary) or is unavailable, so idle chatter leaves no trace.
struct FoundationModelsMemoryDistiller: MemoryDistiller {
    func distill(_ conversation: MemoryConversation, index: EntityIndex, now: Date) async -> DistilledNote? {
        let model = SystemLanguageModel.default
        guard case .available = model.availability else { return nil }
        let session = LanguageModelSession(model: model, instructions: Self.instructions)
        let prompt = """
        Bruker sa: «\(conversation.userText)»
        Assistent svarte: «\(conversation.assistantText)»
        Destillér ETT kompakt, varig notat om brukeren fra dette, eller la summary være tom hvis ingenting varig ble sagt.
        """
        guard let note = try? await session.respond(to: prompt, generating: DistilledMemoryNote.self).content else { return nil }
        let summary = note.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !summary.isEmpty else { return nil }
        let refs = note.entityRefs.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return DistilledNote(
            summary: summary,
            entityRefs: refs,
            kind: SaveMemoryTool.memoryKind(from: note.kind),
            // WP-48: the shared expiry rule moved out of the (now DEBUG-only)
            // MockMemoryDistiller into MemoryFreshness — same behaviour.
            expiresAt: note.ephemeral ? MemoryFreshness.endOfOsloDay(now) : nil
        )
    }

    static let instructions = """
    Du destillerer én assistent-samtale til ETT kompakt, strukturert notat om brukeren — ALDRI et råt transkript.
    Ta bare med noe varig og personlig (spoiler-preferanse, kunnskapsnivå, varselstoleranse, en preferanse eller en konkret plan som «ser etappen i opptak i kveld»). Er det ingenting varig, la summary være tom.
    Hold summary til én rolig norsk setning.
    """
}

#else

// FoundationModels not importable (e.g. an older SDK) — provide the same type
// so the app still builds and links; it simply reports unavailable.
import Foundation

struct FoundationModelsInterestAssistant: InterestAssistant {
    func availability() -> AssistantAvailability {
        .unavailable(message: "Apple Intelligence er ikke tilgjengelig i denne byggevarianten.")
    }

    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery, memory: MemoryContext) async throws -> AssistantTurn {
        throw AssistantError.unavailable(message: "Apple Intelligence er ikke tilgjengelig i denne byggevarianten.")
    }
}

/// FoundationModels-free fallback distiller — records nothing (the on-device
/// model isn't available in this build variant).
struct FoundationModelsMemoryDistiller: MemoryDistiller {
    func distill(_ conversation: MemoryConversation, index: EntityIndex, now: Date) async -> DistilledNote? { nil }
}

#endif
