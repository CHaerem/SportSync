//
//  LaunchTrace.swift
//  Sportivista
//
//  DEBUG-only launch-phase timing — the measuring stick for the owner-reported
//  «Henter data …» cold-start hang (19.07.2026). Prints one line per phase with
//  ms since process start, so `simctl launch --console` (or Console.app on a
//  device) shows exactly where the first-paint milliseconds go. No-op in
//  Release; costs one static read otherwise.
//

import Foundation

enum LaunchTrace {
    #if DEBUG || SPORTIVISTA_TRACE
    static let processStart = CFAbsoluteTimeGetCurrent()

    /// Log a phase with duration since `since`, stamped with time since process start.
    static func mark(_ label: String, since: CFAbsoluteTime) {
        let now = CFAbsoluteTimeGetCurrent()
        let total = (now - processStart) * 1000
        let phase = (now - since) * 1000
        print(String(format: "[LAUNCH %7.1fms] %@ (%.1fms)", total, label, phase))
    }

    /// Log an instant (no duration).
    static func point(_ label: String) {
        let total = (CFAbsoluteTimeGetCurrent() - processStart) * 1000
        print(String(format: "[LAUNCH %7.1fms] %@", total, label))
    }
    #else
    @inline(__always) static func mark(_ label: String, since: CFAbsoluteTime) {}
    @inline(__always) static func point(_ label: String) {}
    #endif
}
