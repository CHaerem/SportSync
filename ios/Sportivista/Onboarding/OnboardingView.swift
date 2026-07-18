//
//  OnboardingView.swift
//  Sportivista
//
//  WP-31 — the calm first-run experience (dossier P310's «definere»-løkke:
//  "onboarding er en samtale, ikke et skjema — ingen konkurrent lar deg SI hva
//  du bryr deg om"). Four quiet steps, all in the Tekst-TV language (mono,
//  amber, near-black, the ensō mark), no hero art, no carousel, no emoji, no
//  exclamation marks:
//
//    1. welcome    — one honest sentence about what Sportivista is (når · hva · hvor)
//                    + the on-device privacy moment (P350/P360).
//    2. converse   — the PRIMARY path when Apple Intelligence is available: the
//                    same »_ command-line idiom, free Norwegian text → the
//                    EXISTING assistant (InterestAssistant.interpret) → a calm
//                    diff the user confirms, saying several things in a row while
//                    the "Følger nå" list grows. This reuses AssistantViewModel
//                    wholesale — NOT a parallel input.
//    3. quickPicks — the fallback (and available to everyone): curated Norwegian
//                    starter packs as ≥44pt tap targets. This alone gives full
//                    value on a cold start with no Apple Intelligence.
//    4. landing    — the quiet finish: it points at the always-present command
//                    line ("du kan alltid si mer til Sportivista") and drops the user
//                    into an agenda that ALREADY reflects the choices, because
//                    every confirm/tap recompiled it live via onProfileChanged.
//
//  Presentation only. Every mutation goes through AssistantViewModel + the pure
//  pipeline (grounding, InterestProfile.applying, ProfileStore, EffectiveInterests).
//

import SwiftUI

struct OnboardingView: View {
    /// The SAME assistant ContentView owns — so a follow made here is the same
    /// profile the agenda behind the overlay recompiles against.
    @Bindable var assistant: AssistantViewModel
    /// Finish: mark onboarding done and drop into the (already-filled) agenda.
    var onFinish: () -> Void
    /// Skip from the welcome: mark done, leave the profile empty. The agenda's
    /// own empty state then points back at the command line.
    var onSkip: () -> Void
    /// DEBUG screenshot harness only: jump straight to a step so each state can
    /// be captured deterministically. Nil in the shipping flow (always `.welcome`).
    var initialStep: OnboardingStep? = nil

