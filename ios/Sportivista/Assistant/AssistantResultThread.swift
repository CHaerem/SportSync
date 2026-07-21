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
            sectionTitle("APPLE INTELLIGENCE")
            Text(message)
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label.opacity(0.8))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Rounded amber-tint notice (was a sharp amber-stroke box) — the tint
        // still marks it as an availability note, the header is now native grey.
        .background(SportivistaTokens.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
        neutralCard {
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
        }
    }

    private func answerRow(_ row: AnswerRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(row.dayLabel)
                    .font(.sportivista(.caption2, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
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
        neutralCard {
            VStack(alignment: .leading, spacing: 6) {
                sectionTitle("REGNSKAP")
                Text(tally.summary)
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
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
            // Destructive confirm — the app's flat destructive pattern (same as
            // Deg › Nullstill): a red hairline Bekreft + a muted Avbryt. The one
            // prominent-filled language (amber capsule) is reserved for the
            // affirmative primary; a destructive action is never amber.
            HStack(spacing: 12) {
                Button("Bekreft") { viewModel.confirmCommand(); dismissIfDone() }
                    .font(.sportivista(.footnote, weight: .bold))
                    .foregroundStyle(SportivistaTokens.destructive)
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.destructive))
                    .accessibilityIdentifier("command.confirm")
                Button("Avbryt") { viewModel.cancelCommand(); dismissIfDone() }
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.label))
                    .accessibilityIdentifier("command.cancel")
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.destructive.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    /// A calm one-line receipt after a harmless command executed ("Tema: mørkt.",
    /// "Åpner Brann–X.") — the "rolig kvittering" the brief asks for.
    private func commandReceiptSection(_ receipt: String) -> some View {
        neutralCard {
            VStack(alignment: .leading, spacing: 6) {
                sectionTitle("UTFØRT")
                Text(receipt)
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Proposals (the DIFF)

    private var proposalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("FORESLÅTTE ENDRINGER")
            // The sheet's ONE prominent primary is the shared amber capsule
            // (`SportivistaPrimaryButtonStyle`, the app-wide primary language —
            // onboarding's CTA uses the same). Single diff: the sole row's Bekreft
            // IS that capsule. Multi diff: «Bekreft alle» is the one capsule and
            // each row's Bekreft drops to flat — never two capsules on one screen.
            if viewModel.pending.count > 1 {
                Button("Bekreft alle") { viewModel.confirmAll(); dismissIfDone() }
                    .buttonStyle(SportivistaPrimaryButtonStyle())
                    .accessibilityIdentifier("assistant.confirmAll")
            }
            ForEach(viewModel.pending) { mutation in
                proposalRow(mutation, prominent: viewModel.pending.count == 1)
            }
        }
    }

    private func proposalRow(_ mutation: GroundedMutation, prominent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
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
            if prominent {
                // The sole proposal IS the sheet's one primary: Bekreft as the
                // shared amber capsule; Avvis flat/muted below it.
                VStack(spacing: 8) {
                    Button("Bekreft") { viewModel.confirm(mutation); dismissIfDone() }
                        .buttonStyle(SportivistaPrimaryButtonStyle())
                        // WP-70: stable handle for the follow-via-command-line
                        // flow's Bekreft (the test uses .firstMatch — single diff).
                        .accessibilityIdentifier("assistant.confirm")
                    Button("Avvis") { viewModel.reject(mutation); dismissIfDone() }
                        .font(.sportivista(.subheadline))
                        .buttonStyle(.borderless)
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .sportivistaTapTarget()
                }
            } else {
                // Multi-mutation: «Bekreft alle» above is the one amber primary,
                // so the per-row confirm is flat (green), Avvis flat/muted.
                HStack(spacing: 12) {
                    Button("Bekreft") { viewModel.confirm(mutation); dismissIfDone() }
                        .font(.sportivista(.footnote, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.live)
                        .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.live))
                        .accessibilityIdentifier("assistant.confirm")
                    Button("Avvis") { viewModel.reject(mutation); dismissIfDone() }
                        .font(.sportivista(.footnote))
                        .buttonStyle(.borderless)
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .sportivistaTapTarget()
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        // NEUTRAL native cell (not a kind-tinted card): amber is the only colour
        // that works for BOTH add (green +) and remove (red −), and an amber
        // capsule reads muddily on an amber-tinted card. So add/update/remove
        // semantics ride on the coloured +/±/− marker; the card stays neutral so
        // the amber Bekreft reads cleanly (coordinator-directed, 21.07).
        .background(SportivistaTokens.cell, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(rejection.suggestions, id: \.id) { suggestion in
                                // A «mente du»-forslag IS the action (re-grounds the
                                // whole utterance, re-proposes a diff) — a flat
                                // native row (was a full-width amber pill box):
                                // amber label + a trailing chevron, ≥44pt.
                                Button {
                                    viewModel.choose(suggestion, for: rejection)
                                } label: {
                                    HStack(spacing: 8) {
                                        Text(suggestion.name)
                                            .font(.sportivista(.subheadline, weight: .semibold))
                                            .foregroundStyle(SportivistaTokens.accent)
                                            .multilineTextAlignment(.leading)
                                        Spacer(minLength: 8)
                                        Image(systemName: "chevron.forward")
                                            .font(.sportivista(.footnote, weight: .semibold))
                                            .foregroundStyle(SportivistaTokens.tertiaryLabel)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    // WP-164: the rejection is honest, not a dead-end — the USER
                    // may choose to follow the bare name anyway (a soft-follow;
                    // the model's anti-hallucination gate is untouched). Only a
                    // rejected FOLLOW offers it — «slutt å følge X» does not.
                    if rejection.proposal.kind == .add, !rejection.query.isEmpty {
                        Button {
                            viewModel.softFollow(from: rejection)
                            dismissIfDone()
                        } label: {
                            HStack(spacing: 8) {
                                Text("Følg «\(rejection.query)» likevel")
                                    .font(.sportivista(.subheadline, weight: .semibold))
                                    .foregroundStyle(SportivistaTokens.label)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 8)
                                Image(systemName: "plus")
                                    .font(.sportivista(.footnote, weight: .semibold))
                                    .foregroundStyle(SportivistaTokens.tertiaryLabel)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("assistant.softfollow")
                    }
                    Button("OK") { viewModel.dismissRejection(rejection); dismissIfDone() }
                        .font(.sportivista(.caption))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                        .sportivistaTapTarget()
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SportivistaTokens.destructive.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    // MARK: - Always-explain

    private func explanationSection(_ explanation: AssistantExplanation) -> some View {
        neutralCard {
            VStack(alignment: .leading, spacing: 6) {
                sectionTitle("INGEN ENDRING")
                Text(explanation.understood)
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                Text(explanation.reason)
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.65))
            }
        }
    }

    // MARK: - Small helpers

    /// Native section header: grey (`secondaryLabel`), `.footnote` semibold, no
    /// tracking — matches Deg/Nyheter (was an amber/grey-spaced VERSAL Tekst-TV
    /// label).
    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }

    /// A neutral rounded 12pt content card (was a sharp `label.opacity(0.04)` +
    /// hairline-stroke box) — the answer / regnskap / receipt / explanation
    /// surfaces sit on `cell` over the sheet's grouped `background`.
    private func neutralCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SportivistaTokens.cell, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                    .background(SportivistaTokens.label.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
        // Rendered inside Deg › «Det jeg ikke forsto» as a native List row (its
        // `cell` listRowBackground is the surface) — the old self-card (sharp
        // stroke box) is dropped so it reads as a plain grouped row.
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
