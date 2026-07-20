//
//  AssistantButton.swift
//  Sportivista
//
//  WP-144 — the assistant's ENTRY, back in the thumb-reachable zone. The
//  iteration's endpoint: WP-104's bottom CAPSULE read as a dead search field
//  (a false affordance — it looked like a field, was a button); WP-143 moved the
//  entry to an HONEST header `sparkles` toolbar button, but the owner found it
//  unreachable one-handed at the top of a tall iPhone. WP-144 settles it: a
//  COMPACT floating button pinned to the BOTTOM (the reachable zone) that reads
//  UNMISTAKABLY as a button — the sanctioned iOS 26 floating Liquid Glass action.
//
//  It is NOT the old capsule: it HUGS its content (not full width), is centred
//  over the safe area, carries `sparkles` + an active label («Spør assistenten»)
//  — no grey «skriv her»-placeholder, no inline mic (diktering lives in the
//  sheet). Glass belongs to the CONTROL layer only; the agenda underneath is
//  never glassed and scrolls calmly beneath it (DESIGN § Liquid Glass / § Hjelperen).
//

import SwiftUI

/// The compact, floating bottom entry to the samtaleark. One quiet glass pill
/// that reads as a button — `sparkles` + «Spør assistenten» — never a field.
/// Wired from ContentView's `safeAreaInset(.bottom)` so the List scrolls beneath.
struct AssistantButton: View {
    /// Open the samtaleark (a plain tap — diktering is a tap on the sheet's mic).
    var onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 8) {
                // The assistant glyph, amber — the ONE accent, and the tell that
                // this pill IS a control (not a blank field). `sparkles` is the
                // iOS 26 Apple-Intelligence idiom (the assistant is an on-device
                // Foundation Models one).
                Image(systemName: SportSymbol.assistant)
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .accessibilityHidden(true)
                // An ACTIVE label naming the action (sentence case, imperative) —
                // never a passive «skriv her …» placeholder. label colour, so the
                // amber stays accent-only.
                Text("Spør assistenten")
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.label)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            // Hug the content, ≥44 pt tall; the pill is only as wide as its label.
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // Liquid Glass (iOS 26): the platform's own control material as a TRUE
        // capsule, with a subtle amber tint so it reads as an action rather than
        // an empty field. `.interactive()` gives the native press response.
        .glassEffect(.regular.tint(SportivistaTokens.accent.opacity(0.16)).interactive(), in: .capsule)
        .accessibilityLabel("Assistent")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("assistant.button")
        .padding(.bottom, 4)
    }
}
