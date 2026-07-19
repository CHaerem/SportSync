//
//  AppVersion.swift
//  Sportivista
//
//  «Har jeg siste versjon?» — the published half. The static pipeline writes
//  docs/data/app-version.json with the short hash of the last commit that
//  touched ios/, and the ordinary manifest sync delivers it here like any
//  other data file (it is in SyncClient.defaultFilesOfInterest). The app
//  compares it against its own build-time stamp (BuildStamp, app target) —
//  no extra networking, no store, no server.
//
//  Lives in Sync/ (not the app root) because DataStore is compiled into the
//  widget too, and every type DataStore touches must be widget-safe.
//

import Foundation

struct AppVersion: Codable, Equatable, Sendable {
    /// Short hash of the last commit touching ios/ on main.
    var iosCommit: String
    /// ISO timestamp of that commit (informational).
    var committedAt: String?
    /// When the pipeline published this file (informational).
    var generatedAt: String?
    /// The last recorded TestFlight upload (WP-17) — absent until the first
    /// recorded upload, and in dev-only checkouts.
    var testflight: TestFlightVersion? = nil
}

struct TestFlightVersion: Codable, Equatable, Sendable {
    /// The ios/-commit stamp the uploaded archive was built from.
    var stamp: String
    /// TestFlight build number (informational).
    var build: Int? = nil
    /// Marketing version (informational).
    var version: String? = nil
    var uploadedAt: String? = nil
}

/// The pure «har jeg siste versjon?»-judgement — lives here (Sync/, compiled
/// into SportivistaTests) so it is unit-testable; the Bundle-reading glue in
/// BuildStamp (app root) just delegates.
enum AppVersionCheck {
    /// The build's own stamp, written into the built Info.plist by the
    /// post-build script in ios/project.yml. "ukjent" in builds that skipped
    /// the script (previews, hostless test bundles).
    static var bundleStamp: String {
        (Bundle.main.object(forInfoDictionaryKey: "SportivistaBuildStamp") as? String) ?? "ukjent"
    }

    static var bundleDate: String {
        (Bundle.main.object(forInfoDictionaryKey: "SportivistaBuildDate") as? String) ?? ""
    }

    /// The foot line for THIS running build.
    static func footLine(published: AppVersion?) -> String {
        line(stamp: bundleStamp, date: bundleDate, published: published)
    }

    /// `nil` = cannot judge (no published truth yet, or the build is
    /// unstamped). A `-dirty` build compares on its base commit — it is
    /// "current" in the honest sense of "built on top of the latest".
    ///
    /// Current = the newest code OR the newest SHIPPABLE build (WP-17): a
    /// TestFlight install cannot be more current than the last recorded
    /// upload, so ios/-commits that haven't shipped as a build must not nag
    /// testers with «NYERE FINNES».
    static func isCurrent(stamp: String, published: AppVersion?) -> Bool? {
        guard let latest = published?.iosCommit, !latest.isEmpty,
              stamp != "ukjent", !stamp.isEmpty else { return nil }
        let base = stamp.hasSuffix("-dirty") ? String(stamp.dropLast("-dirty".count)) : stamp
        if base == latest { return true }
        if let shipped = published?.testflight?.stamp, !shipped.isEmpty, base == shipped { return true }
        return false
    }

    /// The quiet foot line: «BYGG a1b2c3d · 16.07 21:40 · SISTE»,
    /// «… · NYERE FINNES (d4e5f6a)» or just the stamp when there is no verdict.
    static func line(stamp: String, date: String, published: AppVersion?) -> String {
        let head = date.isEmpty ? "BYGG \(stamp)" : "BYGG \(stamp) · \(date)"
        switch isCurrent(stamp: stamp, published: published) {
        case .some(true): return head + " · SISTE"
        case .some(false): return head + " · NYERE FINNES (\(published?.iosCommit ?? "?"))"
        case .none: return head
        }
    }
}
