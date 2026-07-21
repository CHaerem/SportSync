//
//  WhatIKnowView.swift
//  Sportivista
//
//  WP-30 — "Hva jeg vet om deg": the P350 trust surface (and the plain-language
//  GDPR answer). A calm, DESIGN.md-true page that lists EVERYTHING remembered —
//  structured facts, episodic notes, behaviour stats — each readable, the
//  structured facts editable, everything deletable, plus a "Glem alt" that wipes
//  all personal memory. Reached from the assistant flow, the same place as "Hva
//  jeg følger". Apple-native baseline throughout: system type, one amber accent,
//  no emoji, tap targets ≥44pt.
//
//  Honest about the privacy contract, in the intro line: this lives ONLY on your
//  device (and your own iCloud / QR bridge) — never our server.
//

import SwiftUI

struct WhatIKnowView: View {
    var viewModel: AssistantViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingForget = false

    private var memory: MemoryState { viewModel.memory }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    intro
                    if memory.isEmpty {
                        emptyState
                    } else {
                        if !memory.facts.isEmpty { factsSection }
                        if !memory.episodic.isEmpty { episodicSection }
                        if !memory.behavior.isEmpty { behaviorSection }
                        forgetAllRow
                    }
                }
                .padding(20)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            .background(SportivistaTokens.background)
            .foregroundStyle(SportivistaTokens.label)
            .navigationTitle("Hva jeg vet om deg")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .foregroundStyle(SportivistaTokens.accent)
                        .sportivistaTapTarget()
                }
            }
            .task { viewModel.refreshMemory() }
        }
    }

    // MARK: - Intro / empty

    private var intro: some View {
        // Prose in the system font (was tabular — a Tekst-TV habit). The privacy
        // honesty («bor kun på enheten din … aldri på en server») is unchanged.
        Text("Dette er alt jeg husker om deg — hvordan du forholder deg til det du følger. Det bor kun på enheten din (og din egen iCloud), aldri på en server. Du kan endre eller slette hva som helst.")
            .font(.sportivista(.footnote))
            .foregroundStyle(SportivistaTokens.label.opacity(0.8))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var emptyState: some View {
        Text("Ingenting ennå. Etter hvert som du bruker assistenten, husker jeg smaken din — kunnskapsnivå, spoilervern, når du vil varsles — her.")
            .font(.sportivista(.footnote))
            .foregroundStyle(SportivistaTokens.label.opacity(0.55))
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Structured facts

    private var factsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("STRUKTURERT (\(memory.facts.count))")
            ForEach(memory.facts) { fact in
                MemoryFactRow(
                    fact: fact,
                    scope: scopeLabel(entityId: fact.entityId, sport: fact.sport),
                    onSave: { viewModel.updateFact($0) },
                    onDelete: { viewModel.deleteFact(fact) }
                )
            }
        }
    }

    // MARK: - Episodic

    private var episodicSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("LÆRT UNDERVEIS (\(memory.episodic.count))")
            ForEach(memory.episodic) { note in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(note.summary)
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Button("Slett") { viewModel.deleteEpisodic(note) }
                            .font(.sportivista(.caption2))
                            .foregroundStyle(SportivistaTokens.destructive.opacity(0.75))
                            .sportivistaTapTarget()
                    }
                    Text(dateLabel(note.createdAt))
                        .font(.sportivistaTabular(.caption2))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SportivistaTokens.cell, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    // MARK: - Behaviour

    private var behaviorSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("ATFERD (\(memory.behavior.count))")
            // WP-138: make the adaptive signal explainable — the subject you engage
            // with most. This is the same affinity used as a mild tie-break/lift;
            // showing it keeps the personalisation transparent, never a black box.
            if let top = topAffinitySubject {
                Text("Sterkest tilknytning: \(top) — jeg løfter dette litt når rekkefølgen ellers er lik.")
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
            // The compact stats as one native grouped cell (was hairline-divided
            // rows) with inset separators.
            VStack(spacing: 0) {
                ForEach(memory.behavior) { stat in
                    behaviorRow(stat)
                    if stat.id != memory.behavior.last?.id {
                        Rectangle().fill(SportivistaTokens.separator)
                            .frame(height: 1)
                            .padding(.leading, 12)
                    }
                }
            }
            .background(SportivistaTokens.cell, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func behaviorRow(_ stat: BehaviorStat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(stat.kind.label) \(behaviorSubject(stat))")
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
            Spacer(minLength: 8)
            // The count is DATA, not an accent — was amber (N amber counts read as
            // an amber wall, cf. WP-147); now the primary label, tabular.
            Text("\(stat.total)×")
                .font(.sportivistaTabular(.footnote, weight: .semibold))
                .foregroundStyle(SportivistaTokens.label)
            Button("Slett") { viewModel.deleteBehavior(stat) }
                .font(.sportivista(.caption2))
                .foregroundStyle(SportivistaTokens.destructive.opacity(0.75))
                .sportivistaTapTarget()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Forget all

    private var forgetAllRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(SportivistaTokens.separator).frame(height: 1)
            if confirmingForget {
                Text("Sikker? Dette sletter alt jeg vet om deg. Det du FØLGER beholdes.")
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.75))
                // Destructive confirm — the app's flat destructive pattern (same
                // as Deg › Nullstill): a red hairline confirm + muted Avbryt. The
                // amber capsule is reserved for affirmative primaries; a
                // destructive action is never amber.
                HStack(spacing: 12) {
                    Button("Ja, glem alt") {
                        viewModel.forgetAllMemory()
                        confirmingForget = false
                    }
                    .font(.sportivista(.footnote, weight: .bold))
                    .foregroundStyle(SportivistaTokens.destructive)
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.destructive))
                    Button("Avbryt") { confirmingForget = false }
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.label))
                }
            } else {
                // The entry to the destructive flow — a quiet flat red text action
                // (the prominent primary is the «Ja, glem alt» confirm above).
                Button("Glem alt") { confirmingForget = true }
                    .font(.sportivista(.footnote, weight: .semibold))
                    .buttonStyle(.borderless)
                    .foregroundStyle(SportivistaTokens.destructive)
                    .sportivistaTapTarget()
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Helpers

    /// Native section header: grey (`secondaryLabel`), `.footnote` semibold, no
    /// tracking — matches Deg/Nyheter (was a grey-spaced VERSAL Tekst-TV label).
    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }

    private func scopeLabel(entityId: String?, sport: String?) -> String {
        if let sport, !sport.isEmpty { return SportVocabulary.display(for: sport) }
        if let entityId, !entityId.isEmpty { return viewModel.entityName(entityId) }
        return "Generelt"
    }

    private func behaviorSubject(_ stat: BehaviorStat) -> String {
        stat.isSport ? SportVocabulary.display(for: stat.token) : viewModel.entityName(stat.token)
    }

    /// WP-138 — the strongest-affinity subject, resolved to a readable name, for
    /// the explainability line above. Nil when nothing has positive affinity yet.
    private var topAffinitySubject: String? {
        guard let first = Affinity(behavior: memory.behavior).topSubjects(limit: 1).first else { return nil }
        return first.isSport ? SportVocabulary.display(for: first.token) : viewModel.entityName(first.token)
    }

    private func dateLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "d. MMM"
        return f.string(from: date)
    }
}

