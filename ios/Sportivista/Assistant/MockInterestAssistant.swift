//
//  MockInterestAssistant.swift
//  Sportivista
//
//  WP-16 — the FM-free stand-in for the on-device model. Apple Intelligence
//  cannot run in CI (or on the Simulator), so every test drives THIS instead of
//  FoundationModels: a deterministic Norwegian keyword parser that turns an
//  utterance into the same `ProposedMutation`s the real model is asked to
//  produce. It also backs SwiftUI previews. It is NOT wired in as a silent
//  fallback for the shipping app — when Apple Intelligence is off the app shows
//  an honest "unavailable" message rather than quietly degrading to keywords
//  (per the brief).
//
//  The parser is intentionally small and rule-based (verbs → intent, entity
//  index → targets, a couple of phrase patterns → scope) — enough to exercise
//  the whole grounding/diff/persistence pipeline against the ten canonical
//  utterances, not a general NLU. Entity RESOLUTION still goes through the
//  index (so the mock can only "find" real entities, exactly like the tool-
//  using model), and grounding re-checks everything downstream regardless.
//
//  WP-48: the whole file is `#if DEBUG` — a Release build must contain no
//  Mock* symbols. Every app reference is itself DEBUG-gated (ContentView's
//  SPORTIVISTA_DEMO harness), and SportivistaTests builds the Debug configuration, so the
//  hostless tests still compile it.
//

#if DEBUG
import Foundation

struct MockInterestAssistant: InterestAssistant {

    enum Behavior: Sendable, Equatable {
        case available
        /// Simulates Apple Intelligence being off / the model not loaded, so
        /// the UI's honest "unavailable" path can be tested without a device.
        case unavailable(String)
        /// Simulates a USABLE model that still produced no usable structured
        /// output for the utterance — an empty mutation list (or output that all
        /// failed validation/grounding). This is the device bug that made the UI
        /// collapse to a bare "fant ingen endringer"; the behaviour exists so the
        /// WP-16.1 honest-explanation path is testable without Apple Intelligence.
        case producesNothing
        /// Simulates the model attempting generation and failing to produce a
        /// valid `@Generable` output (a malformed/incomplete structured response)
        /// — `AssistantError.generationFailed`, as opposed to `.unavailable`
        /// (the device-state gate). Exists so the WP-16.3 "inexpressible"
        /// misunderstood-log outcome is testable without Apple Intelligence.
        case throwsGenerationFailure(String)
    }

    let behavior: Behavior

    init(behavior: Behavior = .available) {
        self.behavior = behavior
    }

    func availability() -> AssistantAvailability {
        switch behavior {
        case .available, .producesNothing, .throwsGenerationFailure: return .available
        case let .unavailable(message): return .unavailable(message: message)
        }
    }

    func interpret(utterance: String, profile: InterestProfile, index: EntityIndex, feed: FeedQuery, memory: MemoryContext) async throws -> AssistantTurn {
        switch behavior {
        case let .unavailable(message):
            throw AssistantError.unavailable(message: message)
        case let .throwsGenerationFailure(message):
            throw AssistantError.generationFailed(message: message)
        case .producesNothing:
            // A usable model that produced nothing. For a QUESTION that still
            // means an empty answer (no phantom rows); for a command it means
            // the empty mutation list the WP-16.1/16.3 paths already handle.
            return MockAnswerer.isQuestion(utterance)
                ? .answer(AssistantAnswer(text: ""))
                : .mutations([])
        case .available:
            // WP-67 intent routing (four arms). PRESENT is checked FIRST: a
            // «vis …»-cue must win over the mutation cue («vis bare golf» is a
            // presentation filter, not *follg golf*). It is anchored on a leading
            // present verb + a groundable subject, so a «følg …» (no cue) and a
            // «vis <hendelse>» openEvent (no sport/entity/window) both fall
            // through untouched.
            if let filter = AgendaFilterParser.parse(utterance, index: index) {
                return .present(filter)
            }
            // WP-66 command arm — the narrowest matcher (a specific anchor word),
            // so a follow/question is never stolen — then WP-16.4's question vs.
            // WP-16 mutation split, unchanged.
            if let command = MockCommandParser.command(utterance, profile: profile, index: index) {
                return .command(command)
            }
            // WP-30: the answer arm reflects the personal-memory state (e.g. a
            // knowledge-level fact makes it explain fagtermer).
            if MockAnswerer.isQuestion(utterance) {
                return .answer(MockAnswerer.answer(utterance: utterance, feed: feed, index: index, memory: memory.state))
            }
            return .mutations(MockInterestParser.parse(utterance: utterance, profile: profile, index: index))
        }
    }
}

