//
//  DesignTokens.swift
//  Sportivista
//
//  Apple-native baseline design system (DESIGN.md § Tokens) — the thin,
//  swappable skin over Apple's platform. Every brand-bearing value (colour,
//  type role, spacing) is a token here, never hardcoded in a component, so a
//  future rebrand is a re-skin of this file alone.
//
//  Two pillars:
//    • Semantic colour tokens (§ Farge) — iOS system colours for the neutral
//      surfaces/text (they carry contrast, dark/light and accessibility for
//      free), plus amber as the ONE accent and green/red signal tokens with
//      their own explicit values.
//    • Dynamic Type typography (§ Typografi) — `Font.sportivista(_:weight:)` binds
//      every text role to a SwiftUI text style (San Francisco), so text scales
//      with the user's setting. `Font.sportivistaTabular(...)` adds `.monospacedDigit`
//      for the time column and other places digits must line up.
//
//  The WP-80 migration shims (the legacy fixed-size `sportivistaMono` font and the
//  Tekst-TV colour aliases) were removed in WP-85 once every surface had
//  migrated to the API above. Fixed `.system(size:)` points are barred by the
//  HIG CI gate (tests/ios-dynamic-type-gate.test.js).
//

import SwiftUI
import UIKit

/// Semantic design tokens — the single source of truth for colour on every
/// surface. Values mirror DESIGN.md § Tokens exactly.
///
/// Neutrals use iOS system colours (which resolve to the documented dark/light
/// hex and adapt to appearance + accessibility automatically); `accent`,
/// `live` and `destructive` carry their own explicit token values.
enum SportivistaTokens {

	// MARK: - Semantic colour tokens (DESIGN.md § Farge)

	/// Page surface. `#000000` dark / `#F2F2F7` light — `systemGroupedBackground`
	/// (the baseline is an inset-grouped list world, so the page background is
	/// the grouped background).
	static let background = Color(uiColor: .systemGroupedBackground)

	/// Behind grouped lists. Same values as `background` (`#000000` / `#F2F2F7`).
	static let groupedBackground = Color(uiColor: .systemGroupedBackground)

	/// List / card surface. `#1C1C1E` dark / `#FFFFFF` light.
	static let cell = Color(uiColor: .secondarySystemGroupedBackground)

	/// Nested / raised surface. `#2C2C2E` dark / `#FFFFFF` light —
	/// `tertiarySystemBackground` (the *grouped* tertiary is `#F2F2F7` in light,
	/// so the plain-background tertiary is the one that hits `#FFFFFF`).
	static let cell2 = Color(uiColor: .tertiarySystemBackground)

	/// Primary text. `#FFFFFF` dark / `#000000` light.
	static let label = Color(uiColor: .label)

	/// Meta / channel / muted text. `rgba(235,235,245,.6)` / `rgba(60,60,67,.6)`.
	static let secondaryLabel = Color(uiColor: .secondaryLabel)

	/// Hairline / separator. `rgba(84,84,88,.6)` / `#C6C6C8`.
	static let separator = Color(uiColor: .separator)

	/// The ONE accent — teletext amber. `#FFB000` dark / `#9A6800` light. Used
	/// only for accent (selected state, bar-button tint, must-see dot, alert-on,
	/// primary action) — never body text, never two amber elements in one row.
	static let accent = Color.sportivista(dark: Color(hex: 0xFFB000), light: Color(hex: 0x9A6800))

	/// Live / positive (systemGreen). `#30D158` dark / `#34C759` light. An own
	/// token value (matches systemGreen) so a rebrand can retune it independently.
	static let live = Color.sportivista(dark: Color(hex: 0x30D158), light: Color(hex: 0x34C759))

	/// Destructive (systemRed). `#FF453A` dark / `#FF3B30` light. An own token
	/// value (matches systemRed) so a rebrand can retune it independently.
	static let destructive = Color.sportivista(dark: Color(hex: 0xFF453A), light: Color(hex: 0xFF3B30))
}

/// Spacing scale on an 8pt basis (4pt for fine tuning) — DESIGN.md
/// § Rytme & layout. Use these instead of ad-hoc literals so rhythm stays
/// consistent and re-tunable.
enum SportivistaSpacing {
	/// 4pt — fine tuning.
	static let xs: CGFloat = 4
	/// 8pt — the basis unit.
	static let s: CGFloat = 8
	/// 12pt — inset-group corner / tight grouping.
	static let m: CGFloat = 12
	/// 16pt — standard content inset.
	static let l: CGFloat = 16
	/// 24pt — section spacing.
	static let xl: CGFloat = 24
	/// 32pt — large section spacing.
	static let xxl: CGFloat = 32
}

extension Color {
	/// Dynamic colour that follows the system colour scheme — the SwiftUI
	/// analogue of the `prefers-color-scheme` swap on the web surface. Used for
	/// the accent/signal tokens whose exact values are brand-owned (not a plain
	/// system colour).
	static func sportivista(dark: Color, light: Color) -> Color {
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
	/// The Dynamic Type text-style API (DESIGN.md § Typografi). Binds a
	/// role to a SwiftUI text style so text scales with the user's setting —
	/// San Francisco (system), NEVER a fixed `.system(size:)` point. Pass a
	/// `weight` for semibold/bold roles.
	///
	/// Role → style map (DESIGN.md typography table):
	///   • Stor tittel (nav) → `.largeTitle` bold
	///   • Seksjonstittel    → `.headline`
	///   • Radtittel / Tid   → `.body` (Tid also `sportivistaTabular`, semibold)
	///   • Meta / kanal      → `.subheadline` (secondaryLabel)
	///   • Gruppeoverskrift  → `.footnote`
	///   • Caption           → `.caption`
	static func sportivista(_ style: Font.TextStyle = .body, weight: Font.Weight? = nil) -> Font {
		let base = Font.system(style)
		guard let weight else { return base }
		return base.weight(weight)
	}

	/// Dynamic Type text style with tabular (monospaced) digits — for the time
	/// column and anywhere numerals must line up (DESIGN.md: "Tabular
	/// tall … der sifre skal rette seg inn"). Still San Francisco, still scales.
	static func sportivistaTabular(_ style: Font.TextStyle = .body, weight: Font.Weight? = nil) -> Font {
		sportivista(style, weight: weight).monospacedDigit()
	}
}
