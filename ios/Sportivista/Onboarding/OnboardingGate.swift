//
//  OnboardingGate.swift
//  Sportivista
//
//  WP-31 — the pure decision layer for the first-run onboarding (dossier P310's
//  «definere»-løkke: "onboarding er en samtale, ikke et skjema"). Kept FM-free
//  and I/O-free so the whole "should we show it / where does it start" logic is
//  unit-testable directly, the same pure-core/thin-shell split the rest of the
//  app uses (ContentView is a thin `@AppStorage` + overlay shell around this).
//
//  The persistent flag is a single Bool in `@AppStorage` (mirroring
//  ThemeOverride.storageKey): onboarding is a one-time thing, re-runnable on
//  demand from "Hva jeg følger" (which just clears the flag / re-presents).
//

import Foundation

/// The steps of the calm first-run flow. `welcome` is always first; the build
/// step is `converse` when Apple Intelligence is available (the primary,
/// say-what-you-follow path) else `quickPicks` (the fallback that must give
/// full value on its own); `landing` is the quiet finish that points at the
/// always-present command line.
enum OnboardingStep: Equatable, Sendable {
    case welcome
    case converse
    case quickPicks
    case landing
}

/// Pure show-decision + navigation helpers for onboarding.
enum OnboardingGate {
    /// `@AppStorage` key for the persistent "onboarding done" flag. A single
    /// value, applied at the app root — no per-screen wiring (same convention
    /// as `ThemeOverride.storageKey`).
    static let storageKey = "sportivista.onboardingCompleted"

    /// First-run detection: show the onboarding ONLY when it hasn't been
    /// completed/skipped AND the local profile is still empty. A user who
    /// already follows something (e.g. after a QR import, or a returning
    /// install) never sees it unprompted; a re-run is an explicit action
    /// (`restart`, below), never automatic.
    static func shouldShow(completed: Bool, profileIsEmpty: Bool) -> Bool {
        !completed && profileIsEmpty
    }

    /// The build-profile step to enter after the welcome. Conversation-first
    /// when the on-device model can be used; quick-picks otherwise — so a
    /// cold start without Apple Intelligence still lands on a fully useful
    /// step rather than a dead conversation box.
    static func buildStep(aiAvailable: Bool) -> OnboardingStep {
        aiAvailable ? .converse : .quickPicks
    }
}
