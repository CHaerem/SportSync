//
//  AssistantSheetView.swift
//  Sportivista
//
//  WP-104 → WP-143 → WP-144 — THE SAMTALEARK. The Claude Design-handoff ("Intuitivt
//  for alle") replaced the always-present inline command line; the entry point is now
//  the floating bottom `AssistantButton` (ContentView `safeAreaInset(.bottom)`) that
//  opens THIS native sheet (WP-143 tried a header toolbar button, WP-144 moved it to
//  the reachable bottom as an honest, compact button). The sheet is the whole
//  conversation surface: writing, the tre trykkbare eksempelrader, the thinking
//  marker, and — landing in the SAME ark — the result thread (your message as a
//  bubble + the reused diff/answer/command cards). Full state spec in
//  design/specs/assistent-nyheter-v0.md § Samtalearket.
//
//  The five states from the spec, all rendered here from the view model:
//    1. Opened   — one hjelpesetning + three tappable example rows + the field.
//    2. Typing   — the field grows vertically to ~4 lines (Meldinger-mønsteret);
//                  send is the amber primærknapp; retur gives a linjeskift.
//    3. Dictation— native keyboard dictation (v1: we focus the field so the
//                  keyboard — with its own mic — is one tap away; we do NOT build
//                  our own speech recognition, per the WP-104 brief).
//    4. Answer in thread — your message as a bubble, the result cards under it
//                  (AssistantResultThread), a «Følg opp …» field one tap away.
//    5. Thinking — a dimmed "tenker …" + Avbryt, never a spinner (DESIGN).
//
//  Presentation only. All logic is AssistantViewModel; ContentView owns raising
//  the sheet (detents + grabber) and recompiling the agenda on confirm.
//

import SwiftUI

struct AssistantSheetView: View {
    /// `@Bindable` so the field can bind to `viewModel.utterance` (the view model
    /// is `@Observable`).
    @Bindable var viewModel: AssistantViewModel
    /// Dismisses the sheet (ContentView flips the presentation binding). Called
    /// on Lukk and on the "Bekreft ⇒ arket lukkes" moment (dismissIfDone).
    var dismiss: () -> Void
    /// A mic-tap on the capsule opens the sheet with the field already focused,
    /// so the keyboard (and its native dictation mic) is up immediately.
    var startFocused: Bool = false

    @FocusState private var fieldFocused: Bool

