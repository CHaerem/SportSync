//
//  NotificationOperation.swift
//  Zenji
//
//  WP-15: the output of `NotificationPlanner.plan(...)` — a set of operations
//  keyed on the WP-02 stable event id, one per affected event, never more
//  than one per id. The planner is pure data in, pure data out; only
//  `NotificationPlanner.reconcile(...)` (NotificationPlanner.swift) actually
//  executes these against a `NotificationScheduling`.
//

import Foundation

/// The concrete, ready-to-schedule content for one event's reminder. Two
/// requests compare equal only when EVERYTHING an OS notification actually
/// shows is identical (fire date, title, body) — any difference (a moved
/// kickoff, a newly-confirmed channel, a title correction) is a real change
/// the planner must act on.
struct NotificationRequest: Equatable {
    var id: String
    var title: String
    var body: String
    var fireDate: Date
}

/// One instruction for a single event id. `scheduleNew` and `reschedule`
/// carry the same payload shape (a stable id + same-identifier request always
/// replaces a pending one at the OS level — see NotificationScheduling) but
/// are kept as distinct cases because the *reason* differs and the WP-15
/// brief's acceptance tests assert on it directly: a first-ever appearance
/// vs. a change to an event this client already believed it had scheduled.
enum NotificationOperation: Equatable {
    case scheduleNew(NotificationRequest)
    case reschedule(NotificationRequest)
    case cancel(id: String)

    var id: String {
        switch self {
        case .scheduleNew(let request), .reschedule(let request):
            return request.id
        case .cancel(let id):
            return id
        }
    }
}
