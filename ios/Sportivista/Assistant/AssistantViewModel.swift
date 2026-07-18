//
//  AssistantViewModel.swift
//  Sportivista
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
    /// The current, persisted profile ("Hva jeg følger"). Setter is internal
    /// (not `private(set)`) only because the WP-19 profil-sync arm now lives in
    /// Profile/AssistantViewModel+ProfileSync.swift (WP-48) — an extension in
    /// another file can't reach a private setter. Only that extension and this
    /// class assign it.
    var profile: InterestProfile
    /// Grounded mutations awaiting the user's Bekreft/Avvis.
    private(set) var pending: [GroundedMutation] = []
    /// Proposals rejected by grounding — shown as honest "fant ikke …" notes.
    private(set) var rejected: [RejectedMutation] = []
    /// WP-16.4 — the answer to a question, resolved to displayable rows. Nil
    /// unless the last submit routed to the answer arm.
    private(set) var answer: AssistantAnswerResult?
    /// WP-65 — the per-clause accounting for a BULK utterance (what landed · what
    /// wasn't found). Set whenever an utterance decomposed into more than one
    /// clause, so a dropped clause is impossible to hide; nil for single-clause
    /// utterances (the existing diff/explanation already covers those).
    private(set) var mutationTally: MutationTally?
    /// WP-66 — a calm confirmation shown after a direct command executed
    /// ("Tema: mørkt.", "Åpner Brann–X."). Nil unless the last turn ran a command.
    private(set) var commandReceipt: String?
    /// WP-66 — a command awaiting the user's Bekreft/Avbryt. Only the destructive
    /// reset uses this (reusing the WP-32 confirm semantics); the harmless
    /// commands execute directly. Nil otherwise.
    private(set) var pendingCommand: AssistantCommand?
    /// WP-66 — bumped when a command asks a HOST surface to reveal itself ("del
    /// profil" / "hva vet du om meg"): ProfileSharePanel / AssistantPanel observe
    /// these and open the matching disclosure/page, the same idiom as `presentToken`.
    private(set) var shareRequestToken = 0
    private(set) var memoryRequestToken = 0

    /// Bound to the command-line text field.
    var utterance: String = ""
    /// WP-82 — bumped every time a mutation or command is CONFIRMED (Bekreft),
    /// so the command surface can play ONE light `.sensoryFeedback(.success)` on
    /// confirm (DESIGN § Bevegelse & haptikk). A pure signal — no
    /// behaviour or routing changes.
    private(set) var confirmHaptic = 0
    private(set) var isThinking = false
    /// A blocking error (model unavailable / generation failed) shown verbatim.
    private(set) var errorMessage: String?
    /// The always-explain account (WP-16.1): set WHENEVER a submitted utterance
    /// produced no confirmable change (or an empty answer), instead of a
    /// dead-end. Nil when there are pending mutations or an answer to show.
    private(set) var explanation: AssistantExplanation?

    /// WP-16.4 — bumped whenever there's a fresh presentable result (a diff, an
    /// answer, an explanation, an error, or a pre-filled follow). ContentView
    /// observes it to raise the assistant panel over the agenda. Setter is
    /// internal (not `private(set)`) only so the profil-sync extension in
    /// Profile/AssistantViewModel+ProfileSync.swift (WP-48) can bump it too.
    var presentToken = 0
    /// WP-16.4 — called after any mutation is APPLIED, so the host can recompile
    /// the agenda immediately ("umiddelbar konsekvens"). Set by ContentView.
    var onProfileChanged: (() -> Void)?
    /// WP-66 — performs the HOST-owned side of a command: the theme override
    /// (@AppStorage), raising onboarding, opening an event's detail sheet, and
    /// the CONFIRMED reset (+ re-onboard). Set by ContentView. VM-owned effects
    /// (memory-forget, notification lead time, the share/memory disclosures) are
    /// handled inside the view model directly. When `.openEvent` is delivered
    /// through this closure its associated value is the RESOLVED event id (the
    /// view model resolved the phrase against the local agenda first).
    var onCommand: ((AssistantCommand) -> Void)?
    /// WP-67 — applies an EPHEMERAL presentation filter to the agenda («vis bare
    /// golf denne uka»). Set by ContentView, which forwards it to
    /// `AgendaViewModel.applyFilter`. Never touches the profile (this is a pure
    /// view layer) and is never persisted; an empty filter clears it.
    var onPresent: ((AgendaFilter) -> Void)?
    /// WP-67 — the filter the last present turn produced (for testing + so a
    /// host built without `onPresent` can still read the parsed filter). Nil
    /// until a present turn runs; cleared at the start of every submit.
    private(set) var presentedFilter: AgendaFilter?

    /// The local "forsto ikke"-log (WP-16.3): every submit that ended without
    /// an applied mutation, most-recent first.
    private(set) var misunderstoodEntries: [MisunderstoodEntry] = []
    /// Entries still needing attention — a `resolved` one no longer counts.
    var misunderstoodCount: Int { misunderstoodEntries.filter { !$0.isResolved }.count }

    /// WP-30 — the live personal-memory projection ("Hva jeg vet om deg"):
    /// structured facts + episodic notes + behaviour stats, tombstones dropped.
    private(set) var memory: MemoryState = MemoryState()
    /// The count shown next to "HVA JEG VET OM DEG".
    var memoryItemCount: Int { memory.itemCount }

    /// Anything worth raising the panel for.
    var hasPresentableResult: Bool {
        !pending.isEmpty || !rejected.isEmpty || explanation != nil || answer != nil || errorMessage != nil
            || commandReceipt != nil || pendingCommand != nil
            || lastImportSummary != nil || shareImportMessage != nil
    }

    private let assistant: any InterestAssistant
    /// Internal (not private) only because the WP-19 profil-sync arm in
    /// Profile/AssistantViewModel+ProfileSync.swift (WP-48) reads it — share
    /// link/QR export, import-merge, reload, background sync all go through it.
    let profileStore: ProfileStore
    private let index: EntityIndex
    private let misunderstoodLog: MisunderstoodLogStore
    /// WP-30 — personal memory (facts/episodic/behaviour) over the SAME profile
    /// file (`ProfileSyncState`), and the episodic distiller that turns a
    /// conversation into a compact note.
    private let memoryStore: MemoryStore
    private let distiller: any MemoryDistiller
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
        memoryStore: MemoryStore? = nil,
        distiller: any MemoryDistiller = FoundationModelsMemoryDistiller(),
        feedProvider: @escaping () -> FeedQuery = { FeedQuery(now: Date()) }
    ) {
        self.assistant = assistant
        self.profileStore = profileStore
        self.index = index
        self.misunderstoodLog = misunderstoodLog
        // Default the memory store over the SAME profile file, so memory and the
        // profile share one on-disk `ProfileSyncState`.
        self.memoryStore = memoryStore ?? MemoryStore(profileStore: profileStore)
        self.distiller = distiller
        self.feedProvider = feedProvider
        self.profile = profileStore.load()
        self.availability = assistant.availability()
        self.misunderstoodEntries = misunderstoodLog.load()
        self.memory = (memoryStore ?? MemoryStore(profileStore: profileStore)).load()
    }

    /// App wiring: the real FM assistant + the on-disk profile + the synced
    /// entity index and agenda from the WP-12 cache. The feed provider re-reads
    /// events every submit and folds the local profile into the effective
    /// interests, so the answer arm sees exactly the agenda on screen.
    convenience init(
        dataStore: DataStore = DataStore(),
        // WP-62 — the real FM assistant is wrapped in a deadline so a stuck
        // generation can't leave the command line blinking "tenker …" forever;
        // on timeout it surfaces a calm "tok for lang tid" via the same
        // `.generationFailed` flow. Tests inject the fast mock directly, so the
        // deadline never bites there.
        assistant: any InterestAssistant = TimeoutInterestAssistant(wrapping: FoundationModelsInterestAssistant()),
        profileStore: ProfileStore = ProfileStore(),
        misunderstoodLog: MisunderstoodLogStore = MisunderstoodLogStore()
    ) {
        // WP-60: build the entity index ONCE and share it between grounding and
        // the answer arm's feed provider. The provider previously built a NEW
        // EntityIndex on every submit (a full entities.json decode + by-id map +
        // resolver substrate); reuse this one. Only events/interests/profile are
        // re-read per submit — so a just-confirmed follow is still reflected —
        // while the (unchanged) entity index is no longer rebuilt each time.
        let index = EntityIndex(dataStore.loadEntities())
        self.init(
            assistant: assistant,
            profileStore: profileStore,
            index: index,
            misunderstoodLog: misunderstoodLog,
            feedProvider: {
                let events = dataStore.loadEvents()
                let base = dataStore.loadInterests() ?? Interests()
                let profile = profileStore.load()
                let effective = EffectiveInterests.merge(profile: profile, into: base, index: index)
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

        // WP-63: os_signpost the submit preludium — the synchronous local prep
        // that runs BEFORE the on-device model call: building the feed (events/
        // entities/profile decode + merge + FeedQuery.build) and the memory
        // context. A stuck prelude shows in Instruments as this named interval
        // (Subsystem "app.sportivista.perf") rather than merging into the model latency.
        // Pure observation — nothing about the result changes.
        let prelude = PerfSignpost.assistant.beginInterval("submit-prelude")
        let feed = feedProvider()
        // WP-30 — hand the assistant the personal-memory context: the live state
        // (injected as a retrieval digest) + the write sink (the saveMemory tool).
        let memoryContext = MemoryContext(state: memory, sink: memoryStore)
        PerfSignpost.assistant.endInterval("submit-prelude", prelude)
        do {
            let turn = try await assistant.interpret(utterance: text, profile: profile, index: index, feed: feed, memory: memoryContext)
            guard !Task.isCancelled else { return }
            switch turn {
            case .mutations(let proposals):
                applyMutations(text: text, proposals: proposals)
            case .answer(let ans):
                applyAnswer(text: text, answer: ans, feed: feed)
            case .command(let command):
                applyCommand(command, feed: feed)
            case .present(let filter):
                applyPresent(filter)
            }
            // WP-30 — the model may have written a fact via saveMemory; reflect it.
            refreshMemory()
            // WP-30 — episodic: distil this exchange into a compact note (never a
            // transcript). Fire-and-forget so it never delays the shown result.
            let assistantText = distillableAssistantText(from: turn)
            distill(userText: text, assistantText: assistantText)
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
        // WP-65 — publish the per-clause tally for a bulk utterance, so partial
        // understanding is reported per clause (never a silent drop). Nil for a
        // single-clause utterance, where the diff/explanation say it all.
        mutationTally = AssistantExplanation.tally(grounded: result.grounded, rejected: result.rejected)
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

    // MARK: - Present arm (WP-67 — the ephemeral presentation filter)

    /// Apply a presentation filter to the agenda — EPHEMERAL, never persisted,
    /// never a profile mutation. The host (ContentView) forwards it to
    /// `AgendaViewModel.applyFilter`, which narrows what the board SHOWS (a pure
    /// view layer over the compiled sections). Deliberately raises NO ark: the
    /// quiet filter line over the agenda is the whole feedback, so the filtered
    /// board stays visible. Clears the command line, and an empty filter (from
    /// «vis alt igjen») resets the view.
    private func applyPresent(_ filter: AgendaFilter) {
        presentedFilter = filter
        onPresent?(filter)
        utterance = ""
    }

    // MARK: - Command arm (WP-66)

    /// The assistant-ark chips run through the SAME path a typed command does:
    /// validate → hold-for-confirmation (destructive) or execute (harmless) →
    /// calm receipt. Raises the ark so the receipt/confirmation is seen.
    func runCommand(_ command: AssistantCommand) {
        resetResults()
        resetBatch()
        applyCommand(command, feed: nil)
        if hasPresentableResult { presentToken &+= 1 }
    }

    /// Route one command. A destructive command (reset) is HELD for the user's
    /// Bekreft (WP-32 confirm reuse); a harmless one executes now. `feed` is the
    /// already-built agenda when we have one (submit), else built lazily and only
    /// for `openEvent`.
    private func applyCommand(_ command: AssistantCommand, feed: FeedQuery?) {
        guard !command.needsConfirmation else {
            pendingCommand = command
            return
        }
        execute(command, feed: feed)
    }

    /// Perform a validated, non-destructive command and set its calm receipt.
    private func execute(_ command: AssistantCommand, feed: FeedQuery?) {
        switch command {
        case let .setTheme(theme):
            onCommand?(command)
            commandReceipt = "Tema: \(themeLabel(theme))."
        case .rerunOnboarding:
            onCommand?(command)
            commandReceipt = "Åpner oppsettet på nytt."
        case .shareProfile:
            shareRequestToken &+= 1
            commandReceipt = profile.isEmpty
                ? "Du følger ingenting å dele ennå — begynn i linjen."
                : "Her er QR-koden og delingslenken din."
        case .showMemory:
            memoryRequestToken &+= 1
            commandReceipt = "Åpner det jeg vet om deg (\(memoryItemCount))."
        case let .forgetMemory(query):
            commandReceipt = forgetMemory(matching: query)
        case let .setNotificationLeadTime(enabled):
            NotificationLeadPreference.setLeadTimeEnabled(enabled)
            commandReceipt = enabled
                ? "Varsler kommer i god tid før hendelsen."
                : "Varsler kommer når hendelsen starter."
        case let .openEvent(query):
            openEvent(matching: query, feed: feed ?? feedProvider())
        case .resetProfile:
            break // destructive — held for confirmation in applyCommand, never here
        }
    }

    /// The user confirmed a held (destructive) command — carry it out. The reset
    /// itself is performed by the host (ContentView.performReset via onCommand),
    /// which also re-raises onboarding, exactly like the WP-32 disclosure path.
    func confirmCommand() {
        guard let command = pendingCommand else { return }
        pendingCommand = nil
        confirmHaptic &+= 1
        onCommand?(command)
        utterance = ""
    }

    /// The user cancelled a held command — nothing changes.
    func cancelCommand() { pendingCommand = nil }

    /// Forget personal memory matching `query` (empty ⇒ everything). Deletes
    /// through the SAME `MemoryStore` CRUD the "Hva jeg vet om deg" page uses, so
    /// tombstones replicate identically. Returns a calm Norwegian receipt naming
    /// what was forgotten (or that nothing matched — honest, never silent).
    private func forgetMemory(matching query: String) -> String {
        let q = TextMatch.normalize(query)
        guard !q.isEmpty else {
            forgetAllMemory()
            return "Glemte alt jeg visste om deg. Det du følger er urørt."
        }
        var forgotten = 0
        for fact in memory.facts where memoryFactMatches(fact, q: q) {
            memoryStore.deleteFact(id: fact.id); forgotten += 1
        }
        for note in memory.episodic where TextMatch.normalize(note.summary).contains(q) {
            memoryStore.deleteEpisodic(id: note.id); forgotten += 1
        }
        for stat in memory.behavior where TextMatch.normalize(behaviorDisplayName(stat)).contains(q) {
            memoryStore.deleteBehavior(key: stat.key); forgotten += 1
        }
        refreshMemory()
        return forgotten == 0
            ? "Jeg har ingenting lagret om «\(query)» å glemme."
            : "Glemte \(forgotten) ting jeg visste om «\(query)»."
    }

    private func memoryFactMatches(_ fact: MemoryFact, q: String) -> Bool {
        // Include the sport's Norwegian DISPLAY name so a Norwegian query
        // ("sjakk") matches an English-tagged fact ("chess" → "Sjakk").
        [fact.value, fact.reason, fact.sport ?? "",
         fact.sport.map(SportVocabulary.display(for:)) ?? "",
         fact.entityId.map(entityName) ?? ""]
            .map(TextMatch.normalize)
            .contains { $0.contains(q) }
    }

    private func behaviorDisplayName(_ stat: BehaviorStat) -> String {
        stat.isSport ? SportVocabulary.display(for: stat.token) : entityName(stat.token)
    }

    /// Resolve `query` against the LOCAL agenda and open the matching row's
    /// detail via the host; explain honestly when nothing matches (never a dead
    /// end — the WP-16.1 contract, applied to the command arm).
    private func openEvent(matching query: String, feed: FeedQuery) {
        let hit = feed.search(query, limit: 1).first
            ?? index.resolve(query).served.flatMap { feed.next(matching: $0) }
        guard let hit else {
            explanation = AssistantExplanation(
                understood: "Jeg forsto «\(query)» som en hendelse du ville åpne.",
                reason: "Jeg fant ingen kamp eller hendelse som matcher «\(query)» i agendaen din akkurat nå."
            )
            return
        }
        // The host opens the detail sheet for this resolved id (see onCommand).
        onCommand?(.openEvent(query: hit.id))
        commandReceipt = "Åpner \(hit.title)."
    }

    private func themeLabel(_ theme: ThemeOverride) -> String {
        switch theme {
        case .system: return "automatisk"
        case .dark: return "mørkt"
        case .light: return "lyst"
        }
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
        confirmHaptic &+= 1
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
        confirmHaptic &+= 1
        onProfileChanged?()
        utterance = ""
    }

    func reject(_ mutation: GroundedMutation) {
        // WP-30 behaviour stat: a rejection is a "dismiss" signal for the entity.
        memoryStore.record(.dismiss, entityId: mutation.entity.id)
        refreshMemory()
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

    // MARK: - WP-31 — onboarding starter packs

    /// Whether every rule in `pack` is already followed — drives the quiet
    /// "valgt" state and lets a second tap toggle the pack back off.
    func isApplied(_ pack: StarterPack) -> Bool {
        guard !pack.rules.isEmpty else { return false }
        let ids = Set(profile.rules.map(\.entityId))
        return pack.entityIds.allSatisfy(ids.contains)
    }

    /// Apply (or, if already applied, remove) a curated onboarding starter pack.
    /// A tap IS the confirmation — no diff round-trip — but it runs through the
    /// SAME `InterestProfile.applying` core, persists, and fires
    /// `onProfileChanged`, so the agenda recompiles on the spot exactly like a
    /// confirmed conversation mutation ("umiddelbar konsekvens"). Grounds against
    /// the live index when present, else the pack's own curated entity data, so
    /// it gives full value at cold start before entities.json has synced.
    func toggleStarterPack(_ pack: StarterPack) {
        let mutations = isApplied(pack)
            ? pack.removeMutations(index: index, profile: profile)
            : pack.addMutations(index: index, profile: profile)
        guard !mutations.isEmpty else { return }
        profile = profile.applying(mutations)
        persist()
        onProfileChanged?()
    }

    // MARK: - WP-19 — profil-sync (QR-bro + bakgrunns-sync)
    //
    // The whole arm lives in Profile/AssistantViewModel+ProfileSync.swift
    // (WP-48 — the profile domain moved out of Assistant/). Only its two
    // STORED properties stay behind here: a Swift extension can't hold stored
    // state. Their setters are internal (not `private(set)`) so that extension
    // — another file — can assign them; `resetResults()` below clears them.

    /// The last import's calm outcome, for the share panel's confirmation line.
    var lastImportSummary: ProfileImportSummary?
    /// An honest error if an import couldn't be read ("ikke en gyldig kode").
    var shareImportMessage: String?

    // MARK: - WP-30 — personal memory ("Hva jeg vet om deg")

    /// Re-read the live memory projection from disk.
    func refreshMemory() { memory = memoryStore.load() }

    /// A human display name for an entity id (falls back to the id itself when
    /// the index hasn't synced or the entity is gone) — for the memory page.
    func entityName(_ id: String) -> String { index.entity(id: id)?.name ?? id }

    /// Behaviour: record that the user OPENED an event's detail — one "open" per
    /// entity the event is about, plus its sport. Pure, no AI (WP-30 layer 3).
    func recordOpened(_ event: Event) {
        for id in SpoilerShield.entityIds(of: event) { memoryStore.record(.open, entityId: id) }
        if !event.sport.isEmpty { memoryStore.record(.open, sport: event.sport) }
        refreshMemory()
    }

    /// Behaviour: record that the user EXPANDED something (a collapsed series, or
    /// "hvorfor vises denne") — an "expand" signal on the sport/entities.
    func recordExpanded(_ event: Event) {
        for id in SpoilerShield.entityIds(of: event) { memoryStore.record(.expand, entityId: id) }
        if !event.sport.isEmpty { memoryStore.record(.expand, sport: event.sport) }
        refreshMemory()
    }

    /// Edit (or add) a structured fact from the "Hva jeg vet om deg" page.
    func updateFact(_ fact: MemoryFact) {
        memoryStore.upsertFact(fact)
        refreshMemory()
    }

    /// Forget one structured fact (a replicating tombstone).
    func deleteFact(_ fact: MemoryFact) {
        memoryStore.deleteFact(id: fact.id)
        refreshMemory()
    }

    /// Forget one episodic memory note.
    func deleteEpisodic(_ note: EpisodicNote) {
        memoryStore.deleteEpisodic(id: note.id)
        refreshMemory()
    }

    /// Forget one behaviour stat.
    func deleteBehavior(_ stat: BehaviorStat) {
        memoryStore.deleteBehavior(key: stat.key)
        refreshMemory()
    }

    /// The GDPR "Glem alt" — forget ALL personal memory (facts + episodic +
    /// behaviour). The follow-profile is deliberately kept (see MemoryStore).
    func forgetAllMemory() {
        memoryStore.forgetAll()
        refreshMemory()
    }

    /// The spoiler shield derived from the current memory — the flag the agenda
    /// and detail sheet respect (masking result/score for spoiler-policy
    /// entities/sports). Recomputed from `memory` so it tracks edits live.
    var spoilerShield: SpoilerShield { SpoilerShield(memory: memory) }

    /// Fire-and-forget episodic distillation of one exchange. Never blocks the
    /// shown result; records a compact note only when the distiller finds
    /// something durable (nil otherwise).
    private func distill(userText: String, assistantText: String) {
        Task { @MainActor in
            guard let note = await self.distiller.distill(
                MemoryConversation(userText: userText, assistantText: assistantText), index: self.index, now: Date()
            ) else { return }
            self.memoryStore.appendEpisodic(note)
            self.refreshMemory()
        }
    }

    /// The assistant's side of the exchange, for distillation: the answer prose,
    /// or a short account of the mutations proposed.
    private func distillableAssistantText(from turn: AssistantTurn) -> String {
        switch turn {
        case let .answer(answer): return answer.text
        case let .mutations(proposals):
            return proposals.map { "\($0.kind.rawValue) \($0.entityQuery)" }.joined(separator: "; ")
        case let .command(command):
            // A command is an app action, not durable personal context; give the
            // distiller only its short token (it records nothing durable from it).
            return command.evalToken
        case let .present(filter):
            // A presentation filter is an ephemeral VIEW change, not durable
            // personal context — give the distiller only a short, inert token.
            return "present \(filter.subjectLabel)"
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

    // MARK: - WP-32 — nullstill / re-onboard

    /// Reset the local profile on THIS device (see `ResetService`):
    /// `.followedOnly` clears the follow-profile + the onboarding-completed
    /// flag; `.everything` (the GDPR level) ALSO forgets all personal memory
    /// and the misunderstood-log. Re-reads every affected store into this
    /// view model's published state and fires `onProfileChanged` so the
    /// agenda recompiles on the spot — `ContentView` is what actually raises
    /// the onboarding overlay afterwards (it owns that piece of state).
    func resetProfile(_ level: ResetLevel) {
        ResetService.reset(level: level, profileStore: profileStore, memoryStore: memoryStore, misunderstoodLogStore: misunderstoodLog)
        resetResults()
        resetBatch()
        reloadProfile()
        refreshMemory()
        refreshMisunderstoodLog()
        onProfileChanged?()
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

    // MARK: - WP-82 — command-line discoverability (rest · focus · typing)

    /// REST state: a CONCRETE example placeholder (not an abstract instruction),
    /// so an empty line still teaches what the assistant can do
    /// (DESIGN § Hjelperen: "hvile = konkret eksempel-placeholder").
    let restPlaceholder = "Prøv «følg Bodø/Glimt» eller «når spiller Ruud?»"

    /// FOCUS state: a small, calm row of context suggestions that rises over the
    /// line while it has focus. Tapping one FILLS the line (the user still edits
    /// or sends it) — discovery, never an applied action. These are example
    /// prompts spanning the assistant's arms (følg · spør · vis), scoped to the
    /// agenda context the command line lives in.
    var focusSuggestions: [String] {
        ["følg et lag", "hva skjer i kveld?", "vis bare fotball"]
    }

    /// Fill the command line with a tapped focus suggestion. Deliberately does
    /// NOT submit — the user reviews/edits/sends it, so a tap never surprises
    /// them with a change.
    func fillSuggestion(_ text: String) { utterance = text }

    /// TYPING state: live grounding of the in-progress utterance against the
    /// SAME entity index the grounder uses — "velg, ikke stav". Reuses
    /// `EntityIndex.nearestMatches` (no new matching logic); empty until there's
    /// something groundable, so the row stays silent for very short input or a
    /// phrase that resolves to nothing (e.g. a pure question). Selecting a hit
    /// runs `proposeFollow` (below), the exact grounded diff/confirm flow the
    /// detail sheet's «Følg X» uses.
    func groundingHits(for text: String, limit: Int = 3) -> [Entity] {
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2, hasEntities else { return [] }
        return index.nearestMatches(to: q, limit: limit)
    }

    // MARK: - Helpers

    private func resetResults() {
        errorMessage = nil
        explanation = nil
        pending = []
        rejected = []
        answer = nil
        mutationTally = nil
        commandReceipt = nil
        pendingCommand = nil
        presentedFilter = nil
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
