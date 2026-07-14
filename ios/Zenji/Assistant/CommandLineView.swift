//
//  CommandLineView.swift
//  Zenji
//
//  WP-16.4 — THE KOMMANDOLINJE. The seamless-assistant brief's first move: a
//  fixed, quiet prompt line pinned to the bottom of the agenda (above the
//  safe-area), the PRIMARY way into the assistant — "assistenten ER
//  grensesnittet", not a room behind a button. Tekst-TV to the core: a mono
//  `»_` sigil, a plain text field, and a blinking `▌` block cursor (static
//  under Reduce Motion — the clock is the app's only sanctioned motion, and
//  this one honours the same rule).
//
//  It carries no logic of its own: it binds the field to
//  AssistantViewModel.utterance, fires `run()` on submit (cancellable), and
//  leaves raising the result "ark" to ContentView (which watches
//  `presentToken`). While the model works it shows a dimmed "tenker …" next to
//  the blinking cursor — never a spinner (move 5) — and an Avbryt.
//

import SwiftUI

struct CommandLineView: View {
    @Bindable var viewModel: AssistantViewModel
    /// Bound from ContentView so the header `»_` glyph can focus the line.
    @FocusState.Binding var focused: Bool
    /// Tapping the line's own `»_` opens the assistant in "browse" mode
    /// (Hva jeg følger + forsto-ikke-loggen) without typing anything.
    var onOpenBrowse: () -> Void

    private var trimmed: String {
        viewModel.utterance.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            // The sigil — a quiet, tappable "oppslag" into the flow.
            Button(action: onOpenBrowse) {
                Text("»_")
                    .font(.zenjiMono(size: 15, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.muted)
            }
            .accessibilityLabel("Åpne assistenten")
            // WP-14.3: same glyph, ≥44×44pt hit area.
            .zenjiTapTarget()

            TextField("Skriv eller spør …", text: $viewModel.utterance, axis: .vertical)
                .font(.zenjiMono(size: 15))
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .focused($focused)
                .submitLabel(.send)
                .disabled(viewModel.isThinking)
                .onSubmit(submit)

            trailing
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(ZenjiTokens.hairline).frame(height: 1)
        }
    }

    // MARK: - Trailing state (cursor · thinking · send)

    @ViewBuilder
    private var trailing: some View {
        if viewModel.isThinking {
            HStack(spacing: 8) {
                BlinkingCursor()
                Text("tenker …")
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.muted)
                Button("Avbryt") { viewModel.cancel() }
                    .font(.zenjiMono(size: 12))
                    .foregroundStyle(ZenjiTokens.muted)
                    .zenjiTapTarget()
            }
        } else if !trimmed.isEmpty {
            Button(action: submit) {
                Text("↵")
                    .font(.zenjiMono(size: 17, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.accent)
            }
            .accessibilityLabel("Send")
            .zenjiTapTarget()
        } else {
            // Idle: the blinking prompt cursor IS the whole affordance.
            BlinkingCursor()
        }
    }

    private func submit() {
        guard !trimmed.isEmpty, !viewModel.isThinking else { return }
        focused = false
        viewModel.run()
    }
}

/// The Tekst-TV block cursor. Blinks (the assistant's only motion besides the
/// clock) unless Reduce Motion is on, in which case it holds steady — same
/// contract the header clock follows (DESIGN.md "Bevegelse & lyd").
struct BlinkingCursor: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        Text("▌")
            .font(.zenjiMono(size: 15, weight: .semibold))
            .foregroundStyle(ZenjiTokens.accent)
            .opacity(dim ? 0.12 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                    dim = true
                }
            }
            .accessibilityHidden(true)
    }
}
