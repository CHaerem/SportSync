//
//  DegView.swift
//  Zenji
//
//  WP-83 — the "Deg" screen (DESIGN § Deg-skjermen). Pushed from the
//  agenda's `gearshape` toolbar button, it RE-HOMES the permanent sections that
//  used to live at the foot of the assistant ark (WP-82 slimmed the ark down to
//  conversation/result only). It is a native inset-grouped `List` — SF Symbols
//  leading, chevron/value trailing — with the platform owning grouping,
//  separators, pressed-state and accessibility.
//
//  It RE-USES the existing views and flows verbatim — `WhatIKnowView` (memory),
//  `ProfileSharePanel` (share/import), the rule list + «Fjern» off
//  `AssistantViewModel`, the WP-32 reset semantics (`ResetLevel` + the host's
//  `onReset`), the misunderstood log + `MisunderstoodEntryRow`, and (DEBUG) the
//  `EvalView`. No memory/profile/reset/eval LOGIC is re-implemented here; this
//  file only lays out the entrances (WP-83 non-goal: don't touch the logic).
//
//  Groups (DESIGN § Deg-skjermen):
//    • PROFIL     — Hva jeg følger (n) · Sett opp på nytt
//    • DATA OM MEG — Hva jeg vet om deg (n) · Det jeg ikke forsto (n) · Del profil
//    • APP        — Varsel før start · Utseende (tema) · Nullstill
//    • FOT        — the quiet «BYGG …» version line
//    • DEBUG      — Eval (only in a DEBUG build)
//

import SwiftUI

struct DegView: View {
    var viewModel: AssistantViewModel
    /// WP-31 — re-run the first-run onboarding (host raises the overlay). The
    /// host also dismisses this screen so the overlay is unobstructed.
    var onRerunOnboarding: () -> Void = {}
    /// WP-32 — perform a confirmed reset (host resets AND raises onboarding).
    var onReset: (ResetLevel) -> Void = { _ in }
    /// WP-32 — whether cross-device sync is on, so the reset confirmation only
    /// mentions other devices when there ARE any (honest, not hypothetical).
    var syncEnabled: Bool = false
    /// The published app-version truth for the «BYGG … / NYERE FINNES» foot.
    var publishedAppVersion: AppVersion? = nil

    /// The SAME @AppStorage key ContentView used for the header glyph — the
    /// theme override now lives here (DESIGN § Tema: "en enhets-
    /// preferanse under Deg › Utseende, ikke lenger en header-glyf").
    @AppStorage(ThemeOverride.storageKey) private var themeRaw = ThemeOverride.system.rawValue
    /// Mirrors `NotificationLeadPreference` (the toggle writes straight through).
    @State private var leadTimeOn = NotificationLeadPreference.isLeadTimeEnabled()
    @State private var memoryShown = false
    @State private var shareShown = false
    #if DEBUG
    @State private var evalShown = false
    #endif

    private var theme: ThemeOverride { ThemeOverride(rawValue: themeRaw) ?? .system }

