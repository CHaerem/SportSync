//
//  AssistantCommandTests.swift
//  SportivistaTests
//
//  WP-66 — the assistant's command arm. Apple Intelligence can't run in CI, so
//  these drive the deterministic MockCommandParser (the router the mock uses)
//  and the AssistantViewModel command flow end-to-end — the same code path the
//  shipping app runs through the FM model, minus the model. Every command in the
//  catalogue gets a mock test; the destructive one (reset) is proven to be HELD
//  for confirmation before it acts.
//

import XCTest

final class AssistantCommandTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()
    private let profile = InterestProfile()

    private func parse(_ utterance: String) -> AssistantCommand? {
        MockCommandParser.command(utterance, profile: profile, index: index)
    }

    // MARK: - Per-command parse (the catalogue)

    func test_theme_dark_light_system() {
        XCTAssertEqual(parse("Bytt til mørkt tema"), .setTheme(.dark))
        XCTAssertEqual(parse("Bruk lyst tema"), .setTheme(.light))
        XCTAssertEqual(parse("Bruk systemets tema"), .setTheme(.system))
        XCTAssertEqual(parse("mørk modus"), .setTheme(.dark))
    }

    func test_reset_levels() {
        XCTAssertEqual(parse("Nullstill det jeg følger"), .resetProfile(.followedOnly))
        XCTAssertEqual(parse("Slett alt om meg"), .resetProfile(.everything))
        XCTAssertEqual(parse("nullstill"), .resetProfile(.followedOnly))
    }

    func test_rerunOnboarding() {
        XCTAssertEqual(parse("Kjør onboarding på nytt"), .rerunOnboarding)
        XCTAssertEqual(parse("start onboarding igjen"), .rerunOnboarding)
    }

    func test_shareProfile() {
        XCTAssertEqual(parse("Del profilen min"), .shareProfile)
        XCTAssertEqual(parse("vis QR-koden"), .shareProfile)
    }

    func test_showMemory() {
        XCTAssertEqual(parse("Hva vet du om meg?"), .showMemory)
        XCTAssertEqual(parse("åpne minnet"), .showMemory)
    }

    func test_forgetMemory() {
        XCTAssertEqual(parse("Glem alt om meg"), .forgetMemory(query: ""))
        // A targeted forget keeps the topic phrase.
        if case let .forgetMemory(query)? = parse("Glem det du vet om sjakk") {
            XCTAssertTrue(query.lowercased().contains("sjakk"))
        } else {
            XCTFail("«glem det du vet om sjakk» should be a targeted memory-forget")
        }
    }

    func test_notificationLeadTime() {
        XCTAssertEqual(parse("Skru av varsel-ledetid"), .setNotificationLeadTime(enabled: false))
        XCTAssertEqual(parse("Skru på varsel-ledetid"), .setNotificationLeadTime(enabled: true))
        XCTAssertEqual(parse("slå av varsler"), .setNotificationLeadTime(enabled: false))
    }

    func test_openEvent() {
        if case let .openEvent(query)? = parse("Vis Brann-kampen") {
            XCTAssertTrue(query.lowercased().contains("brann"))
        } else {
            XCTFail("«vis Brann-kampen» should be an openEvent command")
        }
    }

    // MARK: - Narrowness: commands must NOT steal follows/questions/filters

    func test_followsAndQuestions_areNotCommands() {
        for u in [
            "Følg Casper Ruud bare i Grand Slams",
            "Slutt med tennis",
            "Mer sykkel i juli",
            "Følg Tour de France med fokus på norske utøvere",
            "Hva bør jeg se i kveld?",
            "Når går neste TdF-etappe?",
            "gjør noe fint med sporten min",
        ] {
            XCTAssertNil(parse(u), "«\(u)» must not be captured as a command")
        }
    }

    func test_visBareGolf_isNotAnOpenCommand_leftToWP67Filter() {
        // «Vis bare golf denne uka» is the WP-67 presentation filter (a known-gap
        // mutation today), NOT an event-open — it must fall through.
        XCTAssertNil(parse("Vis bare golf denne uka"))
    }

    // MARK: - The command arm routes through the mock assistant

    func test_interpret_routesCommandArm() async throws {
        let turn = try await MockInterestAssistant().interpret(
            utterance: "Bytt til mørkt tema", profile: profile, index: index, feed: FeedQuery(now: Date())
        )
        guard case let .command(command) = turn else { return XCTFail("a command must route to the command arm") }
        XCTAssertEqual(command, .setTheme(.dark))
    }

    // MARK: - evalToken / confirmation contract

    func test_evalTokens() {
        XCTAssertEqual(AssistantCommand.setTheme(.dark).evalToken, "theme:dark")
        XCTAssertEqual(AssistantCommand.resetProfile(.everything).evalToken, "reset:everything")
        XCTAssertEqual(AssistantCommand.resetProfile(.followedOnly).evalToken, "reset:followed")
        XCTAssertEqual(AssistantCommand.shareProfile.evalToken, "share")
        XCTAssertEqual(AssistantCommand.setNotificationLeadTime(enabled: false).evalToken, "notify:off")
        XCTAssertEqual(AssistantCommand.forgetMemory(query: "").evalToken, "forget:*")
        XCTAssertEqual(AssistantCommand.openEvent(query: "Brann").evalToken, "open:brann")
    }

    func test_onlyResetNeedsConfirmation() {
        XCTAssertTrue(AssistantCommand.resetProfile(.followedOnly).needsConfirmation)
        XCTAssertTrue(AssistantCommand.resetProfile(.everything).needsConfirmation)
        for c: AssistantCommand in [.setTheme(.dark), .rerunOnboarding, .shareProfile, .showMemory,
                                    .forgetMemory(query: ""), .setNotificationLeadTime(enabled: true),
                                    .openEvent(query: "x")] {
            XCTAssertFalse(c.needsConfirmation, "\(c) should execute directly")
        }
    }

    // MARK: - NotificationLeadPreference (persistence, isolated defaults)

    func test_leadPreference_defaultsOn_andPersists() {
        let defaults = UserDefaults(suiteName: "wp66-\(UUID().uuidString)")!
        XCTAssertTrue(NotificationLeadPreference.isLeadTimeEnabled(defaults), "unset ⇒ on (historical default)")
        NotificationLeadPreference.setLeadTimeEnabled(false, defaults)
        XCTAssertFalse(NotificationLeadPreference.isLeadTimeEnabled(defaults))
        NotificationLeadPreference.setLeadTimeEnabled(true, defaults)
        XCTAssertTrue(NotificationLeadPreference.isLeadTimeEnabled(defaults))
    }
}

