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
        return "Fant ingenting som passer «\(query)». Prøv et annet navn."
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
