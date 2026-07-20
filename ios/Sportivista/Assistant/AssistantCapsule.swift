//
//  AssistantCapsule.swift
//  Sportivista
//
//  WP-104 — the assistant's ENTRY, the Claude Design-handoff's replacement for
//  the always-present inline command line: a quiet capsule BUTTON pinned to the
//  bottom of the agenda / Nyheter (above the safe area). "Assistenten er synlig
//  og selvforklarende" — the whole surface is one button (button-rolle, ≥44 pt)
//  that opens the samtaleark; the trailing mic opens it straight into the
//  keyboard's native dictation (spec § 3a / DESIGN § Hjelperen).
//
//  It floats as a Liquid Glass control (glassEffect) over the scrolling content
//  — the same idiom the old command line used — via ContentView's
//  `safeAreaInset(.bottom)`. Glass belongs to the CONTROL layer only; the agenda
//  underneath is never glassed (DESIGN § Liquid Glass).
//

import SwiftUI

struct AssistantCapsule: View {
    /// Which root surface the capsule sits on — the resting label NAMES a
    /// capability contextual to it (WP-142, § Hjelperen), not a blank "Spør …".
    var context: AssistantViewModel.CapsuleContext
    /// Open the samtaleark (a plain tap anywhere on the capsule).
    var onOpen: () -> Void
    /// Open the samtaleark straight into diktering (the trailing mic).
    var onDictate: () -> Void

    private var prompt: String { AssistantViewModel.capsulePrompt(for: context) }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onOpen) {
                HStack(spacing: 10) {
                    // Rev. 19.07 eier-funn: without a leading anchor the label
                    // reads as a dead text field. The assistant symbol
                    // (secondaryLabel, matching the prompt — never amber; the mic
                    // keeps the one accent) is the Maps-pattern anchor DESIGN
                    // § Hjelperen requires — kept even now the resting line NAMES a
                    // capability (WP-142), so the row never reads as a blank field.
                    Image(systemName: SportSymbol.assistant)
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .accessibilityHidden(true)
                    Text(prompt)
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Assistent")
            .accessibilityHint(prompt)
            .accessibilityIdentifier("assistant.capsule")

            Button(action: onDictate) {
                Image(systemName: "mic")
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.accent)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Diktér")
            .accessibilityIdentifier("assistant.capsule.mic")
            .sportivistaTapTarget()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        // Liquid Glass (iOS 26): the platform's own control material — a TRUE
        // capsule (DESIGN § Hjelperen, rev. 19.07 eier-funn: "i EKTE Capsule-form",
        // not the old rect-26 that only approximated one) over the agenda.
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal, 10)
        .padding(.bottom, 4)
    }
}
