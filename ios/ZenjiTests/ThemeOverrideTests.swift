//
//  ThemeOverrideTests.swift
//  ZenjiTests
//
//  WP-14.2 acceptance — the pure half of the manual theme override: the tap
//  cycle (system → mørk → lys → system), the mapping to SwiftUI's
//  `ColorScheme?`, the quantized header glyph, the Norwegian VoiceOver label,
//  and the `@AppStorage`-style persistence via `rawValue` round-tripped
//  through an isolated `UserDefaults` suite (never `.standard`, so this test
//  can never pollute — or be polluted by — a real run).
//

import XCTest

final class ThemeOverrideTests: XCTestCase {

    // MARK: - Cycling (header tap order)

    func testNext_systemGoesToDark() {
        XCTAssertEqual(ThemeOverride.system.next, .dark)
    }

    func testNext_darkGoesToLight() {
        XCTAssertEqual(ThemeOverride.dark.next, .light)
    }

    func testNext_lightGoesBackToSystem() {
        XCTAssertEqual(ThemeOverride.light.next, .system)
    }

    func testNext_threeTapsReturnsToTheStartingState() {
        for start in ThemeOverride.allCases {
            XCTAssertEqual(start.next.next.next, start, "a full cycle from \(start) must return to \(start)")
        }
    }

    // MARK: - ColorScheme mapping

    func testColorScheme_system_isNilAndDefersToTheDevice() {
        XCTAssertNil(ThemeOverride.system.colorScheme)
    }

    func testColorScheme_dark_isDark() {
        XCTAssertEqual(ThemeOverride.dark.colorScheme, .dark)
    }

    func testColorScheme_light_isLight() {
        XCTAssertEqual(ThemeOverride.light.colorScheme, .light)
    }

    // MARK: - Quantized header glyph (DESIGN.md: mono, no emoji)

    func testGlyph_system_isHalfCircle() {
        XCTAssertEqual(ThemeOverride.system.glyph, "◐")
    }

    func testGlyph_dark_isFilledCircle() {
        XCTAssertEqual(ThemeOverride.dark.glyph, "●")
    }

    func testGlyph_light_isHollowCircle() {
        XCTAssertEqual(ThemeOverride.light.glyph, "○")
    }

    func testGlyph_everyStateIsDistinct() {
        let glyphs = Set(ThemeOverride.allCases.map(\.glyph))
        XCTAssertEqual(glyphs.count, ThemeOverride.allCases.count, "each state must render its own quantized glyph")
    }

    // MARK: - Norwegian VoiceOver label

    func testAccessibilityLabel_system_isNorwegianAutomatisk() {
        XCTAssertEqual(ThemeOverride.system.accessibilityLabel, "Tema: automatisk")
    }

    func testAccessibilityLabel_dark_isNorwegianMork() {
        XCTAssertEqual(ThemeOverride.dark.accessibilityLabel, "Tema: mørk")
    }

    func testAccessibilityLabel_light_isNorwegianLys() {
        XCTAssertEqual(ThemeOverride.light.accessibilityLabel, "Tema: lys")
    }

    // MARK: - Persistence (the `@AppStorage`-backed rawValue round trip)

    func testRawValue_roundTripsThroughUserDefaults() throws {
        let suiteName = "ThemeOverrideTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        defaults.set(ThemeOverride.dark.rawValue, forKey: ThemeOverride.storageKey)
        let stored = defaults.string(forKey: ThemeOverride.storageKey)
        XCTAssertEqual(stored.flatMap(ThemeOverride.init(rawValue:)), .dark)
    }

    func testRawValue_missingKey_fallsBackToSystem() throws {
        let suiteName = "ThemeOverrideTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let stored = defaults.string(forKey: ThemeOverride.storageKey)
        XCTAssertNil(stored, "a fresh suite has no stored override")
        XCTAssertEqual(stored.flatMap(ThemeOverride.init(rawValue:)) ?? .system, .system, "ContentView falls back to .system exactly this way")
    }

    func testRawValue_corruptValue_fallsBackToSystem() {
        // Mirrors `ContentView.themeOverride`'s `?? .system` — a future
        // migration or a corrupted default must never crash or force a
        // random theme.
        XCTAssertNil(ThemeOverride(rawValue: "not-a-real-case"))
    }
}
