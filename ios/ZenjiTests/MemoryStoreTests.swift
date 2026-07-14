//
//  MemoryStoreTests.swift
//  ZenjiTests
//
//  WP-30 — the three memory layers persist + project correctly, and memory
//  RIDES the same `ProfileSyncState` as the profile (extends it, never a
//  competing store): a memory write leaves the follow-rules intact and vice
//  versa. Also the "Hva jeg vet om deg" CRUD (edit fact, delete each layer,
//  "Glem alt") and the model's saveMemory command round-trip.
//

import XCTest

final class MemoryStoreTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    // MARK: - saveMemory command round-trip (the tool's effect)

    func test_saveCommand_persistsAndReloads() {
        let store = AssistantTestSupport.tempMemoryStore()
        store.save(SaveMemoryCommand(sport: "chess", kind: .knowledgeLevel, value: "nybegynner", reason: "sa det selv"), now: now)

        let memory = store.load()
        XCTAssertEqual(memory.facts.count, 1)
        let fact = try! XCTUnwrap(memory.facts.first)
        XCTAssertEqual(fact.kind, .knowledgeLevel)
        XCTAssertEqual(fact.sport, "chess")
        XCTAssertEqual(fact.value, "nybegynner")
    }

    func test_saveCommand_foldsSameScopeSameKind_ratherThanDuplicating() {
        let store = AssistantTestSupport.tempMemoryStore()
        store.save(SaveMemoryCommand(sport: "f1", kind: .spoilerPolicy, value: "opptak", reason: "a"), now: now)
        store.save(SaveMemoryCommand(sport: "f1", kind: .spoilerPolicy, value: "opptak (helg)", reason: "b"), now: now.addingTimeInterval(60))

        let facts = store.load().facts.filter { $0.kind == .spoilerPolicy }
        XCTAssertEqual(facts.count, 1, "a second same-scope/same-kind save refreshes, never duplicates")
        XCTAssertEqual(facts.first?.value, "opptak (helg)")
    }

    // MARK: - Structured facts CRUD

    func test_upsertFact_thenEdit_updatesInPlace() {
        let store = AssistantTestSupport.tempMemoryStore()
        var fact = MemoryFact(entityId: "casper-ruud", kind: .preference, value: "liker grus", reason: "r", updatedAt: now)
        store.upsertFact(fact, now: now)

        fact.value = "liker gress"
        store.upsertFact(fact, now: now.addingTimeInterval(60))

        let facts = store.load().facts
        XCTAssertEqual(facts.count, 1, "same id ⇒ edit in place, not a new fact")
        XCTAssertEqual(facts.first?.value, "liker gress")
    }

    func test_deleteFact_leavesADurableTombstone() {
        let store = AssistantTestSupport.tempMemoryStore()
        let fact = MemoryFact(sport: "golf", kind: .note, value: "x", reason: "r", updatedAt: now)
        store.upsertFact(fact, now: now)
        store.deleteFact(id: fact.id, now: now.addingTimeInterval(60))

        XCTAssertTrue(store.load().facts.isEmpty, "the live view no longer shows it")
        let onDisk = store.profileStore.loadSyncState().facts.first { $0.id == fact.id }
        XCTAssertEqual(onDisk?.deleted, true, "the deletion survives as a tombstone (so a peer can't revive it)")
    }

    // MARK: - Episodic

    func test_appendEpisodic_storesMemoryNoteAndSurvivesReload() {
        let store = AssistantTestSupport.tempMemoryStore()
        store.appendEpisodic(DistilledNote(summary: "Lærte: ser Tour i opptak i kveld.", entityRefs: ["cycling"], kind: .spoilerPolicy), now: now)

        let episodic = store.load().episodic
        XCTAssertEqual(episodic.count, 1)
        XCTAssertEqual(episodic.first?.summary, "Lærte: ser Tour i opptak i kveld.")
        XCTAssertTrue(episodic.first?.isMemory ?? false)
    }

    func test_deleteEpisodic_removesIt() {
        let store = AssistantTestSupport.tempMemoryStore()
        store.appendEpisodic(DistilledNote(summary: "a"), now: now)
        let note = try! XCTUnwrap(store.load().episodic.first)
        store.deleteEpisodic(id: note.id)
        XCTAssertTrue(store.load().episodic.isEmpty)
    }

    // MARK: - Behaviour (grow-only, pure)

    func test_recordBehaviour_accumulatesPerEntityAndSport() {
        let store = AssistantTestSupport.tempMemoryStore()
        store.record(.open, entityId: "casper-ruud")
        store.record(.open, entityId: "casper-ruud")
        store.record(.dismiss, sport: "tennis")

        let stats = store.load().behavior
        let opens = stats.first { $0.kind == .open && $0.token == "casper-ruud" }
        XCTAssertEqual(opens?.total, 2)
        let dismiss = stats.first { $0.kind == .dismiss && $0.token == "tennis" && $0.isSport }
        XCTAssertEqual(dismiss?.total, 1)
    }

    // MARK: - "Glem alt"

    func test_forgetAll_wipesMemoryButKeepsTheFollowProfile() throws {
        // A shared profile file carrying BOTH a follow-rule and memory.
        let profileStore = AssistantTestSupport.tempProfileStore()
        let index = AssistantTestSupport.liveIndex()
        try profileStore.save(InterestProfile().applying(
            GroundedMutation(kind: .add, entity: index.entity(id: "casper-ruud")!, scope: nil, weight: 0.5, reason: "tennis", previousRule: nil), now: now
        ), now: now)
        let store = MemoryStore(profileStore: profileStore)
        store.save(SaveMemoryCommand(sport: "f1", kind: .spoilerPolicy, value: "opptak", reason: "r"), now: now)
        store.appendEpisodic(DistilledNote(summary: "note"), now: now)
        store.record(.open, entityId: "casper-ruud")

        store.forgetAll(now: now.addingTimeInterval(120))

        let memory = store.load()
        XCTAssertTrue(memory.isEmpty, "all three memory layers are forgotten")
        XCTAssertEqual(profileStore.load().rules.map(\.entityId), ["casper-ruud"], "the follow-profile is untouched by 'Glem alt'")
    }

    // MARK: - Memory rides ProfileSyncState (extends, doesn't compete)

    func test_savingProfile_preservesMemory() throws {
        let profileStore = AssistantTestSupport.tempProfileStore()
        let index = AssistantTestSupport.liveIndex()
        let store = MemoryStore(profileStore: profileStore)
        store.save(SaveMemoryCommand(sport: "chess", kind: .knowledgeLevel, value: "nybegynner", reason: "r"), now: now)

        // A later PROFILE save (rules path) must not drop the memory fact.
        try profileStore.save(InterestProfile().applying(
            GroundedMutation(kind: .add, entity: index.entity(id: "magnus-carlsen")!, scope: nil, weight: 0.5, reason: "sjakk", previousRule: nil), now: now
        ), now: now.addingTimeInterval(60))

        XCTAssertEqual(store.load().facts.first?.value, "nybegynner", "a profile save carries memory facts through untouched")
    }

    // MARK: - Projection

    func test_memoryStateProjection_dropsTombstonesAndForeignRecords() {
        let state = ProfileSyncState(
            episodic: [
                EpisodicNote(distilled: DistilledNote(summary: "keep"), now: now),
                EpisodicNote(id: "foreign", kind: "misunderstood", createdAt: now),
            ],
            counters: [
                Counter(key: BehaviorCounter.key(.open, entityId: "casper-ruud"), perDevice: ["d": 3]),
                Counter(key: "some-other-counter", perDevice: ["d": 9]),
            ],
            facts: [
                MemoryFact(id: "live", sport: "golf", kind: .note, value: "v", reason: "r", updatedAt: now),
                MemoryFact(id: "dead", sport: "golf", kind: .note, value: "v", reason: "r", updatedAt: now, deleted: true),
            ]
        )
        let memory = MemoryState(from: state)
        XCTAssertEqual(memory.facts.map(\.id), ["live"], "tombstoned facts are dropped from the live view")
        XCTAssertEqual(memory.episodic.map(\.summary), ["keep"], "only WP-30 memory notes appear")
        XCTAssertEqual(memory.behavior.map(\.token), ["casper-ruud"], "only behaviour-namespaced counters appear")
    }
}
