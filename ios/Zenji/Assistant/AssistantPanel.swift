//
//  AssistantPanel.swift
//  Zenji
//
//  WP-16.4 → WP-82 → WP-83 — the assistant's RESULT surface. WP-83 slimmed it to
//  conversation/result ONLY: the answer block, the proposal DIFF (Bekreft/Avvis
//  per mutation, «mente du …?» suggestions), the per-clause REGNSKAP, the
//  command confirm/receipt, the «ikke funnet» rejections and the always-explain
//  «ingen endring» account. The permanent sections it used to carry — Hva jeg
//  følger, Hva jeg vet om deg, Det jeg ikke forsto, Del profil, the tema/varsel
//  quick-chips, Nullstill, Sett opp på nytt, the version line and the DEBUG eval
//  entry — were RE-HOMED to the "Deg" screen (DegView, reached from the agenda's
//  gearshape). This panel is now presented as a native `.sheet` (detents) that
//  ContentView raises over the agenda; the command line stays put beneath it.
//
//  Presentation only. All logic is AssistantViewModel + the pure pipeline it
//  calls; this file lays the state out.
//

import SwiftUI

struct AssistantPanel: View {
    var viewModel: AssistantViewModel
    /// Dismisses the sheet (ContentView flips the presentation binding).
    var dismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            Rectangle().fill(ZenjiTokens.separator).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let message = viewModel.availability.message { unavailableBanner(message) }
                    if let error = viewModel.errorMessage { errorRow(error) }
                    if let answer = viewModel.answer { answerSection(answer) }
                    if let tally = viewModel.mutationTally { tallySection(tally) }
                    if let pendingCommand = viewModel.pendingCommand { commandConfirmSection(pendingCommand) }
                    if let receipt = viewModel.commandReceipt { commandReceiptSection(receipt) }
                    if !viewModel.pending.isEmpty { proposalsSection }
                    if !viewModel.rejected.isEmpty { rejectionsSection }
                    if let explanation = viewModel.explanation { explanationSection(explanation) }
                }
                .padding(20)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .background(ZenjiTokens.cell)
        .foregroundStyle(ZenjiTokens.label)
        .task { viewModel.refreshAvailability() }
        // WP-82 — one light success haptic on Bekreft (a mutation/command
        // confirmed), DESIGN-BASELINE § Bevegelse & haptikk. The trigger only
        // bumps on an explicit confirm, never on scroll or every tap.
        .sensoryFeedback(.success, trigger: viewModel.confirmHaptic)
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("ASSISTENT")
                .font(.zenji(.subheadline, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .tracking(2)
            Spacer()
            Button("Lukk") { dismiss() }
                .font(.zenji(.subheadline))
                .foregroundStyle(ZenjiTokens.secondaryLabel)
                .zenjiTapTarget()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - Availability / error

    private func unavailableBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("APPLE INTELLIGENCE")
                .font(.zenji(.caption2, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent.opacity(0.8))
                .tracking(1.5)
            Text(message)
                .font(.zenji(.footnote))
                .foregroundStyle(ZenjiTokens.label.opacity(0.8))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.accent.opacity(0.10))
        .overlay(Rectangle().stroke(ZenjiTokens.accent.opacity(0.35), lineWidth: 1))
    }

    private func errorRow(_ error: String) -> some View {
        Text(error)
            .font(.zenji(.footnote))
            .foregroundStyle(ZenjiTokens.destructive)
    }

    // MARK: - Answer (WP-16.4)

    /// A question's calm reply: the prose, then the referenced rows as quiet
    /// when · what · where lines — the same shape an agenda row answers.
    private func answerSection(_ answer: AssistantAnswerResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("SVAR")
            Text(answer.text)
                .font(.zenji(.subheadline))
                .foregroundStyle(ZenjiTokens.label)
                .fixedSize(horizontal: false, vertical: true)
            if !answer.rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(answer.rows) { row in answerRow(row) }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(ZenjiTokens.label.opacity(0.15), lineWidth: 1))
    }

    private func answerRow(_ row: AnswerRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(row.dayLabel)
                    .font(.zenji(.caption2, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
                    .tracking(1)
                Text(row.timeLabel)
                    .font(.zenjiTabular(.footnote, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.label)
            }
            .frame(minWidth: 72, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.zenji(.subheadline))
                    .foregroundStyle(ZenjiTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                Text(row.channelLabel)
                    .font(.zenji(.caption))
                    .foregroundStyle(row.channelLabel == "–" ? ZenjiTokens.secondaryLabel.opacity(0.5) : ZenjiTokens.secondaryLabel)
            }
        }
    }

    // MARK: - Per-clause accounting (WP-65 — the bulk-utterance regnskap)

    /// A calm one-line account of a bulk utterance: what landed and what wasn't
    /// found. Sits above the diff so the user sees, at a glance, that every
    /// clause was handled — the "aldri stille ledd-dropp" guarantee made visible.
    /// The detail (Bekreft/Avvis, «mente du …?») still lives in the sections below.
    private func tallySection(_ tally: MutationTally) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("REGNSKAP")
            Text(tally.summary)
                .font(.zenji(.footnote))
                .foregroundStyle(ZenjiTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(ZenjiTokens.label.opacity(0.15), lineWidth: 1))
    }

    // MARK: - Command arm (WP-66)

    /// The rolig confirm ark for a DESTRUCTIVE command (reset) — reuses the WP-32
    /// confirmation semantics: the exact consequence in one sentence, then
    /// Bekreft/Avbryt at comfortable size. Only `.resetProfile` ever gets here.
    private func commandConfirmSection(_ command: AssistantCommand) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("BEKREFT")
            Text(command.confirmationPrompt ?? "Vil du gjøre dette?")
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button("Bekreft") { viewModel.confirmCommand(); dismissIfDone() }
                    .font(.zenji(.footnote, weight: .bold))
                    .foregroundStyle(ZenjiTokens.destructive)
                    .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.destructive))
                    .accessibilityIdentifier("command.confirm")
                Button("Avbryt") { viewModel.cancelCommand(); dismissIfDone() }
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                    .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.label))
                    .accessibilityIdentifier("command.cancel")
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.destructive.opacity(0.06))
        .overlay(Rectangle().stroke(ZenjiTokens.destructive.opacity(0.3), lineWidth: 1))
    }

    /// A calm one-line receipt after a harmless command executed ("Tema: mørkt.",
    /// "Åpner Brann–X.") — the "rolig kvittering" the brief asks for.
    private func commandReceiptSection(_ receipt: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("UTFØRT")
            Text(receipt)
                .font(.zenji(.footnote))
                .foregroundStyle(ZenjiTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.accent.opacity(0.08))
        .overlay(Rectangle().stroke(ZenjiTokens.accent.opacity(0.3), lineWidth: 1))
    }

    // MARK: - Proposals (the DIFF)

    private var proposalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("FORESLÅTTE ENDRINGER")
                Spacer()
                if viewModel.pending.count > 1 {
                    // WP-14.3: an action, not chrome — real button comfort.
                    Button("Bekreft alle") { viewModel.confirmAll(); dismissIfDone() }
                        .font(.zenji(.caption, weight: .bold))
                        .foregroundStyle(ZenjiTokens.live)
                        .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.live))
                }
            }
            ForEach(viewModel.pending) { mutation in proposalRow(mutation) }
        }
    }

    private func proposalRow(_ mutation: GroundedMutation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(sign(for: mutation.kind))
                    .font(.zenji(.callout, weight: .bold))
                    .foregroundStyle(color(for: mutation.kind))
                VStack(alignment: .leading, spacing: 2) {
                    Text(mutation.entity.name)
                        .font(.zenji(.subheadline, weight: .bold))
                    Text(subtitle(for: mutation))
                        .font(.zenji(.caption))
                        .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                }
            }
            Text(mutation.reason)
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.label.opacity(0.75))
            // WP-14.3: Bekreft/Avvis ARE the action, never glyph-small — a
            // real, comfortable button (min 44pt tall, roomy padding, a
            // hairline box in the action's own colour, never a filled pill).
            HStack(spacing: 10) {
                Button("Bekreft") { viewModel.confirm(mutation); dismissIfDone() }
                    .font(.zenji(.footnote, weight: .bold))
                    .foregroundStyle(ZenjiTokens.live)
                    .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.live))
                    // WP-70: stable handle for the follow-via-command-line flow's
                    // Bekreft (the test uses .firstMatch — a single-mutation diff).
                    .accessibilityIdentifier("assistant.confirm")
                Button("Avvis") { viewModel.reject(mutation); dismissIfDone() }
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                    .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.label))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color(for: mutation.kind).opacity(0.08))
        .overlay(Rectangle().stroke(color(for: mutation.kind).opacity(0.4), lineWidth: 1))
    }

    private func subtitle(for mutation: GroundedMutation) -> String {
        var parts = [SportVocabulary.display(for: mutation.entity.sport)]
        if let scope = mutation.scope, !scope.isEmpty { parts.append(scope) }
        if mutation.kind != .remove, !mutation.lens.isDefault { parts.append(mutation.lens.label) }
        if mutation.kind != .remove { parts.append("vekt \(weightLabel(mutation.weight))") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Rejections

    private var rejectionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("IKKE FUNNET")
            ForEach(viewModel.rejected) { rejection in
                VStack(alignment: .leading, spacing: 6) {
                    Text(rejection.explanation)
                        .font(.zenji(.footnote))
                        .foregroundStyle(ZenjiTokens.label.opacity(0.85))
                    if !rejection.suggestions.isEmpty {
                        Text("Trykk for å foreslå endringen:")
                            .font(.zenji(.caption2))
                            .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(rejection.suggestions, id: \.id) { suggestion in
                                // WP-14.3: a «mente du»-forslag IS the action
                                // (it re-grounds the whole utterance and re-
                                // proposes a diff) — comfortable button, not
                                // a glyph-small link.
                                Button {
                                    viewModel.choose(suggestion, for: rejection)
                                } label: {
                                    Text("› \(suggestion.name)")
                                        .font(.zenji(.footnote, weight: .bold))
                                        .foregroundStyle(ZenjiTokens.accent)
                                }
                                .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.accent, fullWidth: true))
                            }
                        }
                    }
                    Button("OK") { viewModel.dismissRejection(rejection); dismissIfDone() }
                        .font(.zenji(.caption))
                        .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                        .zenjiTapTarget()
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(ZenjiTokens.destructive.opacity(0.06))
                .overlay(Rectangle().stroke(ZenjiTokens.destructive.opacity(0.3), lineWidth: 1))
            }
        }
    }

    // MARK: - Always-explain

    private func explanationSection(_ explanation: AssistantExplanation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("INGEN ENDRING")
            Text(explanation.understood)
                .font(.zenji(.footnote))
                .foregroundStyle(ZenjiTokens.label.opacity(0.85))
            Text(explanation.reason)
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.label.opacity(0.65))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.label.opacity(0.05))
        .overlay(Rectangle().stroke(ZenjiTokens.label.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Small helpers

    /// Dismisses the sheet once the user has cleared everything worth showing —
    /// the "Bekreft → arket lukkes → agendaen re-kompileres" moment.
    private func dismissIfDone() {
        if !viewModel.hasPresentableResult { dismiss() }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.zenji(.caption, weight: .bold))
            .foregroundStyle(ZenjiTokens.label.opacity(0.5))
            .tracking(1.5)
    }

    private func sign(for kind: MutationKind) -> String {
        switch kind {
        case .add: return "+"
        case .update: return "±"
        case .remove: return "−"
        }
    }

    private func color(for kind: MutationKind) -> Color {
        switch kind {
        case .add: return ZenjiTokens.live
        case .update: return ZenjiTokens.accent
        case .remove: return ZenjiTokens.destructive
        }
    }

    private func weightLabel(_ weight: Double) -> String {
        String(format: "%.1f", weight)
    }
}