/// The deterministic parse, exposed as a static pure function so tests can call
/// it directly (synchronously) as well as through the async protocol.
enum MockInterestParser {

    enum Intent: Equatable {
        case add
        case increase
        case decrease
        case remove
    }

    static func parse(utterance: String, profile: InterestProfile, index: EntityIndex) -> [ProposedMutation] {
        let trimmed = utterance.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        // WP-65 — bulk-fangst: a long, natural utterance may name SEVERAL
        // interests ("golf, spesielt Hovland, all vintersport, Brann og litt
        // F1"). Split it into clauses, parse each on its own, and combine — so
        // no clause is ever silently dropped (the WP-65 bug). A single-clause
        // utterance decomposes to exactly one clause, so the ten canonical
        // cases behave identically to before.
        var out: [ProposedMutation] = []
        var seenIds = Set<String>()
        var seenQueries = Set<String>()
        for clause in clauses(in: trimmed, index: index) {
            for m in parseClause(clause, profile: profile, index: index) {
                if m.entityId.isEmpty {
                    // An unresolved (not-found) clause — deduped by its query so
                    // the same miss isn't reported twice, but NEVER dropped.
                    let key = TextMatch.normalize(m.entityQuery)
                    guard !key.isEmpty, seenQueries.insert(key).inserted else { continue }
                    out.append(m)
                } else if seenIds.insert(m.entityId).inserted {
                    out.append(m)
                }
            }
        }
        return out
    }

    /// Parse ONE clause (the whole utterance when it has no connectors) into its
    /// mutation(s) — the WP-16→WP-64 single-utterance logic, unchanged apart from
    /// the WP-65 sport-level grounding preference in `sportProposals`.
    static func parseClause(_ clause: String, profile: InterestProfile, index: EntityIndex) -> [ProposedMutation] {
        let trimmed = clause.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        let intent = detectIntent(trimmed)
        let scope = extractScope(from: trimmed)
        let weight = weight(for: intent)

        // 1) An explicit entity mention always wins.
        let matched = index.detectEntities(in: trimmed)
        if !matched.isEmpty {
            // A lens only makes sense on add/increase/decrease — never on remove.
            let lens: Lens = intent == .remove ? .sportAsSuch : detectLens(in: trimmed)
            return matched.map { entity in
                let effectiveScope = intent == .remove ? nil : scope
                return ProposedMutation(
                    kind: kind(for: intent),
                    entityId: entity.id,
                    entityQuery: entity.name,
                    scope: effectiveScope,
                    weight: weight,
                    reason: entityReason(intent: intent, name: entity.name, scope: effectiveScope, lens: lens),
                    lens: lens
                )
            }
        }

        // 2) A whole-category command ("følg vintersport") — WP-64. Grounds to
        //    the published umbrella entity as ONE broad-scope following (the
        //    "all vintersport" mutation), checked BEFORE the sport path since an
        //    umbrella term is not itself a single sport.
        if let category = EntityIndex.categoryKeyword(in: trimmed) {
            let lens: Lens = intent == .remove ? .sportAsSuch : detectLens(in: trimmed)
            return categoryProposals(intent: intent, category: category, scope: scope, weight: weight, lens: lens, profile: profile, index: index)
        }

        // 3) A whole-sport command ("mer sykkel", "slutt med tennis", "følg skiskyting").
        if let sport = EntityIndex.sportKeyword(in: trimmed) {
            let lens: Lens = intent == .remove ? .sportAsSuch : detectLens(in: trimmed)
            return sportProposals(intent: intent, sport: sport, scope: scope, weight: weight, lens: lens, profile: profile, index: index)
        }

        // 4) Nothing recognised → one unresolved proposal; grounding rejects it
        //    with a "mente du …?" suggestion. This is how free-text entities are
        //    caught rather than invented.
        let query = residualQuery(trimmed)
        guard !query.isEmpty else { return [] }
        return [ProposedMutation(
            kind: kind(for: intent),
            entityId: "",
            entityQuery: query,
            scope: intent == .remove ? nil : scope,
            weight: weight,
            reason: "Klarte ikke å knytte «\(query)» til noe i indeksen."
        )]
    }

