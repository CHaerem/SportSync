//
//  Interaction.swift
//  Sportivista
//
//  WP-14.3 — DESIGN.md "Interaksjon" (a normative line added by this
//  package): every interactive element gets an Apple HIG-compliant ≥44×44pt
//  hit area, however small its glyph reads visually. The owner's finding on a
//  physical iPhone was "veldig små knapper" (very small buttons) — the fix is
//  ALWAYS the hit area, never the glyph scale: the small, quiet marks are the
//  Apple-native visual language (DESIGN.md) and are kept exactly as-is.
//
//  Two shapes cover every case in the audit (see PR body for the full table):
//
//   • `.sportivistaTapTarget()` — for glyph/icon-only or small-text chrome (header
//     glyphs, the samtaleark's send/Avbryt, toolbar "Lukk", "OK",
//     "Fjern", "Slett", note-edit controls …). The glyph/text stays exactly
//     the size DESIGN.md specifies; only the invisible hit area grows to
//     ≥44×44pt via padding + `contentShape`, never by enlarging the mark.
//   • `SportivistaActionButtonStyle` — for SECONDARY / multi controls that ARE
//     the action, not incidental chrome (Bekreft/Avvis, «mente du»-forslag): a
//     real, comfortable button — min 44pt tall, roomy horizontal padding, a flat
//     hairline box. Deliberately UNFILLED (DESIGN.md forbudsliste: no pill-shaped
//     SECONDARY/multi-buttons) — the box is a 1pt stroke in the action's own
//     colour (diffAdd/diffRemove/accent/muted), never a second accent.
//   • `SportivistaPrimaryButtonStyle` — for the ONE prominent PRIMARY action per
//     screen (DESIGN.md § Forbudsliste, primary-CTA clarification): a readable,
//     FILLED amber native capsule. The barred "pills" are secondary/multi-buttons;
//     a single prominent primary action per screen is sanctioned and must read
//     unmistakably as a button (the unfilled outline read barely as a button in
//     light mode — the design-review 🔴). Use exactly once per screen; every other
//     action stays flat/muted (`SportivistaActionButtonStyle` / `.sportivistaTapTarget()`).
//

import SwiftUI

extension View {
    /// Grows the tappable area to ≥44×44pt around a small glyph or text
    /// label without changing how it looks — the padding is invisible, the
    /// mark stays visually quiet (DESIGN.md "Interaksjon").
    func sportivistaTapTarget() -> some View {
        self
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

/// A comfortable, flat action button: min 44pt tall, generous horizontal
/// padding, a hairline box in the action's own colour. The DESIGN.md-faithful
/// alternative to a filled pill — use for controls that are themselves the
/// action (Bekreft/Avvis, «mente du»-forslag), never for incidental chrome
/// (that's `.sportivistaTapTarget()`).
struct SportivistaActionButtonStyle: ButtonStyle {
    var tint: Color
    /// The suggestion rows in "IKKE FUNNET" want the full row width (they're
    /// one option per line); Bekreft/Avvis sit side by side and should only
    /// be as wide as their own label + padding.
    var fullWidth: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        Group {
            if fullWidth {
                configuration.label.frame(maxWidth: .infinity, alignment: .leading)
            } else {
                configuration.label
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .overlay(Rectangle().stroke(tint.opacity(0.4), lineWidth: 1))
        .opacity(configuration.isPressed ? 0.55 : 1)
    }
}

/// The ONE prominent PRIMARY action per screen — a readable, FILLED amber native
/// capsule (DESIGN.md § Forbudsliste, primary-CTA clarification: a single prominent
/// primary action per screen is sanctioned; the barred "pills" are the SECONDARY /
/// multi-buttons). The unfilled amber outline read barely as a button in light mode
/// (design-review 🔴, 21.07) — this fills it so it is unmistakably tappable.
///
/// Filled with the `accent` token; the label uses the scheme-inverse colour so it
/// stays high-contrast in BOTH themes — black on the bright dark-amber (`#FFB000`),
/// white on the darker light-amber (`#9A6800`) — since a single fixed label colour
/// can't clear WCAG on both. Scales with Dynamic Type (`.headline`), ≥44 pt tall.
/// Use EXACTLY once per screen; every other action stays flat/muted.
struct SportivistaPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sportivista(.headline))
            .foregroundStyle(Color.sportivista(dark: .black, light: .white))
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(SportivistaTokens.accent, in: Capsule())
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}
