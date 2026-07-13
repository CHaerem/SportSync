//
//  RecordingNotificationScheduler.swift
//  ZenjiTests
//
//  WP-15: a recording `NotificationScheduling` double — logs every
//  schedule/cancel call instead of touching the real, global
//  UNUserNotificationCenter (ZenjiTests is a hostless logic bundle; a real
//  center call would need a running app and would prompt the actual OS
//  permission dialog, neither of which a unit test should depend on).
//
//  `@unchecked Sendable` mirrors `MockURLProtocol`'s own reasoning: test code
//  in this suite runs single-threaded, each test gets a fresh instance, and
//  the strict-concurrency checker has no way to verify that on its own for a
//  plain mutable class.
//

import Foundation

final class RecordingNotificationScheduler: NotificationScheduling, @unchecked Sendable {
    private(set) var scheduledRequests: [NotificationRequest] = []
    private(set) var cancelledIDs: [String] = []
    private(set) var authorizationRequestCount = 0
    var authorizationResult = true

    func requestAuthorizationIfNeeded() async -> Bool {
        authorizationRequestCount += 1
        return authorizationResult
    }

    func schedule(_ request: NotificationRequest) async {
        scheduledRequests.append(request)
    }

    func cancel(id: String) async {
        cancelledIDs.append(id)
    }
}
