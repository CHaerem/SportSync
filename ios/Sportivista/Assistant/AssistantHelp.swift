//
//  AssistantHelp.swift
//  Sportivista
//
//  WP-68 — the assistant's APP-HELP knowledge: a versioned, curated Norwegian
//  capability document maintained as code right beside the WP-66 command
//  catalogue. "Hva kan du?" / "hvordan nullstiller jeg?" / "hvordan følger jeg
//  noe?" are answered from THIS curated fact — never from an empty agenda feed,
//  and never from general world knowledge (the honesty rule: the on-device model
//  answers only about the app + the user's own agenda).
//
//  Plain, FoundationModels-FREE Swift (like AssistantModels / AssistantCommand):
//    • the REAL model reads `document()` through the read-only `getHelp` tool
//      (FoundationModelsInterestAssistant), exactly as `getProfile` exposes the
//      profile;
//    • the deterministic mock reads `answer(for:)` (MockAnswerer), so the whole
//      help path is unit-testable in CI without Apple Intelligence.
//
//  NO DRIFT: the per-command help is keyed by `CommandKind` (one arm per
//  AssistantCommand case, mapped by an EXHAUSTIVE switch — a new command won't
//  compile until it is mapped). A coherence test then asserts every CommandKind
//  has a curated `HelpEntry`, so a new command can never ship without help text.
//

import Foundation

/// The distinct arms of the WP-66 `AssistantCommand` catalogue — one per app
/// action, `CaseIterable` so the help document + the coherence test can enumerate
/// them. The associated values on `AssistantCommand` don't matter for help; the
/// arm does.
enum CommandKind: String, CaseIterable, Sendable {
    case theme
    case reset
    case onboarding
    case share
    case memory
    case forget
    case notifications
    case openEvent
}

extension AssistantCommand {
    /// The help arm this command belongs to. EXHAUSTIVE by design: a new
    /// `AssistantCommand` case forces a new `CommandKind` mapping here at compile
    /// time, and the coherence test then forces a `HelpEntry` for it — so app
    /// help can never silently drift behind the catalogue.
    var helpKind: CommandKind {
        switch self {
        case .setTheme: return .theme
        case .resetProfile: return .reset
        case .rerunOnboarding: return .onboarding
        case .shareProfile: return .share
        case .showMemory: return .memory
        case .forgetMemory: return .forget
        case .setNotificationLeadTime: return .notifications
        case .openEvent: return .openEvent
        }
    }
}

/// One curated help entry for a command arm: a short Norwegian title and a
/// how-to that ALWAYS references a concrete action the user can take (say a
/// phrase, or tap a quick chip). `keywords` are normalised substrings that route
/// a «hvordan …?» question to this entry.
struct HelpEntry: Sendable, Equatable {
    var kind: CommandKind
    var title: String
    var howTo: String
    var keywords: [String]
}

/// The versioned app-help knowledge. Curated fact, not a model — so it is exact,
/// testable, and confined to what the app actually does.
enum AssistantHelp {

    /// Bumped when the curated help content changes materially (mirrors the
    /// versioning of the eval corpus).
    static let version = 1

    // MARK: - Capability sections (the three arms of the assistant)

    /// The "Hva kan du?" overview — names the three things the assistant does and
    /// references concrete actions. Mentions «Følg …», tema and nullstille so a
    /// capability question always points at something the user can do next.
    static let overview = """
    Jeg kan tre ting: \
    1) endre hva du følger — «Følg Casper Ruud», «Jeg liker golf og sykkel», «Slutt med tennis» (du bekrefter først); \
    2) svare på hva som er på agendaen din — «Hva er på i kveld?», «Når går neste etappe?»; \
    3) styre appen — tema, varsler, nullstille, dele profil og det jeg vet om deg (HURTIG-chips: TEMA, VARSEL, DEL PROFIL, MITT MINNE). \
    Spør «hvordan gjør jeg …?». Jeg svarer bare om appen og din egen agenda, ikke generelle kunnskapsspørsmål.
    """

    /// How to CHANGE what you follow (the mutation arm).
    static let followHowTo = """
    Skriv hva du vil følge — «Følg Viktor Hovland», «Følg Tour de France med fokus på norske», «Jeg liker golf og litt F1». Du bekrefter endringen før den lagres.
    """

    /// How to ASK about the agenda (the answer arm).
    static let askHowTo = """
    Spør på vanlig norsk: «Hva er på i dag?», «Hva bør jeg se i kveld?», «Når går neste TdF-etappe?». Jeg svarer fra agendaen din med tid, hva og hvor.
    """

    // MARK: - Per-command help (one entry per CommandKind — no drift)

