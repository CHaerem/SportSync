//
//  AssistantView.swift
//  Zenji
//
//  WP-16 — the one FM-lekegrind screen, reached from a discreet "Assistent"
//  glyph in the Tekst-TV header (ContentView). Calm, Norwegian, monospace: a
//  text field for the utterance; the model's proposed changes shown as a DIFF
//  (green add / amber change / red remove, in the design tokens) with
//  Bekreft/Avvis per mutation; honest "fant ikke …" notes for anything that
//  couldn't be grounded; and the current profile listed below as "Hva jeg
//  følger", each rule with its Norwegian reason. When Apple Intelligence is off
//  or the model isn't loaded, a quiet banner says so plainly rather than
//  pretending to work.
//
//  All logic lives in AssistantViewModel + the pure pipeline it calls; this
//  file is presentation only.
//

import SwiftUI

struct AssistantView: View {
    @State private var viewModel: AssistantViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var inputFocused: Bool

    /// Canonical example utterances (the WP-16 spirit) — tappable to fill the
    /// field, so the playground is discoverable without a keyboard tour.
    private static let examples = [
        "Følg Casper Ruud bare i Grand Slams",
        "Slutt med tennis",
        "Mer sykkel i juli",
        "Følg Magnus Carlsen",
        "Prioriter 100 Thieves høyere"
    ]

    init(viewModel: AssistantViewModel = AssistantViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if let message = viewModel.availability.message {
                    unavailableBanner(message)
                }
                inputSection
                statusSection
                if let explanation = viewModel.explanation { explanationSection(explanation) }
                if !viewModel.pending.isEmpty { proposalsSection }
                if !viewModel.rejected.isEmpty { rejectionsSection }
                profileSection
                examplesSection
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(ZenjiTokens.background.ignoresSafeArea())
        .foregroundStyle(ZenjiTokens.foreground)
        .task { viewModel.refreshAvailability() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("ASSISTENT")
                .font(.zenjiMono(size: 20, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .tracking(2)
            Spacer()
            Button("Lukk") { dismiss() }
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
        }
    }

    // MARK: - Availability banner

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

    // MARK: - Input

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Skriv hva du vil følge, på vanlig norsk:")
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))

            TextField("f.eks. følg Ruud bare i Grand Slams", text: $viewModel.utterance, axis: .vertical)
                .font(.zenjiMono(size: 15))
                .textFieldStyle(.plain)
                .lineLimit(1...4)
                .focused($inputFocused)
                .padding(12)
                .background(ZenjiTokens.foreground.opacity(0.06))
                .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.2), lineWidth: 1))
                .submitLabel(.send)
                .onSubmit(runSubmit)

            Button(action: runSubmit) {
                Text(viewModel.isThinking ? "TOLKER …" : "TOLK")
                    .font(.zenjiMono(size: 14, weight: .bold))
                    .tracking(1.5)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(ZenjiTokens.accent.opacity(canSubmit ? 0.85 : 0.25))
                    .foregroundStyle(ZenjiTokens.background)
            }
            .disabled(!canSubmit)
        }
    }

    private var canSubmit: Bool {
        !viewModel.isThinking && !viewModel.utterance.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func runSubmit() {
        inputFocused = false
        Task { await viewModel.submit() }
    }

    // MARK: - Status (thinking / error / notice)

    @ViewBuilder
    private var statusSection: some View {
        if viewModel.isThinking {
            HStack(spacing: 8) {
                ProgressView().tint(ZenjiTokens.accent)
                Text("Tenker …")
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
            }
        }
        if let error = viewModel.errorMessage {
            Text(error)
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.diffRemove)
        }
    }

    // MARK: - Always-explain (no confirmable change → an honest account)

    /// The WP-16.1 contract, on screen: never a bare "fant ingen endringer".
    /// Shows what the assistant understood and WHY nothing changed; any
    /// "mente du …?" suggestions render just below in the rejections section.
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

    // MARK: - Proposed mutations (the DIFF)

    private var proposalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("FORESLÅTTE ENDRINGER")
                Spacer()
                if viewModel.pending.count > 1 {
                    Button("Bekreft alle") { viewModel.confirmAll() }
                        .font(.zenjiMono(size: 12, weight: .bold))
                        .foregroundStyle(ZenjiTokens.diffAdd)
                }
            }
            ForEach(viewModel.pending) { mutation in
                proposalRow(mutation)
            }
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
                Button("Bekreft") { viewModel.confirm(mutation) }
                    .font(.zenjiMono(size: 13, weight: .bold))
                    .foregroundStyle(ZenjiTokens.diffAdd)
                Button("Avvis") { viewModel.reject(mutation) }
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
        // The lens — "gjennom norske utøvere" — shown only when it isn't the
        // neutral default, and never on a remove (WP-16.1).
        if mutation.kind != .remove, !mutation.lens.isDefault { parts.append(mutation.lens.label) }
        if mutation.kind != .remove { parts.append("vekt \(weightLabel(mutation.weight))") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Rejections (grounding failures)

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
                    Button("OK") { viewModel.dismissRejection(rejection) }
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

    // MARK: - Profile ("Hva jeg følger")

    private var profileSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("HVA JEG FØLGER")
            if viewModel.profile.isEmpty {
                Text("Ingenting ennå. Skriv en ytring over for å begynne.")
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.55))
            } else {
                ForEach(viewModel.profile.rules) { rule in
                    ruleRow(rule)
                }
            }
        }
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

    // MARK: - Examples

    private var examplesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("PRØV")
            ForEach(Self.examples, id: \.self) { example in
                Button {
                    viewModel.utterance = example
                    inputFocused = true
                } label: {
                    Text("› \(example)")
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.accent.opacity(0.8))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    // MARK: - Small helpers

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

#Preview {
    // Preview uses the deterministic mock so it renders without Apple Intelligence.
    let index = EntityIndex([
        Entity(id: "casper-ruud", name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis", type: "athlete"),
        Entity(id: "magnus-carlsen", name: "Magnus Carlsen", aliases: [], sport: "chess", type: "athlete")
    ])
    return AssistantView(viewModel: AssistantViewModel(
        assistant: MockInterestAssistant(),
        profileStore: ProfileStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("zenji-preview")),
        index: index
    ))
}
