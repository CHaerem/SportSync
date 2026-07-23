//
//  BriefNotificationPlanner.swift
//  Sportivista
//
//  WP-181 — plans the daily brief ritual ping («Morgenbriefen er klar»), the
//  optional local notification that nudges the user toward the morning brief.
//  Same pure/impure split as NotificationPlanner: `plan(enabled:)` is a pure
//  function of the opt-in state (unit-tested directly, no OS), and
//  `reconcile(enabled:)` carries the decision out against an injected
//  `NotificationScheduling`.
//
//  Two invariants this whole file exists to hold:
//    • GENERISK TEKST. The ping's text is ALWAYS the same fixed line — never a
//      result, a score or any content, so it can never be a spoiler on a lock
//      screen (the same rule ResultDigest's shielded alert follows, taken to its
//      limit: the brief ping carries no payload at all).
//    • ETTER morgen-editorialen. It fires at 06:45 Oslo, comfortably AFTER the
//      06:30 Oslo editorial run (WP-173) that the fallback brief line draws on,
//      so «klar» is honest.
//
//  Permission is requested ONLY when actually enabling (the same lazy rule the
//  event/result planners follow): a user turning it OFF is never prompted, and
//  the ping is never scheduled behind their back.
//

import Foundation

struct BriefNotificationPlanner: Sendable {
    /// The stable request id — one repeating notification, replaced (never
    /// duplicated) each time it is re-scheduled.
    static let identifier = "sportivista.brief.daily"
    /// 06:45 Europe/Oslo — 15 min AFTER the 06:30 Oslo morning editorial (WP-173),
    /// so the fallback line the brief may show is already fresh when we say «klar».
    static let osloHour = 6
    static let osloMinute = 45
    static let timeZoneIdentifier = "Europe/Oslo"
    /// The FIXED, content-free copy. Always this — no results, no spoilers, no
    /// digits. Echoes the house voice («Resultatet er klart. Åpne når du vil se
    /// det.» → VOICE.md) without ever naming what happened.
    static let title = "Morgenbriefen er klar"
    static let body = "Åpne når du vil."

    /// What to do given the opt-in state: enabled ⇒ (re)schedule the repeating
    /// ping; disabled ⇒ cancel it. Pure — the whole decision, no OS.
    enum Plan: Equatable {
        case schedule(DailyNotificationRequest)
        case cancel(id: String)
    }

    static let request = DailyNotificationRequest(
        id: identifier, title: title, body: body,
        hour: osloHour, minute: osloMinute, timeZoneIdentifier: timeZoneIdentifier
    )

    static func plan(enabled: Bool) -> Plan {
        enabled ? .schedule(request) : .cancel(id: identifier)
    }

    // MARK: - Execution (impure — the only part that touches the OS)

    var scheduler: NotificationScheduling

    init(scheduler: NotificationScheduling = UNUserNotificationScheduler()) {
        self.scheduler = scheduler
    }

    /// Bring the scheduled ping in line with `enabled`. Requests notification
    /// permission ONLY when enabling (turning it off never prompts). Returns the
    /// plan it carried out, for the tests.
    @discardableResult
    func reconcile(enabled: Bool) async -> Plan {
        let plan = Self.plan(enabled: enabled)
        switch plan {
        case .schedule(let request):
            guard await scheduler.requestAuthorizationIfNeeded() else { return plan }
            await scheduler.scheduleRepeatingDaily(request)
        case .cancel(let id):
            await scheduler.cancel(id: id)
        }
        return plan
    }
}