    @State private var step: OnboardingStep = .welcome
    @FocusState private var inputFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var trimmed: String {
        assistant.utterance.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ZStack {
            SportivistaTokens.background.ignoresSafeArea()
            VStack(spacing: 0) {
                brandHeader
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        switch step {
                        case .welcome: welcomeStep
                        case .converse: converseStep
                        case .quickPicks: quickPicksStep
                        case .landing: landingStep
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                    .frame(maxWidth: 640, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
            }
        }
        .foregroundStyle(SportivistaTokens.label)
        .task { assistant.refreshAvailability() }
        .onAppear { if let initialStep { step = initialStep } }
    }

    // MARK: - Brand header (ensō · SPORTIVISTA)

    private var brandHeader: some View {
        HStack(spacing: 0) {
            // Brand lock (designprofil rev 2): wordmark + amber colon.
            Text("SPORTIVISTA")
                .font(.sportivistaTabular(.title2, weight: .bold))
                .foregroundStyle(SportivistaTokens.label)
                .tracking(2)
            Text(":")
                .font(.sportivistaTabular(.title2, weight: .heavy))
                .foregroundStyle(SportivistaTokens.accent)
            Spacer()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sportivista")
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 20)
    }

    // MARK: - Step 1 · Welcome

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Velkommen")
            Text("Sportivista er én rolig oversikt over idretten du følger — når det skjer, hva det er, og hvor du kan se det.")
                .font(.sportivistaTabular(.subheadline, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)

            // The privacy moment — on-brand, true, trust-building (P350/P360).
            VStack(alignment: .leading, spacing: 6) {
                Text("PÅ TELEFONEN DIN")
                    .font(.sportivistaTabular(.caption2, weight: .bold))
                    .foregroundStyle(SportivistaTokens.accent.opacity(0.85))
                    .tracking(1.5)
                Text("Det du følger bor på telefonen din — aldri på en server.")
                    .font(.sportivistaTabular(.subheadline, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(Rectangle().stroke(SportivistaTokens.accent.opacity(0.3), lineWidth: 1))

            VStack(alignment: .leading, spacing: 14) {
                Button("Kom i gang") {
                    go(to: OnboardingGate.buildStep(aiAvailable: assistant.availability.isAvailable))
                }
                .font(.sportivistaTabular(.subheadline, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))

                Button("Hopp over") { onSkip() }
                    .font(.sportivistaTabular(.footnote, weight: .regular))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .sportivistaTapTarget()
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Step 2 · Converse (the primary path)

    private var converseStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Fortell meg hva du følger")
            Text("Skriv fritt på norsk — «Liverpool», «golf, mest de norske», «sjakk når Carlsen spiller». Jeg foreslår, du bekrefter. Si gjerne flere ting etter hverandre.")
                .font(.sportivistaTabular(.subheadline, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)

            if let message = assistant.availability.message { unavailableBanner(message) }

            promptLine

            if let error = assistant.errorMessage { errorRow(error) }
            if let tally = assistant.mutationTally { tallyBlock(tally) }
            if !assistant.pending.isEmpty { diffBlock }
            if !assistant.rejected.isEmpty { rejectionsBlock }
            if let explanation = assistant.explanation { explanationBlock(explanation) }

            followingNow

            stepFooter(
                alternative: ("Velg fra startpakker i stedet", { go(to: .quickPicks) }),
                primary: ("Ferdig", { go(to: .landing) })
            )
        }
    }

    /// The command line, reused as the onboarding input — the SAME idiom as the
    /// always-present line (mono `»_`, plain field, blinking amber cursor /
    /// "tenker …" / send), so onboarding feels like the app, not a wizard.
    private var promptLine: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("»_")
                .font(.sportivistaTabular(.subheadline, weight: .semibold))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .accessibilityHidden(true)

            TextField("Skriv hva du følger …", text: $assistant.utterance, axis: .vertical)
                .font(.sportivistaTabular(.subheadline, weight: .regular))
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .focused($inputFocused)
                .submitLabel(.send)
                .disabled(assistant.isThinking)
                .onSubmit(submit)
                // WP-70: stable handle for the onboarding converse-step flow.
                .accessibilityIdentifier("onboarding.field")

            if assistant.isThinking {
                HStack(spacing: 8) {
                    BlinkingCursor()
                    Text("tenker …")
                        .font(.sportivistaTabular(.footnote, weight: .regular))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                    Button("Avbryt") { assistant.cancel() }
                        .font(.sportivistaTabular(.caption, weight: .regular))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .sportivistaTapTarget()
                }
            } else if !trimmed.isEmpty {
                Button(action: submit) {
                    Text("↵")
                        .font(.sportivistaTabular(.body, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.accent)
                }
                .accessibilityLabel("Send")
                // WP-70: distinct id (the keyboard's `.send` return key shares the
                // "Send" label) so the onboarding converse flow can tap it.
                .accessibilityIdentifier("onboarding.send")
                .sportivistaTapTarget()
            } else {
                BlinkingCursor()
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.cell)
        .overlay(Rectangle().stroke(SportivistaTokens.separator, lineWidth: 1))
    }

    private func submit() {
        guard !trimmed.isEmpty, !assistant.isThinking else { return }
        inputFocused = false
        assistant.run()
    }

    /// WP-65 — the per-clause regnskap for a bulk utterance said during
    /// onboarding ("golf, Hovland, all vintersport …"): what landed and what
    /// wasn't found, in one calm line, so saying several things at once never
    /// hides a dropped clause. Same flow as the always-present assistant.
    private func tallyBlock(_ tally: MutationTally) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionLabel("REGNSKAP")
            Text(tally.summary)
                .font(.sportivistaTabular(.footnote, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.04))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.15), lineWidth: 1))
    }

    /// The proposal diff — the same before/after language as the assistant ark,
    /// pared down for onboarding: `+`/`±`/`−` in the semantic colours, the
    /// entity + scope + lens subtitle, the reason, and a comfortable Bekreft /
    /// Avvis per row (never glyph-small).
    private var diffBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("FORSLAG")
            ForEach(assistant.pending) { mutation in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(sign(mutation.kind))
                            .font(.sportivistaTabular(.callout, weight: .bold))
                            .foregroundStyle(color(mutation.kind))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mutation.entity.name)
                                .font(.sportivistaTabular(.subheadline, weight: .bold))
                            Text(mutationSubtitle(mutation))
                                .font(.sportivistaTabular(.caption, weight: .regular))
                                .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                        }
                    }
                    HStack(spacing: 10) {
                        Button("Bekreft") { assistant.confirm(mutation) }
                            .font(.sportivistaTabular(.footnote, weight: .bold))
                            .foregroundStyle(SportivistaTokens.live)
                            .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.live))
                        Button("Avvis") { assistant.reject(mutation) }
                            .font(.sportivistaTabular(.footnote, weight: .regular))
                            .foregroundStyle(SportivistaTokens.label.opacity(0.6))
                            .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.label))
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(color(mutation.kind).opacity(0.08))
                .overlay(Rectangle().stroke(color(mutation.kind).opacity(0.4), lineWidth: 1))
            }
        }
    }

    /// The honest "IKKE FUNNET" block with tappable «mente du …?» suggestions —
    /// the WP-16.1/16.2 always-explain contract, so the conversation never
    /// dead-ends. Falling back to quick-picks is one line away below.
    private var rejectionsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("IKKE FUNNET")
            ForEach(assistant.rejected) { rejection in
                VStack(alignment: .leading, spacing: 6) {
                    Text(rejection.explanation)
                        .font(.sportivistaTabular(.footnote, weight: .regular))
                        .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(rejection.suggestions, id: \.id) { suggestion in
                        Button { assistant.choose(suggestion, for: rejection) } label: {
                            Text("› \(suggestion.name)")
                                .font(.sportivistaTabular(.footnote, weight: .bold))
                                .foregroundStyle(SportivistaTokens.accent)
                        }
                        .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
                    }
                    Button("OK") { assistant.dismissRejection(rejection) }
                        .font(.sportivistaTabular(.caption, weight: .regular))
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

    private func explanationBlock(_ explanation: AssistantExplanation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionLabel("INGEN ENDRING")
            Text(explanation.understood)
                .font(.sportivistaTabular(.footnote, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            Text(explanation.reason)
                .font(.sportivistaTabular(.caption, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
            Button("Velg fra startpakker i stedet") { go(to: .quickPicks) }
                .font(.sportivistaTabular(.caption, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .sportivistaTapTarget()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.05))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Step 3 · Quick picks (fallback + for everyone)

    private var quickPicksStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Velg det du bryr deg om")
            Text(quickPicksIntro)
                .font(.sportivistaTabular(.subheadline, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                ForEach(StarterPacks.all) { pack in packRow(pack) }
            }

            followingNow

            stepFooter(
                alternative: assistant.availability.isAvailable ? ("Skriv i stedet", { go(to: .converse) }) : nil,
                primary: ("Ferdig", { go(to: .landing) })
            )
        }
    }

    private var quickPicksIntro: String {
        if assistant.availability.isAvailable {
            return "Tapp for å legge til. Du kan endre alt senere, eller skrive fritt til Sportivista i stedet."
        }
        // Honest degradation: Apple Intelligence is off / unsupported here.
        return "Tapp for å legge til. (Å skrive fritt til Sportivista krever Apple Intelligence, som ikke er på her — men startpakkene gir deg alt du trenger.)"
    }

    private func packRow(_ pack: StarterPack) -> some View {
        let applied = assistant.isApplied(pack)
        return Button { assistant.toggleStarterPack(pack) } label: {
            HStack(alignment: .top, spacing: 12) {
                // A calm add/valgt marker — the amber dot is the whole language.
                Text(applied ? "•" : "+")
                    .font(.sportivistaTabular(.callout, weight: .bold))
                    .foregroundStyle(applied ? SportivistaTokens.accent : SportivistaTokens.secondaryLabel)
                    .frame(width: 14, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(pack.title)
                        .font(.sportivistaTabular(.subheadline, weight: .bold))
                        .foregroundStyle(SportivistaTokens.label)
                    Text(pack.subtitle)
                        .font(.sportivistaTabular(.caption, weight: .regular))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if applied {
                    Text("VALGT")
                        .font(.sportivistaTabular(.caption2, weight: .bold))
                        .foregroundStyle(SportivistaTokens.accent)
                        .tracking(1)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
            .background((applied ? SportivistaTokens.accent : SportivistaTokens.label).opacity(applied ? 0.08 : 0.03))
            .overlay(Rectangle().stroke((applied ? SportivistaTokens.accent : SportivistaTokens.label).opacity(applied ? 0.4 : 0.15), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(pack.title). \(pack.subtitle). \(applied ? "Valgt" : "Legg til")")
        // WP-70: a stable per-pack handle for the quick-picks + rapid-toggle
        // XCUITest flows (the a11y label carries the applied state, so the test
        // needs a state-independent id to tap repeatedly).
        .accessibilityIdentifier("starterpack.\(pack.id)")
    }

    // MARK: - Step 4 · Landing

    private var landingStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Klart")
            if assistant.profile.isEmpty {
                Text("Du følger ingenting ennå — det er helt greit. Skriv til Sportivista når som helst nederst på skjermen.")
                    .font(.sportivistaTabular(.subheadline, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Agendaen din er klar, og viser allerede det du valgte.")
                    .font(.sportivistaTabular(.subheadline, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
                followingNow
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Du kan alltid si mer til Sportivista — skriv i kommandolinjen nederst.")
                    .font(.sportivistaTabular(.footnote, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    Text("»_")
                        .font(.sportivistaTabular(.subheadline, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                    BlinkingCursor()
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(Rectangle().stroke(SportivistaTokens.separator, lineWidth: 1))

            Button("Til agendaen") { onFinish() }
                .font(.sportivistaTabular(.subheadline, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
                .padding(.top, 4)
        }
    }

    // MARK: - Shared pieces

    /// The growing "Følger nå" list — the visible feedback that saying a thing
    /// (typed or tapped) landed, exactly the same profile the agenda compiles
    /// against.
    @ViewBuilder
    private var followingNow: some View {
        if !assistant.profile.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                sectionLabel("FØLGER NÅ (\(assistant.profile.rules.count))")
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(assistant.profile.rules) { rule in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•")
                                .font(.sportivistaTabular(.footnote, weight: .bold))
                                .foregroundStyle(SportivistaTokens.accent)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(rule.entityName)
                                    .font(.sportivistaTabular(.subheadline, weight: .bold))
                                Text(ruleSubtitle(rule))
                                    .font(.sportivistaTabular(.caption2, weight: .regular))
                                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                            }
                        }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SportivistaTokens.label.opacity(0.03))
            .overlay(Rectangle().stroke(SportivistaTokens.separator, lineWidth: 1))
        }
    }

    private func stepFooter(alternative: (String, () -> Void)?, primary: (String, () -> Void)) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let alternative {
                Button(alternative.0) { alternative.1() }
                    .font(.sportivistaTabular(.footnote, weight: .regular))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .sportivistaTapTarget()
            }
            Button(primary.0) { primary.1() }
                .font(.sportivistaTabular(.subheadline, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
        }
        .padding(.top, 8)
    }

    private func stepHeading(_ text: String) -> some View {
        Text(text)
            .font(.sportivistaTabular(.title3, weight: .bold))
            .foregroundStyle(SportivistaTokens.label)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.sportivistaTabular(.caption, weight: .bold))
            .foregroundStyle(SportivistaTokens.label.opacity(0.5))
            .tracking(1.5)
    }

    private func unavailableBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("APPLE INTELLIGENCE")
                .font(.sportivistaTabular(.caption2, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent.opacity(0.8))
                .tracking(1.5)
            Text(message)
                .font(.sportivistaTabular(.footnote, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            Button("Velg fra startpakker i stedet") { go(to: .quickPicks) }
                .font(.sportivistaTabular(.caption, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .sportivistaTapTarget()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.accent.opacity(0.10))
        .overlay(Rectangle().stroke(SportivistaTokens.accent.opacity(0.35), lineWidth: 1))
    }

    private func errorRow(_ error: String) -> some View {
        Text(error)
            .font(.sportivistaTabular(.footnote, weight: .regular))
            .foregroundStyle(SportivistaTokens.destructive)
    }

    private func go(to next: OnboardingStep) {
        inputFocused = false
        if reduceMotion {
            step = next
        } else {
            withAnimation(.easeOut(duration: 0.15)) { step = next }
        }
    }

    // MARK: - Formatting

    private func sign(_ kind: MutationKind) -> String {
        switch kind {
        case .add: return "+"
        case .update: return "±"
        case .remove: return "−"
        }
    }

    private func color(_ kind: MutationKind) -> Color {
        switch kind {
        case .add: return SportivistaTokens.live
        case .update: return SportivistaTokens.accent
        case .remove: return SportivistaTokens.destructive
        }
    }

    private func mutationSubtitle(_ mutation: GroundedMutation) -> String {
        var parts = [SportVocabulary.display(for: mutation.entity.sport)]
        if let scope = mutation.scope, !scope.isEmpty { parts.append(scope) }
        if mutation.kind != .remove, !mutation.lens.isDefault { parts.append(mutation.lens.label) }
        return parts.joined(separator: " · ")
    }

    private func ruleSubtitle(_ rule: InterestRule) -> String {
        var parts = [SportVocabulary.display(for: rule.sport)]
        if let scope = rule.scope, !scope.isEmpty { parts.append(scope) }
        if !rule.lens.isDefault { parts.append(rule.lens.label) }
        return parts.joined(separator: " · ")
    }
}
