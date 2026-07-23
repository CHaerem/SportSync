//
//  BriefAlertPreference.swift
//  Sportivista
//
//  WP-181 — the OPT-IN store for the daily brief ping («Morgenbriefen er klar»,
//  ~06:45 Oslo). Mirrors WP-176's ResultAlertPreference PATTERN but is its OWN
//  preference, deliberately not reusing that set:
//
//    • AV som default. The ritual ping is a nudge, not something anyone should
//      discover buzzing them unasked — the user turns it on in Deg › APP.
//    • En per-ENHET-preferanse, ikke en del av følgeprofilen. Same reasoning as
//      NotificationLeadPreference / ResultAlertPreference / ThemeOverride: which
//      of MY devices pings me in the morning is a device concern, never
//      replicated to every device through the synced profile. A reset never
//      touches it.
//
//  Unlike ResultAlertPreference this is a single global on/off (not per-entity):
//  the ping carries NO content — always the same generic «klar» line, never a
//  result or a spoiler — so there is nothing to scope per team.
//

import Foundation

enum BriefAlertPreference {
    /// The `@AppStorage`/UserDefaults key. Absent ⇒ OFF (opt-in).
    static let storageKey = "sportivista.notify.dailyBriefEnabled"

    /// Whether the daily brief ping is scheduled. Default OFF — a missing key is
    /// a user who never opted in.
    static func isEnabled(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: storageKey)
    }

    /// Persist the choice.
    static func setEnabled(_ enabled: Bool, _ defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: storageKey)
    }
}
