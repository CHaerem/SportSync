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
    /// WP-31 — re-run the first-run onboarding from "Hva jeg følger". Default
    /// no-op so previews / standalone use still compile.
    var onRerunOnboarding: () -> Void = {}
    /// WP-32 — perform a confirmed reset (ContentView both calls
    /// `AssistantViewModel.resetProfile(_:)` AND raises the onboarding overlay
    /// afterwards, so it owns this closure). Default no-op so previews /
    /// standalone use still compile.
    var onReset: (ResetLevel) -> Void = { _ in }
    /// WP-32 — whether cross-device sync is actually on (CloudKit, WP-17),
    /// so the reset confirmation can honestly mention other devices only
    /// when there ARE other devices to mention. Defaults to off (the free-
    /// account build's `LocalOnlyProfileSync`).
    var syncEnabled: Bool = false
    /// «Har jeg siste versjon?» — the published truth (synced
    /// app-version.json); ContentView passes it, default nil so previews /
    /// standalone use still compile (the line then shows the stamp alone).
    var publishedAppVersion: AppVersion? = nil

    @State private var misunderstoodExpanded = false
    @State private var profileExpanded = false
    /// WP-30 — the "Hva jeg vet om deg" page (presented from the same foot as
    /// "Hva jeg følger").
    @State private var memoryPageShown = false
    /// WP-32 — the "Nullstill" disclosure + which level (if any) is mid-
    /// confirmation (nil = the two calm entry rows, non-nil = the confirm ark).
    @State private var resetExpanded = false
    @State private var confirmingReset: ResetLevel?
    /// WP-66 — read the current theme so the quick chip can show its glyph and
    /// cycle to the next state (the SAME @AppStorage key ContentView writes).
    @AppStorage(ThemeOverride.storageKey) private var themeRaw = ThemeOverride.system.rawValue
    #if DEBUG
    /// WP-69 — the DEBUG-only FM-eval screen, reached from this same foot (the
    /// existing debug surface). Never compiled into a Release build.
    @State private var evalShown = false
    #endif

    /// DEBUG screenshot harness only: force the "Nullstill" disclosure open
    /// (and optionally jump straight to one level's confirmation ark) so each
    /// state can be captured deterministically. Nil in the shipping flow —
    /// same convention as `OnboardingView.initialStep`.
    var initialResetState: ResetDemoState? = nil

    struct ResetDemoState {
        var expanded: Bool
        var confirming: ResetLevel?
    }

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
                    Rectangle().fill(ZenjiTokens.separator).frame(height: 1).padding(.vertical, 2)
                    quickChipsRow
                    profileSection
                    rerunOnboardingRow
                    memoryEntry
                    resetSection
                    misunderstoodSection
                    #if DEBUG
                    evalEntry
                    #endif
                    ProfileSharePanel(viewModel: viewModel)
                    versionLine
                }
                .padding(20)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .background(ZenjiTokens.cell)
        .foregroundStyle(ZenjiTokens.label)
        .task { viewModel.refreshAvailability() }
        .onAppear {
            if let initialResetState {
                resetExpanded = initialResetState.expanded
                confirmingReset = initialResetState.confirming
            }
        }
        // WP-66 — the «hva vet du om meg» command opens the memory page (the same
        // sheet the memoryEntry row opens), via a token the view model bumps.
        .onChange(of: viewModel.memoryRequestToken) { _, _ in memoryPageShown = true }
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

    // MARK: - Quick chips (WP-66)

    /// A FEW, quiet chips for the main app actions — flat hairline boxes in the
    /// accent (never filled pills; DESIGN.md forbudsliste), ≥44 pt tall. They run
    /// the SAME command path a typed command does (`runCommand`), so the chip and
    /// the utterance are one code path. Wraps to two rows on a narrow width so the
    /// body never scrolls horizontally.
    private var quickChipsRow: some View {
        let theme = ThemeOverride(rawValue: themeRaw) ?? .system
        let leadOn = NotificationLeadPreference.isLeadTimeEnabled()
        return VStack(alignment: .leading, spacing: 8) {
            sectionTitle("HURTIG")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { chipButtons(theme: theme, leadOn: leadOn) }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) { chip("TEMA \(theme.glyph)") { viewModel.runCommand(.setTheme(theme.next)) }
                        chip("VARSEL \(leadOn ? "●" : "○")") { viewModel.runCommand(.setNotificationLeadTime(enabled: !leadOn)) } }
                    HStack(spacing: 8) { chip("DEL PROFIL") { viewModel.runCommand(.shareProfile) }
                        chip("MITT MINNE") { viewModel.runCommand(.showMemory) } }
                }
            }
        }
    }

    @ViewBuilder
    private func chipButtons(theme: ThemeOverride, leadOn: Bool) -> some View {
        chip("TEMA \(theme.glyph)") { viewModel.runCommand(.setTheme(theme.next)) }
        chip("VARSEL \(leadOn ? "●" : "○")") { viewModel.runCommand(.setNotificationLeadTime(enabled: !leadOn)) }
        chip("DEL PROFIL") { viewModel.runCommand(.shareProfile) }
        chip("MITT MINNE") { viewModel.runCommand(.showMemory) }
    }

    private func chip(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.zenji(.caption, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .tracking(1)
        }
        .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.accent))
        .accessibilityIdentifier("chip.\(label.split(separator: " ").first.map(String.init)?.lowercased() ?? "")")
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

    // MARK: - Profile ("Hva jeg følger") — a quiet disclosure

    private var profileSection: some View {
        DisclosureGroup(isExpanded: $profileExpanded) {
            VStack(alignment: .leading, spacing: 0) {
                if viewModel.profile.isEmpty {
                    Text("Ingenting ennå. Skriv en ytring i linjen for å begynne.")
                        .font(.zenji(.footnote))
                        .foregroundStyle(ZenjiTokens.label.opacity(0.55))
                        .padding(.top, 10)
                } else {
                    ForEach(viewModel.profile.rules) { rule in ruleRow(rule) }
                }
            }
            .padding(.top, 8)
        } label: {
            Text("HVA JEG FØLGER (\(viewModel.profile.rules.count))")
                .font(.zenji(.caption, weight: .bold))
                .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                .tracking(1.5)
        }
        .tint(ZenjiTokens.secondaryLabel)
    }

    private func ruleRow(_ rule: InterestRule) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(rule.entityName)
                    .font(.zenji(.subheadline, weight: .bold))
                Spacer()
                Button("Fjern") { viewModel.removeRule(rule) }
                    .font(.zenji(.caption))
                    .foregroundStyle(ZenjiTokens.destructive.opacity(0.8))
                    .zenjiTapTarget()
            }
            Text(ruleSubtitle(rule))
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.label.opacity(0.6))
            Text(rule.reason)
                .font(.zenji(.caption2))
                .foregroundStyle(ZenjiTokens.label.opacity(0.5))
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZenjiTokens.label.opacity(0.1)).frame(height: 1)
        }
    }

    /// WP-31 — a quiet way back into the first-run flow ("say what you follow"),
    /// for someone who skipped it or wants to add more from a guided step.
    private var rerunOnboardingRow: some View {
        Button { onRerunOnboarding() } label: {
            HStack {
                Text("SETT OPP DET DU FØLGER")
                    .font(.zenji(.caption, weight: .bold))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                    .tracking(1.5)
                Spacer()
                Text("»_")
                    .font(.zenji(.footnote, weight: .semibold))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Sett opp det du følger på nytt")
    }

    private func ruleSubtitle(_ rule: InterestRule) -> String {
        var parts = [SportVocabulary.display(for: rule.sport)]
        if let scope = rule.scope, !scope.isEmpty { parts.append(scope) }
        if !rule.lens.isDefault { parts.append(rule.lens.label) }
        parts.append("vekt \(weightLabel(rule.weight))")
        return parts.joined(separator: " · ")
    }

    // MARK: - "Hva jeg vet om deg" (WP-30) — a quiet entry to the memory page

    /// A calm, chevron-free row (rhythm signals tappability, per DESIGN.md) that
    /// opens the "Hva jeg vet om deg" trust/GDPR page — sits right under "Hva
    /// jeg følger", the same foot of the ark.
    private var memoryEntry: some View {
        Button { memoryPageShown = true } label: {
            HStack {
                Text("HVA JEG VET OM DEG (\(viewModel.memoryItemCount))")
                    .font(.zenji(.caption, weight: .bold))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                    .tracking(1.5)
                Spacer()
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .sheet(isPresented: $memoryPageShown) {
            WhatIKnowView(viewModel: viewModel)
        }
    }

    // MARK: - "Nullstill" (WP-32) — reset the profile, re-onboard, no reinstall

    /// A quiet disclosure at the same foot as "Hva jeg følger"/"Hva jeg vet om
    /// deg": two calm entry rows (never a "button jungle" — each opens the
    /// SAME inline confirm-ark, one at a time) collapse to a single confirm
    /// step per tap, exactly the "Glem alt" idiom `WhatIKnowView` already uses.
    private var resetSection: some View {
        DisclosureGroup(isExpanded: $resetExpanded) {
            VStack(alignment: .leading, spacing: 14) {
                if let level = confirmingReset {
                    resetConfirmation(level)
                } else {
                    Text("Dette gjelder DENNE enheten — du trenger aldri installere Zenji på nytt for å nullstille.")
                        .font(.zenji(.caption))
                        .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                        .fixedSize(horizontal: false, vertical: true)
                    resetRow(
                        title: "Nullstill det du følger",
                        detail: "Fjerner alt du følger og viser onboarding på nytt. Det jeg vet om deg beholdes.",
                        identifier: "reset.followedOnly",
                        action: { confirmingReset = .followedOnly }
                    )
                    resetRow(
                        title: "Slett alt om meg",
                        detail: "Det du følger OG alt jeg vet om deg, pluss loggen over det jeg ikke forsto.",
                        identifier: "reset.everything",
                        action: { confirmingReset = .everything }
                    )
                }
            }
            .padding(.top, 10)
        } label: {
            Text("NULLSTILL")
                .font(.zenji(.caption, weight: .bold))
                .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                .tracking(1.5)
        }
        .tint(ZenjiTokens.secondaryLabel)
    }

    private func resetRow(title: String, detail: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.zenji(.footnote, weight: .bold))
                    .foregroundStyle(ZenjiTokens.destructive.opacity(0.85))
                Text(detail)
                    .font(.zenji(.caption2))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // An explicit label collapses the two-line VStack into a SINGLE
        // accessible button element (same pattern as the onboarding pack rows) —
        // better VoiceOver AND a stable, tappable handle for the XCUITest reset
        // flow (a plain-style button with only child texts otherwise exposes the
        // texts, not an actionable button).
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityIdentifier(identifier)
    }

    /// The rolig confirm ark (DESIGN.md — never a system alert): the exact,
    /// honest consequence in one sentence, then Nullstill/Avbryt at full
    /// comfortable size (never glyph-small). Mentions other devices ONLY when
    /// sync is actually on — an honest, not hypothetical, disclosure.
    private func resetConfirmation(_ level: ResetLevel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(resetConfirmationText(level))
                .font(.zenji(.caption))
                .foregroundStyle(ZenjiTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button("Nullstill") {
                    onReset(level)
                    confirmingReset = nil
                }
                .font(.zenji(.footnote, weight: .bold))
                .foregroundStyle(ZenjiTokens.destructive)
                .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.destructive))
                // WP-70: stable handles for the reset flow (cancel + confirm) —
                // the labels ("Nullstill"/"Avbryt") also appear elsewhere.
                .accessibilityIdentifier("reset.confirm")
                Button("Avbryt") { confirmingReset = nil }
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.6))
                    .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.label))
                    .accessibilityIdentifier("reset.cancel")
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.destructive.opacity(0.06))
        .overlay(Rectangle().stroke(ZenjiTokens.destructive.opacity(0.3), lineWidth: 1))
    }

    private func resetConfirmationText(_ level: ResetLevel) -> String {
        let otherDevicesNote = syncEnabled ? " Andre enheter beholder sitt til neste sync." : ""
        switch level {
        case .followedOnly:
            return "Dette sletter det du følger på denne enheten og starter onboarding på nytt. Det jeg vet om deg beholdes. Kan ikke angres.\(otherDevicesNote)"
        case .everything:
            return "Dette sletter det du følger og alt Zenji vet om deg, fra denne enheten. Kan ikke angres.\(otherDevicesNote)"
        }
    }

    // MARK: - "Det jeg ikke forsto" (WP-16.3)

    private var misunderstoodSection: some View {
        DisclosureGroup(isExpanded: $misunderstoodExpanded) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 16) {
                    ShareLink(item: misunderstoodExportText, preview: SharePreview("forsto-ikke-rapport.json")) {
                        Text("DEL RAPPORT")
                            .font(.zenji(.caption2, weight: .bold))
                            .foregroundStyle(ZenjiTokens.accent)
                    }
                    .disabled(viewModel.misunderstoodEntries.isEmpty)
                    .zenjiTapTarget()
                    Spacer()
                    if !viewModel.misunderstoodEntries.isEmpty {
                        Button("Slett alt") { viewModel.deleteAllMisunderstood() }
                            .font(.zenji(.caption2))
                            .foregroundStyle(ZenjiTokens.destructive.opacity(0.75))
                            .zenjiTapTarget()
                    }
                }
                if viewModel.misunderstoodEntries.isEmpty {
                    Text("Ingenting her ennå — det dukker opp når jeg ikke klarer å gjøre en ytring om til en endring.")
                        .font(.zenji(.caption))
                        .foregroundStyle(ZenjiTokens.label.opacity(0.55))
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
                .font(.zenji(.caption, weight: .bold))
                .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                .tracking(1.5)
        }
        .tint(ZenjiTokens.secondaryLabel)
    }

    private var misunderstoodExportText: String {
        String(data: viewModel.misunderstoodExportPayload(), encoding: .utf8) ?? "[]"
    }

    #if DEBUG
    // MARK: - Eval (WP-69, DEBUG only)

    /// A quiet entry to the on-device FM-eval screen at the same foot as the
    /// other developer surfaces. Compiled out of Release builds entirely (the
    /// whole EvalView + its model are `#if DEBUG`).
    private var evalEntry: some View {
        Button { evalShown = true } label: {
            HStack {
                Text("EVAL (DEBUG)")
                    .font(.zenji(.caption, weight: .bold))
                    .foregroundStyle(ZenjiTokens.label.opacity(0.5))
                    .tracking(1.5)
                Spacer()
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .sheet(isPresented: $evalShown) {
            EvalView()
        }
    }
    #endif

    /// The quiet version foot: which build is installed, and — when the
    /// synced app-version.json says so — whether a newer one exists. Muted
    /// mono, never a badge; the calmest possible «oppdater meg»-signal.
    private var versionLine: some View {
        Text(AppVersionCheck.footLine(published: publishedAppVersion))
            .font(.zenjiTabular(.caption2))
            .foregroundStyle(ZenjiTokens.secondaryLabel)
            .tracking(1.0)
            .padding(.top, 8)
            .accessibilityIdentifier("versionLine")
    }

    // MARK: - Small helpers

    /// Fades the ark away once the user has cleared everything worth showing —
    /// the "Bekreft → arket glir bort → agendaen re-kompileres" moment.
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
