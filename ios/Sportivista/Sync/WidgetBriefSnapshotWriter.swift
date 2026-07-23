//
//  WidgetBriefSnapshotWriter.swift
//  Sportivista
//
//  WP-181 — the thin, impure half of the widget's morning brief line: the app
//  writes the pre-rendered brief (WidgetBriefSnapshot says why the app and not
//  the widget composes it) into the same App Group cache the widget reads. Same
//  pure/impure split as WidgetResultSnapshotWriter — a protocol seam so
//  NewsModel's tests can record the write without touching a real container, and
//  a production implementation that is a four-line CacheStore call.
//

import Foundation

protocol WidgetBriefSnapshotWriting: Sendable {
	func write(_ snapshot: WidgetBriefSnapshot)
}

/// Production: writes `widget-brief.json` into the App Group cache atomically
/// (CacheStore's contract). A write failure is swallowed — a missing snapshot is
/// a widget with no brief line, a legitimate quiet state, never a reason to fail
/// a board rebuild.
struct CacheWidgetBriefSnapshotWriter: WidgetBriefSnapshotWriting {
	private let cache: CacheStore

	init(cache: CacheStore = CacheStore()) {
		self.cache = cache
	}

	func write(_ snapshot: WidgetBriefSnapshot) {
		guard let data = try? SyncState.encoder.encode(snapshot) else { return }
		try? cache.write(data, filename: WidgetBriefSnapshot.filename)
	}
}
