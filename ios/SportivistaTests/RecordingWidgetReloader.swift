//
//  RecordingWidgetReloader.swift
//  SportivistaTests
//
//  WP-121: a recording `WidgetReloading` double — counts
//  `reloadAllTimelines()` calls instead of touching the real, global
//  WidgetCenter (SportivistaTests is a hostless logic bundle with no WidgetKit
//  host; the real call needs a running app). Mirrors
//  RecordingNotificationScheduler's `@unchecked Sendable` reasoning: test code
//  in this suite runs single-threaded and each test gets a fresh instance.
//

import Foundation

final class RecordingWidgetReloader: WidgetReloading, @unchecked Sendable {
    private(set) var reloadCount = 0

    func reloadAllTimelines() {
        reloadCount += 1
    }
}