    var body: some View {
        List {
            profileGroup
            dataGroup
            appGroup
            #if DEBUG
            debugGroup
            #endif
            versionFooter
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(ZenjiTokens.background)
        .foregroundStyle(ZenjiTokens.label)
        .navigationTitle("Deg")
        .navigationBarTitleDisplayMode(.inline)
        .task { viewModel.refreshMemory() }
        // The memory page keeps its own NavigationStack + «Lukk» (WP-30), so it
        // is presented as a sheet rather than pushed (no nested nav bars).
        .sheet(isPresented: $memoryShown) { WhatIKnowView(viewModel: viewModel) }
        .sheet(isPresented: $shareShown) { ProfileShareSheet(viewModel: viewModel) }
        #if DEBUG
        .sheet(isPresented: $evalShown) { EvalView() }
        #endif
    }

    // MARK: - PROFIL

    private var profileGroup: some View {
        Section {
            NavigationLink {
                FollowedRulesView(viewModel: viewModel)
            } label: {
                rowLabel("list.star", "Hva jeg følger", value: "\(viewModel.profile.rules.count)")
            }
            .accessibilityIdentifier("deg.follows")

            Button { onRerunOnboarding() } label: {
                rowLabel("sparkles", "Sett opp på nytt", chevron: true)
            }
            .accessibilityIdentifier("deg.rerunOnboarding")
        } header: {
            groupHeader("PROFIL")
        }
        .listRowBackground(ZenjiTokens.cell)
    }

    // MARK: - DATA OM MEG

    private var dataGroup: some View {
        Section {
            Button { memoryShown = true } label: {
                rowLabel("brain.head.profile", "Hva jeg vet om deg",
                         value: "\(viewModel.memoryItemCount)", chevron: true)
            }
            .accessibilityIdentifier("deg.memory")

            NavigationLink {
                MisunderstoodView(viewModel: viewModel)
            } label: {
                rowLabel("questionmark.circle", "Det jeg ikke forsto",
                         value: "\(viewModel.misunderstoodCount)")
            }
            .accessibilityIdentifier("deg.misunderstood")

            Button { shareShown = true } label: {
                rowLabel("square.and.arrow.up", "Del profil", chevron: true)
            }
            .accessibilityIdentifier("deg.share")
        } header: {
            groupHeader("DATA OM MEG")
        } footer: {
            Text("Alt jeg vet om deg bor kun på enheten din (og din egen iCloud) — aldri på en server.")
                .font(.zenji(.footnote))
                .foregroundStyle(ZenjiTokens.secondaryLabel)
        }
        .listRowBackground(ZenjiTokens.cell)
    }

    // MARK: - APP

    private var appGroup: some View {
        Section {
            Toggle(isOn: Binding(
                get: { leadTimeOn },
                set: { on in
                    leadTimeOn = on
                    NotificationLeadPreference.setLeadTimeEnabled(on)
                }
            )) {
                rowLabelContent("bell", "Varsel før start")
            }
            .tint(ZenjiTokens.accent)
            .accessibilityIdentifier("deg.leadTime")

            // Utseende: cycle system → mørk → lys → system (the same three-step
            // ThemeOverride the header glyph used to drive). The a11y label cycles
            // with the value so the XCUITest can assert the cycle; a stable id
            // ("theme.toggle") keeps a label-independent handle.
            Button {
                themeRaw = theme.next.rawValue
            } label: {
                rowLabel("circle.lefthalf.filled", "Utseende", value: themeValueLabel)
            }
            .accessibilityIdentifier("theme.toggle")
            .accessibilityLabel(theme.accessibilityLabel)

            NavigationLink {
                ResetView(onReset: onReset, syncEnabled: syncEnabled)
            } label: {
                rowLabel("trash", "Nullstill", tint: ZenjiTokens.destructive)
            }
            .accessibilityIdentifier("deg.reset")
        } header: {
            groupHeader("APP")
        }
        .listRowBackground(ZenjiTokens.cell)
    }

    private var themeValueLabel: String {
        switch theme {
        case .system: return "Automatisk"
        case .dark: return "Mørk"
        case .light: return "Lys"
        }
    }

    #if DEBUG
    // MARK: - DEBUG (Eval)

    private var debugGroup: some View {
        Section {
            Button { evalShown = true } label: {
                rowLabel("checklist", "Eval", chevron: true)
            }
            .accessibilityIdentifier("deg.eval")
        } header: {
            groupHeader("DEBUG")
        }
        .listRowBackground(ZenjiTokens.cell)
    }
    #endif

    // MARK: - Version foot

    private var versionFooter: some View {
        Section {
            Text(AppVersionCheck.footLine(published: publishedAppVersion))
                .font(.zenjiTabular(.caption))
                .foregroundStyle(ZenjiTokens.secondaryLabel)
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityIdentifier("versionLine")
                .listRowBackground(Color.clear)
        }
    }

    // MARK: - Row helpers (SF Symbol leading · value + chevron trailing)

    private func rowLabel(_ symbol: String, _ title: String, value: String? = nil,
                          chevron: Bool = false, tint: Color = ZenjiTokens.label) -> some View {
        HStack {
            rowLabelContent(symbol, title, tint: tint)
            Spacer()
            if let value {
                Text(value)
                    .font(.zenjiTabular(.body))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
            }
            if chevron {
                Image(systemName: "chevron.forward")
                    .font(.zenji(.footnote, weight: .semibold))
                    .foregroundStyle(Color(uiColor: .tertiaryLabel))
            }
        }
        .contentShape(Rectangle())
    }

    private func rowLabelContent(_ symbol: String, _ title: String,
                                 tint: Color = ZenjiTokens.label) -> some View {
        Label {
            Text(title)
                .font(.zenji(.body))
                .foregroundStyle(tint)
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(tint == ZenjiTokens.destructive ? ZenjiTokens.destructive : ZenjiTokens.accent)
        }
    }

    private func groupHeader(_ text: String) -> some View {
        Text(text)
            .font(.zenji(.footnote, weight: .semibold))
            .foregroundStyle(ZenjiTokens.secondaryLabel)
    }
}

// MARK: - "Hva jeg følger" (re-homed from AssistantPanel.profileSection)

/// The follow list, pushed from Deg › Hva jeg følger. Renders `viewModel.profile`
/// with the SAME per-rule «Fjern» the ark used (`AssistantViewModel.removeRule`) —
/// no follow logic re-implemented, just relocated to its own screen.
private struct FollowedRulesView: View {
    var viewModel: AssistantViewModel

