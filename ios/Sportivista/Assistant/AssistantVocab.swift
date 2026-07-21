//
//  AssistantVocab.swift
//  Sportivista
//
//  The SHARED assistant vocabulary, decoded once from the bundled
//  `assistant-vocab.json` — the SAME file the web reads (docs/js/assistant.js) and
//  iOS bundles (project.yml references ../docs/config/assistant-vocab.json into the
//  app + test targets; NOT the widget — the widget runs no assistant). Change a
//  keyword in that one file and both platforms follow. Mirrors LensConfig.
//
//  Fail-safe: a missing/unparseable resource returns `fallback`, whose values are
//  byte-identical to the literals SportVocabulary/AgendaFilterParser pinned before
//  the extraction — so a bad bundle degrades to today's behaviour, never a crash.
//

import Foundation

struct AssistantVocab: Decodable, Sendable {
    var sportKeywords: [String: String]
    var categories: Categories
    var presentCues: [String]
    var resetWords: [String]
    var windowTokens: [String: [String]]

    struct Categories: Decodable, Sendable {
        var keywords: [String: String]
        var members: [String: [String]]
        var display: [String: String]
    }

    /// Values identical to the pre-extraction literals — the safety net.
    static let fallback = AssistantVocab(
        sportKeywords: [
            "fotball": "football", "football": "football", "soccer": "football",
            "golf": "golf", "tennis": "tennis",
            "sjakk": "chess", "chess": "chess",
            "sykkel": "cycling", "sykling": "cycling", "landeveissykling": "cycling", "cycling": "cycling",
            "friidrett": "athletics", "athletics": "athletics", "løping": "athletics",
            "f1": "f1", "formel1": "f1", "formel": "f1", "formula1": "f1", "formula": "f1",
            "esport": "esports", "esports": "esports", "cs2": "esports", "cs": "esports", "counterstrike": "esports",
            "skiskyting": "biathlon", "biathlon": "biathlon",
            "langrenn": "cross-country", "crosscountry": "cross-country",
            "alpint": "alpine", "alpine": "alpine", "slalam": "alpine", "utfor": "alpine",
            "hopp": "ski jumping", "skihopp": "ski jumping", "hopprenn": "ski jumping",
            "kombinert": "nordic", "nordic": "nordic",
        ],
        categories: Categories(
            keywords: [
                "vintersport": "winter-sports", "vintersporter": "winter-sports",
                "vinteridrett": "winter-sports", "vinteridretter": "winter-sports",
            ],
            members: ["winter-sports": ["biathlon", "cross-country", "nordic", "alpine", "ski jumping"]],
            display: ["winter-sports": "vintersport"]
        ),
        presentCues: ["vis", "filtrer", "fremhev"],
        resetWords: ["alt", "alle", "igjen", "allt"],
        windowTokens: [
            "this-week": ["uka", "uken", "uke"], "this-weekend": ["helga", "helgen", "helg"],
            "tomorrow": ["morgen", "imorgen"], "today": ["dag", "idag"], "tonight": ["kveld", "ikveld"],
        ]
    )

    static let shared: AssistantVocab = load()

    static func load() -> AssistantVocab {
        let bundle = Bundle(for: AssistantVocabBundleMarker.self)
        guard
            let url = bundle.url(forResource: "assistant-vocab", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode(AssistantVocab.self, from: data)
        else {
            return fallback
        }
        return decoded
    }

    /// The tokens for a window iOS supports (the AgendaFilterWindow cases). The web
    /// also carries a `tonight` window; iOS's filter has none, so it's ignored here.
    func tokens(for window: String) -> Set<String> { Set(windowTokens[window] ?? []) }
}

private final class AssistantVocabBundleMarker {}
