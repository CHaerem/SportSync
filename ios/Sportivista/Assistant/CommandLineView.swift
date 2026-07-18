//
//  CommandLineView.swift
//  Sportivista
//
//  WP-16.4 → WP-82 — THE KOMMANDOLINJE. A quiet write-/search-line pinned to the
//  bottom of the agenda (above the safe-area), the PRIMARY way into the
//  assistant — "assistenten ER grensesnittet", not a room behind a button.
//
//  WP-82 makes the line INTUITIVE via the three discoverability states
//  (DESIGN § Hjelperen), with NO permanent chrome:
//    • REST     — a CONCRETE example placeholder (not an abstract instruction).
//    • FOCUS    — a small, calm row of context-suggestion pills rises OVER the
//                 line; it disappears the moment focus is released.
//    • TYPING   — live grounding against the entity index: matches show as
//                 tappable rows while you type ("Bodø/Glimt · fotball") so you
//                 CHOOSE, don't spell. Selecting runs the grounded follow flow.
//  The field itself is a native text field: autocorrect/autocap OFF (proper
//  nouns), a clear button, the keyboard's own dictation mic left untouched, and
//  a sensible send/return. Typography is the WP-80 Dynamic Type API + semantic
//  colour tokens (the deprecated Tekst-TV `sportivistaMono` shim is gone here).
//
//  It carries no logic of its own: it binds the field to
//  AssistantViewModel.utterance, fires `run()` on submit (cancellable), reads
//  the discovery helpers off the view model, and leaves raising the result "ark"
//  to ContentView (which watches `presentToken`). While the model works it shows
//  a dimmed "tenker …" next to the blinking cursor — never a spinner — and an
//  Avbryt.
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
        VStack(alignment: .leading, spacing: 0) {
            // FOCUS / TYPING discovery rises over the line, and collapses the
            // instant focus is released — no permanent chrome.
            if focused {
                discoverySection
                    .transition(.opacity)
            }
            inputRow
        }
        // Liquid Glass (iOS 26): the platform's own control material replaces
        // the opaque bar + hairline. Glass belongs on the CONTROL layer only —
        // content (the agenda) never gets glassed. A rounded rect (not a
        // capsule) so the shape stays calm when the discovery section expands
        // the bar to two rows. System glass handles Reduce Transparency /
        // legibility fallbacks automatically.
        .glassEffect(.regular, in: .rect(cornerRadius: 26))
        .padding(.horizontal, 10)
        .padding(.bottom, 4)
        .animation(.easeOut(duration: 0.15), value: focused)
        .animation(.easeOut(duration: 0.15), value: trimmed.isEmpty)
    }

    // MARK: - The input line

    private var inputRow: some View {
        HStack(alignment: .center, spacing: 10) {
            // The sigil — a quiet, tappable "oppslag" into the flow.
            Button(action: onOpenBrowse) {
                Text("»_")
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .accessibilityLabel("Åpne assistenten")
            // WP-70: a stable handle for the XCUITest that opens the assistant ark
            // (reset flow) without typing.
            .accessibilityIdentifier("command.browse")
            // WP-14.3: same glyph, ≥44×44pt hit area.
            .sportivistaTapTarget()

            TextField(viewModel.restPlaceholder, text: $viewModel.utterance, axis: .vertical)
                .font(.sportivista(.subheadline))
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .focused($focused)
                .submitLabel(.send)
                // WP-82: proper nouns (Bodø/Glimt, Ruud) must not be
                // auto-capitalised or auto-corrected out from under the user; the
                // keyboard's own dictation mic is left in place (free, native).
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .disabled(viewModel.isThinking)
                .onSubmit(submit)
                // WP-70: stable handle for the follow-via-command-line flow.
                .accessibilityIdentifier("command.field")

            trailing
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Discovery (WP-82 — focus suggestions · typing grounding)

    /// While focused: grounding hits when the user is typing, else the calm
    /// context-suggestion row. An empty view (no hits for a short/question-only
    /// phrase) simply collapses.
    @ViewBuilder
    private var discoverySection: some View {
        let hits = viewModel.groundingHits(for: viewModel.utterance)
        Group {
            if !trimmed.isEmpty {
                if !hits.isEmpty { groundingHits(hits) }
            } else {
                focusSuggestions
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, SportivistaSpacing.s)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// FOCUS state: flat hairline pills in amber (never filled), each ≥44 pt via
    /// `SportivistaActionButtonStyle`. Horizontally scrollable so a narrow width never
    /// forces the body to scroll sideways.
    private var focusSuggestions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SportivistaSpacing.s) {
                // WP-99: a STANDING first pill that answers "what can this line
                // even do?" — the discoverability gap the owner hit. Unlike the
                // example prompts (which FILL the line), it routes straight to the
                // EXISTING help arm (WP-68 getHelp/AssistantHelp) and shows the
                // answer — so tapping it teaches, it doesn't leave homework.
                Button {
                    focused = false
                    viewModel.askForHelp()
                } label: {
                    Text(AssistantViewModel.helpPrompt)
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.accent)
                }
                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent))
                .accessibilityIdentifier("assistant.help")

                ForEach(Array(viewModel.focusSuggestions.enumerated()), id: \.offset) { index, text in
                    Button {
                        viewModel.fillSuggestion(text)
                    } label: {
                        Text(text)
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.accent)
                    }
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent))
                    .accessibilityIdentifier("assistant.suggestion.\(index)")
                }
            }
            .padding(.bottom, SportivistaSpacing.s)
        }
        .accessibilityIdentifier("assistant.suggestions")
    }

    /// TYPING state: live grounding rows — "velg, ikke stav". Selecting a hit
    /// drops it into the grounded diff/confirm flow (`proposeFollow`), the SAME
    /// path the detail sheet's «Følg X» uses.
    private func groundingHits(_ hits: [Entity]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(hits, id: \.id) { entity in
                Button {
                    select(entity)
                } label: {
                    HStack(spacing: SportivistaSpacing.s) {
                        Text(entity.name)
                            .font(.sportivista(.subheadline))
                            .foregroundStyle(SportivistaTokens.label)
                        Text("·")
                            .font(.sportivista(.subheadline))
                            .foregroundStyle(SportivistaTokens.secondaryLabel.opacity(0.6))
                        Text(SportVocabulary.display(for: entity.sport))
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.secondaryLabel)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("grounding.\(entity.id)")
            }
        }
        .padding(.bottom, SportivistaSpacing.xs)
    }

    // MARK: - Trailing state (cursor · thinking · clear + send)

    @ViewBuilder
    private var trailing: some View {
        if viewModel.isThinking {
            HStack(spacing: 8) {
                BlinkingCursor()
                Text("tenker …")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                Button("Avbryt") { viewModel.cancel() }
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .sportivistaTapTarget()
            }
        } else if !trimmed.isEmpty {
            HStack(spacing: 4) {
                // Native-feel clear button (the plain axis text field has none of
                // UIKit's `.clearButtonMode`). Muted, so send stays the single
                // amber element in the row (DESIGN: never two amber together).
                Button(action: clear) {
                    Text("✕")
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .accessibilityLabel("Tøm")
                .accessibilityIdentifier("command.clear")
                .sportivistaTapTarget()

                Button(action: submit) {
                    Text("↵")
                        .font(.sportivista(.body, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.accent)
                }
                .accessibilityLabel("Send")
                // WP-70: a distinct id — the `submitLabel(.send)` keyboard key ALSO
                // carries the "Send" label, so the XCUITest needs an unambiguous handle.
                .accessibilityIdentifier("command.send")
                .sportivistaTapTarget()
            }
        } else if focused {
            // WP-99: focused but EMPTY — the send button lives in this trailing
            // slot when there's text, so the empty-focused state was the one hole
            // with no way to put the keyboard away (the owner-hit bug). Fill it
            // with a quiet, HIG-native keyboard-dismiss glyph (never amber — send
            // is the row's only amber). ≥44pt via the shared tap target.
            Button { focused = false } label: {
                Image(systemName: "keyboard.chevron.compact.down")
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .accessibilityLabel("Lukk tastaturet")
            .accessibilityIdentifier("command.dismissKeyboard")
            .sportivistaTapTarget()
        } else {
            // Idle (unfocused): the blinking prompt cursor IS the whole affordance.
            BlinkingCursor()
        }
    }

    private func submit() {
        guard !trimmed.isEmpty, !viewModel.isThinking else { return }
        focused = false
        viewModel.run()
    }

    /// Clear the line but keep focus — the user is still composing.
    private func clear() {
        viewModel.utterance = ""
        focused = true
    }

    /// Select a live grounding hit ("velg, ikke stav") — hand it to the grounded
    /// follow flow (the panel rises via `presentToken`, exactly like a typed
    /// "Følg X"); nothing is applied until the user taps Bekreft.
    private func select(_ entity: Entity) {
        focused = false
        viewModel.proposeFollow(entity)
    }
}

/// The Tekst-TV block cursor. Blinks (the assistant's only motion besides the
/// clock) unless Reduce Motion is on, in which case it holds steady — same
/// contract the header clock follows (DESIGN "Bevegelse & haptikk").
struct BlinkingCursor: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        Text("▌")
            .font(.sportivista(.subheadline, weight: .semibold))
            .foregroundStyle(SportivistaTokens.accent)
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