    var body: some View {
        List {
            if viewModel.profile.isEmpty {
                Section {
                    Text("Ingenting ennå. Skriv en ytring i linjen nederst på agendaen for å begynne.")
                        .font(.zenji(.subheadline))
                        .foregroundStyle(ZenjiTokens.secondaryLabel)
                }
                .listRowBackground(ZenjiTokens.cell)
            } else {
                Section {
                    ForEach(viewModel.profile.rules) { rule in
                        ruleRow(rule)
                    }
                }
                .listRowBackground(ZenjiTokens.cell)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(ZenjiTokens.background)
        .navigationTitle("Hva jeg følger")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func ruleRow(_ rule: InterestRule) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(rule.entityName)
                    .font(.zenji(.body, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.label)
                Spacer()
                Button("Fjern") { viewModel.removeRule(rule) }
                    .font(.zenji(.subheadline))
                    .foregroundStyle(ZenjiTokens.destructive.opacity(0.85))
                    .buttonStyle(.borderless)
                    .zenjiTapTarget()
            }
            Text(ruleSubtitle(rule))
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.secondaryLabel)
            Text(rule.reason)
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.secondaryLabel.opacity(0.8))
        }
        .padding(.vertical, 4)
    }

    private func ruleSubtitle(_ rule: InterestRule) -> String {
        var parts = [SportVocabulary.display(for: rule.sport)]
        if let scope = rule.scope, !scope.isEmpty { parts.append(scope) }
        if !rule.lens.isDefault { parts.append(rule.lens.label) }
        parts.append("vekt \(String(format: "%.1f", rule.weight))")
        return parts.joined(separator: " · ")
    }
}

// MARK: - "Det jeg ikke forsto" (re-homed from AssistantPanel.misunderstoodSection)

/// The misunderstood-utterance log, pushed from Deg › Det jeg ikke forsto. Re-uses
/// `MisunderstoodEntryRow` and the SAME view-model actions (export / delete /
/// note) the ark used — nothing re-implemented.
private struct MisunderstoodView: View {
    var viewModel: AssistantViewModel

