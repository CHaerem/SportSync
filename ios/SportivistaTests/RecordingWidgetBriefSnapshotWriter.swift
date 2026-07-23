//
//  RecordingWidgetBriefSnapshotWriter.swift
//  SportivistaTests
//
//  WP-181 — a recording `WidgetBriefSnapshotWriting` double: captures the
//  pre-rendered widget brief line NewsModel writes, instead of touching a real
//  App Group container. Same shape as RecordingWidgetReloader / the recording
//  notification scheduler; single-threaded per test, `@unchecked Sendable`.
//

import Foundation

final class RecordingWidgetBriefSnapshotWriter: WidgetBriefSnapshotWriting, @unchecked Sendable {
	private(set) var written: [WidgetBriefSnapshot] = []
	var last: WidgetBriefSnapshot? { written.last }

	func write(_ snapshot: WidgetBriefSnapshot) {
		written.append(snapshot)
	}
}
