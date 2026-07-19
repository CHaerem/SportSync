//
//  ContextActionTests.swift
//  SportivistaTests
//
//  WP-16.4 — the event detail sheet's two context actions: «Følg <entitet>»
//  (a pre-filled add routed through the SAME grounded diff/confirm flow) and
//  «Hvorfor vises denne?» (the deterministic FeedCompiler.whyShown reason). The
//  first is proven at both ends — the followable candidates a row exposes, and
//  the view model turning a tap into a confirmable diff that, once confirmed,
//  recompiles the agenda (onProfileChanged).
//

import XCTest

@MainActor
final class ContextActionTests: XCTestCase {

    private let index = AssistantTestSupport.liveIndex()

    // MARK: - followable candidates (AgendaViewModel.followableEntities)

    func test_followable_resolvesTeamsByName() {
        let event = EventBuilder.make(
            sport: "football", title: "Strømsgodset – Lyn", time: "2026-08-02T15:00:00Z",
            homeTeam: "Strømsgodset", awayTeam: "Lyn"
        )
        let followable = AgendaViewModel.followableEntities(for: event, index: index, followedIds: [])
        XCTAssertTrue(followable.contains { $0.id == "fk-lyn-oslo" }, "«Lyn» resolves to FK Lyn Oslo")
    }

    func test_followable_dropsAlreadyFollowed() {
        let event = EventBuilder.make(
            sport: "football", title: "Strømsgodset – Lyn", time: "2026-08-02T15:00:00Z",
            homeTeam: "Strømsgodset", awayTeam: "Lyn"
        )
        let followable = AgendaViewModel.followableEntities(for: event, index: index, followedIds: ["fk-lyn-oslo"])
        XCTAssertFalse(followable.contains { $0.id == "fk-lyn-oslo" }, "no «Følg X» for something already followed")
    }

    // MARK: - proposeFollow → diff → confirm → recompile

    func test_proposeFollow_createsAConfirmableDiff_thenApplies() {
        var recompiled = 0
        let vm = AssistantViewModel(
            assistant: MockInterestAssistant(),
            profileStore: AssistantTestSupport.tempProfileStore(),
            index: self.index,
            misunderstoodLog: AssistantTestSupport.tempMisunderstoodLog()
        )
        vm.onProfileChanged = { recompiled += 1 }

        let lyn = index.entity(id: "fk-lyn-oslo")!
        vm.proposeFollow(lyn)
        XCTAssertEqual(vm.pending.map(\.entity.id), ["fk-lyn-oslo"], "a tap pre-fills a confirmable add")
        XCTAssertTrue(vm.profile.isEmpty, "nothing applied until Bekreft")

        vm.confirm(vm.pending[0])
        XCTAssertEqual(vm.profile.rules.map(\.entityId), ["fk-lyn-oslo"])
        XCTAssertEqual(recompiled, 1, "confirming a follow recompiles the agenda immediately")
    }

    // MARK: - whyShown (FeedCompiler)

    func test_whyShown_trackedTeam() {
        let fe = FeedEvent(sport: "football", title: "Strømsgodset – Lyn", homeTeam: "Strømsgodset", awayTeam: "Lyn")
        let interests = Interests(alwaysTrack: Interests.AlwaysTrack(
            teams: [Interests.Entity(name: "Lyn", sport: "football")]
        ))
        XCTAssertTrue(FeedCompiler.whyShown(fe, interests: interests).hasPrefix("Fordi Lyn spiller"))
    }

    func test_whyShown_followedSport() {
        let fe = FeedEvent(sport: "football", title: "Bodø/Glimt – Molde")
        let why = FeedCompiler.whyShown(fe, interests: Interests(followBroadly: ["football"]))
        XCTAssertEqual(why, "Du følger fotball")
    }

    func test_whyShown_aiResearch() {
        let fe = FeedEvent(sport: "chess", title: "Sjakk-NM", source: "ai-research")
        XCTAssertEqual(FeedCompiler.whyShown(fe, interests: Interests()), "AI-research fant dette for deg")
    }

    func test_whyShown_trackedTournamentAndEnduranceVerb() {
        // A tracked tournament reads "Del av …".
        let stage = FeedEvent(sport: "cycling", title: "Etappe 3", tournament: "Tour de France 2026")
        let tournInterests = Interests(alwaysTrack: Interests.AlwaysTrack(
            tournaments: [Interests.Entity(name: "Tour de France", sport: "cycling", notify: true)]
        ))
        XCTAssertTrue(FeedCompiler.whyShown(stage, interests: tournInterests).hasPrefix("Del av Tour de France"))

        // A tracked rider in an endurance sport uses "er med", not "spiller"
        // (the rider name is matched in the haystack via the title).
        let riderEvent = FeedEvent(sport: "cycling", title: "Etappe 3 – Jonas Abrahamsen i brudd")
        let riderInterests = Interests(alwaysTrack: Interests.AlwaysTrack(
            athletes: [Interests.Entity(name: "Jonas Abrahamsen", sport: "cycling")]
        ))
        XCTAssertTrue(FeedCompiler.whyShown(riderEvent, interests: riderInterests).hasPrefix("Fordi Jonas Abrahamsen er med"))
    }
}
