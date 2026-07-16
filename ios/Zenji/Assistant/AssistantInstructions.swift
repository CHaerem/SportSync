//
//  AssistantInstructions.swift
//  Zenji
//
//  WP-71 — the on-device assistant's system prompts, extracted into a
//  FoundationModels-FREE builder so they are (a) shared by the FM assistant and
//  (b) length-testable in CI without Apple Intelligence.
//
//  WHY THIS FILE EXISTS (the WP-71 hotfix): WP-66/67/68 each grew a single,
//  monolithic prompt (all four intent arms) + a single `GeneratedTurn` schema
//  (every arm's fields) + FOUR tools, all presented on EVERY generation. That
//  fixed overhead alone overran the on-device 4096-token context, so the
//  end-to-end eval logged ~95 «Context length of 4096 was exceeded during
//  singleExtend» and collapsed to 10/55.
//
//  THE FIX — budget the prompt by SPLITTING the one big generation into two
//  small ones (WP-71 angle 4, "differensier"):
//    1. a tiny, TOOL-LESS intent classifier (`classifier`) — one string field,
//       one short prompt, no tools ⇒ a few hundred tokens total;
//    2. a FOCUSED per-arm session that carries ONLY that arm's prompt, its own
//       small @Generable schema, and ONLY the tools that arm needs (mutations →
//       searchEntities; answer → searchEvents/getProfile/getHelp; command &
//       present → no tools).
//  No single generation ever again holds all four arms' schema + all four
//  tools, so each one fits the context with wide margin — with NO capability
//  lost (all four arms, the lens, memory, and every tool remain).
//
//  TOKEN-BUDGET ASSUMPTION (documented, deliberately rough): the on-device
//  context is 4096 tokens and must hold the prompt + the tool definitions + the
//  @Generable output schema + the live conversation (utterance, every tool call
//  and its RESULT, and the generated output). Norwegian text tokenises at
//  roughly ~3.5 characters/token here, so a prompt's char count is a usable
//  proxy for its token cost. The budgets below cap each phase's FIXED prompt;
//  `AssistantInstructionsTests` is the CI tripwire that fails if a future
//  package inflates any of them.
//

import Foundation

/// Builds the assistant's system prompts. Pure string assembly over FM-free
/// value types — no FoundationModels import — so both the FM assistant and the
/// CI guard test use it. One prompt per phase (WP-71): the intent classifier
/// plus one focused prompt per intent arm.
enum AssistantInstructions {

    /// The tool-less intent classifier's prompt must stay under this.
    static let classifierBudget = 1100
    /// Each focused per-arm prompt (empty profile, no memory) must stay under
    /// this. Bump ONLY with an eval run proving the 4096-context still holds —
    /// these caps are the tripwire WP-71 added.
    static let armBudget = 1500

    // MARK: - Phase 1: the intent classifier (no tools, tiny schema)

    /// Routes an utterance to exactly one arm. Deliberately terse and tool-less,
    /// so this first generation is cheap and reliable; the chosen arm then runs
    /// its own focused session.
    static let classifier = """
    Klassifiser ytringen fra en norsk sportsfan i ÉN intent. Sett intent til én av:
    - 'mutations': bruker vil ENDRE hva som følges — følg/slutt/prioriter/mer/mindre, ELLER deklarativt («jeg liker …», «jeg følger …», «interessert i …»). Å nevne en interesse = følg den.
    - 'answer': bruker SPØR — om agendaen (hva/når/hvor) eller om appen/deg («hva kan du?», «hvordan gjør jeg X?»).
    - 'command': appen skal GJØRE noe — tema, nullstille, onboarding, dele profil/QR, «hva vet du om meg», glemme noe, varsel-ledetid, eller åpne én hendelse.
    - 'present': bruker vil MIDLERTIDIG endre hva agendaen VISER uten å endre profilen — «vis bare golf denne uka», «vis vintersport», «vis alt igjen».
    «vis <idrett/kategori>» → present; «vis <lag/hendelse>-kampen» (åpne én hendelse) → command.
    """

    // MARK: - Phase 2: focused per-arm prompts

