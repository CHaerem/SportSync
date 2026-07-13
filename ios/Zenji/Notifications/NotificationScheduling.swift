//
//  NotificationScheduling.swift
//  Zenji
//
//  WP-15: the thin shell around UNUserNotificationCenter. Everything with
//  real logic (which events get a reminder, what the text says, when it
//  fires) lives in the pure `NotificationPlanner.plan(...)`; this protocol
//  exists only so tests can substitute a recording double instead of talking
//  to the real, global notification center (ZenjiTests is a hostless logic
//  bundle — a real UNUserNotificationCenter call would need a running app
//  and would prompt the actual OS permission dialog, neither of which a unit
//  test should depend on).
//

import Foundation
import UserNotifications

protocol NotificationScheduling: Sendable {
    /// Requests notification permission the first time it's actually needed
    /// (see the file header on NotificationPlanner.reconcile for why this is
    /// called lazily, not at app start), and reports whether the app may
    /// show alerts afterward. Safe to call on every reconcile — a real
    /// implementation only prompts the user once (`.notDetermined`); after
    /// that it just reports the OS's existing decision.
    func requestAuthorizationIfNeeded() async -> Bool

    /// Schedules (or, for an identifier already pending, replaces — this is
    /// standard `UNUserNotificationCenter` behaviour) a local notification.
    func schedule(_ request: NotificationRequest) async

    /// Cancels a pending notification by id. A no-op if nothing with that id
    /// is pending.
    func cancel(id: String) async
}

/// The production implementation, backed by the real `UNUserNotificationCenter`.
/// `@unchecked Sendable` mirrors `CacheStore`'s own reasoning: this wraps a
/// system framework singleton this process treats as effectively immutable
/// (one `let` reference, no locally-mutated state), the same shape the
/// strict-concurrency checker can't verify on its own for a framework type.
final class UNUserNotificationScheduler: NotificationScheduling, @unchecked Sendable {
    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func requestAuthorizationIfNeeded() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .denied:
            return false
        case .notDetermined:
            return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        @unknown default:
            return false
        }
    }

    func schedule(_ request: NotificationRequest) async {
        let content = UNMutableNotificationContent()
        content.title = request.title
        content.body = request.body
        content.sound = .default

        // A time-interval trigger (not a calendar/date trigger) so a
        // `fireDate` that NotificationPlanner has already clamped to "now"
        // (see its file header) fires promptly instead of being rejected —
        // UNCalendarNotificationTrigger has no such minimum-interval quirk,
        // but UNTimeIntervalNotificationTrigger requires > 0.
        let interval = max(request.fireDate.timeIntervalSinceNow, 1)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let osRequest = UNNotificationRequest(identifier: request.id, content: content, trigger: trigger)
        try? await center.add(osRequest)
    }

    func cancel(id: String) async {
        center.removePendingNotificationRequests(withIdentifiers: [id])
    }
}
