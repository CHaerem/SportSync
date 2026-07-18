//
//  ResetService.swift
//  Sportivista
//
//  WP-32 — "nullstill profil + re-onboard". The owner's ask, verbatim: "burde
//  være mulig å resette/slette profil så jeg ikke trenger å reinstallere appen
//  for onboarding". This is the pure, testable core: one function that clears
//  local user state through the SAME stores the rest of the app already uses
//  — `ProfileStore` (WP-16/19), `MemoryStore` (WP-30), `MisunderstoodLogStore`
//  (WP-16.3) — plus the `OnboardingGate` flag (WP-31), so a reset genuinely
//  re-triggers the first-run flow on the very next frame. No SwiftUI here;
//  `AssistantViewModel.resetProfile(_:)` is the thin shell that also refreshes
//  its published state, and `ContentView` is what raises the onboarding
//  overlay (it owns that piece of state).
//
//  Two levels, both calm (DESIGN.md — reached from the same quiet foot of the
//  assistant ark as "Hva jeg følger"/"Hva jeg vet om deg", never a new tab):
//
//    • `.followedOnly` — "Nullstill det du følger": clears the interest
//      profile (every rule) + the onboarding-completed flag. Memory and the
//      misunderstood-log are untouched.
//    • `.everything`   — "Slett alt om meg" (the GDPR button): the above,
//      PLUS all personal memory (`MemoryStore.forgetAll`, WP-30's "Glem alt")
//      and the "Det jeg ikke forsto"-log (`MisunderstoodLogStore.deleteAll`).
//
//  Deliberately NOT reset by EITHER level:
//    • `ThemeOverride` — a per-DEVICE display preference, not part of the
//      user's PROFILE. It lives in its own `@AppStorage` key, conceptually
//      outside "what you follow" or "what I know about you" — flipping
//      someone's screen back to system/dark because they cleared their
//      follows would be a surprising side effect, not a benefit. (If a future
//      package ever wants a screen literally titled "innstillinger" that
//      bundles device prefs too, that is a deliberate, separate decision —
//      not implied by "nullstill profil".)
//    • Server-synced cache (events/entities/standings/tracked/…, `DataStore`/
//      `CacheStore`) — that data isn't the user's; it's world data mirrored
//      locally from the public site, and wiping it would force an immediate
//      re-fetch with no privacy benefit (CLAUDE.md's "cache/synkede
//      server-data røres ikke — bare bruker-profilen").
//
//  The tombstone question (the brief calls this out explicitly — "vurder: full
//  reset bør gi en REN start, ikke en haug tombstones som synkes ut"): a reset
//  goes through `ProfileStore.save(_:)` with an EMPTY `InterestProfile`, the
//  EXACT code path a normal one-by-one "Fjern" already uses
//  (`AssistantViewModel.removeRule`). That stamps a TOMBSTONE per removed rule
//  rather than deleting the on-disk record outright — a deliberate choice, not
//  an oversight. DESIGN.md's P360 sync contract is binding: "en sletting
//  replikeres — en gammel enhet gjenoppliver den aldri." If a reset instead
//  wrote a bare empty `ProfileSyncState`, a LocalOnly reset would look clean
//  on disk, but on a paid-account/CloudKit build the very next background sync
//  would silently RESURRECT every old rule from a peer that hasn't seen the
//  reset yet — the opposite of what "nullstill" promises, and a much worse
//  outcome than a few inert tombstone bytes. Tombstones do not bloat what the
//  user SEES: `ProfileSyncState.profile` already filters them out, so the live
//  "Hva jeg følger" view is genuinely, visibly empty either way. The SAME
//  reasoning applies to `MemoryStore.forgetAll()` (already tombstone-based for
//  facts) reused unchanged for the `.everything` level.
//

import Foundation

/// Which level of "nullstill" to perform (see file header).
enum ResetLevel: Sendable {
    /// "Nullstill det du følger": the follow-profile + onboarding flag only.
    case followedOnly
    /// "Slett alt om meg": the above, PLUS all personal memory and the
    /// misunderstood-utterance log. The GDPR button.
    case everything
}

enum ResetService {
    /// Performs the reset for `level` against the given stores, on THIS
    /// device only (see file header — sync, if enabled, is what carries the
    /// deletion to other devices, on their next round). `defaults` is
    /// injectable so tests never touch `UserDefaults.standard`.
    static func reset(
        level: ResetLevel,
        profileStore: ProfileStore,
        memoryStore: MemoryStore,
        misunderstoodLogStore: MisunderstoodLogStore,
        defaults: UserDefaults = .standard,
        now: Date = Date()
    ) {
        // The follow-profile: an empty save tombstones every existing rule via
        // the SAME diff-and-stamp path a normal "Fjern" uses (see header).
        try? profileStore.save(InterestProfile(rules: []), now: now)

        // The onboarding flag: clearing it (rather than merely setting it to
        // `false`) leaves no trace it was ever completed — `OnboardingGate.
        // shouldShow` reads `defaults.bool(forKey:)`, which is `false` either
        // way, so this is equivalent but honestly says "never completed".
        defaults.removeObject(forKey: OnboardingGate.storageKey)

        if level == .everything {
            memoryStore.forgetAll(now: now)
            misunderstoodLogStore.deleteAll()
        }
    }
}