    /// Curated help, one per `CommandKind`. The coherence test asserts this list
    /// covers every arm; `document()` and `answer(for:)` read it, so the FM tool
    /// and the mock never diverge from the catalogue.
    static let commandEntries: [HelpEntry] = [
        HelpEntry(
            kind: .theme,
            title: "Bytte tema",
            howTo: "Si «bytt til mørkt tema» (eller «lyst tema» / «systemtema»), eller trykk TEMA-chippen i arket.",
            keywords: ["tema", "modus", "mørk", "lys", "dark", "light"]
        ),
        HelpEntry(
            kind: .reset,
            title: "Nullstille",
            howTo: "Si «nullstill» for å tømme det du følger, eller «slett alt om meg» for å fjerne alt jeg vet om deg. Begge spør om bekreftelse først.",
            keywords: ["nullstill", "resett", "slett", "tomme", "start pa nytt", "begynne pa nytt"]
        ),
        HelpEntry(
            kind: .onboarding,
            title: "Kjøre oppsettet på nytt",
            howTo: "Si «kjør onboarding på nytt», så åpner jeg førstegangsoppsettet igjen.",
            keywords: ["onboarding", "oppsett", "sette opp", "komme i gang"]
        ),
        HelpEntry(
            kind: .share,
            title: "Dele profilen",
            howTo: "Si «del profilen» eller «vis QR-koden», eller trykk DEL PROFIL-chippen — så får du delingslenke og QR.",
            keywords: ["del", "dele", "qr", "profil"]
        ),
        HelpEntry(
            kind: .memory,
            title: "Se hva jeg vet om deg",
            howTo: "Si «hva vet du om meg» eller trykk MITT MINNE-chippen, så åpner jeg det jeg husker om deg.",
            keywords: ["minne", "husker", "vet du om meg", "hva du vet"]
        ),
        HelpEntry(
            kind: .forget,
            title: "Glemme noe om deg",
            howTo: "Si «glem alt om meg», eller «glem det du vet om sjakk» for å glemme noe bestemt.",
            keywords: ["glem"]
        ),
        HelpEntry(
            kind: .notifications,
            title: "Styre varsler",
            howTo: "Si «skru av varsel-ledetid» (varsel når hendelsen starter) eller «skru på varsel-ledetid» (varsel i god tid), eller trykk VARSEL-chippen.",
            keywords: ["varsel", "varsl", "ledetid", "paminnelse"]
        ),
        HelpEntry(
            kind: .openEvent,
            title: "Åpne en hendelse",
            howTo: "Si «vis Brann-kampen» eller «åpne neste etappe», så åpner jeg detaljene for den raden i agendaen din.",
            keywords: ["apne", "vis kampen", "detalj"]
        ),
    ]

    /// The curated entry for one arm (nil only if the catalogue grew without help
    /// — the case the coherence test forbids).
    static func entry(for kind: CommandKind) -> HelpEntry? {
        commandEntries.first { $0.kind == kind }
    }

    // MARK: - The full curated document (the getHelp tool's payload)

    /// The whole capability document the FM `getHelp` tool returns — the model
    /// answers app-help questions from THIS, never from guesswork. The per-command
    /// section is generated from `commandEntries` in `CommandKind` order, so it
    /// can never drift behind the catalogue.
    static func document() -> String {
        let commandLines = CommandKind.allCases
            .compactMap(entry(for:))
            .map { "- \($0.title): \($0.howTo)" }
            .joined(separator: "\n")
        return """
        SPORTIVISTA — HVA ASSISTENTEN KAN (hjelp v\(version))

        \(overview)

        ENDRE HVA DU FØLGER:
        \(followHowTo)

        SPØRRE OM AGENDAEN:
        \(askHowTo)

        STYRE APPEN:
        \(commandLines)
        """
    }

    // MARK: - The mock's help answerer

    /// Answer an app-help / capability question from the curated document, or nil
    /// if the utterance is NOT such a question (so it falls through to the agenda
    /// answer arm). Deliberately narrow: a bare capability signal («kan du», «hjelp»)
    /// gives the overview; a «hvordan …?» question only answers when it names an
    /// app capability or command — a general "hvordan spiller man sjakk?" returns
    /// nil so the honesty rule holds (no world knowledge here).
    static func answer(for utterance: String) -> AssistantAnswer? {
        // Normalised, punctuation-free token stream, space-padded — so «du?» and
        // «du» match alike and word-boundary substring checks are honest.
        let n = " " + EntityIndex.tokens(utterance).joined(separator: " ") + " "
        let trimmed = n.trimmingCharacters(in: .whitespaces)

        // Capability overview — «hva kan du?», «kan du hjelpe meg?», bare «hjelp».
        if n.contains(" kan du ") || trimmed == "hjelp" || trimmed == "hjelp meg" {
            return AssistantAnswer(text: overview)
        }

        // How-to questions. Everything below requires an explicit «hvordan».
        guard n.contains(" hvordan ") else { return nil }

        // A named command arm wins (theme/reset/…): its concrete how-to.
        if let entry = commandEntries.first(where: { e in e.keywords.contains { n.contains($0) } }) {
            return AssistantAnswer(text: entry.howTo)
        }
        // Otherwise the two non-command arms — following, and asking the agenda.
        if matches(n, followKeywords) { return AssistantAnswer(text: followHowTo) }
        if matches(n, askKeywords) { return AssistantAnswer(text: askHowTo) }
        // A generic «hvordan bruker jeg appen/deg?» → the overview.
        if matches(n, appKeywords) { return AssistantAnswer(text: overview) }
        // Named nothing about the app → not ours (honesty rule).
        return nil
    }

    // MARK: - Routing keyword sets (normalised)

    private static let followKeywords = ["følg", "følge", "legge til", "abonner", "interessert"]
    private static let askKeywords = ["kommende", "agenda", "hva er pa", "hvor kan jeg se", "sporre"]
    private static let appKeywords = ["appen", "sportivista", "bruke", "bruker", " deg "]

    private static func matches(_ n: String, _ keywords: [String]) -> Bool {
        keywords.contains { n.contains($0) }
    }
}
