//
//  DesignTokens.swift
//  Zenji
//
//  Tekst-TV (teletext) visual identity — mood ported from docs/css/base.css:
//  amber-led monochrome, a near-black dark "page" by default, a warm-paper
//  light sibling, one monospace typeface throughout. Shared by the Zenji app
//  and the ZenjiWidget extension (see ios/project.yml sources for both targets).
//
//  Values are the DESIGN.md token table (the normative cross-surface
//  contract), kept in lock-step with it — dark is the merkevare-default,
//  light is the equally-polished "warm paper" sibling. Amber is the ONE
//  accent (DESIGN.md "Tokens"): wordmark, day headers, must-see dot, clock,
//  selected state — never body text.
//

import SwiftUI
import UIKit

/// Raw Tekst-TV colour tokens, split by appearance — a 1:1 mirror of the
/// DESIGN.md token table.
enum ZenjiTokens {

    /// Dark "page" — the default appearance.
    enum Dark {
        /// Teletext amber — the one accent.
        static let amber = Color(hex: 0xFFB000)
        /// Near-black page background.
        static let background = Color(hex: 0x0A0A0C)
        /// Raised surface (detail sheet / cards-that-aren't-cards).
        static let surface = Color(hex: 0x131316)
        /// Warm off-white foreground text.
        static let foreground = Color(hex: 0xE8E6E0)
        /// Muted secondary text ("dempet") — meta, channel, honest "–".
        static let muted = Color(hex: 0x8A877E)
        /// Hairline rule between rows / under the header.
        static let hairline = Color(hex: 0x26251F)
        /// The semantic, sparingly-used "live" colour.
        static let live = Color(hex: 0x5BD990)
    }

    /// "Warm paper" — the light sibling.
    enum Light {
        /// Warm paper background.
        static let background = Color(hex: 0xF5F1E6)
        /// Raised surface on paper.
        static let surface = Color(hex: 0xEDE8D9)
        /// Darkened amber — keeps the accent legible on a light page.
        static let accent = Color(hex: 0x8F6400)
        /// Ink on paper.
        static let foreground = Color(hex: 0x1D1B15)
        /// Muted secondary text on paper.
        static let muted = Color(hex: 0x6E6A5C)
        /// Hairline on paper.
        static let hairline = Color(hex: 0xD9D3C0)
        /// Live colour on paper (darkened for contrast).
        static let live = Color(hex: 0x2E7D4F)
    }

    /// The one accent colour, adapted to the current system colour scheme.
    static var accent: Color { .zenji(dark: Dark.amber, light: Light.accent) }
    /// Page background, adapted to the current system colour scheme.
    static var background: Color { .zenji(dark: Dark.background, light: Light.background) }
    /// Raised surface (detail sheets), adapted to the current colour scheme.
    static var surface: Color { .zenji(dark: Dark.surface, light: Light.surface) }
    /// Body text, adapted to the current system colour scheme.
    static var foreground: Color { .zenji(dark: Dark.foreground, light: Light.foreground) }
    /// Muted secondary text ("dempet"), adapted to the current colour scheme.
    static var muted: Color { .zenji(dark: Dark.muted, light: Light.muted) }
    /// Hairline rule, adapted to the current colour scheme.
    static var hairline: Color { .zenji(dark: Dark.hairline, light: Light.hairline) }
    /// The semantic "live" colour, adapted to the current colour scheme.
    static var live: Color { .zenji(dark: Dark.live, light: Light.live) }

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