    private var trimmed: String {
        viewModel.utterance.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    /// Something worth showing in the thread (a diff, answer, receipt, …).
    private var hasResult: Bool { viewModel.hasPresentableResult }

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            Rectangle().fill(SportivistaTokens.separator).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // State 1 — the opened state shows only while the thread is
                    // empty and nothing is being interpreted.
                    if !hasResult && !viewModel.isThinking {
                        openedState
                    }
                    // State 4/5 — your message stays up as a bubble while the
                    // model thinks and once the result lands.
                    if let message = viewModel.lastSubmittedUtterance, hasResult || viewModel.isThinking {
                        userBubble(message)
                    }
                    if hasResult {
                        AssistantResultThread(viewModel: viewModel, dismissIfDone: dismissIfDone)
                    }
                    if viewModel.isThinking { thinkingRow }
                }
                .padding(20)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            inputRow
        }
        .background(SportivistaTokens.cell)
        .foregroundStyle(SportivistaTokens.label)
        .task { viewModel.refreshAvailability() }
        // One light success haptic on Bekreft (a mutation/command confirmed),
        // DESIGN § Bevegelse & haptikk — never on scroll or every tap.
        .sensoryFeedback(.success, trigger: viewModel.confirmHaptic)
        .onAppear { if startFocused { fieldFocused = true } }
        // A presentation filter applied from within the sheet raises NO ark
        // (DESIGN § present) — the filtered board IS the feedback, so close the
        // sheet so it's visible underneath.
        .onChange(of: viewModel.presentedFilter) { _, filter in
            if filter != nil { dismiss() }
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("ASSISTENT")
                .font(.sportivista(.subheadline, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .tracking(2)
            Spacer()
            Button("Lukk") { dismiss() }
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .accessibilityIdentifier("assistant.close")
                .sportivistaTapTarget()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - State 1 — opened (intro + example rows)

    private var openedState: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let message = viewModel.availability.message {
                // Honesty: Apple Intelligence off ⇒ say it, before the examples.
                Text(message)
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.8))
            }
            Text(AssistantViewModel.sheetIntro)
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("assistant.intro")

            Text("PRØV")
                .font(.sportivista(.caption, weight: .bold))
                .foregroundStyle(SportivistaTokens.label.opacity(0.5))
                .tracking(1.5)
            VStack(spacing: 0) {
                ForEach(AssistantViewModel.exampleRows) { row in
                    exampleRow(row)
                    if row.id != AssistantViewModel.exampleRows.last?.id {
                        Rectangle().fill(SportivistaTokens.separator).frame(height: 1)
                    }
                }
            }
            .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.15), lineWidth: 1))
        }
    }

    /// One tappable example row (ikke chips) — label + trailing «›». ≥44pt.
    private func exampleRow(_ row: AssistantViewModel.ExampleRow) -> some View {
        Button {
            tapExample(row)
        } label: {
            HStack(spacing: 8) {
                Text(row.label)
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.label)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Text("›")
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("assistant.example.\(row.id)")
    }

    private func tapExample(_ row: AssistantViewModel.ExampleRow) {
        switch row.kind {
        case .prefillFollow:
            // WP-104: pre-fill «følg » and focus the field. The user still
            // chooses the entity and sends it — a discovery affordance, never an
            // applied change.
            // TODO(WP-105): route this row to the "Legg til"-søk (entities.json)
            //   instead of pre-filling the field, once that search view lands.
            viewModel.utterance = "følg "
            fieldFocused = true
        case .run:
            // «Hva går i kveld?» / «Endre varsler eller tema» run as ordinary
            // prompts through the existing answer / command arms.
            fieldFocused = false
            viewModel.runExample(row)
        }
    }

    // MARK: - State 4 — your message bubble

    private func userBubble(_ text: String) -> some View {
        HStack {
            Spacer(minLength: 40)
            Text(text)
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.label)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(SportivistaTokens.accent.opacity(0.12))
                .overlay(Rectangle().stroke(SportivistaTokens.accent.opacity(0.3), lineWidth: 1))
                .accessibilityIdentifier("assistant.userMessage")
        }
    }

    // MARK: - State 5 — thinking

    private var thinkingRow: some View {
        HStack(spacing: 8) {
            BlinkingCursor()
            Text("tenker …")
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .accessibilityIdentifier("assistant.thinking")
            Spacer(minLength: 8)
            Button("Avbryt") { viewModel.cancel() }
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .accessibilityIdentifier("assistant.cancel")
                .sportivistaTapTarget()
        }
    }

    // MARK: - State 2 — the field (grows to ~4 lines; retur = linjeskift)

    private var inputRow: some View {
        VStack(spacing: 0) {
            Rectangle().fill(SportivistaTokens.separator).frame(height: 1)
            HStack(alignment: .bottom, spacing: 10) {
                TextField(placeholder, text: $viewModel.utterance, axis: .vertical)
                    .font(.sportivista(.subheadline))
                    .textFieldStyle(.plain)
                    .lineLimit(1...4)
                    .focused($fieldFocused)
                    // Proper nouns (Bodø/Glimt, Ruud) must not be auto-capitalised
                    // or auto-corrected out from under the user; the keyboard's own
                    // dictation mic is left in place (free, native, v1 diktering).
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .disabled(viewModel.isThinking)
                    .accessibilityIdentifier("assistant.field")
                trailing
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
    }

    private var placeholder: String {
        hasResult ? AssistantViewModel.followUpPlaceholder : AssistantViewModel.fieldPlaceholder
    }

    @ViewBuilder
    private var trailing: some View {
        if !trimmed.isEmpty {
            // Send = the amber primærknapp (retur gives a linjeskift instead).
            Button(action: submit) {
                Text("Send")
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.accent)
            }
            .accessibilityLabel("Send")
            .accessibilityIdentifier("assistant.send")
            .sportivistaTapTarget()
            .disabled(viewModel.isThinking)
        } else {
            // Empty field: a quiet mic that focuses the field (bringing up the
            // keyboard, whose native dictation mic is the v1 diktering). Never
            // amber — send is the row's only amber (DESIGN: two amber forbidden).
            Button {
                fieldFocused = true
            } label: {
                Image(systemName: "mic")
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .accessibilityLabel("Diktér")
            .accessibilityIdentifier("assistant.mic")
            .sportivistaTapTarget()
        }
    }

    // MARK: - Actions

    private func submit() {
        guard !trimmed.isEmpty, !viewModel.isThinking else { return }
        fieldFocused = false
        viewModel.run()
    }

    /// The "Bekreft → arket lukkes → agendaen re-kompileres" moment: close the
    /// sheet once the user has cleared everything worth showing.
    private func dismissIfDone() {
        if !viewModel.hasPresentableResult { dismiss() }
    }
}

/// The block cursor. Blinks (the assistant's only motion) unless Reduce
/// Motion is on, in which case it holds steady (DESIGN "Bevegelse & haptikk").
/// Re-homed here from CommandLineView (WP-104) — shared by the sheet's thinking
/// state and the onboarding conversation step.
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
