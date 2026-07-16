//
//  MockCommandParser.swift
//  Zenji
//
//  WP-66 — the deterministic stand-in for the FM model's COMMAND arm, the
//  counterpart to MockInterestParser (mutations) and MockAnswerer (answers).
//  Apple Intelligence can't run in CI/Simulator, so the command router is a
//  plain, pure function the tests drive directly: a small, rule-based Norwegian
//  keyword matcher that turns an utterance into an `AssistantCommand`, or nil
//  when the utterance is not a command (so it falls through to the question /
//  mutation arms exactly as before).
//
//  Deliberately NARROW — the command arm is checked FIRST, so any over-capture
//  would steal a follow/question. Two rules keep it honest:
//    • Each command needs a specific ANCHOR word (tema/modus, nullstill,
//      onboarding, profil+del/qr, vet+meg/minne, glem+minne-kontekst,
//      varsel/ledetid, or a leading «vis»/«åpne»).
//    • «Vis bare …» is explicitly LEFT to the mutation arm — it is the WP-67
//      presentation filter, not an event-open (guarded so present-01 stays a
//      known gap, not a mis-routed command).
//
//  WP-48 convention: the whole file is `#if DEBUG` — a Release build carries no
//  Mock* symbols; the hostless tests (Debug config) still compile it.
//

#if DEBUG
import Foundation

enum MockCommandParser {

    /// Interpret `utterance` as an app command, or nil if it is not one. Pure +
    /// synchronous so tests call it directly; `MockInterestAssistant` wraps it.
    static func command(_ utterance: String, profile: InterestProfile, index: EntityIndex) -> AssistantCommand? {
        let tokens = EntityIndex.tokens(utterance)
        guard !tokens.isEmpty else { return nil }
        let set = Set(tokens)

        // 1) THEME — «bytt til mørkt tema», «lyst tema», «bruk systemtema».
        if let theme = theme(tokens: tokens, set: set) { return .setTheme(theme) }

        // 2) RESET — «nullstill», «slett alt om meg» (GDPR). DESTRUCTIVE.
        if set.contains("nullstill") || set.contains("resett")
            || (set.contains("slett") && set.contains("alt")) {
            // The GDPR level is the one that names memory / everything about
            // "meg"; a bare «nullstill (det jeg følger)» is the follow-only level.
            let everything = set.contains("meg") || set.contains("minne")
                || set.contains("data") || set.contains("vet")
            return .resetProfile(everything ? .everything : .followedOnly)
        }

        // 3) RE-ONBOARDING — «kjør onboarding på nytt», «start oppsettet igjen».
        if set.contains("onboarding") || (set.contains("oppsett") && set.contains("nytt"))
            || (set.contains("oppsettet") && set.contains("nytt")) {
            return .rerunOnboarding
        }

        // 4) SHARE — «del profilen», «vis QR-koden». Checked before openEvent so
        //    a leading «vis» in «vis QR» opens sharing, not an event.
        if set.contains("qr")
            || (hasPrefix(tokens, "del") && hasPrefix(tokens, "profil")) {
            return .shareProfile
        }

        // 5) FORGET (memory) — «glem alt om meg», «glem det du vet om sjakk».
        //    Checked BEFORE the memory-open branch (a «glem … vet … om …» phrase
        //    matches both), and requires a MEMORY context word so a bare «glem
        //    <lag>» stays an unfollow (the mutation arm's «glem» verb) rather than
        //    a memory wipe.
        if set.contains("glem") || set.contains("glemme") {
            let memoryContext = set.contains("meg") || set.contains("vet") || set.contains("lagret")
                || set.contains("minne") || set.contains("minnet") || set.contains("husker")
                || set.contains("alt") || set.contains("alle")
            if memoryContext {
                let query = residual(tokens, dropping: forgetStopwords)
                let all = query.isEmpty || set.contains("alt") || set.contains("alle")
                return .forgetMemory(query: all ? "" : query)
            }
        }

        // 6) MEMORY (open) — «hva vet du om meg», «åpne minnet». Runs before the
        //    question arm (which this utterance would otherwise trigger).
        if set.contains("minne") || set.contains("minnet")
            || (set.contains("vet") && (set.contains("meg") || set.contains("om"))) {
            return .showMemory
        }

        // 7) NOTIFICATION LEAD TIME — «skru på varsel-ledetid», «slå av varsler».
        if set.contains("varsel") || set.contains("varsler") || set.contains("varsling")
            || set.contains("varslinger") || set.contains("ledetid")
            || set.contains("paminnelse") || set.contains("paminnelser") {
            // «på» normalises to «pa»; a negative word means off, else on.
            let off = set.contains("av") || set.contains("ingen") || set.contains("uten") || set.contains("stopp")
            return .setNotificationLeadTime(enabled: !off)
        }

        // 8) OPEN EVENT — a leading «vis»/«åpne» naming a specific event. NOT
        //    «vis bare …» (the WP-67 presentation filter — left to the mutation
        //    arm's known-gap) and NOT if there's nothing to name.
        if let first = tokens.first, first == "vis" || first == "apne" {
            if set.contains("bare") { return nil }           // WP-67 filter — not us
            let query = residual(tokens, dropping: openStopwords)
            guard !query.isEmpty else { return nil }
            return .openEvent(query: query)
        }

        return nil
    }

    // MARK: - Theme

    private static func theme(tokens: [String], set: Set<String>) -> ThemeOverride? {
        let anchored = set.contains("tema") || set.contains("modus")
            || tokens.contains { $0.hasSuffix("tema") || $0.hasSuffix("modus") }
        let system = tokens.contains { $0.hasPrefix("system") } || set.contains("automatisk") || set.contains("auto")
        let dark = tokens.contains { $0.hasPrefix("mørk") } || set.contains("dark")
        let light = tokens.contains { $0.hasPrefix("lys") } || set.contains("light")
        guard anchored, system || dark || light else { return nil }
        if system { return .system }
        if dark { return .dark }
        return .light
    }

    // MARK: - Helpers

    private static func hasPrefix(_ tokens: [String], _ prefix: String) -> Bool {
        tokens.contains { $0.hasPrefix(prefix) }
    }

    /// The remaining meaningful phrase after dropping the verb/scaffolding tokens
    /// for a command — the free-text argument (event name / memory topic).
    private static func residual(_ tokens: [String], dropping stop: Set<String>) -> String {
        tokens.filter { !stop.contains($0) && !EntityIndex.isYear($0) }.joined(separator: " ")
    }

    private static let openStopwords: Set<String> = [
        "vis", "apne", "meg", "oss", "kampen", "kamp", "kampene", "matchen", "match",
        "detaljer", "detalj", "arrangementet", "eventet", "hendelsen", "runde", "etappe",
    ]

    private static let forgetStopwords: Set<String> = [
        "glem", "glemme", "alt", "alle", "om", "meg", "det", "du", "vet", "at", "jeg",
        "er", "som", "lagret", "minne", "minnet", "husker", "mitt", "min", "har", "sa",
    ]
}
#endif
