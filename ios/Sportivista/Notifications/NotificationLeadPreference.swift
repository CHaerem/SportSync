//
//  NotificationLeadPreference.swift
//  Sportivista
//
//  WP-66 — the NotificationPlanner's FIRST control surface. Until now the lead
//  time (how long before an event a reminder fires) was fixed by
//  interests.json's `notify.leadMinutes` (default 30) with no way for the user
//  to change it. The assistant's `setNotificationLeadTime` command needs a
//  place to persist that choice, so this is a tiny, per-DEVICE preference:
//
//    • ON  (default) — fire the reminder AHEAD of the event (the interests lead).
//    • OFF          — fire it AT the event's start (no lead).
//
//  A device-level display/behaviour preference, deliberately NOT part of the
//  synced follow-profile or personal memory (same reasoning as ThemeOverride in
//  ResetService's header) — it lives in its own `@AppStorage`/UserDefaults key
//  and a reset never touches it. Kept as a pure enum with an injectable
//  `UserDefaults` so the persistence + the effective-lead math are unit-testable
//  without touching `.standard`.
//

import Foundation

enum NotificationLeadPreference {
    /// The `@AppStorage`/UserDefaults key (default: ON when unset).
    static let storageKey = "sportivista.notify.leadTimeEnabled"

    /// Whether reminders fire AHEAD of the event. Absent key ⇒ true (the
    /// historical behaviour), so an upgrade doesn't silently change anything.
    static func isLeadTimeEnabled(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: storageKey) == nil ? true : defaults.bool(forKey: storageKey)
    }

    /// Persist the choice.
    static func setLeadTimeEnabled(_ enabled: Bool, _ defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: storageKey)
    }
}