    // MARK: - Clause splitting (WP-65 — deterministic bulk-fangst)

    /// Norwegian connectors that separate interests in a bulk utterance. A run
    /// like ", og" collapses to one boundary (the empty fragment is dropped).
    private static let clausePattern = "\\s*(?:,|;|\\bog\\b|\\bsamt\\b|\\bpluss\\b)\\s*"

    /// Words a MODIFIER fragment starts with — a scope/lens tail like "bare de
    /// norske", "mest de norske", or "med fokus på …" that belongs to the
    /// PREVIOUS clause, not a new interest. Normalised (TextMatch): «på»→"pa",
    /// «når»→"nar". A fragment that carries its OWN target (entity/sport/category)
    /// is never a modifier regardless of its lead word — the strong signal
    /// short-circuits — so intensifiers ("mest", "spesielt") are safe here: they
    /// only merge a target-less tail like "mest de norske".
    private static let modifierLeadWords: Set<String> = [
        "bare", "kun", "i", "med", "under", "nar", "pa", "for", "de", "den", "det", "som", "hvis",
        "mest", "mer", "mindre", "helst", "gjerne", "spesielt", "saerlig", "primaert", "hovedsakelig"
    ]

    /// Decompose an utterance into interest clauses. Modifier fragments (a
    /// scope/lens phrase with no target of its own) are re-attached to the clause
    /// they qualify, so "Mer sykkel, bare de norske" stays ONE clause while
    /// "golf, Hovland og F1" becomes three.
    static func clauses(in utterance: String, index: EntityIndex) -> [String] {
        let frags = rawFragments(utterance)
        guard frags.count > 1 else { return frags.isEmpty ? [utterance] : frags }
        var merged: [String] = []
        for frag in frags {
            if !merged.isEmpty, isModifierFragment(frag, index: index) {
                merged[merged.count - 1] += " " + frag
            } else {
                merged.append(frag)
            }
        }
        return merged
    }

