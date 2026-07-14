//
//  AssistantPanel.swift
//  Zenji
//
//  WP-16.4 — the assistant's content, moved OUT of a separate screen and INTO
//  the flow: a flat "ark" (flate-token) that fades in over the agenda when the
//  command line has something to show. It carries everything the WP-16 screen
//  did — the proposal DIFF (Bekreft/Avvis per mutation, «mente du …?»
//  suggestions, the always-explain «ingen endring» account) — PLUS the WP-16.4
//  answer block (a question's calm reply + the rows it referenced), and reaches
//  «Hva jeg følger» + the WP-16.3 forsto-ikke-loggen from two quiet disclosures
//  at the bottom of the SAME ark ("i samme flyt"). No text input lives here —
//  that's the always-present command line; confirming a change fades this ark
//  away (≤150 ms) and the agenda behind it recompiles on the spot.
//
//  Presentation only. All logic is AssistantViewModel + the pure pipeline it
//  calls; this file lays the state out.
//

import SwiftUI

struct AssistantPanel: View {
    var viewModel: AssistantViewModel
    /// Fades the ark away (ContentView owns the ≤150 ms transition).
    var dismiss: () -> Void

    @State private var misunderstoodExpanded = false
    @State private var profileExpanded = false

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            Rectangle().fill(ZenjiTokens.hairline).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let message = viewModel.availability.message { unavailableBanner(message) }
                    if let error = viewModel.errorMessage { errorRow(error) }
                    if let answer = viewModel.answer { answerSection(answer) }
                    if !viewModel.pending.isEmpty { proposalsSection }
                    if !viewModel.rejected.isEmpty { rejectionsSection }
                    if let explanation = viewModel.explanation { explanationSection(explanation) }
                    Rectangle().fill(ZenjiTokens.hairline).frame(height: 1).padding(.vertical, 2)
                    profileSection
                    misunderstoodSection
                }
                .padding(20)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .background(ZenjiTokens.surface)
        .foregroundStyle(ZenjiTokens.foreground)
        .task { viewModel.refreshAvailability() }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("ASSISTENT")
                .font(.zenjiMono(size: 15, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .tracking(2)
            Spacer()
            Button("Lukk") { dismiss() }
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.muted)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - Availability / error

    private func unavailableBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("APPLE INTELLIGENCE")
                .font(.zenjiMono(size: 11, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent.opacity(0.8))
                .tracking(1.5)
            Text(message)
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.8))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.accent.opacity(0.10))
        .overlay(Rectangle().stroke(ZenjiTokens.accent.opacity(0.35), lineWidth: 1))
    }

    private func errorRow(_ error: String) -> some View {
        Text(error)
            .font(.zenjiMono(size: 13))
            .foregroundStyle(ZenjiTokens.diffRemove)
    }

    // MARK: - Answer (WP-16.4)

    /// A question's calm reply: the prose, then the referenced rows as quiet
    /// when · what · where lines — the same shape an agenda row answers.
    private func answerSection(_ answer: AssistantAnswerResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("SVAR")
            Text(answer.text)
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if !answer.rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(answer.rows) { row in answerRow(row) }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.foreground.opacity(0.04))
        .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.15), lineWidth: 1))
    }

    private func answerRow(_ row: AnswerRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(row.dayLabel)
                    .font(.zenjiMono(size: 10, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.muted)
                    .tracking(1)
                Text(row.timeLabel)
                    .font(.zenjiMono(size: 13, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.foreground)
                    .monospacedDigit()
            }
            .frame(minWidth: 72, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.zenjiMono(size: 14))
                    .foregroundStyle(ZenjiTokens.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(row.channelLabel)
                    .font(.zenjiMono(size: 12))
                    .foregroundStyle(row.channelLabel == "–" ? ZenjiTokens.muted.opacity(0.5) : ZenjiTokens.muted)
            }
        }
    }

    // MARK: - Proposals (the DIFF)

    private var proposalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("FORESLÅTTE ENDRINGER")
                Spacer()
                if viewModel.pending.count > 1 {
                    Button("Bekreft alle") { viewModel.confirmAll(); dismissIfDone() }
                        .font(.zenjiMono(size: 12, weight: .bold))
                        .foregroundStyle(ZenjiTokens.diffAdd)
                }
            }
            ForEach(viewModel.pending) { mutation in proposalRow(mutation) }
        }
    }

    private func proposalRow(_ mutation: GroundedMutation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(sign(for: mutation.kind))
                    .font(.zenjiMono(size: 16, weight: .bold))
                    .foregroundStyle(color(for: mutation.kind))
                VStack(alignment: .leading, spacing: 2) {
                    Text(mutation.entity.name)
                        .font(.zenjiMono(size: 15, weight: .bold))
                    Text(subtitle(for: mutation))
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
                }
            }
            Text(mutation.reason)
                .font(.zenjiMono(size: 12))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.75))
            HStack(spacing: 10) {
                Button("Bekreft") { viewModel.confirm(mutation); dismissIfDone() }
                    .font(.zenjiMono(size: 13, weight: .bold))
                    .foregroundStyle(ZenjiTokens.diffAdd)
                Button("Avvis") { viewModel.reject(mutation); dismissIfDone() }
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
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
                        .font(.zenjiMono(size: 13))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                    if !rejection.suggestions.isEmpty {
                        Text("Trykk for å foreslå endringen:")
                            .font(.zenjiMono(size: 11))
                            .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(rejection.suggestions, id: \.id) { suggestion in
                                Button {
                                    viewModel.choose(suggestion, for: rejection)
                                } label: {
                                    Text("› \(suggestion.name)")
                                        .font(.zenjiMono(size: 13, weight: .bold))
                                        .foregroundStyle(ZenjiTokens.accent)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                    }
                    Button("OK") { viewModel.dismissRejection(rejection); dismissIfDone() }
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(ZenjiTokens.diffRemove.opacity(0.06))
                .overlay(Rectangle().stroke(ZenjiTokens.diffRemove.opacity(0.3), lineWidth: 1))
            }
        }
    }

    // MARK: - Always-explain

    private func explanationSection(_ explanation: AssistantExplanation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("INGEN ENDRING")
            Text(explanation.understood)
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
            Text(explanation.reason)
                .font(.zenjiMono(size: 12))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.65))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.foreground.opacity(0.05))
        .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Profile ("Hva jeg følger") — a quiet disclosure

    private var profileSection: some View {
        DisclosureGroup(isExpanded: $profileExpanded) {
            VStack(alignment: .leading, spacing: 0) {
                if viewModel.profile.isEmpty {
                    Text("Ingenting ennå. Skriv en ytring i linjen for å begynne.")
                        .font(.zenjiMono(size: 13))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.55))
                        .padding(.top, 10)
                } else {
                    ForEach(viewModel.profile.rules) { rule in ruleRow(rule) }
                }
            }
            .padding(.top, 8)
        } label: {
            Text("HVA JEG FØLGER (\(viewModel.profile.rules.count))")
                .font(.zenjiMono(size: 12, weight: .bold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
                .tracking(1.5)
        }
        .tint(ZenjiTokens.muted)
    }

    private func ruleRow(_ rule: InterestRule) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(rule.entityName)
                    .font(.zenjiMono(size: 14, weight: .bold))
                Spacer()
                Button("Fjern") { viewModel.removeRule(rule) }
                    .font(.zenjiMono(size: 12))
                    .foregroundStyle(ZenjiTokens.diffRemove.opacity(0.8))
            }
            Text(ruleSubtitle(rule))
                .font(.zenjiMono(size: 12))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
            Text(rule.reason)
                .font(.zenjiMono(size: 11))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZenjiTokens.foreground.opacity(0.1)).frame(height: 1)
        }
    }

    private func ruleSubtitle(_ rule: InterestRule) -> String {
        var parts = [SportVocabulary.display(for: rule.sport)]
        if let scope = rule.scope, !scope.isEmpty { parts.append(scope) }
        if !rule.lens.isDefault { parts.append(rule.lens.label) }
        parts.append("vekt \(weightLabel(rule.weight))")
        return parts.joined(separator: " · ")
    }

    // MARK: - "Det jeg ikke forsto" (WP-16.3)

    private var misunderstoodSection: some View {
        DisclosureGroup(isExpanded: $misunderstoodExpanded) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 16) {
                    ShareLink(item: misunderstoodExportText, preview: SharePreview("forsto-ikke-rapport.json")) {
                        Text("DEL RAPPORT")
                            .font(.zenjiMono(size: 11, weight: .bold))
                            .foregroundStyle(ZenjiTokens.accent)
                    }
                    .disabled(viewModel.misunderstoodEntries.isEmpty)
                    Spacer()
                    if !viewModel.misunderstoodEntries.isEmpty {
                        Button("Slett alt") { viewModel.deleteAllMisunderstood() }
                            .font(.zenjiMono(size: 11))
                            .foregroundStyle(ZenjiTokens.diffRemove.opacity(0.75))
                    }
                }
                if viewModel.misunderstoodEntries.isEmpty {
                    Text("Ingenting her ennå — det dukker opp når jeg ikke klarer å gjøre en ytring om til en endring.")
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.55))
                } else {
                    ForEach(viewModel.misunderstoodEntries) { entry in
                        MisunderstoodEntryRow(
                            entry: entry,
                            onSaveNote: { note in viewModel.setMisunderstoodNote(note, for: entry) },
                            onDelete: { viewModel.deleteMisunderstood(entry) }
                        )
                    }
                }
            }
            .padding(.top, 12)
        } label: {
            Text("DET JEG IKKE FORSTO (\(viewModel.misunderstoodCount))")
                .font(.zenjiMono(size: 12, weight: .bold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
                .tracking(1.5)
        }
        .tint(ZenjiTokens.muted)
    }

    private var misunderstoodExportText: String {
        String(data: viewModel.misunderstoodExportPayload(), encoding: .utf8) ?? "[]"
    }

    // MARK: - Small helpers

    /// Fades the ark away once the user has cleared everything worth showing —
    /// the "Bekreft → arket glir bort → agendaen re-kompileres" moment.
    private func dismissIfDone() {
        if !viewModel.hasPresentableResult { dismiss() }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.zenjiMono(size: 12, weight: .bold))
            .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
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
        case .add: return ZenjiTokens.diffAdd
        case .update: return ZenjiTokens.accent
        case .remove: return ZenjiTokens.diffRemove
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
                    .font(.zenjiMono(size: 13, weight: .bold))
                Spacer()
                if entry.isResolved {
                    Text("LØST")
                        .font(.zenjiMono(size: 10, weight: .bold))
                        .foregroundStyle(ZenjiTokens.diffAdd)
                }
            }
            Text(entry.outcome.label)
                .font(.zenjiMono(size: 11))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
            Text(entry.explanation.reason)
                .font(.zenjiMono(size: 12))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.75))

            if isEditingNote {
                TextField("Hva mente du egentlig?", text: $noteDraft, axis: .vertical)
                    .font(.zenjiMono(size: 12))
                    .textFieldStyle(.plain)
                    .lineLimit(1...3)
                    .padding(8)
                    .background(ZenjiTokens.foreground.opacity(0.06))
                    .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.2), lineWidth: 1))
                HStack(spacing: 14) {
                    Button("Lagre notat") {
                        onSaveNote(noteDraft)
                        isEditingNote = false
                    }
                    .font(.zenjiMono(size: 11, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent)
                    Button("Avbryt") {
                        noteDraft = entry.note ?? ""
                        isEditingNote = false
                    }
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
                }
            } else if let note = entry.note, !note.isEmpty {
                Text("Notat: \(note)")
                    .font(.zenjiMono(size: 12))
                    .foregroundStyle(ZenjiTokens.accent.opacity(0.85))
            }

            HStack(spacing: 16) {
                if !isEditingNote {
                    Button(entry.note?.isEmpty == false ? "Endre notat" : "Legg til notat") {
                        isEditingNote = true
                    }
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
                }
                Button("Slett") { onDelete() }
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.diffRemove.opacity(0.7))
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.foreground.opacity(0.04))
        .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.15), lineWidth: 1))
    }
}
