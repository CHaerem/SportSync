//
//  AssistantViewModel+Follow.swift
//  Sportivista
//
//  WP-105 — the ONE direct-follow apply path shared by the assistant-free 3b
//  surfaces (Deg › Det du følger + Legg til, and the event detail sheet's
//  «Følg <navn>» button). "Interesser uten assistent": the path from "så noe
//  interessant" to "følger" never routes through the assistant diff — a tap IS
//  the confirmation.
//
//  This is NOT a new write path. It funnels the same three steps every
//  confirmed mutation already uses into one entry point:
//    profile = profile.applying(mutation)   // the pure diff core (InterestProfile)
//    profileStore.save(profile)             // the persist() body — the one store
//    onProfileChanged?()                    // "umiddelbar konsekvens" recompile
//  i.e. exactly what `confirm`/`confirmAll`/`toggleStarterPack` do, minus the
//  diff round-trip — mirroring `toggleStarterPack`'s "a tap IS the confirmation"
//  contract for a single entity. It lives in Profile/ (like the WP-19 profil-sync
//  arm in AssistantViewModel+ProfileSync.swift) so it can reach the internal
//  `profile` setter, the `profileStore`, and `onProfileChanged` without touching
//  Assistant/.
//

import Foundation

extension AssistantViewModel {
    /// Whether `entityId` is already in the profile — drives the Legg til /
    /// detail «Følg» button's presence (no button for something already
    /// followed) and the "Følger" read-out.
    func isFollowing(_ entityId: String) -> Bool {
        profile.rule(for: entityId) != nil
    }

    /// Follow `entity` directly — the tap IS the confirmation, no assistant diff
    /// (3b: "krever aldri assistenten"). Upsert semantics via
    /// `InterestProfile.applying` (re-following just refreshes the rule), then the
    /// same persist + recompile every confirmed mutation runs. Returns whether the
    /// save succeeded (false only on a genuine disk failure; the in-memory profile
    /// is updated regardless, exactly like the diff/confirm path).
    @discardableResult
    func follow(_ entity: Entity, reason: String? = nil, now: Date = Date()) -> Bool {
        let mutation = GroundedMutation(
            kind: .add,
            entity: entity,
            scope: nil,
            weight: InterestProfile.defaultWeight,
            reason: reason ?? "Du valgte å følge \(entity.name).",
            previousRule: profile.rule(for: entity.id)
        )
        profile = profile.applying(mutation, now: now)
        let saved = (try? profileStore.save(profile)) != nil
        onProfileChanged?()
        return saved
    }
}
