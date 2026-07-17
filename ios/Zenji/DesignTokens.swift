//
//  DesignTokens.swift
//  Zenji
//
//  Apple-native baseline design system (DESIGN-BASELINE.md § Tokens) — the thin,
//  swappable skin over Apple's platform. Every brand-bearing value (colour,
//  type role, spacing) is a token here, never hardcoded in a component, so a
//  future rebrand is a re-skin of this file alone.
//
//  Two pillars:
//    • Semantic colour tokens (§ Farge) — iOS system colours for the neutral
//      surfaces/text (they carry contrast, dark/light and accessibility for
//      free), plus amber as the ONE accent and green/red signal tokens with
//      their own explicit values.
//    • Dynamic Type typography (§ Typografi) — `Font.zenji(_:weight:)` binds
//      every text role to a SwiftUI text style (San Francisco), so text scales
//      with the user's setting. `Font.zenjiTabular(...)` adds `.monospacedDigit`
//      for the time column and other places digits must line up.
//
//  Non-breaking (WP-80): the legacy `zenjiMono(size:)` font and the Tekst-TV
//  colour names (`foreground`/`muted`/`surface`/`hairline`/`diffAdd`/`diffRemove`)
//  are kept as deprecated shims mapping onto the new tokens, so the widget and
//  every existing view compile UNCHANGED and each surface migrates on its own
//  schedule (WP-81..84). The shims are removed once all surfaces have migrated
//  (WP-85).
//

import SwiftUI
import UIKit

/// Semantic design tokens — the single source of truth for colour on every
/// surface. Values mirror DESIGN-BASELINE.md § Tokens exactly.
///
/// Neutrals use iOS system colours (which resolve to the documented dark/light
/// hex and adapt to appearance + accessibility automatically); `accent`,
/// `live` and `destructive` carry their own explicit token values.
enum ZenjiTokens {

	// MARK: - Semantic colour tokens (DESIGN-BASELINE.md § Farge)

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
	static let accent = Color.zenji(dark: Color(hex: 0xFFB000), light: Color(hex: 0x9A6800))

	/// Live / positive (systemGreen). `#30D158` dark / `#34C759` light. An own
	/// token value (matches systemGreen) so a rebrand can retune it independently.
	static let live = Color.zenji(dark: Color(hex: 0x30D158), light: Color(hex: 0x34C759))

	/// Destructive (systemRed). `#FF453A` dark / `#FF3B30` light. An own token
	/// value (matches systemRed) so a rebrand can retune it independently.
	static let destructive = Color.zenji(dark: Color(hex: 0xFF453A), light: Color(hex: 0xFF3B30))

	// MARK: - Legacy Tekst-TV colour names (deprecated — WP-80 shim)
	//
	// These map the pre-baseline names onto the semantic tokens so every
	// un-migrated view/widget compiles unchanged. Each surface migrates to the
	// semantic name on its own schedule (WP-81..84); the aliases are removed in
	// WP-85. Deprecation is a compile-time *warning* (not an error), so the
	// build stays green throughout the migration.

	/// Legacy alias for `label` (primary text).
	@available(*, deprecated, message: "Use ZenjiTokens.label")
	static var foreground: Color { label }

	/// Legacy alias for `secondaryLabel` (muted/meta text).
	@available(*, deprecated, message: "Use ZenjiTokens.secondaryLabel")
	static var muted: Color { secondaryLabel }

	/// Legacy alias for `cell` (raised surface / detail sheet).
	@available(*, deprecated, message: "Use ZenjiTokens.cell")
	static var surface: Color { cell }

	/// Legacy alias for `separator` (hairline rule).
	@available(*, deprecated, message: "Use ZenjiTokens.separator")
	static var hairline: Color { separator }

	/// Legacy alias for `live` — the DIFF "add/keep" colour (green signal).
	@available(*, deprecated, message: "Use ZenjiTokens.live")
	static var diffAdd: Color { live }

	/// Legacy alias for `destructive` — the DIFF "remove" colour (red signal).
	@available(*, deprecated, message: "Use ZenjiTokens.destructive")
	static var diffRemove: Color { destructive }
}

/// Spacing scale on an 8pt basis (4pt for fine tuning) — DESIGN-BASELINE.md
/// § Rytme & layout. Use these instead of ad-hoc literals so rhythm stays
/// consistent and re-tunable.
enum ZenjiSpacing {
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
	/// The Dynamic Type text-style API (DESIGN-BASELINE.md § Typografi). Binds a
	/// role to a SwiftUI text style so text scales with the user's setting —
	/// San Francisco (system), NEVER a fixed `.system(size:)` point. Pass a
	/// `weight` for semibold/bold roles.
	///
	/// Role → style map (DESIGN-BASELINE.md typography table):
	///   • Stor tittel (nav) → `.largeTitle` bold
	///   • Seksjonstittel    → `.headline`
	///   • Radtittel / Tid   → `.body` (Tid also `zenjiTabular`, semibold)
	///   • Meta / kanal      → `.subheadline` (secondaryLabel)
	///   • Gruppeoverskrift  → `.footnote`
	///   • Caption           → `.caption`
	static func zenji(_ style: Font.TextStyle = .body, weight: Font.Weight? = nil) -> Font {
		let base = Font.system(style)
		guard let weight else { return base }
		return base.weight(weight)
	}

	/// Dynamic Type text style with tabular (monospaced) digits — for the time
	/// column and anywhere numerals must line up (DESIGN-BASELINE.md: "Tabular
	/// tall … der sifre skal rette seg inn"). Still San Francisco, still scales.
	static func zenjiTabular(_ style: Font.TextStyle = .body, weight: Font.Weight? = nil) -> Font {
		zenji(style, weight: weight).monospacedDigit()
	}

	/// DEPRECATED (WP-80 shim). The Tekst-TV monospace font took a FIXED point
	/// size and did not scale with Dynamic Type. It is kept only so un-migrated
	/// views/widget compile unchanged; it now maps the old size to the NEAREST
	/// Dynamic Type text style (so shimmed text scales for free) and keeps
	/// tabular digits (the old mono font aligned numerals, so the time column
	/// stays aligned until it migrates). Removed in WP-85.
	///
	/// Migrate call sites to `Font.zenji(_:weight:)` / `Font.zenjiTabular(...)`.
	@available(*, deprecated, message: "Use Font.zenji(_:weight:) / Font.zenjiTabular(_:weight:) — this fixed-size monospace font ignores Dynamic Type")
	static func zenjiMono(size: CGFloat, weight: Font.Weight = .regular) -> Font {
		zenjiTabular(textStyle(nearestTo: size), weight: weight)
	}

	/// Maps a legacy fixed point size onto the nearest Dynamic Type text style,
	/// by each style's default (Large content size) point size. Used only by the
	/// `zenjiMono` shim.
	private static func textStyle(nearestTo size: CGFloat) -> Font.TextStyle {
		switch size {
		case 31...: return .largeTitle	// 34
		case 25..<31: return .title		// 28
		case 21..<25: return .title2		// 22
		case 18.5..<21: return .title3	// 20
		case 16.5..<18.5: return .body	// 17 (body/headline)
		case 15.5..<16.5: return .callout	// 16
		case 14..<15.5: return .subheadline	// 15
		case 12.5..<14: return .footnote	// 13
		case 11.5..<12.5: return .caption	// 12
		default: return .caption2		// 11
		}
	}
}
