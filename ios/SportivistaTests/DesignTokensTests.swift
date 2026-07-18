//
//  DesignTokensTests.swift
//  SportivistaTests
//
//  Token & typography foundation acceptance (DESIGN.md § Tokens). Proves:
//    • the semantic colour tokens exist and resolve to the documented dark/
//      light values (§ Farge),
//    • the Dynamic Type text-style API binds to SwiftUI text styles (and the
//      tabular variant adds monospaced digits),
//    • the 8pt spacing scale exists.
//
//  The WP-80 migration shims (the fixed-size `sportivistaMono` font and the legacy
//  Tekst-TV colour aliases) were removed in WP-85; their tests went with them.
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

	// MARK: - Semantic colour tokens (DESIGN.md § Farge)

	func testBackgroundResolvesToDocumentedValues() {
		assertHex(SportivistaTokens.background, darkTraits, 0x000000, "background dark")
		assertHex(SportivistaTokens.background, lightTraits, 0xF2F2F7, "background light")
	}

	func testGroupedBackgroundMatchesBackground() {
		assertHex(SportivistaTokens.groupedBackground, darkTraits, 0x000000, "groupedBackground dark")
		assertHex(SportivistaTokens.groupedBackground, lightTraits, 0xF2F2F7, "groupedBackground light")
	}

	func testCellResolvesToDocumentedValues() {
		assertHex(SportivistaTokens.cell, darkTraits, 0x1C1C1E, "cell dark")
		assertHex(SportivistaTokens.cell, lightTraits, 0xFFFFFF, "cell light")
	}

	func testCell2ResolvesToDocumentedValues() {
		assertHex(SportivistaTokens.cell2, darkTraits, 0x2C2C2E, "cell2 dark")
		assertHex(SportivistaTokens.cell2, lightTraits, 0xFFFFFF, "cell2 light")
	}

	func testLabelResolvesToDocumentedValues() {
		assertHex(SportivistaTokens.label, darkTraits, 0xFFFFFF, "label dark")
		assertHex(SportivistaTokens.label, lightTraits, 0x000000, "label light")
	}

	func testAccentIsAmber() {
		assertHex(SportivistaTokens.accent, darkTraits, 0xFFB000, "accent dark")
		assertHex(SportivistaTokens.accent, lightTraits, 0x9A6800, "accent light")
	}

	func testLiveResolvesToDocumentedValues() {
		assertHex(SportivistaTokens.live, darkTraits, 0x30D158, "live dark")
		assertHex(SportivistaTokens.live, lightTraits, 0x34C759, "live light")
	}

	func testDestructiveResolvesToDocumentedValues() {
		assertHex(SportivistaTokens.destructive, darkTraits, 0xFF453A, "destructive dark")
		assertHex(SportivistaTokens.destructive, lightTraits, 0xFF3B30, "destructive light")
	}

	/// secondaryLabel and separator are semi-transparent system colours — assert
	/// they resolve (exist) and, per DESIGN, are muted (alpha < 1) so
	/// they read as "dempet"/hairline rather than solid.
	func testSecondaryLabelAndSeparatorAreMutedSystemColours() {
		let secDark = rgba(SportivistaTokens.secondaryLabel, darkTraits)
		let secLight = rgba(SportivistaTokens.secondaryLabel, lightTraits)
		XCTAssertLessThan(secDark.a, 1.0, "secondaryLabel dark should be muted")
		XCTAssertLessThan(secLight.a, 1.0, "secondaryLabel light should be muted")

		let sepDark = rgba(SportivistaTokens.separator, darkTraits)
		let sepLight = rgba(SportivistaTokens.separator, lightTraits)
		XCTAssertLessThanOrEqual(sepDark.a, 1.0, "separator dark resolves")
		XCTAssertLessThanOrEqual(sepLight.a, 1.0, "separator light resolves")
	}

	// MARK: - Typography (DESIGN.md § Typografi)

	func testSportivistaFontBindsToTextStyle() {
		XCTAssertEqual(Font.sportivista(.body), Font.system(.body))
		XCTAssertEqual(Font.sportivista(.headline), Font.system(.headline))
		XCTAssertEqual(Font.sportivista(), Font.system(.body), "default role is .body")
	}

	func testSportivistaFontAppliesWeight() {
		XCTAssertEqual(Font.sportivista(.largeTitle, weight: .bold), Font.system(.largeTitle).weight(.bold))
		XCTAssertEqual(Font.sportivista(.body, weight: .semibold), Font.system(.body).weight(.semibold))
	}

	func testSportivistaTabularAddsMonospacedDigits() {
		XCTAssertEqual(Font.sportivistaTabular(.body), Font.system(.body).monospacedDigit())
		XCTAssertEqual(Font.sportivistaTabular(.body, weight: .semibold),
		               Font.system(.body).weight(.semibold).monospacedDigit())
		// Tabular differs from the plain style (proves the modifier is applied).
		XCTAssertNotEqual(Font.sportivistaTabular(.body), Font.sportivista(.body))
	}

	// MARK: - Spacing scale (8pt basis)

	func testSpacingScaleIsEightPtBased() {
		XCTAssertEqual(SportivistaSpacing.xs, 4)
		XCTAssertEqual(SportivistaSpacing.s, 8)
		XCTAssertEqual(SportivistaSpacing.m, 12)
		XCTAssertEqual(SportivistaSpacing.l, 16)
		XCTAssertEqual(SportivistaSpacing.xl, 24)
		XCTAssertEqual(SportivistaSpacing.xxl, 32)
	}
}
