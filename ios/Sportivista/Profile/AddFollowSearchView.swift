//
//  AddFollowSearchView.swift
//  Sportivista
//
//  WP-105 — «Legg til» (DESIGN § Deg-skjermen): search the SAME entity index the
//  assistant grounds against (entities.json) — "velg, ikke stav". A hit list of
//  «Navn · sport · type» with a per-row «Følg» button (accent, one amber per
//  row); Følg runs through the SAME apply path the assistant's confirmed diff
//  uses (`AssistantViewModel.follow` — one source of truth, no assistant round-
//  trip). Something already followed shows a muted "Følger" instead of a button.
//
//  The index is built here from the synced `entities.json` exactly as
//  AssistantViewModel builds its own (EntityIndex(DataStore().loadEntities())),
//  so the fuzzy matching (aliases / initials / typos / edition-stripping) — and
//  therefore the "substring traps" — are handled by the shared EntityIndex
//  helpers, not re-implemented.
//
//  WP-164 — the search never dead-ends: a miss offers «Følg likevel», which
//  creates a NAME-based soft-follow rule (see InterestRule.softFollowId /
//  AssistantViewModel.softFollow). Downstream matching is already
//  name-tolerant, so the row waits honestly in «Det du følger» until coverage
//  arrives.
//

import SwiftUI

struct AddFollowSearchView: View {
    var viewModel: AssistantViewModel
    /// Injectable so tests/previews can pass a fixture index; the app loads the
    /// live synced index on appear.
    var indexProvider: () -> EntityIndex = { EntityIndex(DataStore().loadEntities()) }

    @State private var query = ""
    @State private var index = EntityIndex([])
    @State private var loaded = false
    @Environment(\.dismiss) private var dismiss

    /// Only real followable targets — never the whole-sport / umbrella-category
    /// pseudo-entities the index also carries (those are the assistant's
    /// broad-scope grounding, not a "follow this team/athlete" pick).
    private var results: [Entity] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return [] }
        return index.search(query).filter { $0.type != "sport" && $0.type != "category" }
    }

    var body: some View {
        NavigationStack {
            List {
                if results.isEmpty {
                    Section {
                        Text(emptyMessage)
                            .font(.sportivista(.subheadline))
                            .foregroundStyle(SportivistaTokens.secondaryLabel)
                        // WP-164: the search never dead-ends at «finnes ikke» —
                        // a name outside the index can be followed anyway.
                        if let name = softFollowCandidate {
                            softFollowRow(name)
                        }
                    }
                    .listRowBackground(SportivistaTokens.cell)
                } else {
                    Section {
                        ForEach(results, id: \.id) { entity in
                            resultRow(entity)
                        }
                    } header: {
                        Text("TREFF")
                            .font(.sportivista(.footnote, weight: .semibold))
                            .foregroundStyle(SportivistaTokens.secondaryLabel)
                    }
                    .listRowBackground(SportivistaTokens.cell)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(SportivistaTokens.background)
            .foregroundStyle(SportivistaTokens.label)
            .navigationTitle("Legg til")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Søk lag, utøver eller turnering")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .foregroundStyle(SportivistaTokens.accent)
                }
            }
        }
        .onAppear {
            guard !loaded else { return }
            index = indexProvider()
            loaded = true
        }
    }

    private var emptyMessage: String {
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            return "Søk opp et lag, en utøver eller en turnering å følge."
        }
        // WP-164: no «prøv et annet navn»-dead-end — the soft-follow row below
        // offers the honest way forward.
        return "Fant ingenting som passer «\(query)»."
    }

    // MARK: - WP-164 — «Følg likevel» (search never says just «finnes ikke»)

    /// The trimmed query as a soft-follow candidate — non-nil exactly when the
    /// user typed something and the index had no followable hit.
    private var softFollowCandidate: String? {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// The calm follow-anyway affordance: one quiet action + one honest line
    /// about what it means. Already soft-followed → a muted read-out instead.
    /// WP-165: either way, a quiet «meld inn ønsket» tap lets the user signal the
    /// demand so the server learns this is wanted — the follow isn't a dead end.
    private func softFollowRow(_ name: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if viewModel.isFollowing(InterestRule.softFollowId(for: name)) {
                Text("Du følger «\(name)» — venter på dekning.")
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .accessibilityIdentifier("addfollow.softfollowing")
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Button("Følg «\(name)» likevel") {
                        viewModel.softFollow(name: name)
                    }
                    .font(.sportivista(.subheadline, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .buttonStyle(.borderless)
                    .sportivistaTapTarget()
                    .accessibilityIdentifier("addfollow.softfollow")
                    Text("Vi kjenner ikke navnet ennå. Raden i Det du følger venter til dekningen kommer.")
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            CoverageRequestLink(name: name)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func resultRow(_ entity: Entity) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entity.name)
                    .font(.sportivista(.body, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.label)
                Text("\(SportVocabulary.display(for: entity.sport)) · \(FollowVocabulary.typeLabel(entity.type))")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            Spacer()
            if viewModel.isFollowing(entity.id) {
                Text("Følger")
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .accessibilityIdentifier("addfollow.following.\(entity.id)")
            } else {
                Button("Følg") {
                    viewModel.follow(entity)
                }
                .font(.sportivista(.subheadline, weight: .semibold))
                .foregroundStyle(SportivistaTokens.accent)
                .buttonStyle(.borderless)
                .sportivistaTapTarget()
                .accessibilityIdentifier("addfollow.follow.\(entity.id)")
            }
        }
        .padding(.vertical, 2)
    }
}
