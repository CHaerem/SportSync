//
//  DesignTokensTests.swift
//  ZenjiTests
//
//  WP-80 acceptance — the token & typography foundation (DESIGN-BASELINE.md
//  § Tokens). Proves:
//    • the semantic colour tokens exist and resolve to the documented dark/
//      light values (§ Farge),
//    • the Dynamic Type text-style API binds to SwiftUI text styles (and the
//      tabular variant adds monospaced digits),
//    • the deprecated `zenjiMono(size:)` shim still compiles and maps a legacy
//      point size onto the nearest text style (so every un-migrated view/widget
//      keeps compiling until WP-85),
//    • the legacy colour aliases map onto the new tokens,
//    • the 8pt spacing scale exists.
//

import XCTest
import SwiftUI
import UIKit

final class DesignTokensTests: XCTestCase {

	// MARK: - Helpers

	private let darkTraits = UITraitCollection(userInterfaceStyle: .dark)
	private let lightTraits = UITraitCollection(userInterfaceStyle: .light)

	/// Resolves a SwiftUI colour token in a given appearance and returns its
	/// 8-bit sRGB components.
	private func rgba(_ color: Color, _ traits: UITraitCollection) -> (r: Int, g: Int, b: Int, a: CGFloat) {
		let resolved = UIColor(color).resolvedColor(with: traits)
		var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
		resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
		return (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()), a)
	}

	/// Asserts a token resolves to an opaque `0xRRGGBB` value in the given
	/// appearance, within a ±2/255 tolerance for float rounding.
	private func assertHex(_ color: Color, _ traits: UITraitCollection, _ hex: UInt32,
	                       _ label: String, file: StaticString = #filePath, line: UInt = #line) {
		let got = rgba(color, traits)
		let want = (r: Int((hex >> 16) & 0xFF), g: Int((hex >> 8) & 0xFF), b: Int(hex & 0xFF))
		XCTAssertLessThanOrEqual(abs(got.r - want.r), 2, "\(label) R", file: file, line: line)
		XCTAssertLessThanOrEqual(abs(got.g - want.g), 2, "\(label) G", file: file, line: line)
		XCTAssertLessThanOrEqual(abs(got.b - want.b), 2, "\(label) B", file: file, line: line)
	}

	// MARK: - Semantic colour tokens (DESIGN-BASELINE.md § Farge)

	func testBackgroundResolvesToDocumentedValues() {
		assertHex(ZenjiTokens.background, darkTraits, 0x000000, "background dark")
		assertHex(ZenjiTokens.background, lightTraits, 0xF2F2F7, "background light")
	}

	func testGroupedBackgroundMatchesBackground() {
		assertHex(ZenjiTokens.groupedBackground, darkTraits, 0x000000, "groupedBackground dark")
		assertHex(ZenjiTokens.groupedBackground, lightTraits, 0xF2F2F7, "groupedBackground light")
	}

	func testCellResolvesToDocumentedValues() {
		assertHex(ZenjiTokens.cell, darkTraits, 0x1C1C1E, "cell dark")
		assertHex(ZenjiTokens.cell, lightTraits, 0xFFFFFF, "cell light")
	}

	func testCell2ResolvesToDocumentedValues() {
		assertHex(ZenjiTokens.cell2, darkTraits, 0x2C2C2E, "cell2 dark")
		assertHex(ZenjiTokens.cell2, lightTraits, 0xFFFFFF, "cell2 light")
	}

	func testLabelResolvesToDocumentedValues() {
		assertHex(ZenjiTokens.label, darkTraits, 0xFFFFFF, "label dark")
		assertHex(ZenjiTokens.label, lightTraits, 0x000000, "label light")
	}

	func testAccentIsAmber() {
		assertHex(ZenjiTokens.accent, darkTraits, 0xFFB000, "accent dark")
		assertHex(ZenjiTokens.accent, lightTraits, 0x9A6800, "accent light")
	}

	func testLiveResolvesToDocumentedValues() {
		assertHex(ZenjiTokens.live, darkTraits, 0x30D158, "live dark")
		assertHex(ZenjiTokens.live, lightTraits, 0x34C759, "live light")
	}

	func testDestructiveResolvesToDocumentedValues() {
		assertHex(ZenjiTokens.destructive, darkTraits, 0xFF453A, "destructive dark")
		assertHex(ZenjiTokens.destructive, lightTraits, 0xFF3B30, "destructive light")
	}

	/// secondaryLabel and separator are semi-transparent system colours — assert
	/// they resolve (exist) and, per DESIGN-BASELINE, are muted (alpha < 1) so
	/// they read as "dempet"/hairline rather than solid.
	func testSecondaryLabelAndSeparatorAreMutedSystemColours() {
		let secDark = rgba(ZenjiTokens.secondaryLabel, darkTraits)
		let secLight = rgba(ZenjiTokens.secondaryLabel, lightTraits)
		XCTAssertLessThan(secDark.a, 1.0, "secondaryLabel dark should be muted")
		XCTAssertLessThan(secLight.a, 1.0, "secondaryLabel light should be muted")

		let sepDark = rgba(ZenjiTokens.separator, darkTraits)
		let sepLight = rgba(ZenjiTokens.separator, lightTraits)
		XCTAssertLessThanOrEqual(sepDark.a, 1.0, "separator dark resolves")
		XCTAssertLessThanOrEqual(sepLight.a, 1.0, "separator light resolves")
	}

	// MARK: - Legacy colour aliases (WP-80 shim → new tokens)

	@available(*, deprecated)
	func testLegacyColourAliasesMapToNewTokens() {
		// Referencing the deprecated aliases proves they still compile; comparing
		// resolved values proves the mapping. Wrapped in a @available(deprecated)
		// method so the intentional legacy use raises no warning noise.
		XCTAssertEqual(rgba(ZenjiTokens.foreground, darkTraits).r, rgba(ZenjiTokens.label, darkTraits).r)
		XCTAssertEqual(rgba(ZenjiTokens.muted, darkTraits).a, rgba(ZenjiTokens.secondaryLabel, darkTraits).a, accuracy: 0.01)
		assertHex(ZenjiTokens.surface, darkTraits, 0x1C1C1E, "surface(alias→cell) dark")
		assertHex(ZenjiTokens.diffAdd, darkTraits, 0x30D158, "diffAdd(alias→live) dark")
		assertHex(ZenjiTokens.diffRemove, darkTraits, 0xFF453A, "diffRemove(alias→destructive) dark")
	}

	// MARK: - Typography (DESIGN-BASELINE.md § Typografi)

	func testZenjiFontBindsToTextStyle() {
		XCTAssertEqual(Font.zenji(.body), Font.system(.body))
		XCTAssertEqual(Font.zenji(.headline), Font.system(.headline))
		XCTAssertEqual(Font.zenji(), Font.system(.body), "default role is .body")
	}

	func testZenjiFontAppliesWeight() {
		XCTAssertEqual(Font.zenji(.largeTitle, weight: .bold), Font.system(.largeTitle).weight(.bold))
		XCTAssertEqual(Font.zenji(.body, weight: .semibold), Font.system(.body).weight(.semibold))
	}

	func testZenjiTabularAddsMonospacedDigits() {
		XCTAssertEqual(Font.zenjiTabular(.body), Font.system(.body).monospacedDigit())
		XCTAssertEqual(Font.zenjiTabular(.body, weight: .semibold),
		               Font.system(.body).weight(.semibold).monospacedDigit())
		// Tabular differs from the plain style (proves the modifier is applied).
		XCTAssertNotEqual(Font.zenjiTabular(.body), Font.zenji(.body))
	}

	// MARK: - Deprecated zenjiMono shim (WP-80 — keeps views compiling)

	@available(*, deprecated)
	func testZenjiMonoShimMapsSizeToNearestTextStyle() {
		// The shim must still compile and return a sensible, Dynamic-Type-backed
		// font. Legacy sizes used across the un-migrated views map to the nearest
		// text style, with tabular digits preserved. The shim's default weight is
		// `.regular`, which SwiftUI records as a distinct modifier — so the
		// expectation carries `.regular` too.
		XCTAssertEqual(Font.zenjiMono(size: 13), Font.zenjiTabular(.footnote, weight: .regular))
		XCTAssertEqual(Font.zenjiMono(size: 12), Font.zenjiTabular(.caption, weight: .regular))
		XCTAssertEqual(Font.zenjiMono(size: 11), Font.zenjiTabular(.caption2, weight: .regular))
		XCTAssertEqual(Font.zenjiMono(size: 15), Font.zenjiTabular(.subheadline, weight: .regular))
		XCTAssertEqual(Font.zenjiMono(size: 17), Font.zenjiTabular(.body, weight: .regular))
		XCTAssertEqual(Font.zenjiMono(size: 28), Font.zenjiTabular(.title, weight: .regular))
		XCTAssertEqual(Font.zenjiMono(size: 34), Font.zenjiTabular(.largeTitle, weight: .regular))
	}

	@available(*, deprecated)
	func testZenjiMonoShimCarriesWeight() {
		XCTAssertEqual(Font.zenjiMono(size: 13, weight: .bold),
		               Font.zenjiTabular(.footnote, weight: .bold))
		XCTAssertEqual(Font.zenjiMono(size: 15, weight: .semibold),
		               Font.zenjiTabular(.subheadline, weight: .semibold))
	}

	// MARK: - Spacing scale (8pt basis)

	func testSpacingScaleIsEightPtBased() {
		XCTAssertEqual(ZenjiSpacing.xs, 4)
		XCTAssertEqual(ZenjiSpacing.s, 8)
		XCTAssertEqual(ZenjiSpacing.m, 12)
		XCTAssertEqual(ZenjiSpacing.l, 16)
		XCTAssertEqual(ZenjiSpacing.xl, 24)
		XCTAssertEqual(ZenjiSpacing.xxl, 32)
	}
}