    /// Split on the connector pattern, trimming and dropping empty fragments.
    private static func rawFragments(_ s: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: clausePattern, options: [.caseInsensitive]) else { return [s] }
        let ns = s as NSString
        var parts: [String] = []
        var last = 0
        for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            if m.range.location > last {
                parts.append(ns.substring(with: NSRange(location: last, length: m.range.location - last)))
            }
            last = m.range.location + m.range.length
        }
        if last < ns.length { parts.append(ns.substring(from: last)) }
        return parts.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    /// A fragment is a MODIFIER (merge into the previous clause) when it carries
    /// NO target of its own (no entity, sport, or category) AND opens with a
    /// scope/lens word. An unresolvable-but-intended target like "Brann" opens
    /// with a real noun, so it stays its own clause and is honestly reported as
    /// not-found rather than swallowed.
    static func isModifierFragment(_ frag: String, index: EntityIndex) -> Bool {
        if !index.detectEntities(in: frag).isEmpty { return false }
        if EntityIndex.sportKeyword(in: frag) != nil { return false }
        if EntityIndex.categoryKeyword(in: frag) != nil { return false }
        guard let first = EntityIndex.tokens(frag).first else { return true }
        return modifierLeadWords.contains(first)
    }

    // MARK: - Sport-level commands

    private static func sportProposals(intent: Intent, sport: String, scope: String?, weight: Double?, lens: Lens, profile: InterestProfile, index: EntityIndex) -> [ProposedMutation] {
        let display = SportVocabulary.display(for: sport)

        switch intent {
        case .remove:
            // Drop every rule the profile currently holds for this sport.
            return profile.rules
                .filter { $0.sport == sport }
                .compactMap { rule in
                    guard let entity = index.entity(id: rule.entityId) else { return nil }
                    return ProposedMutation(
                        kind: .remove,
                        entityId: entity.id,
                        entityQuery: display,
                        reason: "Du ba om å slutte med \(display) — fjerner \(entity.name)."
                    )
                }

        case .add, .increase, .decrease:
            // WP-65 — a BARE sport word ("golf", "litt F1", "mer sykkel") means
            // the WHOLE sport, so ground to the sport-level entity (sport-<tag>)
            // when one exists. This mirrors what the real FM proposes and is
            // genuinely more correct than picking an arbitrary flagship
            // tournament (following "golf" must not silently become one random
            // event). Sports with no published sport entity (tennis, athletics)
            // fall back to the most-headline real entity.
            guard let entity = index.entity(id: "sport-\(sport)")
                ?? index.representativeEntity(forSport: sport, preferredIn: profile) else { return [] }
            return [ProposedMutation(
                kind: kind(for: intent),
                entityId: entity.id,
                entityQuery: display,
                scope: scope,
                weight: weight,
                reason: sportReason(intent: intent, display: display, entityName: entity.name, scope: scope, lens: lens),
                lens: lens
            )]
        }
    }

    // MARK: - Category-level commands (WP-64)

    /// A whole-category command ("følg vintersport"). Grounds to the published
    /// umbrella entity as ONE broad-scope following (so a bulk utterance counts
    /// "all vintersport" as a single suggestion), through the normal diff/confirm
    /// flow. Removal drops the category rule when the profile holds it. If the
    /// category entity is somehow absent (older index), falls back to expanding
    /// into the member sports so the intent is never silently dropped.
    private static func categoryProposals(intent: Intent, category: String, scope: String?, weight: Double?, lens: Lens, profile: InterestProfile, index: EntityIndex) -> [ProposedMutation] {
        let display = SportVocabulary.categoryDisplay(for: category)
        guard let entity = index.categoryEntity(for: category) else {
            return (SportVocabulary.categoryToSports[category] ?? []).flatMap {
                sportProposals(intent: intent, sport: $0, scope: scope, weight: weight, lens: lens, profile: profile, index: index)
            }
        }

        switch intent {
        case .remove:
            guard profile.rule(for: entity.id) != nil else { return [] }
            return [ProposedMutation(
                kind: .remove,
                entityId: entity.id,
                entityQuery: display,
                reason: "Du ba om å slutte med \(display)."
            )]

        case .add, .increase, .decrease:
            let members = SportVocabulary.categoryToSports[category]?.count ?? 0
            return [ProposedMutation(
                kind: kind(for: intent),
                entityId: entity.id,
                entityQuery: display,
                scope: scope,
                weight: weight,
                reason: categoryReason(intent: intent, display: display, memberCount: members, scope: scope, lens: lens),
                lens: lens
            )]
        }
    }

    // MARK: - Intent / weight / kind

    static func detectIntent(_ utterance: String) -> Intent {
        let n = " " + TextMatch.normalize(utterance) + " "
        func has(_ needles: [String]) -> Bool { needles.contains { n.contains($0) } }

        if has([" slutt", " fjern", " stopp", " dropp", " glem", " avfølg", " ikke følg"]) { return .remove }
        // Decrease BEFORE increase: "nedprioriter" contains "prioriter".
        if has([" mindre", " lavere", " nedprioriter", " senk", " sjeldnere"]) { return .decrease }
        if has([" mer ", " prioriter", " høyere", " viktigere", " øk", " mest ", " oftere"]) { return .increase }
        return .add
    }

    static func kind(for intent: Intent) -> MutationKind {
        switch intent {
        case .add: return .add
        case .increase, .decrease: return .update
        case .remove: return .remove
        }
    }

    // MARK: - Lens detection (WP-16.1)

    /// Detects the PERSPECTIVE phrase in an utterance — the Norwegian-focus case
    /// that produced the original bug ("med fokus på norske utøvere", "bare de
    /// norske"). Everything else is `.sportAsSuch` (the default). The mock only
    /// needs this one lens to exercise the pipeline; the real FM model also
    /// emits the richer `.throughAthletes` lens, and `MutationGrounder`
    /// re-checks every lens regardless of where it came from.
    static func detectLens(in utterance: String) -> Lens {
        let n = " " + TextMatch.normalize(utterance) + " "
        let norwegianFocus = [" norske ", " norsk ", " nordmenn ", " nordmennene "]
        if norwegianFocus.contains(where: n.contains) { return .throughNorwegians }
        return .sportAsSuch
    }

    static func weight(for intent: Intent) -> Double? {
        switch intent {
        case .add, .remove: return nil        // grounder applies the default
        case .increase: return 0.8
        case .decrease: return 0.3
        }
    }

    // MARK: - Scope extraction

    static func extractScope(from utterance: String) -> String? {
        // "bare …" / "kun …" — from that word to the end, original casing.
        if let match = firstRegexRange(utterance, "(?i)\\b(bare|kun)\\b.*$") {
            return match
        }
        // "… i <rest>" → keep as "i <rest>".
        if let match = firstRegexRange(utterance, "(?i)(?:^|\\s)i\\s+\\S.*$") {
            return match
        }
        // "under <rest>".
        if let match = firstRegexRange(utterance, "(?i)\\bunder\\b.*$") {
            return match
        }
        return nil
    }

    private static func firstRegexRange(_ s: String, _ pattern: String) -> String? {
        guard let r = s.range(of: pattern, options: .regularExpression) else { return nil }
        let out = s[r].trimmingCharacters(in: .whitespacesAndNewlines)
        return out.isEmpty ? nil : out
    }

    // MARK: - Residual (unresolved) query

    static let stopwords: Set<String> = [
        "følg", "følge", "følger", "legg", "til", "vis", "meg", "spor", "start", "begynn", "se",
        "slutt", "slutte", "slutter", "med", "fjern", "stopp", "dropp", "ikke", "glem", "avfølg",
        "mer", "mindre", "prioriter", "prioritere", "høyere", "lavere", "øk", "øke", "senk",
        "viktigere", "mest", "oftere", "sjeldnere", "opp", "ned", "nedprioriter",
        "bare", "kun", "i", "under", "på", "av", "og", "en", "et", "den", "de", "litt", "mye", "også"
    ]

    static func residualQuery(_ utterance: String) -> String {
        EntityIndex.tokens(utterance)
            .filter { !stopwords.contains($0) && !EntityIndex.isYear($0) }
            .joined(separator: " ")
    }

    // MARK: - Norwegian reason text (always filled)

    static func entityReason(intent: Intent, name: String, scope: String?, lens: Lens) -> String {
        let s = scope.map { " (\($0))" } ?? ""
        let base: String
        switch intent {
        case .add: base = "Du ba om å følge \(name)\(s)."
        case .increase: base = "Du ba om å prioritere \(name) høyere\(s)."
        case .decrease: base = "Du ba om å nedprioritere \(name)\(s)."
        case .remove: base = "Du ba om å slutte å følge \(name)."
        }
        return lens.isDefault ? base : "\(base) Fokus: \(lens.label)."
    }

    static func sportReason(intent: Intent, display: String, entityName: String, scope: String?, lens: Lens) -> String {
        let s = scope.map { " \($0)" } ?? ""
        let base: String
        switch intent {
        case .add, .increase: base = "Du vil se mer \(display)\(s). Legger til \(entityName)."
        case .decrease: base = "Du vil se mindre \(display). Nedprioriterer \(entityName)."
        case .remove: base = "Du ba om å slutte med \(display)."
        }
        return lens.isDefault ? base : "\(base) Fokus: \(lens.label)."
    }

    static func categoryReason(intent: Intent, display: String, memberCount: Int, scope: String?, lens: Lens) -> String {
        let s = scope.map { " \($0)" } ?? ""
        let grener = memberCount > 0 ? " (dekker \(memberCount) grener)" : ""
        let base: String
        switch intent {
        case .add, .increase: base = "Du vil følge \(display)\(s)\(grener)."
        case .decrease: base = "Du vil nedprioritere \(display)."
        case .remove: base = "Du ba om å slutte med \(display)."
        }
        return lens.isDefault ? base : "\(base) Fokus: \(lens.label)."
    }
}
#endif
