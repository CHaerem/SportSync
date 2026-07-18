//
//  AgendaFilterTests.swift
//  SportivistaTests
//
//  WP-67 — the presentation-filter arm. Apple Intelligence can't run in CI, so
//  these drive the deterministic pieces the shipping app also runs through the
//  real FM model, minus the model:
//    • AgendaFilterParser — «vis …» → an ephemeral AgendaFilter (and nil for a
//      follow / an event-open, so no arm is stolen).
//    • MockInterestAssistant routing — a «vis …»-cue wins over the mutation cue.
//    • AgendaViewModel.applyFilter — the pure view layer that narrows the board
//      WITHOUT touching the five predicates (the golden vectors are elsewhere).
//    • AssistantViewModel — a present turn calls onPresent and never mutates the
//      profile.
//

import XCTest

final class AgendaFilterParserTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func parse(_ u: String) -> AgendaFilter? { AgendaFilterParser.parse(u, index: index) }

    // MARK: - Present utterances → a filter

    func test_visBareGolfDenneUka_sportPlusWindow() {
        guard let f = parse("Vis bare golf denne uka") else { return XCTFail("should be a present filter") }
        XCTAssertEqual(f.sports, ["golf"])
        XCTAssertEqual(f.window, .thisWeek)
        XCTAssertTrue(f.entities.isEmpty)
        XCTAssertEqual(f.subjectLabel, "GOLF · DENNE UKA")
    }

    func test_visVintersport_categoryExpandsToMemberSports() {
        guard let f = parse("Vis vintersport") else { return XCTFail("should be a present filter") }
        XCTAssertEqual(f.sports, ["biathlon", "cross-country", "nordic", "alpine", "ski jumping"])
        // The line collapses the member set back to the umbrella name.
        XCTAssertEqual(f.subjectLabel, "VINTERSPORT")
    }

    func test_visGolfOgSjakk_twoSports() {
        XCTAssertEqual(parse("Vis golf og sjakk")?.sports, ["golf", "chess"])
    }

    func test_visBareHovland_entityFilter() {
        guard let f = parse("Vis bare Hovland") else { return XCTFail("should be a present filter") }
        XCTAssertEqual(f.entityIds, ["viktor-hovland"])
        XCTAssertTrue(f.sports.isEmpty)
    }

    func test_visAltIgjen_isReset() {
        guard let f = parse("Vis alt igjen") else { return XCTFail("should be a present (reset) filter") }
        XCTAssertTrue(f.isEmpty, "«vis alt igjen» clears the filter")
    }

    func test_visKunSykkelIDag_sportPlusToday() {
        guard let f = parse("Vis kun sykkel i dag") else { return XCTFail("should be a present filter") }
        XCTAssertEqual(f.sports, ["cycling"])
        XCTAssertEqual(f.window, .today)
    }

    // MARK: - Non-present utterances → nil (no arm stolen)

    func test_folgGolf_isNotAPresentFilter() {
        // «følg …» has no present cue → the mutation arm keeps it (this is the
        // WP-67 fix's other half: present wins for «vis …», follow stays follow).
        XCTAssertNil(parse("Følg golf"))
        XCTAssertNil(parse("Følg bare golf"))
    }

    func test_visBrannKampen_isNotAPresentFilter_leftToOpenEvent() {
        // «Vis Brann-kampen» names an event, not a sport/entity/window/reset —
        // it must fall through to the command arm's openEvent.
        XCTAssertNil(parse("Vis Brann-kampen"))
    }

    func test_otherArms_areNotPresentFilters() {
        for u in ["Del profilen min", "Hva vet du om meg?", "Hva skjer i kveld", "Bytt til mørkt tema"] {
            XCTAssertNil(parse(u), "«\(u)» must not be read as a presentation filter")
        }
    }
}

// MARK: - Routing through the mock assistant

final class PresentRoutingTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()
    private let profile = InterestProfile()

    func test_visCue_routesToPresentArm() async throws {
        let turn = try await MockInterestAssistant().interpret(
            utterance: "Vis bare golf denne uka", profile: profile, index: index, feed: FeedQuery(now: Date())
        )
        guard case let .present(filter) = turn else { return XCTFail("«vis …» must route to the present arm") }
        XCTAssertEqual(filter.sports, ["golf"])
        XCTAssertEqual(filter.window, .thisWeek)
    }

    func test_folgCue_stillRoutesToMutations() async throws {
        let turn = try await MockInterestAssistant().interpret(
            utterance: "Følg golf", profile: profile, index: index, feed: FeedQuery(now: Date())
        )
        guard case .mutations = turn else { return XCTFail("«følg …» must stay a mutation") }
    }

    func test_visEventName_stillRoutesToOpenCommand() async throws {
        let turn = try await MockInterestAssistant().interpret(
            utterance: "Vis Brann-kampen", profile: profile, index: index, feed: FeedQuery(now: Date())
        )
        guard case let .command(command) = turn, case .openEvent = command else {
            return XCTFail("«Vis Brann-kampen» must stay an openEvent command")
        }
    }
}

// MARK: - The pure filter application (view layer)

final class AgendaFilterApplyTests: XCTestCase {

    private let now = AssistantTestSupport.iso("2026-07-15T09:00:00Z")  // Wed, Europe/Oslo

    private var todayKey: String { FeedCompiler.osloDayKey(now) }
    private var tomorrowKey: String { FeedCompiler.osloDayKey(now.addingTimeInterval(86_400)) }

