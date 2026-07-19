//
//  FollowedListView.swift
//  Sportivista
//
//  WP-105 — "Det du følger" (DESIGN § Deg-skjermen): a plain inset-grouped list,
//  one row per followed entity («Navn · sport · varsler på/av ›»), each pushing a
//  detail with the rule's real fields + «Slutt å følge» (destructive, behind a
//  calm confirmation). A «+» toolbar entry opens the Legg til-søk. Interests
//  without the assistant (3b): every follow/unfollow here runs through the SAME
//  ProfileStore apply path the assistant's confirmed diff uses
//  (AssistantViewModel.follow / .removeRule — one source of truth).
//
//  Upgraded from DegView's earlier inline «Hva jeg følger» list (its per-rule
//  «Fjern» is replaced by rad → detalj → «Slutt å følge», the DESIGN § Deg
//  navigation).
//

import SwiftUI

struct FollowedListView: View {
    var viewModel: AssistantViewModel
    @State private var addShown = false

    private var rules: [InterestRule] { viewModel.profile.rules }

    var body: some View {
        List {
            if rules.isEmpty {
                Section {
                    Text("Ingenting ennå. Trykk + for å søke opp et lag, en utøver eller en turnering å følge.")
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .listRowBackground(SportivistaTokens.cell)
            } else {
                Section {
                    ForEach(rules) { rule in
                        NavigationLink {
                            FollowDetailView(viewModel: viewModel, rule: rule)
                        } label: {
                            followRow(rule)
                        }
                        .accessibilityIdentifier("followed.row.\(rule.entityId)")
                    }
                } header: {
                    groupHeader("DET DU FØLGER")
                }
                .listRowBackground(SportivistaTokens.cell)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SportivistaTokens.background)
        .foregroundStyle(SportivistaTokens.label)
        .navigationTitle("Det du følger")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    addShown = true
                } label: {
                    Image(systemName: "plus")
                }
                .tint(SportivistaTokens.accent)
                .accessibilityLabel("Legg til")
                .accessibilityIdentifier("followed.add")
            }
        }
        .sheet(isPresented: $addShown) {
            AddFollowSearchView(viewModel: viewModel)
        }
    }

    private func followRow(_ rule: InterestRule) -> some View {
        HStack {
            Text(rule.entityName)
                .font(.sportivista(.body, weight: .semibold))
                .foregroundStyle(SportivistaTokens.label)
            Spacer()
            Text(FollowVocabulary.rowSubtitle(rule))
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .lineLimit(1)
        }
        .contentShape(Rectangle())
    }

    private func groupHeader(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }
}

// MARK: - Detail (rad → detalj)

/// One follow's detail: the rule's real, persisted fields (sport, scope note,
/// perspective, when it was added, its Norwegian reason) shown as text, the
/// device-wide reminder read-out, and «Slutt å følge» behind a calm
/// confirmation (DESIGN § Deg: destructive → ett rolig bekreftelses-ark).
struct FollowDetailView: View {
    var viewModel: AssistantViewModel
    let rule: InterestRule

    @State private var confirmingStop = false
    @Environment(\.dismiss) private var dismiss
    /// The device-wide reminder preference — the only notify signal the on-device
    /// profile carries (there is no per-entity notify field), shown honestly.
    private let leadTimeOn = NotificationLeadPreference.isLeadTimeEnabled()

    var body: some View {
        List {
            Section {
                detailRow("Sport", SportVocabulary.display(for: rule.sport))
                if let scope = rule.scope, !scope.isEmpty {
                    detailRow("Avgrensning", scope)
                }
                if !rule.lens.isDefault {
                    detailRow("Perspektiv", rule.lens.label)
                }
            } header: {
                groupHeader("OM")
            }
            .listRowBackground(SportivistaTokens.cell)

            if !rule.reason.isEmpty {
                Section {
                    Text(rule.reason)
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.label)
                        .fixedSize(horizontal: false, vertical: true)
                } header: {
                    groupHeader("HVORFOR")
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            Section {
                HStack(spacing: 8) {
                    Text(leadTimeOn ? "På" : "Av")
                        .font(.sportivista(.subheadline, weight: .semibold))
                        .foregroundStyle(leadTimeOn ? SportivistaTokens.accent : SportivistaTokens.secondaryLabel)
                    Text(leadTimeOn ? "minner deg før start" : "ingen påminnelse")
                        .font(.sportivista(.caption))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .padding(.vertical, 2)
            } header: {
                groupHeader("VARSEL")
            } footer: {
                Text("Varsel før start styres samlet i Deg › Varsel før start.")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .listRowBackground(SportivistaTokens.cell)

            Section {
                Button(role: .destructive) {
                    confirmingStop = true
                } label: {
                    Text("Slutt å følge")
                        .font(.sportivista(.body, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.destructive)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("followed.stop")
            }
            .listRowBackground(SportivistaTokens.cell)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SportivistaTokens.background)
        .foregroundStyle(SportivistaTokens.label)
        .navigationTitle(rule.entityName)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Slutt å følge \(rule.entityName)?",
            isPresented: $confirmingStop,
            titleVisibility: .visible
        ) {
            Button("Slutt å følge", role: .destructive) {
                viewModel.removeRule(rule)
                dismiss()
            }
            .accessibilityIdentifier("followed.stop.confirm")
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("\(rule.entityName) forsvinner fra det du følger, og agendaen oppdateres. Du kan legge til igjen når som helst.")
        }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.label)
            Spacer()
            Text(value)
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .multilineTextAlignment(.trailing)
        }
    }

    private func groupHeader(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }
}

// MARK: - Shared Norwegian vocabulary for the follow surfaces

enum FollowVocabulary {
    /// «sport · varsler på/av» — the row subtitle. "varsler" reflects the
    /// device-wide `NotificationLeadPreference` (the on-device profile has no
    /// per-entity notify field), so the read-out stays honest.
    static func rowSubtitle(_ rule: InterestRule) -> String {
        let notify = NotificationLeadPreference.isLeadTimeEnabled() ? "varsler på" : "varsler av"
        return "\(SportVocabulary.display(for: rule.sport)) · \(notify)"
    }

    /// A Norwegian word for an entity's `type` (athlete/team/tournament/…), for
    /// the Legg til search rows' «sport · type» line.
    static func typeLabel(_ type: String) -> String {
        switch type {
        case "athlete": return "utøver"
        case "team": return "lag"
        case "tournament": return "turnering"
        case "league": return "liga"
        case "sport": return "sport"
        case "category": return "kategori"
        default: return type
        }
    }
}
