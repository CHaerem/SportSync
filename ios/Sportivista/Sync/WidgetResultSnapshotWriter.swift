//
//  WidgetResultSnapshotWriter.swift
//  Sportivista
//
//  WP-176 — the thin, impure half of the widget's «siste resultat»-linje: the
//  app writes the pre-rendered, spoiler-filtered snapshot (ResultDigest decides
//  WHAT; WidgetResultSnapshot says why the app and not the widget decides it)
//  into the same App Group cache the widget already reads. Same pure/impure
//  split as everything else here — a protocol seam so SyncFreshnessTests can
//  record the writes without touching a real container, and a production
//  implementation that is a four-line CacheStore call.
//

import Foundation

protocol WidgetResultSnapshotWriting: Sendable {
    func write(_ snapshot: WidgetResultSnapshot)
}

/// Production: writes `widget-result.json` into the App Group cache atomically
/// (CacheStore's contract). A write failure is swallowed — a missing snapshot is
/// a widget with no result line, which is a legitimate quiet state, never a
/// reason to fail a sync.
struct CacheWidgetResultSnapshotWriter: WidgetResultSnapshotWriting {
    private let cache: CacheStore

    init(cache: CacheStore = CacheStore()) {
        self.cache = cache
    }

    func write(_ snapshot: WidgetResultSnapshot) {
        guard let data = try? SyncState.encoder.encode(snapshot) else { return }
        try? cache.write(data, filename: WidgetResultSnapshot.filename)
    }
}