/// One row in "Det jeg ikke forsto" (WP-16.3): the utterance, what went wrong,
/// an optional note ("hva jeg egentlig mente"), and delete. A resolved entry
/// (a later "mente du" pick got confirmed) shows a quiet "LØST" tag.
struct MisunderstoodEntryRow: View {
    let entry: MisunderstoodEntry
    let onSaveNote: (String?) -> Void
    let onDelete: () -> Void

    @State private var isEditingNote = false
    @State private var noteDraft: String

    init(entry: MisunderstoodEntry, onSaveNote: @escaping (String?) -> Void, onDelete: @escaping () -> Void) {
        self.entry = entry
        self.onSaveNote = onSaveNote
        self.onDelete = onDelete
        _noteDraft = State(initialValue: entry.note ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("«\(entry.utterance)»")
                    .font(.zenji(.footnote, weight: .bold))
                Spacer()
                if entry.isResolved {
                    Text("LØST")
                        .font(.zenji(.caption2, weight: .bold))
                        .foregroundStyle(ZenjiTokens.live)
                }
            }
            Text(entry.outcome.label)
                .font(.zenji(.caption2))
                .foregroundStyle(ZenjiTokens.label.opacity(0.6))
            Text(entry.explanation.reason)
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.label.opacity(0.75))