    /// The mutation arm — carries the fan-out + entity-grounding + lens rules,
    /// plus what the user already follows / relevant memory.
    static func mutations(profile: InterestProfile, digest: String = "", canSaveMemory: Bool = false) -> String {
        """
        Bruker vil endre hva som følges. Lag mutasjoner:
        - Fan ut: ett ledd (komma/«og») = én mutasjon; kall searchEntities per ledd; utelat aldri et ledd.
        - Bart idrettsnavn («golf», «litt F1», «mer sykkel») → sport-entiteten (type 'sport'), ikke en turnering. Bestemt lag/utøver/turnering («Lyn», «Hovland», «Tour de France») → den entiteten. «all vintersport» → kategori-entiteten (type 'category').
        - Fant searchEntities ingenting for et ledd: ta det med med tom entityId + entityQuery = ordet, ikke dropp.
        - «slutt med <idrett>» → remove. Kort norsk reason per mutasjon.
        - lens: «med fokus på norske»/«bare de norske» → 'norwegians'; «bare når <utøver> spiller» → 'athletes' + lensAthleteIds (ekte id-er fra searchEntities); ellers 'sport'. Lens endrer aldri hvilken entitet, bare hvordan.\(context(profile: profile, digest: digest, canSaveMemory: canSaveMemory))
        """
    }

    /// The answer arm — agenda questions (searchEvents) vs app-help (getHelp).
    static func answer(profile: InterestProfile, digest: String = "", canSaveMemory: Bool = false) -> String {
        """
        Bruker stiller et spørsmål. Svar kort og rolig på norsk.
        - Om AGENDAEN (hva/når/hvor): bruk searchEvents, referer rader med tid/tittel/kanal, og fyll referencedEventIds med eventId-ene (kolonne 1) — et agendasvar uten rad-id-er er ugrunnet. getProfile gir hva bruker følger.
        - Om APPEN/deg («hva kan du?», «hvordan gjør jeg X?»): bruk getHelp, svar KUN derfra, nevn en konkret handling, la referencedEventIds være tom.
        - Ikke finn på hendelser; generelle spørsmål utenfor appen/agendaen: si ærlig at det er utenfor.\(context(profile: profile, digest: digest, canSaveMemory: canSaveMemory))
        """
    }

    /// The command arm — no tools; the app-action catalogue.
    static let command = """
    Bruker vil at appen skal gjøre noe. Sett command til én av: theme/reset/onboarding/share/memory/forget/notifications/open. commandArgument: theme→dark/light/system; reset→everything (alt om meg)/followed (det jeg følger); notifications→on/off; open→hendelsesnavn; forget→hva (alt for alt).
    """

    /// The present arm — no tools; a pure, ephemeral view filter.
    static let present = """
    Bruker vil MIDLERTIDIG endre hva agendaen VISER (profilen røres ikke). Sett presentFilter til en kort frase: idretter/kategorier/turneringer/utøvere + evt. vindu («golf, denne uka», «vintersport», «sykkel i dag»). «alt» nullstiller.
    """

    // MARK: - Shared context tail (profile + memory), mutations/answer only

    /// The "what the user follows" line + the retrieval digest + the saveMemory
    /// contract, appended only to the arms where personal context matters. Empty
    /// tail when there is nothing to say.
    private static func context(profile: InterestProfile, digest: String, canSaveMemory: Bool) -> String {
        let following: String
        if profile.rules.isEmpty {
            following = "Bruker følger ingenting ennå."
        } else {
            following = "Bruker følger: " + profile.rules.map { rule in
                rule.scope.map { "\(rule.entityName) (\($0))" } ?? rule.entityName
            }.joined(separator: ", ") + "."
        }
        let memoryBlock = digest.isEmpty ? "" : "\n\(digest)"
        let saveBlock = canSaveMemory ? "\nMINNE (saveMemory): uttrykker bruker noe VARIG om SEG SELV — kunnskapsnivå, spoilervern («ser på opptak, ikke røp»), varselsvindu, en preferanse — kall saveMemory ÉN gang (kind, scope, value, kort reason). Har bruker spoilervern på noe: svar på når/hvor, aldri utfall." : ""
        return "\n\n\(following)\(memoryBlock)\(saveBlock)"
    }
}
