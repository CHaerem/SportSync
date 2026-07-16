//
//  OnboardingView.swift
//  Zenji
//
//  WP-31 — the calm first-run experience (dossier P310's «definere»-løkke:
//  "onboarding er en samtale, ikke et skjema — ingen konkurrent lar deg SI hva
//  du bryr deg om"). Four quiet steps, all in the Tekst-TV language (mono,
//  amber, near-black, the ensō mark), no hero art, no carousel, no emoji, no
//  exclamation marks:
//
//    1. welcome    — one honest sentence about what Zenji is (når · hva · hvor)
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
//                    line ("du kan alltid si mer til Zenji") and drops the user
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
            ZenjiTokens.background.ignoresSafeArea()
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
        .foregroundStyle(ZenjiTokens.foreground)
        .task { assistant.refreshAvailability() }
        .onAppear { if let initialStep { step = initialStep } }
    }

    // MARK: - Brand header (ensō · ZENJI)

    private var brandHeader: some View {
        HStack(spacing: 8) {
            Image("EnsoMark")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
                .foregroundStyle(ZenjiTokens.accent)
                .accessibilityHidden(true)
            Text("ZENJI")
                .font(.zenjiMono(size: 22, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .tracking(2)
            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 20)
    }

    // MARK: - Step 1 · Welcome

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Velkommen")
            Text("Zenji er én rolig oversikt over idretten du følger — når det skjer, hva det er, og hvor du kan se det.")
                .font(.zenjiMono(size: 15))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)

            // The privacy moment — on-brand, true, trust-building (P350/P360).
            VStack(alignment: .leading, spacing: 6) {
                Text("PÅ TELEFONEN DIN")
                    .font(.zenjiMono(size: 11, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent.opacity(0.85))
                    .tracking(1.5)
                Text("Det du følger bor på telefonen din — aldri på en server.")
                    .font(.zenjiMono(size: 14))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(Rectangle().stroke(ZenjiTokens.accent.opacity(0.3), lineWidth: 1))

            VStack(alignment: .leading, spacing: 14) {
                Button("Kom i gang") {
                    go(to: OnboardingGate.buildStep(aiAvailable: assistant.availability.isAvailable))
                }
                .font(.zenjiMono(size: 15, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.accent, fullWidth: true))

                Button("Hopp over") { onSkip() }
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.muted)
                    .zenjiTapTarget()
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Step 2 · Converse (the primary path)

    private var converseStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Fortell meg hva du følger")
            Text("Skriv fritt på norsk — «Liverpool», «golf, mest de norske», «sjakk når Carlsen spiller». Jeg foreslår, du bekrefter. Si gjerne flere ting etter hverandre.")
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.8))
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
                .font(.zenjiMono(size: 15, weight: .semibold))
                .foregroundStyle(ZenjiTokens.muted)
                .accessibilityHidden(true)

            TextField("Skriv hva du følger …", text: $assistant.utterance, axis: .vertical)
                .font(.zenjiMono(size: 15))
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .focused($inputFocused)
                .submitLabel(.send)
                .disabled(assistant.isThinking)
                .onSubmit(submit)

            if assistant.isThinking {
                HStack(spacing: 8) {
                    BlinkingCursor()
                    Text("tenker …")
                        .font(.zenjiMono(size: 13))
                        .foregroundStyle(ZenjiTokens.muted)
                    Button("Avbryt") { assistant.cancel() }
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.muted)
                        .zenjiTapTarget()
                }
            } else if !trimmed.isEmpty {
                Button(action: submit) {
                    Text("↵")
                        .font(.zenjiMono(size: 17, weight: .semibold))
                        .foregroundStyle(ZenjiTokens.accent)
                }
                .accessibilityLabel("Send")
                .zenjiTapTarget()
            } else {
                BlinkingCursor()
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.surface)
        .overlay(Rectangle().stroke(ZenjiTokens.hairline, lineWidth: 1))
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
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.foreground.opacity(0.04))
        .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.15), lineWidth: 1))
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
                            .font(.zenjiMono(size: 16, weight: .bold))
                            .foregroundStyle(color(mutation.kind))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mutation.entity.name)
                                .font(.zenjiMono(size: 15, weight: .bold))
                            Text(mutationSubtitle(mutation))
                                .font(.zenjiMono(size: 12))
                                .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
                        }
                    }
                    HStack(spacing: 10) {
                        Button("Bekreft") { assistant.confirm(mutation) }
                            .font(.zenjiMono(size: 13, weight: .bold))
                            .foregroundStyle(ZenjiTokens.diffAdd)
                            .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.diffAdd))
                        Button("Avvis") { assistant.reject(mutation) }
                            .font(.zenjiMono(size: 13))
                            .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
                            .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.foreground))
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
                        .font(.zenjiMono(size: 13))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(rejection.suggestions, id: \.id) { suggestion in
                        Button { assistant.choose(suggestion, for: rejection) } label: {
                            Text("› \(suggestion.name)")
                                .font(.zenjiMono(size: 13, weight: .bold))
                                .foregroundStyle(ZenjiTokens.accent)
                        }
                        .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.accent, fullWidth: true))
                    }
                    Button("OK") { assistant.dismissRejection(rejection) }
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.foreground.opacity(0.6))
                        .zenjiTapTarget()
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(ZenjiTokens.diffRemove.opacity(0.06))
                .overlay(Rectangle().stroke(ZenjiTokens.diffRemove.opacity(0.3), lineWidth: 1))
            }
        }
    }

    private func explanationBlock(_ explanation: AssistantExplanation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionLabel("INGEN ENDRING")
            Text(explanation.understood)
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            Text(explanation.reason)
                .font(.zenjiMono(size: 12))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
            Button("Velg fra startpakker i stedet") { go(to: .quickPicks) }
                .font(.zenjiMono(size: 12, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .zenjiTapTarget()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZenjiTokens.foreground.opacity(0.05))
        .overlay(Rectangle().stroke(ZenjiTokens.foreground.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Step 3 · Quick picks (fallback + for everyone)

    private var quickPicksStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Velg det du bryr deg om")
            Text(quickPicksIntro)
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.8))
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
            return "Tapp for å legge til. Du kan endre alt senere, eller skrive fritt til Zenji i stedet."
        }
        // Honest degradation: Apple Intelligence is off / unsupported here.
        return "Tapp for å legge til. (Å skrive fritt til Zenji krever Apple Intelligence, som ikke er på her — men startpakkene gir deg alt du trenger.)"
    }

    private func packRow(_ pack: StarterPack) -> some View {
        let applied = assistant.isApplied(pack)
        return Button { assistant.toggleStarterPack(pack) } label: {
            HStack(alignment: .top, spacing: 12) {
                // A calm add/valgt marker — the amber dot is the whole language.
                Text(applied ? "•" : "+")
                    .font(.zenjiMono(size: 16, weight: .bold))
                    .foregroundStyle(applied ? ZenjiTokens.accent : ZenjiTokens.muted)
                    .frame(width: 14, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(pack.title)
                        .font(.zenjiMono(size: 15, weight: .bold))
                        .foregroundStyle(ZenjiTokens.foreground)
                    Text(pack.subtitle)
                        .font(.zenjiMono(size: 12))
                        .foregroundStyle(ZenjiTokens.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if applied {
                    Text("VALGT")
                        .font(.zenjiMono(size: 10, weight: .bold))
                        .foregroundStyle(ZenjiTokens.accent)
                        .tracking(1)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
            .background((applied ? ZenjiTokens.accent : ZenjiTokens.foreground).opacity(applied ? 0.08 : 0.03))
            .overlay(Rectangle().stroke((applied ? ZenjiTokens.accent : ZenjiTokens.foreground).opacity(applied ? 0.4 : 0.15), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(pack.title). \(pack.subtitle). \(applied ? "Valgt" : "Legg til")")
    }

    // MARK: - Step 4 · Landing

    private var landingStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Klart")
            if assistant.profile.isEmpty {
                Text("Du følger ingenting ennå — det er helt greit. Skriv til Zenji når som helst nederst på skjermen.")
                    .font(.zenjiMono(size: 15))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Agendaen din er klar, og viser allerede det du valgte.")
                    .font(.zenjiMono(size: 15))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
                followingNow
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Du kan alltid si mer til Zenji — skriv i kommandolinjen nederst.")
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    Text("»_")
                        .font(.zenjiMono(size: 15, weight: .semibold))
                        .foregroundStyle(ZenjiTokens.muted)
                    BlinkingCursor()
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(Rectangle().stroke(ZenjiTokens.hairline, lineWidth: 1))

            Button("Til agendaen") { onFinish() }
                .font(.zenjiMono(size: 15, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.accent, fullWidth: true))
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
                                .font(.zenjiMono(size: 13, weight: .bold))
                                .foregroundStyle(ZenjiTokens.accent)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(rule.entityName)
                                    .font(.zenjiMono(size: 14, weight: .bold))
                                Text(ruleSubtitle(rule))
                                    .font(.zenjiMono(size: 11))
                                    .foregroundStyle(ZenjiTokens.muted)
                            }
                        }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ZenjiTokens.foreground.opacity(0.03))
            .overlay(Rectangle().stroke(ZenjiTokens.hairline, lineWidth: 1))
        }
    }

    private func stepFooter(alternative: (String, () -> Void)?, primary: (String, () -> Void)) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let alternative {
                Button(alternative.0) { alternative.1() }
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.muted)
                    .zenjiTapTarget()
            }
            Button(primary.0) { primary.1() }
                .font(.zenjiMono(size: 15, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .buttonStyle(ZenjiActionButtonStyle(tint: ZenjiTokens.accent, fullWidth: true))
        }
        .padding(.top, 8)
    }

    private func stepHeading(_ text: String) -> some View {
        Text(text)
            .font(.zenjiMono(size: 20, weight: .bold))
            .foregroundStyle(ZenjiTokens.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.zenjiMono(size: 12, weight: .bold))
            .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
            .tracking(1.5)
    }

    private func unavailableBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("APPLE INTELLIGENCE")
                .font(.zenjiMono(size: 11, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent.opacity(0.8))
                .tracking(1.5)
            Text(message)
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            Button("Velg fra startpakker i stedet") { go(to: .quickPicks) }
                .font(.zenjiMono(size: 12, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
                .zenjiTapTarget()
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
        case .add: return ZenjiTokens.diffAdd
        case .update: return ZenjiTokens.accent
        case .remove: return ZenjiTokens.diffRemove
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