    private func row(id: String, sport: String, title: String, homeTeamEntityId: String? = nil) -> AgendaItem {
        let event = EventBuilder.make(sport: sport, title: title, time: "2026-07-15T18:00:00Z", homeTeamEntityId: homeTeamEntityId)
        return .event(AgendaEventRow(
            id: id, timeLabel: "18:00", title: title, metaLabel: nil, channelLabel: "–",
            isMustSee: false, mustWatch: false, isAIResearch: false, event: event
        ))
    }

    /// Two events today (golf + football), one tomorrow (cycling).
    private func sampleSections() -> [AgendaSection] {
        [
            AgendaSection(id: todayKey, label: "I DAG", items: [
                row(id: "g1", sport: "golf", title: "The Open"),
                row(id: "f1", sport: "football", title: "Lyn – Sogndal", homeTeamEntityId: "fk-lyn-oslo"),
            ]),
            AgendaSection(id: tomorrowKey, label: "I MORGEN", items: [
                row(id: "c1", sport: "cycling", title: "Tour de France etappe 12"),
            ]),
        ]
    }

    func test_nilAndEmptyFilter_isIdentity() {
        let sections = sampleSections()
        XCTAssertEqual(AgendaViewModel.applyFilter(nil, to: sections, now: now), sections)
        XCTAssertEqual(AgendaViewModel.applyFilter(AgendaFilter(), to: sections, now: now), sections)
    }

    func test_sportFilter_keepsOnlyMatchingRows_dropsEmptiedSections() {
        let out = AgendaViewModel.applyFilter(AgendaFilter(sports: ["golf"]), to: sampleSections(), now: now)
        // Only the golf row survives; the tomorrow (cycling) section is dropped whole.
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out.first?.items.map(\.id), ["g1"])
    }

    func test_entityFilter_matchesTeamEntityId() {
        let filter = AgendaFilter(entities: [FilterSubjectEntity(id: "fk-lyn-oslo", name: "Lyn")])
        let out = AgendaViewModel.applyFilter(filter, to: sampleSections(), now: now)
        XCTAssertEqual(out.flatMap { $0.items.map(\.id) }, ["f1"])
    }

    func test_windowFilter_keepsOnlyMatchingDay() {
        let today = AgendaViewModel.applyFilter(AgendaFilter(window: .today), to: sampleSections(), now: now)
        XCTAssertEqual(today.map(\.id), [todayKey], "a window-only filter keeps every subject on the matching day")
        XCTAssertEqual(today.first?.items.count, 2)

        let tomorrow = AgendaViewModel.applyFilter(AgendaFilter(window: .tomorrow), to: sampleSections(), now: now)
        XCTAssertEqual(tomorrow.map(\.id), [tomorrowKey])
    }

    func test_sportPlusWindow_intersects() {
        // golf is today; a golf + tomorrow filter yields nothing.
        let out = AgendaViewModel.applyFilter(AgendaFilter(sports: ["golf"], window: .tomorrow), to: sampleSections(), now: now)
        XCTAssertTrue(out.isEmpty)
    }
}

// MARK: - AssistantViewModel present arm (never a profile mutation)

@MainActor
final class AssistantPresentViewModelTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    private func makeVM() -> AssistantViewModel {
        AssistantViewModel(
            assistant: MockInterestAssistant(),
            profileStore: AssistantTestSupport.tempProfileStore(),
            index: index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog()
        )
    }

    func test_presentTurn_callsOnPresent_andNeverTouchesProfile() async {
        let vm = makeVM()
        var applied: AgendaFilter?
        vm.onPresent = { applied = $0 }

        vm.utterance = "Vis bare golf denne uka"
        await vm.submit()

        XCTAssertEqual(applied?.sports, ["golf"], "the host receives the parsed filter")
        XCTAssertEqual(vm.presentedFilter?.window, .thisWeek)
        XCTAssertTrue(vm.profile.rules.isEmpty, "a presentation filter NEVER mutates the profile")
        XCTAssertTrue(vm.pending.isEmpty, "no diff to confirm — it is not a mutation")
        XCTAssertEqual(vm.utterance, "", "the command line clears after a present turn")
    }

    func test_visAltIgjen_appliesAnEmptyFilter() async {
        let vm = makeVM()
        var applied: AgendaFilter?
        vm.onPresent = { applied = $0 }
        vm.utterance = "Vis alt igjen"
        await vm.submit()
        XCTAssertEqual(applied?.isEmpty, true, "«vis alt igjen» resets the view")
    }
}

// MARK: - AgendaViewModel.applyFilter (set / clear semantics)

@MainActor
final class AgendaViewModelFilterTests: XCTestCase {

    private func makeVM() -> AgendaViewModel {
        AgendaViewModel(profileStore: AssistantTestSupport.tempProfileStore())
    }

    func test_applyFilter_setsAndClears() {
        let vm = makeVM()
        vm.applyFilter(AgendaFilter(sports: ["golf"]))
        XCTAssertEqual(vm.filter?.sports, ["golf"])
        // An empty filter clears (the «vis alt igjen» reset path).
        vm.applyFilter(AgendaFilter())
        XCTAssertNil(vm.filter)
        vm.applyFilter(AgendaFilter(sports: ["chess"]))
        XCTAssertNotNil(vm.filter)
        // Explicit nil clears too.
        vm.applyFilter(nil)
        XCTAssertNil(vm.filter)
    }
}