    var body: some View {
        List {
            Section {
                if viewModel.misunderstoodEntries.isEmpty {
                    Text("Ingenting her ennå — det dukker opp når jeg ikke klarer å gjøre en ytring om til en endring.")
                        .font(.zenji(.subheadline))
                        .foregroundStyle(ZenjiTokens.secondaryLabel)
                } else {
                    ForEach(viewModel.misunderstoodEntries) { entry in
                        MisunderstoodEntryRow(
                            entry: entry,
                            onSaveNote: { note in viewModel.setMisunderstoodNote(note, for: entry) },
                            onDelete: { viewModel.deleteMisunderstood(entry) }
                        )
                    }
                }
            } footer: {
                if !viewModel.misunderstoodEntries.isEmpty {
                    HStack(spacing: 16) {
                        ShareLink(item: misunderstoodExportText,
                                  preview: SharePreview("forsto-ikke-rapport.json")) {
                            Text("DEL RAPPORT")
                                .font(.zenji(.caption, weight: .bold))
                                .foregroundStyle(ZenjiTokens.accent)
                        }
                        .zenjiTapTarget()
                        Spacer()
                        Button("Slett alt") { viewModel.deleteAllMisunderstood() }
                            .font(.zenji(.caption))
                            .foregroundStyle(ZenjiTokens.destructive.opacity(0.8))
                            .zenjiTapTarget()
                    }
                    .padding(.top, 4)
                }
            }
            .listRowBackground(ZenjiTokens.cell)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(ZenjiTokens.background)
        .navigationTitle("Det jeg ikke forsto")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var misunderstoodExportText: String {
        String(data: viewModel.misunderstoodExportPayload(), encoding: .utf8) ?? "[]"
    }
}

// MARK: - "Nullstill" (re-homed from AssistantPanel.resetSection)

/// The reset screen, pushed from Deg › Nullstill. Keeps the WP-32 semantics
/// verbatim: two calm entry rows, each collapsing to a SINGLE inline confirm
/// step per tap (never a "button jungle"). The host's `onReset` performs the
/// reset AND raises onboarding (ContentView.performReset) — no reset logic here.
private struct ResetView: View {
    var onReset: (ResetLevel) -> Void
    var syncEnabled: Bool

    @State private var confirming: ResetLevel?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                if let level = confirming {
                    confirmation(level)
                } else {
                    resetRow(
                        title: "Nullstill det du følger",
                        detail: "Fjerner alt du følger og viser onboarding på nytt. Det jeg vet om deg beholdes.",
                        identifier: "reset.followedOnly",
                        action: { confirming = .followedOnly }
                    )
                    resetRow(
                        title: "Slett alt om meg",
                        detail: "Det du følger OG alt jeg vet om deg, pluss loggen over det jeg ikke forsto.",
                        identifier: "reset.everything",
                        action: { confirming = .everything }
                    )
                }
            } header: {
                Text("NULLSTILL")
                    .font(.zenji(.footnote, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
            } footer: {
                Text("Dette gjelder DENNE enheten — du trenger aldri installere Zenji på nytt for å nullstille.")
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
            }
            .listRowBackground(ZenjiTokens.cell)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(ZenjiTokens.background)
        .navigationTitle("Nullstill")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func resetRow(title: String, detail: String, identifier: String,
                          action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.zenji(.body, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.destructive.opacity(0.9))
                Text(detail)
                    .font(.zenji(.caption))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityIdentifier(identifier)
    }

    private func confirmation(_ level: ResetLevel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(confirmationText(level))
                .font(.zenji(.subheadline))
                .foregroundStyle(ZenjiTokens.label)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button("Nullstill") {
                    onReset(level)
                    confirming = nil
                    dismiss()
                }
                .font(.zenji(.footnote, weight: .bold))
                .foregroundStyle(ZenjiTokens.destructive)
                .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.destructive))
                .accessibilityIdentifier("reset.confirm")
                Button("Avbryt") { confirming = nil }
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
                    .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.label))
                    .accessibilityIdentifier("reset.cancel")
            }
        }
        .padding(.vertical, 6)
    }

    private func confirmationText(_ level: ResetLevel) -> String {
        let otherDevicesNote = syncEnabled ? " Andre enheter beholder sitt til neste sync." : ""
        switch level {
        case .followedOnly:
            return "Dette sletter det du følger på denne enheten og starter onboarding på nytt. Det jeg vet om deg beholdes. Kan ikke angres.\(otherDevicesNote)"
        case .everything:
            return "Dette sletter det du følger og alt Zenji vet om deg, fra denne enheten. Kan ikke angres.\(otherDevicesNote)"
        }
    }
}

// MARK: - Del profil (re-uses ProfileSharePanel verbatim)

/// The share/import surface as a self-contained sheet, so it can be presented
/// both from Deg › Del profil AND from ContentView (the «del profil» command /
/// a scanned QR link). Wraps the WP-19 `ProfileSharePanel` unchanged.
struct ProfileShareSheet: View {
    var viewModel: AssistantViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                ProfileSharePanel(viewModel: viewModel)
                    .padding(20)
                    .frame(maxWidth: 640, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .background(ZenjiTokens.background)
            .navigationTitle("Del profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .foregroundStyle(ZenjiTokens.accent)
                }
            }
        }
    }
}
