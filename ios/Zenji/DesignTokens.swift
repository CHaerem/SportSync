//
//  DesignTokens.swift
//  Zenji
//
//  Tekst-TV (teletext) visual identity — mood ported from docs/css/base.css:
//  amber-led monochrome, a near-black dark "page" by default, a warm-paper
//  light sibling, one monospace typeface throughout. Shared by the Zenji app
//  and the ZenjiWidget extension (see ios/project.yml sources for both targets).
//
//  Note: these are the literal WP-10 spec values, not a byte-for-byte copy of
//  the web tokens (which use #ffb454 for amber) — cross-platform token
//  unification is future work, out of scope here.
//

import SwiftUI
import UIKit

/// Raw Tekst-TV colour tokens, split by appearance.
enum ZenjiTokens {

    /// Dark "page" — the default appearance.
    enum Dark {
        /// Teletext amber — the one accent (must-see marks, live, header).
        static let amber = Color(hex: 0xFFB000)
        /// Near-black page background.
        static let background = Color(hex: 0x0A0A0C)
        /// Warm off-white foreground text.
        static let foreground = Color(hex: 0xE8E6E0)
    }

    /// "Warm paper" — the light sibling.
    enum Light {
        /// Warm paper background.
        static let background = Color(hex: 0xF5F1E6)
        /// Darkened amber — keeps the accent legible on a light page.
        static let accent = Color(hex: 0x8F6400)
        /// Ink on paper.
        static let foreground = Color(hex: 0x1A1804)
    }

    /// The one accent colour, adapted to the current system colour scheme.
    static var accent: Color { .zenji(dark: Dark.amber, light: Light.accent) }
    /// Page background, adapted to the current system colour scheme.
    static var background: Color { .zenji(dark: Dark.background, light: Light.background) }
    /// Body text, adapted to the current system colour scheme.
    static var foreground: Color { .zenji(dark: Dark.foreground, light: Light.foreground) }

    /// DIFF colours for the FM-lekegrind's proposed-change view (WP-16): green
    /// for add/keep, red for remove, legible on both the near-black and
    /// warm-paper pages. "Changed" (update) reuses `accent` (amber) so the
    /// palette stays the one restrained accent + these two signal colours.
    static var diffAdd: Color { .zenji(dark: Color(hex: 0x3FB950), light: Color(hex: 0x1A7F37)) }
    static var diffRemove: Color { .zenji(dark: Color(hex: 0xF85149), light: Color(hex: 0xB3261E)) }
}

extension Color {
    /// Dynamic colour that follows the system colour scheme — the SwiftUI
    /// analogue of the `prefers-color-scheme` swap in `docs/css/base.css`.
    static func zenji(dark: Color, light: Color) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }

    /// Convenience initializer from a packed 0xRRGGBB literal.
    init(hex: UInt32, opacity: Double = 1) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: opacity)
    }
}

extension Font {
    /// Tekst-TV is set in monospace throughout — SF Mono on Apple platforms
    /// via the system monospaced design, matching `--font` in base.css.
    static func zenjiMono(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}
