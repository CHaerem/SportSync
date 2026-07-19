//
//  SportSymbol.swift
//  Sportivista
//
//  WP-108 — the app's ONE canonical SF Symbol registry (owner dogfooding
//  finding: "it isn't intuitive which SPORT a row is about without reading the
//  meta text"). DESIGN.md § Radens anatomi (rev. 19.07): one quiet SF Symbol per
//  sport, `tertiaryLabel`, fixed width, NEVER coloured, never emoji/logo —
//  shared by the agenda row, the detail sheet and the Nyheter rows so the whole
//  app names a sport the same way.
//
//  Kept dependency-free (pure Swift, no SwiftUI/UIKit, no SportVocabulary) on
//  purpose: this file lands in the app, the widget AND the test target via
//  `path: Sportivista/Models` in project.yml, and SportVocabulary/NewsLens are
//  NOT in the widget target. Callers pass `Event.sport`, which the pipeline
//  already emits as a canonical English tag (build-entities.js); a small alias
//  set + lowercasing makes the lookup robust without reaching for the assistant
//  vocabulary.
//
//  Every symbol name here is verified to exist on iOS by SportSymbolTests, which
//  instantiates `UIImage(systemName:)` for the whole table + the assistant role
//  (an unknown name renders as an empty image — the test is the guard).
//
//  Symbol choices where SF Symbols has no dedicated glyph (documented, not
//  guessed):
//   • chess → `crown` — SF Symbols ships no chess-piece glyph; the king's crown
//     is the conventional stand-in and reads distinctly from `flag.checkered`.
//   • biathlon → `target` — no biathlon glyph exists; `figure.skiing.crosscountry`
//     would collide with cross-country, so `target` uniquely evokes the
//     rifle-shooting half that DEFINES the sport (and skyting → blink) for the
//     Norwegian fan.
//   • ski jumping + nordic (combined) → `snowflake` — neither has a `figure.*`
//     glyph; the honest generic-winter mark beats forcing a wrong figure. They
//     deliberately share it rather than mislabel.
//

import Foundation

/// The canonical sport → SF Symbol map (+ the assistant entry-point role). The
/// single home for every app-level SF Symbol *role* so a rebrand or a new sport
/// is one edit here, not a hunt across views.
enum SportSymbol {
    /// The assistant entry-point glyph (WP-108) — the capsule button's leading
    /// anchor so the grey placeholder no longer reads as a dead text field
    /// (DESIGN § Hjelperen: "Maps-mønsteret krever ankersymbolet"). `sparkles`
    /// is the iOS 26 Apple-Intelligence idiom, apt because the assistant IS an
    /// on-device Foundation Models assistant. Rendered `secondaryLabel` (matching
    /// the prompt text) — NEVER amber; the trailing `mic` keeps the one accent.
    static let assistant = "sparkles"

    /// The fallback when a sport has no mapped symbol — a neutral, honest
    /// "an event" mark (DESIGN § Radens anatomi: "fallback `calendar`").
    static let fallback = "calendar"

    /// Canonical sport tag → SF Symbol. Keys are the canonical English tags the
    /// pipeline emits (`Event.sport`); a few common aliases are folded in so a
    /// non-canonical payload still resolves.
    private static let table: [String: String] = [
        // Sports we cover wholesale / with real glyphs
        "football": "soccerball",
        "soccer": "soccerball",
        "golf": "figure.golf",
        "tennis": "tennisball",
        "cycling": "figure.outdoor.cycle",
        "athletics": "figure.run",
        "f1": "flag.checkered",
        "formula1": "flag.checkered",
        "motorsport": "flag.checkered",
        "esports": "gamecontroller",
        // Winter sports (WP-64 vocabulary)
        "cross-country": "figure.skiing.crosscountry",
        "alpine": "figure.skiing.downhill",
        "biathlon": "target",           // see file header: shooting half, no collision
        "ski jumping": "snowflake",     // no figure glyph
        "nordic": "snowflake",          // nordic combined — no figure glyph
        // Entity-gated sports (no wholesale coverage) with distinctive marks
        "chess": "crown"                // see file header: king's crown stand-in
    ]

    /// The SF Symbol name for a sport tag (canonical or a known alias), else the
    /// neutral `calendar` fallback. Case/whitespace-insensitive.
    static func name(for sport: String) -> String {
        let key = sport.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return table[key] ?? fallback
    }

    /// The full set of symbol names this registry can emit — the assistant role,
    /// the fallback, and every table value. The test target instantiates each to
    /// prove it exists on iOS.
    static var allSymbolNames: Set<String> {
        Set(table.values) .union([assistant, fallback])
    }
}
