//
//  AssistantViewModel.swift
//  Zenji
//
//  WP-16 — the FM-lekegrind's view model. Orchestrates the one flow the screen
//  needs: utterance → model proposal → HARD grounding → a reviewable DIFF the
//  user confirms/rejects per mutation → persisted profile. Follows the app's
//  usual @MainActor @Observable pattern (AgendaViewModel); the genuinely
//  logic-bearing steps it calls are all pure and separately tested
//  (`MockInterestParser`, `MutationGrounder`, `InterestProfile.applying`,
//  `ProfileStore`), so this type is a thin, testable coordinator rather than a
//  place logic hides.
//
//  It depends only on the `InterestAssistant` PROTOCOL, so AssistantViewModel
//  Tests inject `MockInterestAssistant` (FM can't run in CI) and the shipping
//  app injects `FoundationModelsInterestAssistant` — the code path is identical.
//

import Foundation
import Observation

@MainActor
@Observable
final class AssistantViewModel {
    /// Whether the on-device model can be used — drives the honest "off" banner.
    private(set) var availability: AssistantAvailability
    /// The current, persisted profile ("Hva jeg følger").
    private(set) var profile: InterestProfile
    /// Grounded mutations awaiting the user's Bekreft/Avvis.
    private(set) var pending: [GroundedMutation] = []
    /// Proposals rejected by grounding — shown as honest "fant ikke …" notes.
    private(set) var rejected: [RejectedMutation] = []

    /// Bound to the text field.
    var utterance: String = ""
    private(set) var isThinking = false
    /// A blocking error (model unavailable / generation failed) shown verbatim.
    private(set) var errorMessage: String?
    /// The always-explain account (WP-16.1): set WHENEVER a submitted utterance
    /// produced no confirmable change, instead of the old dead-end "fant ingen
    /// endringer" note. Nil when there are pending mutations to review.
    private(set) var explanation: AssistantExplanation?

    private let assistant: any InterestAssistant
    private let profileStore: ProfileStore
    private let index: EntityIndex

    /// Designated initializer — everything injected, for tests + previews.
    init(assistant: any InterestAssistant, profileStore: ProfileStore, index: EntityIndex) {
        self.assistant = assistant
        self.profileStore = profileStore
        self.index = index
        self.profile = profileStore.load()
        self.availability = assistant.availability()
    }

    /// App wiring: the real FM assistant + the on-disk profile + the synced
    /// entity index from the WP-12 cache.
    convenience init(
        dataStore: DataStore = DataStore(),
        assistant: any InterestAssistant = FoundationModelsInterestAssistant(),
        profileStore: ProfileStore = ProfileStore()
    ) {
        self.init(assistant: assistant, profileStore: profileStore, index: EntityIndex(dataStore.loadEntities()))
    }

    /// The entity index arrived (has been synced)? Used to warn honestly when
    /// nothing can be grounded because the index hasn't downloaded yet.
    var hasEntities: Bool { !index.isEmpty }

    /// Re-reads availability (the model can become ready after app start, or the
    /// user can toggle Apple Intelligence in Settings while the sheet is open).
    func refreshAvailability() {
        availability = assistant.availability()
    }

    /// Runs one utterance through the model + grounding. Never throws — a
    /// failure lands in `errorMessage`, an empty result in `notice`.
    func submit() async {
        let text = utterance.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        errorMessage = nil
        explanation = nil
        pending = []
        rejected = []
        isThinking = true
        defer { isThinking = false }

        do {
            let proposals = try await assistant.propose(utterance: text, profile: profile, index: index)
            let result = MutationGrounder.ground(proposals, index: index, profile: profile)
            pending = result.grounded
            rejected = result.rejected
            // The always-explain rule: no confirmable change is NEVER a bare
            // "fant ingen endringer" — build an honest, structured account.
            if pending.isEmpty {
                explanation = AssistantExplanation.make(
                    utterance: text, proposals: proposals, result: result, hasEntities: hasEntities
                )
            }
        } catch let error as AssistantError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = "Noe gikk galt: \(error.localizedDescription)"
        }
    }

    /// Confirms a single mutation — applies it to the profile and persists.
    func confirm(_ mutation: GroundedMutation) {
        profile = profile.applying(mutation)
        persist()
        pending.removeAll { $0.id == mutation.id }
    }

    /// Confirms every pending mutation at once.
    func confirmAll() {
        guard !pending.isEmpty else { return }
        profile = profile.applying(pending)
        persist()
        pending = []
    }

    /// Discards a proposed mutation without touching the profile.
    func reject(_ mutation: GroundedMutation) {
        pending.removeAll { $0.id == mutation.id }
    }

    func dismissRejection(_ rejection: RejectedMutation) {
        rejected.removeAll { $0.id == rejection.id }
    }

    /// Directly unfollow an existing rule from the "Hva jeg følger" list.
    func removeRule(_ rule: InterestRule) {
        if let entity = index.entity(id: rule.entityId) {
            profile = profile.applying(GroundedMutation(
                kind: .remove, entity: entity, scope: nil, weight: rule.weight,
                reason: "Fjernet manuelt.", previousRule: rule
            ))
        } else {
            // Entity dropped out of the index — remove the rule directly.
            profile = InterestProfile(rules: profile.rules.filter { $0.entityId != rule.entityId })
        }
        persist()
    }

    private func persist() {
        do {
            try profileStore.save(profile)
        } catch {
            errorMessage = "Klarte ikke å lagre profilen din."
        }
    }
}
