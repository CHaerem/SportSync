//
//  AssistantResultThread.swift
//  Sportivista
//
//  WP-104 — the assistant's RESULT sections, extracted from the old
//  AssistantPanel so they can be reused verbatim inside the conversation sheet
//  (AssistantSheetView) — "svaret lander i SAMME ark … gjenbruk diff-/answer-
//  armene" (spec § Samtalearket, tilstand 4). Nothing about the blocks changed
//  from WP-83: the answer, the proposal DIFF (Bekreft/Avvis per mutation, «mente
//  du …?» suggestions), the per-clause REGNSKAP, the command confirm/receipt, the
//  «ikke funnet» rejections and the always-explain «ingen endring» account.
//
//  Presentation only. All logic is AssistantViewModel + the pure pipeline it
//  calls; this file lays the state out. `dismissIfDone` is the "Bekreft ⇒ arket
//  lukkes ⇒ agendaen re-kompileres" moment — the host closes the sheet once
//  there's nothing left worth showing.
//

import SwiftUI

struct AssistantResultThread: View {
    var viewModel: AssistantViewModel
    /// Called after a confirm/reject/dismiss so the host can close the sheet
    /// once the thread is empty (the "arket lukkes" moment).
    var dismissIfDone: () -> Void

    var body: some View {
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
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Availability / error

    private func unavailableBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("APPLE INTELLIGENCE")
                .font(.sportivista(.caption2, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent.opacity(0.8))
                .tracking(1.5)
            Text(message)
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label.opacity(0.8))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.accent.opacity(0.10))
        .overlay(Rectangle().stroke(SportivistaTokens.accent.opacity(0.35), lineWidth: 1))
    }

    private func errorRow(_ error: String) -> some View {
        Text(error)
            .font(.sportivista(.footnote))
            .foregroundStyle(SportivistaTokens.destructive)
    }

    // MARK: - Answer (WP-16.4)

    /// A question's calm reply: the prose, then the referenced rows as quiet
    /// when · what · where lines — the same shape an agenda row answers.
    private func answerSection(_ answer: AssistantAnswerResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("SVAR")
            Text(answer.text)
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.label)
                .fixedSize(horizontal: false, vertical: true)
            if !answer.rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(answer.rows) { row in answerRow(row) }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.15), lineWidth: 1))
    }

    private func answerRow(_ row: AnswerRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(row.dayLabel)
                    .font(.sportivista(.caption2, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .tracking(1)
                Text(row.timeLabel)
                    .font(.sportivistaTabular(.footnote, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.label)
            }
            .frame(minWidth: 72, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                Text(row.channelLabel)
                    .font(.sportivista(.caption))
                    .foregroundStyle(row.channelLabel == "–" ? SportivistaTokens.secondaryLabel.opacity(0.5) : SportivistaTokens.secondaryLabel)
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
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.15), lineWidth: 1))
    }

    // MARK: - Command arm (WP-66)

    /// The rolig confirm ark for a DESTRUCTIVE command (reset) — reuses the WP-32
    /// confirmation semantics: the exact consequence in one sentence, then
    /// Bekreft/Avbryt at comfortable size. Only `.resetProfile` ever gets here.
    private func commandConfirmSection(_ command: AssistantCommand) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("BEKREFT")
            Text(command.confirmationPrompt ?? "Vil du gjøre dette?")
                .font(.sportivista(.caption))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button("Bekreft") { viewModel.confirmCommand(); dismissIfDone() }
                    .font(.sportivista(.footnote, weight: .bold))
                    .foregroundStyle(SportivistaTokens.destructive)
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.destructive))
                    .accessibilityIdentifier("command.confirm")
                Button("Avbryt") { viewModel.cancelCommand(); dismissIfDone() }
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.label))
                    .accessibilityIdentifier("command.cancel")
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.destructive.opacity(0.06))
        .overlay(Rectangle().stroke(SportivistaTokens.destructive.opacity(0.3), lineWidth: 1))
    }

    /// A calm one-line receipt after a harmless command executed ("Tema: mørkt.",
    /// "Åpner Brann–X.") — the "rolig kvittering" the brief asks for.
    private func commandReceiptSection(_ receipt: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("UTFØRT")
            Text(receipt)
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.accent.opacity(0.08))
        .overlay(Rectangle().stroke(SportivistaTokens.accent.opacity(0.3), lineWidth: 1))
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
                        .font(.sportivista(.caption, weight: .bold))
                        .foregroundStyle(SportivistaTokens.live)
                        .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.live))
                }
            }
            ForEach(viewModel.pending) { mutation in proposalRow(mutation) }
        }
    }

    private func proposalRow(_ mutation: GroundedMutation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(sign(for: mutation.kind))
                    .font(.sportivista(.callout, weight: .bold))
                    .foregroundStyle(color(for: mutation.kind))
                VStack(alignment: .leading, spacing: 2) {
                    Text(mutation.entity.name)
                        .font(.sportivista(.subheadline, weight: .bold))
                    Text(subtitle(for: mutation))
                        .font(.sportivista(.caption))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                }
            }
            Text(mutation.reason)
                .font(.sportivista(.caption))
                .foregroundStyle(SportivistaTokens.label.opacity(0.75))
            // WP-14.3: Bekreft/Avvis ARE the action, never glyph-small — a
            // real, comfortable button (min 44pt tall, roomy padding, a
            // hairline box in the action's own colour, never a filled pill).
            HStack(spacing: 10) {
                Button("Bekreft") { viewModel.confirm(mutation); dismissIfDone() }
                    .font(.sportivista(.footnote, weight: .bold))
                    .foregroundStyle(SportivistaTokens.live)
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.live))
                    // WP-70: stable handle for the follow-via-command-line flow's
                    // Bekreft (the test uses .firstMatch — a single-mutation diff).
                    .accessibilityIdentifier("assistant.confirm")
                Button("Avvis") { viewModel.reject(mutation); dismissIfDone() }
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.label))
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
        // WP-147: the internal relevance `weight` is engine jargon, not user copy —
        // "vekt 0.8" leaked into the diff subtitle while the onboarding diff already
        // omitted it (inconsistent). Dropped from the user-facing text; the value
        // still drives ranking, it's just no longer shown.
        return parts.joined(separator: " · ")
    }

    // MARK: - Rejections

    private var rejectionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("IKKE FUNNET")
            ForEach(viewModel.rejected) { rejection in
                VStack(alignment: .leading, spacing: 6) {
                    Text(rejection.explanation)
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    if !rejection.suggestions.isEmpty {
                        Text("Trykk for å foreslå endringen:")
                            .font(.sportivista(.caption2))
                            .foregroundStyle(SportivistaTokens.label.opacity(0.5))
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
                                        .font(.sportivista(.footnote, weight: .bold))
                                        .foregroundStyle(SportivistaTokens.accent)
                                }
                                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
                            }
                        }
                    }
                    Button("OK") { viewModel.dismissRejection(rejection); dismissIfDone() }
                        .font(.sportivista(.caption))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                        .sportivistaTapTarget()
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SportivistaTokens.destructive.opacity(0.06))
                .overlay(Rectangle().stroke(SportivistaTokens.destructive.opacity(0.3), lineWidth: 1))
            }
        }
    }

    // MARK: - Always-explain

    private func explanationSection(_ explanation: AssistantExplanation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("INGEN ENDRING")
            Text(explanation.understood)
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
            Text(explanation.reason)
                .font(.sportivista(.caption))
                .foregroundStyle(SportivistaTokens.label.opacity(0.65))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.05))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Small helpers

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.caption, weight: .bold))
            .foregroundStyle(SportivistaTokens.label.opacity(0.5))
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
        case .add: return SportivistaTokens.live
        case .update: return SportivistaTokens.accent
        case .remove: return SportivistaTokens.destructive
        }
    }
}

