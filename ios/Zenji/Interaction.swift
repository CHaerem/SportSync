//
//  Interaction.swift
//  Zenji
//
//  WP-14.3 — DESIGN.md "Interaksjon" (a normative line added by this
//  package): every interactive element gets an Apple HIG-compliant ≥44×44pt
//  hit area, however small its glyph reads visually. The owner's finding on a
//  physical iPhone was "veldig små knapper" (very small buttons) — the fix is
//  ALWAYS the hit area, never the Tekst-TV glyph scale (DESIGN.md's small,
//  quiet mono glyphs are the visual language and are kept as-is).
//
//  Two shapes cover every case in the audit (see PR body for the full table):
//
//   • `.zenjiTapTarget()` — for glyph/icon-only or small-text chrome (header
//     glyphs, the command line's sigil/send/Avbryt, toolbar "Lukk", "OK",
//     "Fjern", "Slett", note-edit controls …). The glyph/text stays exactly
//     the size DESIGN.md specifies; only the invisible hit area grows to
//     ≥44×44pt via padding + `contentShape`, never by enlarging the mark.
//   • `ZenjiActionButtonStyle` — for controls that ARE the action, not
//     incidental chrome (Bekreft/Avvis, «mente du»-forslag): a real,
//     comfortable button — min 44pt tall, roomy horizontal padding, a flat
//     hairline box. Still no fill (DESIGN.md forbudsliste: "ingen … fylte
//     'pill buttons'") — the box is a 1pt stroke in the action's own colour
//     (diffAdd/diffRemove/accent/muted), never a second accent.
//

import SwiftUI

extension View {
    /// Grows the tappable area to ≥44×44pt around a small glyph or text
    /// label without changing how it looks — the padding is invisible, the
    /// mark stays Tekst-TV-quiet (DESIGN.md "Interaksjon").
    func zenjiTapTarget() -> some View {
        self
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

/// A comfortable, flat action button: min 44pt tall, generous horizontal
/// padding, a hairline box in the action's own colour. The DESIGN.md-faithful
/// alternative to a filled pill — use for controls that are themselves the
/// action (Bekreft/Avvis, «mente du»-forslag), never for incidental chrome
/// (that's `.zenjiTapTarget()`).
struct ZenjiActionButtonStyle: ButtonStyle {
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
