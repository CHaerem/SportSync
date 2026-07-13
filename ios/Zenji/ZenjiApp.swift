//
//  ZenjiApp.swift
//  Zenji
//
//  App entry point. Pure scaffold (WP-10) — no networking, no feed logic.
//  SyncClient (WP-12) and FeedCompiler (WP-13) plug in behind ContentView later.
//

import SwiftUI

@main
struct ZenjiApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
