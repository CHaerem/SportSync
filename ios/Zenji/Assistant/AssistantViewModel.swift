//
//  AssistantViewModel.swift
//  Zenji
//
//  WP-16 → WP-16.4 — the assistant's view model. WP-16 orchestrated one flow:
//  utterance → model proposal → HARD grounding → a reviewable DIFF the user
//  confirms/rejects per mutation → persisted profile. WP-16.4 makes it the
//  brain behind the always-present command line and adds three things without
//  disturbing that flow:
//
//    • INTENT ROUTING — `submit()` now interprets the utterance as EITHER
//      mutations (the WP-16 diff flow, unchanged) OR an `answer` to a question
//      about the agenda, answered from the local `FeedQuery`.
//    • CONTEXT FOLLOW — `proposeFollow(_:)` pre-fills an add-mutation from the
//      event detail sheet straight into the SAME grounded diff/confirm flow.
//    • IMMEDIATE CONSEQUENCE — every applied mutation calls `onProfileChanged`,
//      which ContentView wires to recompile the agenda on the spot.
//
//  Still a thin coordinator over pure, separately-tested pieces
//  (MockInterestParser/MockAnswerer, MutationGrounder, FeedQuery,
//  InterestProfile.applying, ProfileStore, MisunderstoodLogStore); it depends
//  only on the `InterestAssistant` PROTOCOL, so tests inject the deterministic
//  mock and the shipping app injects the FoundationModels one — same path.
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
    /// WP-16.4 — the answer to a question, resolved to displayable rows. Nil
    /// unless the last submit routed to the answer arm.
    private(set) var answer: AssistantAnswerResult?

    /// Bound to the command-line text field.
    var utterance: String = ""
    private(set) var isThinking = false
    /// A blocking error (model unavailable / generation failed) shown verbatim.
    private(set) var errorMessage: String?
    /// The always-explain account (WP-16.1): set WHENEVER a submitted utterance
    /// produced no confirmable change (or an empty answer), instead of a
    /// dead-end. Nil when there are pending mutations or an answer to show.
    private(set) var explanation: AssistantExplanation?

    /// WP-16.4 — bumped whenever there's a fresh presentable result (a diff, an
    /// answer, an explanation, an error, or a pre-filled follow). ContentView
    /// observes it to raise the assistant panel over the agenda.
    private(set) var presentToken = 0
    /// WP-16.4 — called after any mutation is APPLIED, so the host can recompile
    /// the agenda immediately ("umiddelbar konsekvens"). Set by ContentView.
    var onProfileChanged: (() -> Void)?

    /// The local "forsto ikke"-log (WP-16.3): every submit that ended without
    /// an applied mutation, most-recent first.
    private(set) var misunderstoodEntries: [MisunderstoodEntry] = []
    /// Entries still needing attention — a `resolved` one no longer counts.
    var misunderstoodCount: Int { misunderstoodEntries.filter { !$0.isResolved }.count }

    /// Anything worth raising the panel for.
    var hasPresentableResult: Bool {
        !pending.isEmpty || !rejected.isEmpty || explanation != nil || answer != nil || errorMessage != nil
            || lastImportSummary != nil || shareImportMessage != nil
    }

    private let assistant: any InterestAssistant
    private let profileStore: ProfileStore
    private let index: EntityIndex
    private let misunderstoodLog: MisunderstoodLogStore
    /// WP-16.4 — builds the local agenda the answer arm queries, fresh per
    /// submit (so a just-confirmed follow is reflected). Defaults to an empty
    /// feed for the mutation-only unit tests that don't inject one.
    private let feedProvider: () -> FeedQuery
    /// WP-16.4 — the in-flight interpret task, so the command line can cancel it.
    private var currentTask: Task<Void, Never>?

    // MARK: - WP-16.3 in-memory batch bookkeeping (unchanged from WP-16.3)
    private var pendingBatchUtterance = ""
    private var pendingBatchEntityNames: [String] = []
    private var pendingBatchConfirmedAny = false
    private var mentedFromLogId: [String: UUID] = [:]
    private var activeMisunderstoodLogId: UUID?

    /// Designated initializer — everything injected, for tests + previews.
    init(
        assistant: any InterestAssistant,
        profileStore: ProfileStore,
        index: EntityIndex,
        misunderstoodLog: MisunderstoodLogStore = MisunderstoodLogStore(),
        feedProvider: @escaping () -> FeedQuery = { FeedQuery(now: Date()) }
    ) {
        self.assistant = assistant
        self.profileStore = profileStore
        self.index = index
        self.misunderstoodLog = misunderstoodLog
        self.feedProvider = feedProvider
        self.profile = profileStore.load()
        self.availability = assistant.availability()
        self.misunderstoodEntries = misunderstoodLog.load()
    }

    /// App wiring: the real FM assistant + the on-disk profile + the synced
    /// entity index and agenda from the WP-12 cache. The feed provider re-reads
    /// events every submit and folds the local profile into the effective
    /// interests, so the answer arm sees exactly the agenda on screen.
    convenience init(
        dataStore: DataStore = DataStore(),
        assistant: any InterestAssistant = FoundationModelsInterestAssistant(),
        profileStore: ProfileStore = ProfileStore(),
        misunderstoodLog: MisunderstoodLogStore = MisunderstoodLogStore()
    ) {
        self.init(
            assistant: assistant,
            profileStore: profileStore,
            index: EntityIndex(dataStore.loadEntities()),
            misunderstoodLog: misunderstoodLog,
            feedProvider: {
                let events = dataStore.loadEvents()
                let base = dataStore.loadInterests() ?? Interests()
                let idx = EntityIndex(dataStore.loadEntities())
                let profile = profileStore.load()
                let effective = EffectiveInterests.merge(profile: profile, into: base, index: idx)
                return FeedQuery.build(events: events, interests: effective, now: Date())
            }
        )
    }

    /// The entity index arrived (has been synced)? Used to warn honestly when
    /// nothing can be grounded because the index hasn't downloaded yet.
    var hasEntities: Bool { !index.isEmpty }

    func refreshAvailability() { availability = assistant.availability() }

    // MARK: - Submit (intent routing)

    /// Fire-and-forget, cancellable entry the command line uses.
    func run() {
        currentTask?.cancel()
        currentTask = Task { await submit() }
    }

    /// WP-16.4 — cancel the in-flight interpretation (the command line's
    /// "Avbryt" while the cursor is blinking "tenker …"). The blinking marker,
    /// never a spinner, is the whole thinking language.
    func cancel() {
        currentTask?.cancel()
        currentTask = nil
        isThinking = false
    }

    /// Runs one utterance through the model + routing. Never throws — a failure
    /// lands in `errorMessage`, an empty mutation result in `explanation`.
    func submit() async {
        let text = utterance.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        resetResults()
        isThinking = true
        defer { isThinking = false }
        resetBatch()

        let feed = feedProvider()
        do {
            let turn = try await assistant.interpret(utterance: text, profile: profile, index: index, feed: feed)
            guard !Task.isCancelled else { return }
            switch turn {
            case .mutations(let proposals):
                applyMutations(text: text, proposals: proposals)
            case .answer(let ans):
                applyAnswer(text: text, answer: ans, feed: feed)
            }
        } catch let error as AssistantError {
            guard !Task.isCancelled else { return }
            errorMessage = error.errorDescription
            // WP-16.3: `.generationFailed` is the "inexpressible" outcome;
            // `.unavailable` is a device-state gate, deliberately NOT logged.
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
            guard !Task.isCancelled else { return }
            errorMessage = "Noe gikk galt: \(error.localizedDescription)"
        }

        if hasPresentableResult { presentToken &+= 1 }
    }

    /// The WP-16 mutation flow (grounding + always-explain + WP-16.3 logging),
    /// unchanged apart from being one arm of the router now.
    private func applyMutations(text: String, proposals: [ProposedMutation]) {
        let result = MutationGrounder.ground(proposals, index: index, profile: profile)
        pending = result.grounded
        rejected = result.rejected
        if pending.isEmpty {
            let exp = AssistantExplanation.make(
                utterance: text, proposals: proposals, result: result, hasEntities: hasEntities
            )
            explanation = exp
            if hasEntities {
                if !result.rejected.isEmpty {
                    activeMisunderstoodLogId = logMisunderstood(utterance: text, outcome: .rejectedEntity, explanation: exp)
                } else if proposals.isEmpty {
                    logMisunderstood(utterance: text, outcome: .emptyModelResponse, explanation: exp)
                }
            }
        } else {
            pendingBatchUtterance = text
            pendingBatchEntityNames = pending.map(\.entity.name)
        }
    }

    /// WP-16.4 — the answer arm. An empty answer isn't a phantom row: it becomes
    /// an honest always-explain account (never logged as a mutation miss).
    private func applyAnswer(text: String, answer: AssistantAnswer, feed: FeedQuery) {
        let trimmed = answer.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            explanation = AssistantExplanation(
                understood: "Jeg forsto «\(text)» som et spørsmål.",
                reason: "Jeg fant ingenting i agendaen din å svare med akkurat nå."
            )
            return
        }
        self.answer = AssistantAnswerResult(text: trimmed, rows: feed.rows(forIds: answer.referencedEventIds))
    }

    // MARK: - Context follow (WP-16.4 — the detail sheet's «Følg X»)

    /// Pre-fill an add-mutation for `entity` and drop it straight into the SAME
    /// grounded diff/confirm flow a typed "Følg X" produces — the user still
    /// confirms it with Bekreft; nothing is applied by the tap. Raises the panel.
    func proposeFollow(_ entity: Entity) {
        resetResults()
        resetBatch()
        let proposal = ProposedMutation(
            kind: .add, entityId: entity.id, entityQuery: entity.name,
            reason: "Du valgte å følge \(entity.name) fra hendelsen."
        )
        let result = MutationGrounder.ground([proposal], index: index, profile: profile)
        pending = result.grounded
        rejected = result.rejected
        if !pending.isEmpty {
            pendingBatchUtterance = "Følg \(entity.name)"
            pendingBatchEntityNames = pending.map(\.entity.name)
        }
        presentToken &+= 1
    }

    // MARK: - Confirm / reject (unchanged semantics + WP-16.4 recompile hook)

    func confirm(_ mutation: GroundedMutation) {
        profile = profile.applying(mutation)
        persist()
        pending.removeAll { $0.id == mutation.id }
        pendingBatchConfirmedAny = true
        resolveIfMentedFrom(mutation)
        onProfileChanged?()
        if pending.isEmpty { utterance = "" }
    }

    func confirmAll() {
        guard !pending.isEmpty else { return }
        for mutation in pending { resolveIfMentedFrom(mutation) }
        profile = profile.applying(pending)
        persist()
        pendingBatchConfirmedAny = true
        pending = []
        onProfileChanged?()
        utterance = ""
    }

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
            pendingBatchUtterance = ""
        }
    }

    func dismissRejection(_ rejection: RejectedMutation) {
        rejected.removeAll { $0.id == rejection.id }
    }

    /// WP-16.2: the user tapped a "mente du …?" suggestion — re-ground the
    /// ORIGINAL proposal with the chosen entity id, moving it into the diff.
    func choose(_ suggestion: Entity, for rejection: RejectedMutation) {
        var proposal = rejection.proposal
        proposal.entityId = suggestion.id
        let result = MutationGrounder.ground([proposal], index: index, profile: profile)
        pending.append(contentsOf: result.grounded)
        rejected.removeAll { $0.id == rejection.id }
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
            profile = InterestProfile(rules: profile.rules.filter { $0.entityId != rule.entityId })
        }
        persist()
        onProfileChanged?()
    }

    // MARK: - WP-19 — profil-sync (QR-bro + bakgrunns-sync)

    /// A calm summary of what a QR/link import changed — shown after a merge.
    struct ProfileImportSummary: Equatable, Sendable {
        var added: Int
        var updated: Int
        var removed: Int
        var isNoop: Bool { added == 0 && updated == 0 && removed == 0 }
    }

    /// The deep link that SHARES this device's profile (QR + share sheet). Nil
    /// only if encoding somehow fails (never expected for a well-formed profile).
    var profileShareURL: URL? {
        try? ProfileShareCodec.link(for: profileStore.loadSyncState())
    }

    /// The last import's calm outcome, for the share panel's confirmation line.
    private(set) var lastImportSummary: ProfileImportSummary?
    /// An honest error if an import couldn't be read ("ikke en gyldig kode").
    private(set) var shareImportMessage: String?

    /// Import a shared profile from a deep link — MERGES into the local profile
    /// (never overwrites), persists, and recompiles the agenda. Pure + offline.
    func importSharedProfile(from url: URL) {
        importMerging { try ProfileShareCodec.merge(url: url, into: $0) }
    }

    /// Import from a pasted string — the whole `zenji://…` link or just its
    /// payload (both accepted), for the manual import field.
    func importSharedProfile(fromPayload raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let url = URL(string: trimmed), url.scheme == ProfileShareCodec.scheme {
            importSharedProfile(from: url)
        } else {
            importMerging { try ProfileShareCodec.merge(payload: trimmed, into: $0) }
        }
    }

    private func importMerging(_ merge: (ProfileSyncState) throws -> MergeOutcome) {
        shareImportMessage = nil
        lastImportSummary = nil
        let before = profileStore.loadSyncState()
        do {
            let outcome = try merge(before)
            try? profileStore.saveSyncState(outcome.merged)
            lastImportSummary = Self.summary(before: before.profile, after: outcome.merged.profile)
            reloadProfile()
            onProfileChanged?()
        } catch ProfileShareError.empty {
            shareImportMessage = "Koden inneholdt ingen profil å slå sammen."
        } catch ProfileShareError.unsupportedVersion {
            shareImportMessage = "Koden er laget av en nyere versjon av Zenji enn denne."
        } catch {
            shareImportMessage = "Dette var ikke en gyldig Zenji-profilkode."
        }
        presentToken &+= 1
    }

    private static func summary(before: InterestProfile, after: InterestProfile) -> ProfileImportSummary {
        let beforeByID = Dictionary(before.rules.map { ($0.entityId, $0) }, uniquingKeysWith: { a, _ in a })
        let afterByID = Dictionary(after.rules.map { ($0.entityId, $0) }, uniquingKeysWith: { a, _ in a })
        var added = 0, updated = 0, removed = 0
        for (id, rule) in afterByID {
            if let prior = beforeByID[id] { if prior != rule { updated += 1 } } else { added += 1 }
        }
        for id in beforeByID.keys where afterByID[id] == nil { removed += 1 }
        return ProfileImportSummary(added: added, updated: updated, removed: removed)
    }

    /// Re-read the persisted profile into memory (after an external merge — a QR
    /// import or a background CloudKit sync).
    func reloadProfile() {
        profile = profileStore.load()
    }

    /// One offline-first background sync round through `coordinator` (LocalOnly by
    /// default → a no-op). Persists the merged state and recompiles if it changed.
    func runBackgroundSync(using coordinator: ProfileSyncCoordinator) async {
        guard coordinator.backend.isEnabled else { return }
        let result = await coordinator.sync(local: profileStore.loadSyncState())
        guard result.didSync else { return }
        try? profileStore.saveSyncState(result.merged)
        let updated = result.merged.profile
        if updated != profile {
            profile = updated
            onProfileChanged?()
        }
    }

    // MARK: - WP-16.3 — "Det jeg ikke forsto"

    func setMisunderstoodNote(_ note: String?, for entry: MisunderstoodEntry) {
        misunderstoodLog.setNote(note, for: entry.id)
        refreshMisunderstoodLog()
    }

    func deleteMisunderstood(_ entry: MisunderstoodEntry) {
        misunderstoodLog.delete(entry.id)
        refreshMisunderstoodLog()
    }

    func deleteAllMisunderstood() {
        misunderstoodLog.deleteAll()
        refreshMisunderstoodLog()
    }

    func misunderstoodExportPayload() -> Data {
        misunderstoodLog.exportPayload()
    }

    @discardableResult
    private func logMisunderstood(utterance: String, outcome: MisunderstoodOutcome, explanation: AssistantExplanation) -> UUID {
        let id = misunderstoodLog.record(utterance: utterance, outcome: outcome, explanation: explanation)
        refreshMisunderstoodLog()
        return id
    }

    private func resolveIfMentedFrom(_ mutation: GroundedMutation) {
        guard let logId = mentedFromLogId.removeValue(forKey: mutation.id) else { return }
        misunderstoodLog.markResolved(logId)
        refreshMisunderstoodLog()
    }

    private func refreshMisunderstoodLog() {
        misunderstoodEntries = misunderstoodLog.load()
    }

    // MARK: - Helpers

    private func resetResults() {
        errorMessage = nil
        explanation = nil
        pending = []
        rejected = []
        answer = nil
        lastImportSummary = nil
        shareImportMessage = nil
    }

    private func resetBatch() {
        pendingBatchUtterance = ""
        pendingBatchEntityNames = []
        pendingBatchConfirmedAny = false
        activeMisunderstoodLogId = nil
    }

    private func persist() {
        do {
            try profileStore.save(profile)
        } catch {
            errorMessage = "Klarte ikke å lagre profilen din."
        }
    }

    #if DEBUG
    /// DEBUG-only: seed a representative state so each assistant surface can be
    /// screenshotted deterministically in the Simulator, where Apple
    /// Intelligence is unavailable (see ios/README.md). Drives the REAL views +
    /// real value types — it only pre-fills what a live model would have
    /// produced. Never compiled into a release build.
    func demoSeed(_ mode: String) {
        switch mode {
        case "thinking":
            isThinking = true
        case "diff":
            let ruud = Entity(id: "casper-ruud", name: "Casper Ruud", aliases: [], sport: "tennis", type: "athlete")
            pending = [GroundedMutation(
                kind: .add, entity: ruud, scope: "bare i Grand Slams", weight: 0.8,
                reason: "Du ba om å følge Casper Ruud (bare i Grand Slams). Fokus: gjennom norske utøvere.",
                previousRule: nil, lens: .throughNorwegians
            )]
        case "answer":
            answer = AssistantAnswerResult(
                text: "I kveld kan du se VM-semifinale 1 kl. 21:00 på TV 2.",
                rows: [AnswerRow(id: "demo", dayLabel: "I DAG", timeLabel: "21:00", title: "VM-semifinale 1", channelLabel: "TV 2")]
            )
        default:
            break
        }
    }
    #endif
}
