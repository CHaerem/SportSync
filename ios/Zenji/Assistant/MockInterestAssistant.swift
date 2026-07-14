//
//  MockInterestAssistant.swift
//  Zenji
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
    }

    let behavior: Behavior

    init(behavior: Behavior = .available) {
        self.behavior = behavior
    }

    func availability() -> AssistantAvailability {
        switch behavior {
        case .available, .producesNothing: return .available
        case let .unavailable(message): return .unavailable(message: message)
        }
    }

    func propose(utterance: String, profile: InterestProfile, index: EntityIndex) async throws -> [ProposedMutation] {
        switch behavior {
        case let .unavailable(message):
            throw AssistantError.unavailable(message: message)
        case .producesNothing:
            return []
        case .available:
            return MockInterestParser.parse(utterance: utterance, profile: profile, index: index)
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

        // 2) A whole-sport command ("mer sykkel", "slutt med tennis").
        if let sport = EntityIndex.sportKeyword(in: trimmed) {
            let lens: Lens = intent == .remove ? .sportAsSuch : detectLens(in: trimmed)
            return sportProposals(intent: intent, sport: sport, scope: scope, weight: weight, lens: lens, profile: profile, index: index)
        }

        // 3) Nothing recognised → one unresolved proposal; grounding rejects it
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
            guard let entity = index.representativeEntity(forSport: sport, preferredIn: profile) else { return [] }
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
}