            if isEditingNote {
                TextField("Hva mente du egentlig?", text: $noteDraft, axis: .vertical)
                    .font(.zenji(.caption))
                    .textFieldStyle(.plain)
                    .lineLimit(1...3)
                    .padding(8)
                    .background(ZenjiTokens.label.opacity(0.06))
                    .overlay(Rectangle().stroke(ZenjiTokens.label.opacity(0.2), lineWidth: 1))
                HStack(spacing: 14) {
                    Button("Lagre notat") {
                        onSaveNote(noteDraft)
                        isEditingNote = false
                    }
                    .font(.zenji(.caption2, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent)
                    .zenjiTapTarget()
                    Button("Avbryt") {
                        noteDraft = entry.note ?? ""
                        isEditingNote = false
                    }
                    .font(.zenji(.caption2))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                    .zenjiTapTarget()
                }
            } else if let note = entry.note, !note.isEmpty {
                Text("Notat: \(note)")
                    .font(.zenji(.caption))
                    .foregroundStyle(ZenjiTokens.accent.opacity(0.85))
            }

            HStack(spacing: 16) {
                if !isEditingNote {
                    Button(entry.note?.isEmpty == false ? "Endre notat" : "Legg til notat") {
                        isEditingNote = true
                    }
                    .font(.zenji(.caption2))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                    .zenjiTapTarget()
                }
                Button("Slett") { onDelete() }
                    .font(.zenji(.caption2))
                    .foregroundStyle(ZenjiTokens.destructive.opacity(0.7))
                    .zenjiTapTarget()
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(ZenjiTokens.label.opacity(0.15), lineWidth: 1))
    }
}
