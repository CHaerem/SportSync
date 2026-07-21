//
//  AgendaFilter.swift
//  Sportivista
//
//  WP-67 — the assistant's FOURTH intent arm's payload: an EPHEMERAL
//  presentation filter over the agenda. «Vis bare golf denne uka» temporarily
//  narrows what the board shows — it NEVER touches the follow-profile, is never
//  persisted, and is a pure VIEW layer on top of the already-compiled sections
//  (the five predicates / golden vectors are untouched). Reset with one tap.
//
//  Three dimensions (the brief's `{ sports, entiteter, datovindu }`):
//    • `sports`   — canonical sport tags to keep ("golf", "chess"); a category
//                   word ("vintersport") expands to its member sports here.
//    • `entities` — specific entities to keep (id + a cached display name for
//                   the calm filter line); the id is what the agenda matches on.
//    • `window`   — an optional date window ("denne uka", "i dag", "i helga").
//
//  An EMPTY filter means "show everything" — that is exactly what «vis alt
//  igjen» resolves to (the reset).
//
//  Plain, FoundationModels-FREE Swift (Equatable/Sendable), like the rest of
//  the assistant core: the deterministic mock and the real on-device model both
//  produce one of these (via `AgendaFilterParser`), and it is applied identically
//  by `AgendaViewModel` — so the whole filter path is unit-testable without Apple
//  Intelligence.
//

import Foundation

/// One entity a presentation filter keeps: `id` is what the agenda matches on
/// (authoritative), `name` is the cached display label for the quiet filter line
/// — the same id+name idiom as `LensAthlete`.
struct FilterSubjectEntity: Equatable, Sendable {
    var id: String
    var name: String
}

/// A date window a presentation filter can narrow to. `rawValue` is the stable
/// token the eval corpus pins; `label` is the calm Norwegian word for the filter
/// line; the range/`contains` reason in Europe/Oslo, like the rest of the agenda.
enum AgendaFilterWindow: String, Equatable, Sendable {
    case today = "today"
    case tomorrow = "tomorrow"
    case thisWeek = "this-week"
    case thisWeekend = "this-weekend"

    /// The calm Norwegian label for the filter line ("i dag" / "denne uka" …).
    var label: String {
        switch self {
        case .today: return "i dag"
        case .tomorrow: return "i morgen"
        case .thisWeek: return "denne uka"
        case .thisWeekend: return "i helga"
        }
    }

    /// Whether an Europe/Oslo day key ("yyyy-MM-dd") falls in this window,
    /// relative to `now`. String comparison is safe on the fixed-width key.
    func contains(dayKey: String, now: Date) -> Bool {
        let range = dayKeyRange(now: now)
        return dayKey >= range.start && dayKey <= range.end
    }

    /// The [start, end] Europe/Oslo day-key span this window covers. Weeks run
    /// Monday–Sunday (Norwegian); "denne uka" starts today (the agenda never
    /// shows a passed day) and ends on Sunday.
    private func dayKeyRange(now: Date) -> (start: String, end: String) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = FeedCompiler.osloTimeZone
        let today = FeedCompiler.osloDayKey(now)
        func key(_ offsetDays: Int) -> String {
            FeedCompiler.osloDayKey(cal.date(byAdding: .day, value: offsetDays, to: now) ?? now)
        }
        // Monday of the current Mon–Sun week (weekday: 1=Sun … 7=Sat).
        let weekday = cal.component(.weekday, from: now)
        let daysSinceMonday = weekday == 1 ? 6 : weekday - 2
        switch self {
        case .today:
            return (today, today)
        case .tomorrow:
            return (key(1), key(1))
        case .thisWeek:
            return (today, key(-daysSinceMonday + 6))   // today … Sunday
        case .thisWeekend:
            return (key(-daysSinceMonday + 5), key(-daysSinceMonday + 6))  // Sat … Sun
        }
    }
}

/// The ephemeral presentation filter — see the file header. NEVER persisted,
/// never touches the profile.
struct AgendaFilter: Equatable, Sendable {
    /// Canonical sport tags to keep (empty ⇒ no sport constraint).
    var sports: Set<String>
    /// Specific entities to keep (empty ⇒ no entity constraint).
    var entities: [FilterSubjectEntity]
    /// Optional date window (nil ⇒ all dates).
    var window: AgendaFilterWindow?

    init(sports: Set<String> = [], entities: [FilterSubjectEntity] = [], window: AgendaFilterWindow? = nil) {
        self.sports = sports
        self.entities = entities
        self.window = window
    }

    /// The entity ids the agenda matches on.
    var entityIds: Set<String> { Set(entities.map(\.id)) }

    /// Empty ⇒ "show everything" (the «vis alt igjen» reset).
    var isEmpty: Bool { sports.isEmpty && entities.isEmpty && window == nil }

    /// Whether the filter constrains the SUBJECT (sport/entity) at all — a
    /// window-only filter ("vis alt i dag") keeps every subject, just this day.
    var hasSubjectConstraint: Bool { !sports.isEmpty || !entities.isEmpty }