// MARK: - View-model command routing

@MainActor
final class AssistantCommandViewModelTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    /// A feed with one resolvable football event, for the openEvent tests.
    private func feedWithBrann() -> FeedQuery {
        let now = Date()
        let event = FeedQueryEvent(
            id: "brann-rbk", title: "Brann – Rosenborg", sport: "football", tournament: "Eliteserien",
            time: now.addingTimeInterval(3600), endTime: nil, dayKey: "2026-07-16", timeLabel: "18:00",
            channelLabel: "TV 2", isMustSee: true, norwegian: true, haystack: "brann rosenborg eliteserien",
            entityIds: []
        )
        return FeedQuery(now: now, events: [event])
    }

    private func makeVM(
        feed: @escaping () -> FeedQuery = { FeedQuery(now: Date()) },
        memoryStore: MemoryStore? = nil
    ) -> AssistantViewModel {
        AssistantViewModel(
            assistant: MockInterestAssistant(),
            profileStore: AssistantTestSupport.tempProfileStore(),
            index: self.index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog(),
            memoryStore: memoryStore,
            feedProvider: feed
        )
    }

    func test_theme_executesDirectly_withReceipt_andHostCallback() {
        let vm = makeVM()
        var received: AssistantCommand?
        vm.onCommand = { received = $0 }
        vm.runCommand(.setTheme(.dark))
        XCTAssertEqual(received, .setTheme(.dark), "the host performs the theme override")
        XCTAssertEqual(vm.commandReceipt, "Tema: mørkt.")
        XCTAssertNil(vm.pendingCommand)
    }

    func test_reset_isHeldForConfirmation_thenFiresOnConfirm() {
        let vm = makeVM()
        var received: AssistantCommand?
        vm.onCommand = { received = $0 }
        vm.runCommand(.resetProfile(.everything))
        XCTAssertEqual(vm.pendingCommand, .resetProfile(.everything), "a destructive command waits for Bekreft")
        XCTAssertNil(received, "nothing happens before confirmation")

        vm.confirmCommand()
        XCTAssertEqual(received, .resetProfile(.everything), "confirm performs the reset via the host")
        XCTAssertNil(vm.pendingCommand)
    }

    func test_reset_cancel_doesNothing() {
        let vm = makeVM()
        var received: AssistantCommand?
        vm.onCommand = { received = $0 }
        vm.runCommand(.resetProfile(.followedOnly))
        vm.cancelCommand()
        XCTAssertNil(vm.pendingCommand)
        XCTAssertNil(received, "a cancelled command never reaches the host")
    }

    func test_notificationLeadTime_persists() {
        let prior = NotificationLeadPreference.isLeadTimeEnabled()
        defer { NotificationLeadPreference.setLeadTimeEnabled(prior) }
        let vm = makeVM()
        vm.runCommand(.setNotificationLeadTime(enabled: false))
        XCTAssertFalse(NotificationLeadPreference.isLeadTimeEnabled())
        XCTAssertEqual(vm.commandReceipt, "Varsler kommer når hendelsen starter.")
    }

    func test_share_and_memory_bumpHostTokens() {
        let vm = makeVM()
        let share0 = vm.shareRequestToken
        let mem0 = vm.memoryRequestToken
        vm.runCommand(.shareProfile)
        XCTAssertEqual(vm.shareRequestToken, share0 + 1)
        vm.runCommand(.showMemory)
        XCTAssertEqual(vm.memoryRequestToken, mem0 + 1)
    }

    func test_openEvent_resolvesAndAsksHostToOpenTheId() {
        let vm = makeVM(feed: { self.feedWithBrann() })
        var opened: String?
        vm.onCommand = { if case let .openEvent(id) = $0 { opened = id } }
        vm.runCommand(.openEvent(query: "Brann"))
        XCTAssertEqual(opened, "brann-rbk", "the resolved event id is handed to the host")
        XCTAssertEqual(vm.commandReceipt, "Åpner Brann – Rosenborg.")
        XCTAssertNil(vm.explanation)
    }

    func test_openEvent_unknown_explainsHonestly() {
        let vm = makeVM(feed: { self.feedWithBrann() })
        var opened = false
        vm.onCommand = { if case .openEvent = $0 { opened = true } }
        vm.runCommand(.openEvent(query: "Vålerenga"))
        XCTAssertFalse(opened, "an unresolvable event never opens a phantom sheet")
        XCTAssertNotNil(vm.explanation, "it is explained, never a dead end")
        XCTAssertTrue(vm.explanation?.reason.contains("Vålerenga") ?? false)
    }

    func test_forgetMemory_targeted_removesMatchingFact() {
        let store = AssistantTestSupport.tempProfileStore()
        let memoryStore = MemoryStore(profileStore: store)
        memoryStore.save(SaveMemoryCommand(sport: "chess", kind: .knowledgeLevel, value: "nybegynner", reason: "test"))
        let vm = AssistantViewModel(
            assistant: MockInterestAssistant(), profileStore: store, index: self.index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog(), memoryStore: memoryStore
        )
        vm.refreshMemory()
        XCTAssertFalse(vm.memory.facts.isEmpty, "seeded a chess knowledge fact")

        vm.runCommand(.forgetMemory(query: "sjakk"))  // Norwegian for chess
        XCTAssertTrue(vm.memory.facts.isEmpty, "the Norwegian «sjakk» matched the English-tagged chess fact")
        XCTAssertTrue(vm.commandReceipt?.lowercased().contains("glemte") ?? false)
    }

    func test_forgetMemory_all_clearsPersonalMemory() {
        let store = AssistantTestSupport.tempProfileStore()
        let memoryStore = MemoryStore(profileStore: store)
        memoryStore.save(SaveMemoryCommand(sport: "f1", kind: .spoilerPolicy, value: "opptak", reason: "test"))
        let vm = AssistantViewModel(
            assistant: MockInterestAssistant(), profileStore: store, index: self.index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog(), memoryStore: memoryStore
        )
        XCTAssertFalse(vm.memory.isEmpty)
        vm.runCommand(.forgetMemory(query: ""))
        XCTAssertTrue(vm.memory.isEmpty, "forget-all clears personal memory")
        XCTAssertTrue(vm.commandReceipt?.contains("Glemte alt") ?? false)
    }

    // A leading «hvordan» is a how-to QUESTION — it must fall through to the
    // help/answer arm, never execute the command (── the «varsler»-collision:
    // asking how to enable notifications used to flip the setting).
    func test_hvordanQuestion_isNeverACommand() {
        let index = AssistantTestSupport.liveIndex()
        XCTAssertNil(MockCommandParser.command("hvordan slår jeg på varsler?", profile: InterestProfile(), index: index))
        XCTAssertNil(MockCommandParser.command("hvordan nullstiller jeg?", profile: InterestProfile(), index: index))
        // …while the question-SHAPED command stays a command:
        XCTAssertEqual(MockCommandParser.command("Hva vet du om meg?", profile: InterestProfile(), index: index), .showMemory)
    }

    func test_forgetMemory_nothingMatches_isHonest() {
        let vm = makeVM()
        vm.runCommand(.forgetMemory(query: "cricket"))
        XCTAssertTrue(vm.commandReceipt?.contains("ingenting") ?? false, "nothing to forget is stated honestly")
    }
}
