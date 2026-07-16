//
//  ZenjiApp.swift
//  Zenji
//
//  App entry point. WP-12 wires up SyncClient + the BGAppRefreshTask here —
//  registration must happen before the app finishes launching, so it runs
//  eagerly in init() rather than from a view (see BackgroundRefreshScheduler).
//  FeedCompiler (WP-13) plugs in behind ContentView later.
//
//  WP-63: also starts the MetricKit subscriber here — one subscriber for the
//  app's whole lifetime, registered before launch finishes so it catches the
//  MXAppLaunchMetric. Collection runs in Release too (the point is REAL
//  on-device hangs / slow launches); the log is local + private and only the
//  DEBUG eval surface can export it (see MetricSubscriber / MetricLog).
//

import SwiftUI

@main
struct ZenjiApp: App {
    private let syncClient = SyncClient()
    private let dataStore = DataStore()
    private let metricSubscriber = MetricSubscriber()

    init() {
        BackgroundRefreshScheduler.register(syncClient: syncClient, dataStore: dataStore)
        metricSubscriber.start()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(syncClient: syncClient, dataStore: dataStore)
                .onAppear {
                    BackgroundRefreshScheduler.scheduleNextRefresh(dataStore: dataStore)
                }
        }
    }
}
