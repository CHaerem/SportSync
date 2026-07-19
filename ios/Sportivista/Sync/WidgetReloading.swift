//
//  WidgetReloading.swift
//  Sportivista
//
//  WP-121: a thin seam over WidgetKit's
//  `WidgetCenter.shared.reloadAllTimelines()` so the app can nudge the
//  home-screen widget to rebuild the instant a sync changes the data it
//  renders — and so tests can VERIFY that nudge without a running WidgetKit
//  host (a recording double substitutes for the real, global WidgetCenter,
//  the same shape RecordingNotificationScheduler uses for
//  UNUserNotificationCenter).
//
//  Why this exists at all: the WP-118 audit found `reloadAllTimelines()` had
//  ZERO call sites in the whole app — the widget's own timeline reload policy
//  only rebuilds at the Europe/Oslo day boundary (see SportivistaWidget's
//  TimelineReloadPolicy), so between midnights the widget could sit up to ~24h
//  behind an event the server had moved. Every sync path (cold-start refresh,
//  background BGAppRefreshTask, pull-to-refresh) now calls this on a data change.
//
//  Lives in Sportivista/Sync but is deliberately NOT in the widget target's
//  source list (project.yml lists the widget's Sync files individually): the
//  APP reloads the widget, the widget never reloads itself — keeping this out
//  of the extension keeps "ingen nettverk/app-lifecycle-kode i widgeten" intact.
//

import Foundation
import WidgetKit

/// Asks WidgetKit to rebuild every timeline for this app's widgets. One method,
/// so a test double is trivial and the production path is a single system call.
protocol WidgetReloading: Sendable {
    func reloadAllTimelines()
}

/// The production seam, backed by the real `WidgetCenter`. A value type with no
/// stored state — trivially `Sendable`; `reloadAllTimelines()` is safe to call
/// from any thread/actor (it just posts a reload request to WidgetKit).
struct WidgetCenterReloader: WidgetReloading {
    func reloadAllTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