/// One row in "Det jeg ikke forsto" (WP-16.3): the utterance, what went wrong,
/// an optional note ("hva jeg egentlig mente"), and delete. A resolved entry
/// (a later "mente du" pick got confirmed) shows a quiet "LØST" tag. Re-homed
/// here from AssistantPanel (WP-104) — it is used by the "Deg" screen (DegView).
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
                    .font(.sportivista(.footnote, weight: .bold))
                Spacer()
                if entry.isResolved {
                    Text("LØST")
                        .font(.sportivista(.caption2, weight: .bold))
                        .foregroundStyle(SportivistaTokens.live)
                }
            }
            Text(entry.outcome.label)
                .font(.sportivista(.caption2))
                .foregroundStyle(SportivistaTokens.label.opacity(0.6))
            Text(entry.explanation.reason)
                .font(.sportivista(.caption))
                .foregroundStyle(SportivistaTokens.label.opacity(0.75))

            if isEditingNote {
                TextField("Hva mente du egentlig?", text: $noteDraft, axis: .vertical)
                    .font(.sportivista(.caption))
                    .textFieldStyle(.plain)
                    .lineLimit(1...3)
                    .padding(8)
                    .background(SportivistaTokens.label.opacity(0.06))
                    .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.2), lineWidth: 1))
                HStack(spacing: 14) {
                    Button("Lagre notat") {
                        onSaveNote(noteDraft)
                        isEditingNote = false
                    }
                    .font(.sportivista(.caption2, weight: .bold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .sportivistaTapTarget()
                    Button("Avbryt") {
                        noteDraft = entry.note ?? ""
                        isEditingNote = false
                    }
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.5))
                    .sportivistaTapTarget()
                }
            } else if let note = entry.note, !note.isEmpty {
                Text("Notat: \(note)")
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.accent.opacity(0.85))
            }

            HStack(spacing: 16) {
                if !isEditingNote {
                    Button(entry.note?.isEmpty == false ? "Endre notat" : "Legg til notat") {
                        isEditingNote = true
                    }
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                    .sportivistaTapTarget()
                }
                Button("Slett") { onDelete() }
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.destructive.opacity(0.7))
                    .sportivistaTapTarget()
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.15), lineWidth: 1))
    }
}
