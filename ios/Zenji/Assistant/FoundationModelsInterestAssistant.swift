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

// MARK: - saveMemory tool (WP-30 — persist a durable personal fact)

/// The tool the model calls to remember something DURABLE about the user (their
/// knowledge level, a spoiler policy, a notify window, a preference). It writes
/// through a `MemorySink` (the app's `MemoryStore`); the persistence is proven
/// by `MemoryStoreTests` / `SaveMemoryTool`'s round-trip without needing Apple
/// Intelligence. It never reads the agenda — it only records personal context.
struct SaveMemoryTool: Tool {
    let name = "saveMemory"
    let description = "Lagre en VARIG, personlig ting om brukeren selv: kunnskapsnivå, spoilervern (ser noe på opptak), varselsvindu, eller en preferanse. Bruk kun når brukeren uttrykker noe varig om SEG SELV, ikke for vanlige spørsmål."

    let sink: any MemorySink

    @Generable
    struct Arguments {
        @Guide(description: "Type: 'knowledgeLevel' (kunnskapsnivå), 'spoilerPolicy' (spoilervern/ser på opptak), 'notifyWindow' (når det er greit å varsle), 'preference' (generell preferanse) eller 'note' (annet varig notat).")
        var kind: String

        @Guide(description: "Valgfri entityId fra searchEntities som dette gjelder. Tom streng hvis det gjelder en hel idrett eller generelt.")
        var entityId: String

        @Guide(description: "Valgfri idrett dette gjelder (f.eks. 'chess', 'f1', 'golf'). Tom streng hvis det gjelder en bestemt entitet eller generelt.")
        var sport: String

        @Guide(description: "Selve verdien, kort — f.eks. 'nybegynner', 'opptak', '08:00'.")
        var value: String

        @Guide(description: "Kort norsk begrunnelse for hvorfor du lagrer dette.")
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

        // WP-30 — the saveMemory tool lets the model persist a durable, personal
        // thing it learns; only wired when a write sink is provided.
        var tools: [any Tool] = [EntitySearchTool(index: index), EventSearchTool(feed: feed), ProfileTool(profile: profile)]
        if let sink = memory.sink { tools.append(SaveMemoryTool(sink: sink)) }

        let session = LanguageModelSession(
            model: model,
            tools: tools,
            instructions: Self.instructions(profile: profile, digest: digest, canSaveMemory: memory.sink != nil)
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

    static func instructions(profile: InterestProfile, digest: String = "", canSaveMemory: Bool = false) -> String {
        let following: String
        if profile.rules.isEmpty {
            following = "Brukeren følger ingenting ennå."
        } else {
            following = "Brukeren følger allerede: " + profile.rules.map { rule in
                rule.scope.map { "\(rule.entityName) (\($0))" } ?? rule.entityName
            }.joined(separator: ", ") + "."
        }

        // WP-30: the retrieval digest + the saveMemory contract, appended only
        // when there is something to say (empty memory / no sink → no change).
        let memoryBlock = digest.isEmpty ? "" : "\n\n\(digest)"
        let saveBlock = canSaveMemory ? """


        MINNE (verktøyet saveMemory):
        - Hvis brukeren uttrykker noe VARIG om SEG SELV — kunnskapsnivå («jeg er fersk i sjakk»),
          spoilervern («jeg ser F1 på opptak, ikke røp resultatet»), varselsvindu («ikke varsle før 08:00»),
          eller en preferanse — kall saveMemory ÉN gang med riktig kind, scope (entityId eller sport), value og en kort norsk reason.
        - Bruk personlig kontekst du allerede vet (over) til å svare personlig, men LES DEN ALDRI OPP ordrett.
        - Har brukeren spoilervern på noe: ikke avslør resultat, vinner eller stilling for det — svar på når/hvor uten utfall.
        """ : ""

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

        \(following)\(memoryBlock)\(saveBlock)
        """
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
            expiresAt: note.ephemeral ? MockMemoryDistiller.endOfOsloDay(now) : nil
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