/// One structured fact, editable in place: kind label · scope · value, the
/// Norwegian reason, and an "Endre"/"Slett" pair. Editing reveals two fields
/// (value + reason) — the kind and scope are structural and stay fixed.
struct MemoryFactRow: View {
    let fact: MemoryFact
    let scope: String
    let onSave: (MemoryFact) -> Void
    let onDelete: () -> Void

    @State private var editing = false
    @State private var valueDraft: String
    @State private var reasonDraft: String

    init(fact: MemoryFact, scope: String, onSave: @escaping (MemoryFact) -> Void, onDelete: @escaping () -> Void) {
        self.fact = fact
        self.scope = scope
        self.onSave = onSave
        self.onDelete = onDelete
        _valueDraft = State(initialValue: fact.value)
        _reasonDraft = State(initialValue: fact.reason)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                // All category labels are grey — amber is the must-see accent, not
                // a semantic category colour (SPOILERVERN was amber while its
                // siblings KUNNSKAPSNIVÅ/VARSELSVINDU were grey; that was amber
                // drift, cf. WP-147). Destructive is carried by red elsewhere.
                Text(fact.kind.label.uppercased())
                    .font(.sportivista(.caption2, weight: .bold))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                Text("· \(scope)")
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                Spacer()
            }

            if editing {
                field("Verdi", text: $valueDraft)
                field("Begrunnelse", text: $reasonDraft)
                HStack(spacing: 14) {
                    Button("Lagre") {
                        var updated = fact
                        updated.value = valueDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        updated.reason = reasonDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSave(updated)
                        editing = false
                    }
                    .font(.sportivista(.caption2, weight: .bold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .sportivistaTapTarget()
                    Button("Avbryt") {
                        valueDraft = fact.value
                        reasonDraft = fact.reason
                        editing = false
                    }
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.5))
                    .sportivistaTapTarget()
                }
            } else {
                Text(fact.value)
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                if !fact.reason.isEmpty {
                    Text(fact.reason)
                        .font(.sportivista(.caption2))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.55))
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 16) {
                    Button("Endre") { editing = true }
                        .font(.sportivista(.caption2))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                        .sportivistaTapTarget()
                    Button("Slett") { onDelete() }
                        .font(.sportivista(.caption2))
                        .foregroundStyle(SportivistaTokens.destructive.opacity(0.75))
                        .sportivistaTapTarget()
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.cell, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func field(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.sportivista(.caption2, weight: .semibold))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
            TextField(label, text: text, axis: .vertical)
                .font(.sportivista(.caption))
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .padding(8)
                .background(SportivistaTokens.label.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}
