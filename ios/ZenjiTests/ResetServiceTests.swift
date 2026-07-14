//
//  ResetServiceTests.swift
//  ZenjiTests
//
//  WP-32 acceptance — "nullstill profil + re-onboard". Pure, FM-free: proves
//  `ResetService.reset(level:...)` against throwaway temp stores + an isolated
//  `UserDefaults` suite (never `.standard`, same convention as
//  `ThemeOverrideTests`). Covers both levels, the tombstone-not-bare-wipe
//  choice (so a synced peer can't resurrect what was reset), that the theme
//  override is untouched, and that `OnboardingGate.shouldShow` flips back to
//  true once the reset is done.
//

import XCTest

final class ResetServiceTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)
    private let index = AssistantTestSupport.liveIndex()

    /// An isolated `UserDefaults` suite, never `.standard` — same convention as
    /// `ThemeOverrideTests`. The caller `defer`s the cleanup itself (a shared
    /// helper capturing `defaults` in an escaping teardown block trips Swift 6
    /// strict concurrency, since `UserDefaults` isn't `Sendable`).
    private func isolatedDefaults() throws -> (defaults: UserDefaults, suiteName: String) {
        let suiteName = "ResetServiceTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        return (defaults, suiteName)
    }

    /// A follow-rule + one memory fact/episodic note/behaviour bump + one
    /// misunderstood-log entry, all on the SAME shared profile store — the
    /// representative "everything a user has accumulated" state.
    private func seededState() -> (profileStore: ProfileStore, memoryStore: MemoryStore, log: MisunderstoodLogStore) {
        let profileStore = AssistantTestSupport.tempProfileStore()
        try! profileStore.save(InterestProfile().applying(
            GroundedMutation(kind: .add, entity: index.entity(id: "casper-ruud")!, scope: nil, weight: 0.5, reason: "tennis", previousRule: nil), now: now
        ), now: now)

        let memoryStore = MemoryStore(profileStore: profileStore)
        memoryStore.save(SaveMemoryCommand(sport: "tennis", kind: .knowledgeLevel, value: "nybegynner", reason: "sa det selv"), now: now)
        memoryStore.appendEpisodic(DistilledNote(summary: "note"), now: now)
        memoryStore.record(.open, entityId: "casper-ruud")

        let log = AssistantTestSupport.tempMisunderstoodLog()
        log.record(utterance: "Følg cricket", outcome: .rejectedEntity, explanation: AssistantExplanation(understood: "x", reason: "y"), now: now)

        return (profileStore, memoryStore, log)
    }

    // MARK: - `.followedOnly` — profile + onboarding flag only

    func test_followedOnly_clearsProfile_butKeepsMemoryAndLog() throws {
        let (profileStore, memoryStore, log) = seededState()
        let (defaults, suiteName) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set(true, forKey: OnboardingGate.storageKey)

        ResetService.reset(level: .followedOnly, profileStore: profileStore, memoryStore: memoryStore, misunderstoodLogStore: log, defaults: defaults, now: now.addingTimeInterval(60))

        XCTAssertTrue(profileStore.load().isEmpty, "the follow-profile is cleared")
        XCTAssertFalse(memoryStore.load().isEmpty, "memory is untouched at the followedOnly level")
        XCTAssertFalse(log.load().isEmpty, "the misunderstood log is untouched at the followedOnly level")
        XCTAssertFalse(defaults.bool(forKey: OnboardingGate.storageKey), "the onboarding-completed flag is cleared")
    }

    func test_followedOnly_leavesADurableTombstone_notABareWipe() throws {
        // The brief calls this out explicitly: a reset must not just delete the
        // on-disk record (which would let a synced peer resurrect it) — it goes
        // through the SAME tombstone-stamping path a normal "Fjern" uses.
        let (profileStore, memoryStore, log) = seededState()
        let (defaults, suiteName) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        ResetService.reset(level: .followedOnly, profileStore: profileStore, memoryStore: memoryStore, misunderstoodLogStore: log, defaults: defaults, now: now.addingTimeInterval(60))

        let tombstone = profileStore.loadSyncState().rules.first { $0.entityId == "casper-ruud" }
        XCTAssertEqual(tombstone?.deleted, true, "the removed rule survives on disk as a tombstone, so a stale peer can't revive it on sync")
    }

    // MARK: - `.everything` — the GDPR level

    func test_everything_clearsProfileMemoryAndLog() throws {
        let (profileStore, memoryStore, log) = seededState()
        let (defaults, suiteName) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set(true, forKey: OnboardingGate.storageKey)

        ResetService.reset(level: .everything, profileStore: profileStore, memoryStore: memoryStore, misunderstoodLogStore: log, defaults: defaults, now: now.addingTimeInterval(60))

        XCTAssertTrue(profileStore.load().isEmpty, "the follow-profile is cleared")
        XCTAssertTrue(memoryStore.load().isEmpty, "all three memory layers are forgotten")
        XCTAssertTrue(log.load().isEmpty, "the misunderstood log is emptied")
        XCTAssertFalse(defaults.bool(forKey: OnboardingGate.storageKey), "the onboarding-completed flag is cleared")
    }

    // MARK: - Theme override is a device preference, never touched

    func test_reset_neverTouchesTheThemeOverride() throws {
        let (profileStore, memoryStore, log) = seededState()
        let (defaults, suiteName) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set(ThemeOverride.dark.rawValue, forKey: ThemeOverride.storageKey)

        ResetService.reset(level: .everything, profileStore: profileStore, memoryStore: memoryStore, misunderstoodLogStore: log, defaults: defaults, now: now.addingTimeInterval(60))

        XCTAssertEqual(defaults.string(forKey: ThemeOverride.storageKey), ThemeOverride.dark.rawValue,
                       "a unit preference (theme), not part of the PROFILE, must survive any reset level")
    }

    // MARK: - OnboardingGate re-triggers after a reset

    func test_afterReset_onboardingGateShowsAgain() throws {
        let (profileStore, memoryStore, log) = seededState()
        let (defaults, suiteName) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set(true, forKey: OnboardingGate.storageKey)
        XCTAssertFalse(OnboardingGate.shouldShow(completed: defaults.bool(forKey: OnboardingGate.storageKey), profileIsEmpty: profileStore.load().isEmpty))

        ResetService.reset(level: .followedOnly, profileStore: profileStore, memoryStore: memoryStore, misunderstoodLogStore: log, defaults: defaults, now: now.addingTimeInterval(60))

        XCTAssertTrue(OnboardingGate.shouldShow(completed: defaults.bool(forKey: OnboardingGate.storageKey), profileIsEmpty: profileStore.load().isEmpty),
                      "an empty profile + a cleared flag means the gate shows onboarding again — no reinstall needed")
    }

    // MARK: - Server-synced cache is out of scope (nothing here to assert on —
    // ResetService never receives a DataStore/CacheStore reference at all, so
    // there is no code path that could touch it; this documents that as intentional.)
}
