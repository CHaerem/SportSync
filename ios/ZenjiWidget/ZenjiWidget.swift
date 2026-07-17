//
//  ZenjiWidget.swift
//  ZenjiWidget
//
//  WP-14 — the real widget: "neste must-see" (fallback: the next event at
//  all), timeline entries pre-computed for the rest of the Europe/Oslo day
//  from WidgetTimelineBuilder (Zenji/Widget/WidgetTimelineBuilder.swift).
//  NO network access here — `DataStore` only ever reads the App Group cache
//  `SyncClient` (running in the app, not the widget) already wrote; the
//  widget target's project.yml sources deliberately omit SyncClient.swift/
//  Checksum.swift, so there is no network-capable code to accidentally call.
//  systemSmall + systemMedium, both in the shared Tekst-TV tokens.
//

import SwiftUI
import WidgetKit

struct ZenjiWidgetEntry: TimelineEntry {
    let date: Date
    let content: WidgetTimelineBuilder.Entry
}

struct ZenjiTimelineProvider: TimelineProvider {
    private let dataStore: DataStore

    init(dataStore: DataStore = DataStore()) {
        self.dataStore = dataStore
    }

    func placeholder(in context: Context) -> ZenjiWidgetEntry {
        let now = Date()
        return ZenjiWidgetEntry(date: now, content: WidgetTimelineBuilder.Entry(
            date: now, hasHighlight: true, timeLabel: "18:00", title: "Lyn – Sogndal", channelLabel: "TV 2 Play", isMustSee: true
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (ZenjiWidgetEntry) -> Void) {
        completion(currentEntry(now: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ZenjiWidgetEntry>) -> Void) {
        let now = Date()
        let events = dataStore.loadEvents()
        // loadInterests() (WP-15) is nil until interests.json first syncs (or
        // if the cached copy is corrupt) — fall back to an empty Interests()
        // rather than block the widget on it; FeedCompiler.compile's own
        // default followBroadly list still applies in that case.
        let interests = dataStore.loadInterests() ?? Interests()
        let entries = WidgetTimelineBuilder.buildEntries(events: events, interests: interests, now: now)
            .map { ZenjiWidgetEntry(date: $0.date, content: $0) }

        // No network call here either way — this just tells WidgetKit when to
        // invoke getTimeline again so it can recompute against whatever the
        // app has synced into the cache by then. Reload shortly after the
        // last pre-computed entry (end of today, Oslo); `.atEnd` as a
        // fallback for the (practically unreachable) empty-entries case.
        let policy: TimelineReloadPolicy = entries.last.map { .after($0.date.addingTimeInterval(60)) } ?? .atEnd
        completion(Timeline(entries: entries, policy: policy))
    }

    private func currentEntry(now: Date) -> ZenjiWidgetEntry {
        let events = dataStore.loadEvents()
        // loadInterests() (WP-15) is nil until interests.json first syncs (or
        // if the cached copy is corrupt) — fall back to an empty Interests()
        // rather than block the widget on it; FeedCompiler.compile's own
        // default followBroadly list still applies in that case.
        let interests = dataStore.loadInterests() ?? Interests()
        let content = WidgetTimelineBuilder.buildEntries(events: events, interests: interests, now: now).first
            ?? WidgetTimelineBuilder.Entry(date: now, hasHighlight: false, timeLabel: "–", title: "Ingenting i dag", channelLabel: "–", isMustSee: false)
        return ZenjiWidgetEntry(date: now, content: content)
    }
}

struct ZenjiWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: ZenjiTimelineProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("ZENJI")
                    .font(.zenji(.caption, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent)
                    .tracking(1)
                if entry.content.isMustSee {
                    Circle().fill(ZenjiTokens.accent).frame(width: 5, height: 5)
                }
                Spacer()
            }
            Spacer(minLength: 2)
            Text(entry.content.title)
                .font(.zenji(family == .systemSmall ? .subheadline : .callout, weight: .semibold))
                .foregroundStyle(ZenjiTokens.label)
                .lineLimit(family == .systemSmall ? 3 : 2)
            if entry.content.hasHighlight {
                HStack(spacing: 6) {
                    Text(entry.content.timeLabel)
                    Text("·")
                    Text(entry.content.channelLabel)
                }
                .font(.zenjiTabular(.caption2))
                .foregroundStyle(ZenjiTokens.secondaryLabel)
                .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct ZenjiWidget: Widget {
    let kind: String = "ZenjiWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ZenjiTimelineProvider()) { entry in
            ZenjiWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) {
                    ZenjiTokens.background
                }
        }
        .configurationDisplayName("Zenji")
        .description("Neste must-see-hendelse.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
