//
//  BackgroundRefreshScheduler.swift
//  Zenji
//
//  WP-12: thin BGTaskScheduler wrapper — registers and (re)submits the
//  `app.sportivista.refresh` BGAppRefreshTask and delegates the actual work to
//  SyncClient. This is intentionally a separate, minimal layer: everything
//  with real logic to test lives in BackgroundRefreshScheduling.swift (a
//  pure function) instead of here. Not unit-tested itself — BGTaskScheduler
//  needs a running app + the real OS scheduler, which a test target doesn't
//  provide.
//
//  Requires `app.sportivista.refresh` in Info.plist's
//  BGTaskSchedulerPermittedIdentifiers (project.yml) and the Background
//  Modes "fetch" capability (UIBackgroundModes) — both wired in project.yml.
//
//  `@preconcurrency import`: BGTask/BGAppRefreshTask predate Swift
//  Concurrency and aren't annotated Sendable, but `handle(task:...)` below
//  legitimately needs to touch the same task instance both to hand off to
//  SyncClient's async `sync()` and to wire its `expirationHandler` — this is
//  Apple's own documented escape hatch for a not-yet-audited system
//  framework under the Swift 6 language mode (this project's SWIFT_VERSION).
//

@preconcurrency import BackgroundTasks
import Foundation

enum BackgroundRefreshScheduler {
    static let taskIdentifier = "app.sportivista.refresh"

    /// Registers the handler. Must be called before the app finishes
    /// launching (Apple's own requirement for BGTaskScheduler) — with no
    /// AppDelegate in this pure-SwiftUI app, that means ZenjiApp's `init()`,
    /// not a view's `.task` or `.onAppear`.
    static func register(syncClient: SyncClient, dataStore: DataStore) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else { return }
            handle(task: refreshTask, syncClient: syncClient, dataStore: dataStore)
        }
    }

    /// Submits (or re-submits) the next refresh request. Safe to call
    /// repeatedly — a new submission simply replaces any pending one.
    /// Submission errors are ignored: the Simulator and hosts without the
    /// Background Modes capability provisioned throw here, and background
    /// refresh is best-effort by nature — a failed submit just means no
    /// background refresh happens until the app is opened again, which
    /// still triggers a foreground sync (see ContentView).
    static func scheduleNextRefresh(dataStore: DataStore) {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = BackgroundRefreshScheduling.earliestBeginDate(lastSync: dataStore.lastSync)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(task: BGAppRefreshTask, syncClient: SyncClient, dataStore: DataStore) {
        scheduleNextRefresh(dataStore: dataStore) // line up the next one first, per Apple's guidance

        let syncTask = Task {
            _ = await syncClient.sync()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            syncTask.cancel()
        }
    }
}
