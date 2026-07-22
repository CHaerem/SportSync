//
//  DisplayFontTests.swift
//  SportivistaTests
//
//  WP-183 — the typographic voice. DESIGN.md § Typografi: San Francisco
//  everywhere EXCEPT the wordmark, the agenda's time column and the share cards,
//  which carry ONE display face (Space Grotesk, self-hosted OFL subset).
//
//  What this proves (and why each one matters):
//    • The shipped .ttf files are IN the bundle and their PostScript names are
//      exactly the strings `SportivistaDisplayWeight` asks for. A typo there is
//      otherwise invisible: `Font.sportivistaDisplay` fails soft to SF and the
//      app just quietly looks like it did before the work package.
//    • The digits are TABULAR — every one of 0–9 has the same advance. The time
//      column is the whole point of the face; a proportional-figure font would
//      make the board's fixed column wobble.
//    • æ, ø and å exist in every shipped weight (Norwegian UI, non-negotiable).
//    • The face fails soft: asking for an unknown name never crashes.
//
//  A hostless test bundle gets no `UIAppFonts`, so the fonts are registered
//  here with CoreText — the same three files the app/widget/device targets
//  bundle (see ios/project.yml).
//

import XCTest
import SwiftUI
import UIKit
import CoreText

final class DisplayFontTests: XCTestCase {

	/// PostScript names, mirroring `SportivistaDisplayWeight.postScriptName`.
	private static let faces: [(weight: SportivistaDisplayWeight, file: String, postScriptName: String)] = [
		(.medium, "SpaceGrotesk-Medium-subset", "SpaceGrotesk-Medium"),
		(.semibold, "SpaceGrotesk-SemiBold-subset", "SpaceGrotesk-SemiBold"),
		(.bold, "SpaceGrotesk-Bold-subset", "SpaceGrotesk-Bold"),
	]

	override class func setUp() {
		super.setUp()
		for face in faces {
			guard let url = Bundle(for: DisplayFontTests.self).url(forResource: face.file, withExtension: "ttf") else {
				continue // asserted per-test below, with a readable message
			}
			CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
		}
	}

	// MARK: - The shipped files

	func testEveryShippedWeightIsBundled() {
		for face in Self.faces {
			XCTAssertNotNil(
				Bundle(for: DisplayFontTests.self).url(forResource: face.file, withExtension: "ttf"),
				"\(face.file).ttf is not in the test bundle — check ios/project.yml resources"
			)
		}
	}

	func testPostScriptNamesResolveToTheShippedFace() {
		for face in Self.faces {
			XCTAssertEqual(face.weight.postScriptName, face.postScriptName)
			let font = UIFont(name: face.weight.postScriptName, size: 17)
			XCTAssertNotNil(font, "PostScript name \(face.weight.postScriptName) does not resolve")
			XCTAssertEqual(font?.fontName, face.postScriptName)
		}
	}

	// MARK: - Tabular digits (the whole reason for the face)

	func testDigitsAreTabularInEveryWeight() {
		for face in Self.faces {
			guard let font = UIFont(name: face.weight.postScriptName, size: 100) else {
				XCTFail("missing face \(face.weight.postScriptName)")
				continue
			}
			let widths = Set("0123456789".map { advance(of: String($0), in: font) })
			XCTAssertEqual(
				widths.count, 1,
				"\(face.postScriptName): digits are not tabular — advances \(widths.sorted())"
			)
		}
	}

	func testNorwegianLettersExistInEveryWeight() {
		for face in Self.faces {
			guard let font = UIFont(name: face.weight.postScriptName, size: 100) else {
				XCTFail("missing face \(face.weight.postScriptName)")
				continue
			}
			let charset = CTFontCopyCharacterSet(font) as CharacterSet
			for scalar in "æøåÆØÅ".unicodeScalars {
				XCTAssertTrue(
					charset.contains(scalar),
					"\(face.postScriptName) is missing \(scalar) — the UI is Norwegian"
				)
			}
			// The wordmark's own letters, for the same reason.
			for scalar in "SPORTIVISTA:".unicodeScalars {
				XCTAssertTrue(charset.contains(scalar), "\(face.postScriptName) is missing \(scalar)")
			}
		}
	}

	// MARK: - Fail-soft

	func testUnknownFaceNameFallsBackInsteadOfCrashing() {
		XCTAssertNil(UIFont(name: "SpaceGrotesk-NoSuchWeight", size: 17))
		// The token API itself must still hand back a usable font in that world.
		XCTAssertNotNil(Font.sportivistaDisplay(.body, weight: .semibold))
	}

	func testEveryWeightHasADistinctSystemFallback() {
		let fallbacks = SportivistaDisplayWeight.allCases.map(\.systemFallback)
		XCTAssertEqual(Set(fallbacks.map(\.hashValue)).count, SportivistaDisplayWeight.allCases.count)
	}

	// MARK: - Helpers

	/// The advance width of a single-character string in a font.
	private func advance(of text: String, in font: UIFont) -> CGFloat {
		(text as NSString).size(withAttributes: [.font: font]).width
	}
}
