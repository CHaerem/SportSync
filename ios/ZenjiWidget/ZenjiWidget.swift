//
//  ZenjiWidget.swift
//  ZenjiWidget
//
//  Static placeholder timeline — deliberately no sync/feed logic (that is
//  WP-12/WP-13). Always emits a single "now" entry with `.never` refresh so
//  the widget renders the Tekst-TV shell without network or App Group data.
//

import SwiftUI
import WidgetKit

struct ZenjiWidgetEntry: TimelineEntry {
    let date: Date
}

struct ZenjiTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> ZenjiWidgetEntry {
        ZenjiWidgetEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (ZenjiWidgetEntry) -> Void) {
        completion(ZenjiWidgetEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ZenjiWidgetEntry>) -> Void) {
        completion(Timeline(entries: [ZenjiWidgetEntry(date: Date())], policy: .never))
    }
}

struct ZenjiWidgetEntryView: View {
    var entry: ZenjiTimelineProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("ZENJI")
                .font(.zenjiMono(size: 16, weight: .bold))
                .foregroundStyle(ZenjiTokens.accent)
            Text("Ingen events lastet")
                .font(.zenjiMono(size: 11))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.7))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        .description("Neste must-see-hendelse — kommer i WP-14.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
