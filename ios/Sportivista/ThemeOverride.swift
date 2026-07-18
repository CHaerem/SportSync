//
//  ThemeOverride.swift
//  Sportivista
//
//  WP-14.2 — manual theme override, mirroring the web dashboard's theme
//  toggle (`docs/js/dashboard.js` `initTheme`/`#theme-toggle`, DESIGN.md
//  "Header": "gjelder alle flater — web har den alt"). Three states, cycled
//  by tapping the header glyph next to `»_`: system (follow the device) →
//  mørk (force dark) → lys (force light) → back to system. No settings
//  screen — one tap in the header, same UX as the web toggle.
//
//  This type is the pure, unit-testable half of the feature (cycling,
//  ColorScheme mapping, the quantized glyph, the Norwegian VoiceOver label) —
//  same split as BackgroundRefreshScheduling/BackgroundRefreshScheduler:
//  ContentView is a thin `@AppStorage` + `.preferredColorScheme` shell around
//  it, applied once at the view returned to `WindowGroup` so it covers every
//  screen and `.sheet` automatically (`UIColor { traits in … }` in
//  DesignTokens.swift already reads the live trait collection, so no token
//  changes are needed — `.preferredColorScheme` overrides that trait for the
//  whole window, sheets included).
//

import SwiftUI

enum ThemeOverride: String, CaseIterable, Sendable {
    case system
    case dark
    case light

    /// `@AppStorage` key. A single value persisted here and applied at the
    /// app root is enough — no per-screen wiring.
    static let storageKey = "sportivista.themeOverride"

    /// The next state in the header-tap cycle: system → mørk → lys → system.
    var next: ThemeOverride {
        switch self {
        case .system: .dark
        case .dark: .light
        case .light: .system
        }
    }

    /// Maps to SwiftUI's `preferredColorScheme(_:)` — `nil` defers to the
    /// device's own appearance setting.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .dark: .dark
        case .light: .light
        }
    }

    /// The quantized header glyph (DESIGN.md: mono, dempet, no emoji) —
    /// ◐ auto / ● mørk / ○ lys.
    var glyph: String {
        switch self {
        case .system: "◐"
        case .dark: "●"
        case .light: "○"
        }
    }

    /// Norwegian VoiceOver label ("Tema: automatisk/mørk/lys").
    var accessibilityLabel: String {
        switch self {
        case .system: "Tema: automatisk"
        case .dark: "Tema: mørk"
        case .light: "Tema: lys"
        }
    }
}
