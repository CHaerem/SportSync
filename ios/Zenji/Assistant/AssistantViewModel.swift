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

    /// The local "forsto ikke"-log (WP-16.3): every submit that ended without
    /// an applied mutation, most-recent first. Reloaded after every write so
    /// the UI list stays in sync with no manual pull-to-refresh.
    private(set) var misunderstoodEntries: [MisunderstoodEntry] = []
    /// Entries still needing attention — a `resolved` one (WP-16.3 §3, a later
    /// "mente du" pick that got confirmed) no longer counts toward the badge.
    var misunderstoodCount: Int { misunderstoodEntries.filter { !$0.isResolved }.count }

    private let assistant: any InterestAssistant
    private let profileStore: ProfileStore
    private let index: EntityIndex
    private let misunderstoodLog: MisunderstoodLogStore

    // MARK: - WP-16.3 in-memory batch bookkeeping — never persisted itself;
    // just enough state about the CURRENT `pending` batch to (a) log
    // `.allRejectedByUser` with the right utterance if the user rejects every
    // mutation in it without confirming any, and (b) resolve a prior
    // rejected-entity log entry if a "mente du" pick it produced gets confirmed.
    private var pendingBatchUtterance = ""
    private var pendingBatchEntityNames: [String] = []
    private var pendingBatchConfirmedAny = false
    /// Maps a "mente du"-derived `GroundedMutation.id` (from `choose(_:for:)`)
    /// back to the misunderstood-log entry it should resolve if confirmed.
    private var mentedFromLogId: [String: UUID] = [:]
    /// The log entry id (if any) created by the MOST RECENT submit() — the
    /// window during which `choose(_:for:)` can still tie a "mente du" rescue
    /// back to it. Reset every submit().
    private var activeMisunderstoodLogId: UUID?

    /// Designated initializer — everything injected, for tests + previews.
    init(assistant: any InterestAssistant, profileStore: ProfileStore, index: EntityIndex, misunderstoodLog: MisunderstoodLogStore = MisunderstoodLogStore()) {
        self.assistant = assistant
        self.profileStore = profileStore
        self.index = index
        self.misunderstoodLog = misunderstoodLog
        self.profile = profileStore.load()
        self.availability = assistant.availability()
        self.misunderstoodEntries = misunderstoodLog.load()
    }

    /// App wiring: the real FM assistant + the on-disk profile + the synced
    /// entity index from the WP-12 cache.
    convenience init(
        dataStore: DataStore = DataStore(),
        assistant: any InterestAssistant = FoundationModelsInterestAssistant(),
        profileStore: ProfileStore = ProfileStore(),
        misunderstoodLog: MisunderstoodLogStore = MisunderstoodLogStore()
    ) {
        self.init(assistant: assistant, profileStore: profileStore, index: EntityIndex(dataStore.loadEntities()), misunderstoodLog: misunderstoodLog)
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
        // A fresh batch starts here (WP-16.3) — reset before either outcome.
        pendingBatchUtterance = ""
        pendingBatchEntityNames = []
        pendingBatchConfirmedAny = false
        activeMisunderstoodLogId = nil

        do {
            let proposals = try await assistant.propose(utterance: text, profile: profile, index: index)
            let result = MutationGrounder.ground(proposals, index: index, profile: profile)
            pending = result.grounded
            rejected = result.rejected
            // The always-explain rule: no confirmable change is NEVER a bare
            // "fant ingen endringer" — build an honest, structured account.
            if pending.isEmpty {
                let exp = AssistantExplanation.make(
                    utterance: text, proposals: proposals, result: result, hasEntities: hasEntities
                )
                explanation = exp
                // WP-16.3: log it, unless the sole reason is the entity index
                // not having synced yet — that's a transient environment state,
                // not a misunderstood utterance, and isn't useful raw material
                // for the next iteration.
                if hasEntities {
                    if !result.rejected.isEmpty {
                        activeMisunderstoodLogId = logMisunderstood(utterance: text, outcome: .rejectedEntity, explanation: exp)
                    } else if proposals.isEmpty {
                        logMisunderstood(utterance: text, outcome: .emptyModelResponse, explanation: exp)
                    }
                }
            } else {
                // A confirmable batch — remember it so a later "reject everything"
                // can be logged as `.allRejectedByUser` (WP-16.3).
                pendingBatchUtterance = text
                pendingBatchEntityNames = pending.map(\.entity.name)
            }
        } catch let error as AssistantError {
            errorMessage = error.errorDescription
            // WP-16.3: `.generationFailed` means the model had an utterance but
            // could not turn it into a valid structured mutation — the
            // "inexpressible" outcome. `.unavailable` is a device-state gate
            // (Apple Intelligence off), not a misunderstood utterance, so it is
            // deliberately NOT logged here.
            if case let .generationFailed(message) = error {
                logMisunderstood(
                    utterance: text,
                    outcome: .inexpressible,
                    explanation: AssistantExplanation(
                        understood: "Jeg leste ytringen din som «\(text)», men klarte ikke å generere en gyldig endring.",
                        reason: message
                    )
                )
            }
        } catch {
            errorMessage = "Noe gikk galt: \(error.localizedDescription)"
        }
    }

    /// Confirms a single mutation — applies it to the profile and persists.
    func confirm(_ mutation: GroundedMutation) {
        profile = profile.applying(mutation)
        persist()
        pending.removeAll { $0.id == mutation.id }
        pendingBatchConfirmedAny = true
        resolveIfMentedFrom(mutation)
    }

    /// Confirms every pending mutation at once.
    func confirmAll() {
        guard !pending.isEmpty else { return }
        for mutation in pending { resolveIfMentedFrom(mutation) }
        profile = profile.applying(pending)
        persist()
        pendingBatchConfirmedAny = true
        pending = []
    }

    /// Discards a proposed mutation without touching the profile. If this was
    /// the LAST pending mutation in the batch and NONE of them were ever
    /// confirmed, the whole utterance is logged as `.allRejectedByUser`
    /// (WP-16.3) — the model understood it fine, the user just disagreed.
    func reject(_ mutation: GroundedMutation) {
        let hadItem = pending.contains { $0.id == mutation.id }
        pending.removeAll { $0.id == mutation.id }
        mentedFromLogId.removeValue(forKey: mutation.id)
        if hadItem, pending.isEmpty, !pendingBatchConfirmedAny, !pendingBatchUtterance.isEmpty {
            let exp = AssistantExplanation(
                understood: "Jeg foreslo å endre \(pendingBatchEntityNames.joined(separator: ", ")) ut fra «\(pendingBatchUtterance)».",
                reason: "Du avviste alle de foreslåtte endringene uten å bekrefte noen av dem."
            )
            logMisunderstood(utterance: pendingBatchUtterance, outcome: .allRejectedByUser, explanation: exp)
            pendingBatchUtterance = "" // guard against a stray repeat reject() re-logging
        }
    }

    func dismissRejection(_ rejection: RejectedMutation) {
        rejected.removeAll { $0.id == rejection.id }
    }

    /// WP-16.2: the user tapped a "mente du …?" suggestion. Re-ground the
    /// ORIGINAL proposal with the chosen entity id substituted in — so the
    /// intent (add/remove, scope, weight, the «med fokus på norske» lens)
    /// survives — and move the resolved mutation into the reviewable DIFF
    /// (`pending`), exactly like any other proposal. The user still confirms it
    /// with Bekreft; nothing is applied by the tap alone. Never a dead button.
    func choose(_ suggestion: Entity, for rejection: RejectedMutation) {
        var proposal = rejection.proposal
        proposal.entityId = suggestion.id
        let result = MutationGrounder.ground([proposal], index: index, profile: profile)
        pending.append(contentsOf: result.grounded)
        rejected.removeAll { $0.id == rejection.id }
        // WP-16.3 §3: this rescue traces back to the utterance that got logged
        // as `.rejectedEntity` at submit() time — if the rescued mutation is
        // later confirmed, that log entry should flip to resolved.
        if let logId = activeMisunderstoodLogId {
            for m in result.grounded { mentedFromLogId[m.id] = logId }
        }
        // The explanation ("INGEN ENDRING") no longer applies once there's a
        // confirmable change on screen.
        if !pending.isEmpty { explanation = nil }
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

    // MARK: - WP-16.3 — "Det jeg ikke forsto"

    /// The user's own note on what an utterance actually meant.
    func setMisunderstoodNote(_ note: String?, for entry: MisunderstoodEntry) {
        misunderstoodLog.setNote(note, for: entry.id)
        refreshMisunderstoodLog()
    }

    /// Deletes one entry.
    func deleteMisunderstood(_ entry: MisunderstoodEntry) {
        misunderstoodLog.delete(entry.id)
        refreshMisunderstoodLog()
    }

    /// Deletes the whole log ("Slett alt").
    func deleteAllMisunderstood() {
        misunderstoodLog.deleteAll()
        refreshMisunderstoodLog()
    }

    /// The anonymised JSON payload for "Del rapport" (utterance/outcome/
    /// explanation/note/timestamp/resolved only — never anything about the
    /// device or the person) — the UI hands this straight to a `ShareLink`.
    func misunderstoodExportPayload() -> Data {
        misunderstoodLog.exportPayload()
    }

    @discardableResult
    private func logMisunderstood(utterance: String, outcome: MisunderstoodOutcome, explanation: AssistantExplanation) -> UUID {
        let id = misunderstoodLog.record(utterance: utterance, outcome: outcome, explanation: explanation)
        refreshMisunderstoodLog()
        return id
    }

    /// If `mutation` was rescued via a "mente du" tap (`choose(_:for:)`) that
    /// traced back to a logged utterance, mark that log entry resolved — a
    /// success case, kept (and exported) but no longer counted as unresolved.
    private func resolveIfMentedFrom(_ mutation: GroundedMutation) {
        guard let logId = mentedFromLogId.removeValue(forKey: mutation.id) else { return }
        misunderstoodLog.markResolved(logId)
        refreshMisunderstoodLog()
    }

    private func refreshMisunderstoodLog() {
        misunderstoodEntries = misunderstoodLog.load()
    }

    private func persist() {
        do {
            try profileStore.save(profile)
        } catch {
            errorMessage = "Klarte ikke å lagre profilen din."
        }
    }
}
