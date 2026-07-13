//
//  ZenjiApp.swift
//  Zenji
//
//  App entry point. WP-12 wires up SyncClient + the BGAppRefreshTask here —
//  registration must happen before the app finishes launching, so it runs
//  eagerly in init() rather than from a view (see BackgroundRefreshScheduler).
//  FeedCompiler (WP-13) plugs in behind ContentView later.
//

import SwiftUI

@main
struct ZenjiApp: App {
    private let syncClient = SyncClient()
    private let dataStore = DataStore()

    init() {
        BackgroundRefreshScheduler.register(syncClient: syncClient, dataStore: dataStore)
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
