//
//  OnboardingView.swift
//  Sportivista
//
//  WP-31 — the calm first-run experience (dossier P310's «definere»-løkke:
//  "onboarding er en samtale, ikke et skjema — ingen konkurrent lar deg SI hva
//  du bryr deg om"). Four quiet steps on the Apple-native baseline (system
//  type, one amber accent, the ensō mark), no hero art, no carousel, no emoji,
//  no exclamation marks. WP-129 — the copy speaks plainly to a non-technical
//  first-time user (say WHAT the app does before asking for anything) and points
//  at the assistant CAPSULE, never the retired inline command line:
//
//    1. welcome    — one plain-language sentence about what Sportivista does
//                    (samler når · hvor du kan se sporten du bryr deg om)
//                    + the on-device privacy moment (P350/P360).
//    2. converse   — the say-what-you-follow path (Apple Intelligence only):
//                    free Norwegian text in an inline field → the EXISTING
//                    assistant (InterestAssistant.interpret) → a calm diff the
//                    user confirms, saying several things in a row while the
//                    "Følger nå" list grows. Reuses AssistantViewModel wholesale
//                    — NOT a parallel input.
//    3. quickPicks — the tap-to-follow path that works for EVERYONE: curated
//                    Norwegian starter packs as ≥44pt tap targets. This alone
//                    gives full value on a cold start with no Apple Intelligence,
//                    and needs no understanding of the assistant.
//    4. landing    — the quiet finish: it points at the always-present assistant
//                    capsule ("du kan alltid si mer til Sportivista") and drops the
//                    user into an agenda that ALREADY reflects the choices, because
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
    /// WP-132 — «Prøv nå» / a tapped example from the assistant-intro step:
    /// finish onboarding AND open the assistant, optionally pre-filling the
    /// field with `prefill` (nil = open empty). The host owns the actual sheet.
    var onTryAssistant: (String?) -> Void
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
                        case .quickPicks: quickPicksStep
                        case .converse: converseStep
                        case .assistantIntro: assistantIntroStep
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
            Text("Sportivista samler når og hvor du kan se sporten du bryr deg om — alt i én rolig liste.")
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
                // WP-132: quick-picks is the first build step for everyone.
                Button("Kom i gang") { go(to: .quickPicks) }
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

    // MARK: - Step · Converse (the secondary «fortell med egne ord» path)

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
                alternative: ("Tilbake til startpakker", "onboarding.backToPacks", { go(to: .quickPicks) }),
                primary: ("Fortsett", "onboarding.continue", { go(to: .assistantIntro) })
            )
        }
    }

    /// The onboarding's inline conversation field — the enthusiast, say-what-you-
    /// follow input. A plain field with a `»_` prompt sigil and a blinking amber
    /// cursor / "tenker …" / send, feeding the SAME assistant the capsule opens,
    /// so onboarding feels like the app, not a wizard.
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
            Button("Tilbake til startpakker") { go(to: .quickPicks) }
                .font(.sportivistaTabular(.caption, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .sportivistaTapTarget()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SportivistaTokens.label.opacity(0.05))
        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.2), lineWidth: 1))
    }

    // MARK: - Step · Quick picks (the first build step, for everyone — WP-132)

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
                // The say-what-you-follow path is a clearly-secondary entry off
                // this step (Apple-Intelligence-gated), never the primary route.
                alternative: assistant.availability.isAvailable ? ("… eller fortell med egne ord", "onboarding.converseEntry", { go(to: .converse) }) : nil,
                primary: ("Fortsett", "onboarding.continue", { go(to: .assistantIntro) })
            )
        }
    }

    private var quickPicksIntro: String {
        if assistant.availability.isAvailable {
            return "Tapp det du vil følge — du kan velge flere. Du kan endre alt senere, eller fortelle Sportivista med egne ord."
        }
        // Honest degradation: Apple Intelligence is off / unsupported here.
        return "Tapp det du vil følge — du kan velge flere. Alt kan endres senere. (Å fortelle med egne ord krever Apple Intelligence, som ikke er på her — men startpakkene gir deg alt du trenger.)"
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

    // MARK: - Step · Assistant intro (the calm finish that SHOWS depth — WP-132)

    /// The three tappable examples of DEEP personalisation. Each is a real,
    /// currently-supported arm — a lens scope, an athlete follow, and a scoped
    /// spoiler policy (spoilervern must name a sport/entity; a blanket rule is
    /// ignored by `SpoilerShield`, so it is scoped to F1 here). The first two
    /// are pinned by eval-corpus cases (`intro-*`); all three are honest.
    private var assistantIntroExamples: [(id: String, utterance: String)] {
        [
            ("norske-tdf", "bare de norske i Tour de France"),
            ("alt-warholm", "følg alt Warholm gjør"),
            ("spoiler-f1", "ikke vis F1-resultater før jeg har sett løpet"),
        ]
    }

    private var assistantIntroStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            stepHeading("Gjør Sportivista til din")
            Text("Startpakkene er bare begynnelsen. Fortell Sportivista med egne ord, så skreddersyr den seg — helt ned på detaljnivå. Tapp et eksempel for å prøve.")
                .font(.sportivistaTabular(.subheadline, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                ForEach(assistantIntroExamples, id: \.id) { example in
                    exampleRow(example.id, example.utterance)
                }
            }

            if !assistant.availability.isAvailable, let message = assistant.availability.message {
                Text(message)
                    .font(.sportivistaTabular(.footnote, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if assistant.profile.isEmpty {
                Text("Du følger ingenting ennå — det er helt greit. Trykk assistenten nederst når du vil legge til noe.")
                    .font(.sportivistaTabular(.subheadline, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                followingNow
            }

            VStack(alignment: .leading, spacing: 14) {
                // «Prøv nå»: finish AND open the assistant (empty) so the user can
                // say anything — the primary, inviting action.
                Button("Prøv nå") { onTryAssistant(nil) }
                    .font(.sportivistaTabular(.subheadline, weight: .bold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
                    .accessibilityIdentifier("onboarding.tryAssistant")

                // The quiet skip: straight into the (already-filled) agenda.
                Button("Til agendaen") { onFinish() }
                    .font(.sportivistaTabular(.footnote, weight: .regular))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .sportivistaTapTarget()
                    .accessibilityIdentifier("onboarding.toAgenda")
            }
            .padding(.top, 4)
        }
    }

    /// One tappable deep-personalisation example — the quoted utterance in a
    /// calm row (≥44pt). A tap finishes onboarding and opens the assistant with
    /// the phrase pre-filled, so the user sees exactly how it is said.
    private func exampleRow(_ id: String, _ utterance: String) -> some View {
        Button { onTryAssistant(utterance) } label: {
            HStack(alignment: .top, spacing: 12) {
                Text("»")
                    .font(.sportivistaTabular(.callout, weight: .bold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .frame(width: 14, alignment: .leading)
                    .accessibilityHidden(true)
                Text("«\(utterance)»")
                    .font(.sportivistaTabular(.subheadline, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.sportivistaTabular(.footnote, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .accessibilityHidden(true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
            .background(SportivistaTokens.label.opacity(0.03))
            .overlay(Rectangle().stroke(SportivistaTokens.separator, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Prøv: \(utterance)")
        .accessibilityIdentifier("onboarding.example.\(id)")
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

    private func stepFooter(
        alternative: (label: String, id: String, action: () -> Void)?,
        primary: (label: String, id: String, action: () -> Void)
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let alternative {
                Button(alternative.label) { alternative.action() }
                    .font(.sportivistaTabular(.footnote, weight: .regular))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .sportivistaTapTarget()
                    .accessibilityIdentifier(alternative.id)
            }
            Button(primary.label) { primary.action() }
                .font(.sportivistaTabular(.subheadline, weight: .bold))
                .foregroundStyle(SportivistaTokens.accent)
                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
                .accessibilityIdentifier(primary.id)
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
            Button("Tilbake til startpakker") { go(to: .quickPicks) }
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