    /// The calm subject for the filter line ("GOLF · DENNE UKA"). A
    /// sports set that exactly matches a known umbrella category collapses to the
    /// category name ("VINTERSPORT") so the line stays short.
    var subjectLabel: String {
        var parts: [String] = []
        if !sports.isEmpty {
            if let category = SportVocabulary.categoryToSports.first(where: { !$0.value.isEmpty && sports == Set($0.value) }) {
                parts.append(SportVocabulary.categoryDisplay(for: category.key))
            } else {
                parts.append(contentsOf: sports.sorted().map { SportVocabulary.display(for: $0) })
            }
        }
        parts.append(contentsOf: entities.map(\.name))
        if let window { parts.append(window.label) }
        return parts.map { $0.uppercased() }.joined(separator: " · ")
    }
}

/// Parses a Norwegian presentation utterance into an `AgendaFilter`, or nil when
/// it is NOT a presentation-filter utterance (so routing falls through to the
/// command / question / mutation arms unchanged). Pure + synchronous — the
/// deterministic mock (`MockInterestAssistant`) and the real on-device model
/// (`FoundationModelsInterestAssistant`) both route through it, and the tests
/// drive it directly.
///
/// It is deliberately anchored: the utterance must OPEN with a presentation cue
/// («vis …» / «filtrer …»), and it fires only when the cue is followed by
/// something concrete to show (a sport/category keyword, a resolvable entity, or
/// a date window) OR a reset word ("alt"/"alle"/"igjen" ⇒ the empty "show all"
/// filter). A bare «vis <hendelse>» with no such subject stays nil, so the
/// command arm's openEvent («Vis Brann-kampen») is never stolen. Crucially, a
/// «vis …»-utterance's presentation cue WINS over the mutation cue — «vis bare
/// golf» no longer mis-reads as *follow golf* — while «følg …» is untouched (it
/// has no present cue, so this returns nil for it).
enum AgendaFilterParser {

    /// The words that open a presentation utterance (shared assistant-vocab.json).
    private static let presentCues: Set<String> = Set(AssistantVocab.shared.presentCues)

    /// Words that mean "clear the filter" (reset to show everything).
    private static let resetWords: Set<String> = Set(AssistantVocab.shared.resetWords)

    /// Event-open nouns ("Brann-kampen", "matchen") — an utterance naming a
    /// SPECIFIC event to open belongs to the command arm's openEvent, never a
    /// presentation filter. Mirrors the event nouns MockCommandParser treats as
    /// "open this event".
    private static let eventOpenNouns: Set<String> = [
        "kamp", "kampen", "kampene", "match", "matchen", "arrangementet", "eventet", "hendelsen",
    ]

    static func parse(_ utterance: String, index: EntityIndex) -> AgendaFilter? {
        let tokens = EntityIndex.tokens(utterance)
        guard let first = tokens.first, presentCues.contains(first) else { return nil }
        let set = Set(tokens)

        // WP-166: an event-open noun means «vis <hendelse>» — a specific event to
        // OPEN, not a filter. Before the catalog long-tail this fell out naturally
        // (the named team did not ground, so no entity subject was found); now
        // "Brann" IS an entity, so guard it explicitly — otherwise
        // «Vis Brann-kampen» mis-reads as "filter to Brann" and steals the command
        // arm's openEvent.
        if !set.isDisjoint(with: eventOpenNouns) { return nil }

        let sports = detectSports(tokens: tokens)
        let entities = detectEntities(in: utterance, index: index)
        let window = detectWindow(set: set)

        // Something concrete to show → the narrowing filter.
        if !sports.isEmpty || !entities.isEmpty || window != nil {
            return AgendaFilter(sports: sports, entities: entities, window: window)
        }
        // No concrete subject, but an explicit "show everything again" → reset.
        if set.contains(where: resetWords.contains) {
            return AgendaFilter()
        }
        // «vis <navn>» with nothing groundable → not a presentation filter; let
        // the command arm's openEvent («Vis Brann-kampen») handle it.
        return nil
    }

    /// Every canonical sport tag named in the utterance — direct sport keywords
    /// PLUS an umbrella category expanded to its member sports (so "vintersport"
    /// filters to every winter sport). Deterministic, order-independent (a Set).
    static func detectSports(tokens: [String]) -> Set<String> {
        var out = Set<String>()
        for token in tokens {
            if let sport = SportVocabulary.keywordToSport[token] { out.insert(sport) }
            if let category = SportVocabulary.keywordToCategory[token] {
                out.formUnion(SportVocabulary.categoryToSports[category] ?? [])
            }
        }
        return out
    }

    /// Specific entities named in the utterance, resolved through the index (the
    /// same highest-confidence detector the mutation mock uses). Sport/category
    /// types are already excluded there, so a bare "golf" never doubles as both.
    static func detectEntities(in utterance: String, index: EntityIndex) -> [FilterSubjectEntity] {
        index.detectEntities(in: utterance).map { FilterSubjectEntity(id: $0.id, name: $0.name) }
    }

    /// The date window named in the utterance, if any. Reads normalised tokens
    /// («på»→"pa", «uka»→"uka"), so "denne uka"/"i dag"/"i morgen"/"i helga" land.
    static func detectWindow(set: Set<String>) -> AgendaFilterWindow? {
        let v = AssistantVocab.shared // shared window tokens (iOS ignores web's 'tonight')
        if !set.isDisjoint(with: v.tokens(for: "this-week")) { return .thisWeek }
        if !set.isDisjoint(with: v.tokens(for: "this-weekend")) { return .thisWeekend }
        if !set.isDisjoint(with: v.tokens(for: "tomorrow")) { return .tomorrow }
        if !set.isDisjoint(with: v.tokens(for: "today")) { return .today }
        return nil
    }
}
