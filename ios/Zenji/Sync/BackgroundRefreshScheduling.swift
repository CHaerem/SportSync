//
//  BackgroundRefreshScheduling.swift
//  Zenji
//
//  WP-12: pure scheduling-decision logic for the `app.sportivista.refresh`
//  BGAppRefreshTask — deliberately split out from BackgroundRefreshScheduler
//  .swift (which actually talks to BGTaskScheduler) so it can be unit
//  tested. BGTaskScheduler itself needs a running app + the real OS
//  scheduler and isn't something to unit test — but "when do we want the
//  next refresh, given when the last one happened" is a plain function of
//  (lastSync, now) with no such dependency.
//

import Foundation

enum BackgroundRefreshScheduling {
    /// Matches the research agent's own cadence (every 4h — see CLAUDE.md):
    /// no point asking the OS to refresh the client's cache more often than
    /// the server-side data actually changes.
    static let minimumInterval: TimeInterval = 4 * 60 * 60

    /// The earliest the OS should be asked to run the next background
    /// refresh. Never earlier than `now`: if a sync hasn't happened in a
    /// while (or ever — `lastSync == nil`), request the task as soon as the
    /// system is willing to grant it, rather than artificially pushing it
    /// further into the future.
    static func earliestBeginDate(
        lastSync: Date?,
        now: Date = Date(),
        minimumInterval: TimeInterval = BackgroundRefreshScheduling.minimumInterval
    ) -> Date {
        guard let lastSync else { return now }
        let earliest = lastSync.addingTimeInterval(minimumInterval)
        return max(earliest, now)
    }
}
