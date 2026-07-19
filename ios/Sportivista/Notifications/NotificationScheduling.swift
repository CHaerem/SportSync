//
//  NotificationScheduling.swift
//  Sportivista
//
//  WP-15: the thin shell around UNUserNotificationCenter. Everything with
//  real logic (which events get a reminder, what the text says, when it
//  fires) lives in the pure `NotificationPlanner.plan(...)`; this protocol
//  exists only so tests can substitute a recording double instead of talking
//  to the real, global notification center (SportivistaTests is a hostless logic
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
    /// Resolves the notification center lazily, on first actual use — merely
    /// CONSTRUCTING this scheduler must never touch
    /// `UNUserNotificationCenter.current()`. `.current()` throws in a hostless
    /// process (no app bundle → `bundleProxyForCurrentProcess is nil`), so an
    /// eager call in `init` would crash any code that builds a *default*
    /// NotificationPlanner/SyncFreshness inside the hostless SportivistaTests bundle
    /// — WP-121 made that reachable, since AgendaViewModel now carries a default
    /// SyncFreshness and its unit tests construct it with no running app. The
    /// real app always has a bundle, so lazy vs. eager resolution is behaviourally
    /// identical there (and `.current()` returns the same singleton either way).
    private let resolveCenter: @Sendable () -> UNUserNotificationCenter

    init(center: @autoclosure @escaping @Sendable () -> UNUserNotificationCenter = .current()) {
        self.resolveCenter = center
    }

    func requestAuthorizationIfNeeded() async -> Bool {
        let center = resolveCenter()
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
        try? await resolveCenter().add(osRequest)
    }

    func cancel(id: String) async {
        resolveCenter().removePendingNotificationRequests(withIdentifiers: [id])
    }
}
