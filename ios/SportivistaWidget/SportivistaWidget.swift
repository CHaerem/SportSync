//
//  SportivistaWidget.swift
//  SportivistaWidget
//
//  WP-14 — the real widget: "neste must-see" (fallback: the next event at
//  all), timeline entries pre-computed for the rest of the Europe/Oslo day
//  from WidgetTimelineBuilder (Sportivista/Widget/WidgetTimelineBuilder.swift).
//  NO network access here — `DataStore` only ever reads the App Group cache
//  `SyncClient` (running in the app, not the widget) already wrote; the
//  widget target's project.yml sources deliberately omit SyncClient.swift/
//  Checksum.swift, so there is no network-capable code to accidentally call.
//  WP-176 — the widget grows on two axes, both pure client work over the SAME
//  App Group cache:
//    • systemMedium gains a «siste resultat»-linje under the next must-see. It is
//      read pre-rendered from `WidgetResultSnapshot` (written by the app), NOT
//      computed here: the widget compiles no profile and no personal memory, so
//      it cannot know the user's spoiler policy — and an unshielded score on the
//      home screen would be exactly the spoiler WP-30/WP-171 protect against.
//    • accessoryRectangular + accessoryInline (låseskjerm/StandBy) render the
//      same one highlight in the shapes those families allow. No new data, no
//      new network, no new decision — only new surfaces.
//  All families use the shared tokens (amber only as the must-see accent,
//  tabular time, an honest «–» for an unknown channel).
//

import SwiftUI
import WidgetKit

struct SportivistaWidgetEntry: TimelineEntry {
    let date: Date
    let content: WidgetTimelineBuilder.Entry
}

struct SportivistaTimelineProvider: TimelineProvider {
    private let dataStore: DataStore

    init(dataStore: DataStore = DataStore()) {
        self.dataStore = dataStore
    }

    func placeholder(in context: Context) -> SportivistaWidgetEntry {
        let now = Date()
        return SportivistaWidgetEntry(date: now, content: WidgetTimelineBuilder.Entry(
            date: now, hasHighlight: true, timeLabel: "18:00", title: "Lyn – Sogndal", channelLabel: "TV 2 Play", isMustSee: true,
            resultLine: "Brann – Rosenborg 2–1", resultMeta: "Eliteserien"
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (SportivistaWidgetEntry) -> Void) {
        completion(currentEntry(now: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SportivistaWidgetEntry>) -> Void) {
        let now = Date()
        let events = dataStore.loadEvents()
        // loadInterests() (WP-15) is nil until interests.json first syncs (or
        // if the cached copy is corrupt) — fall back to an empty Interests()
        // rather than block the widget on it; FeedCompiler.compile's own
        // default followBroadly list still applies in that case.
        let interests = dataStore.loadInterests() ?? Interests()
        let entries = WidgetTimelineBuilder.buildEntries(
            events: events, interests: interests, now: now,
            resultSnapshot: dataStore.loadWidgetResultSnapshot()
        ).map { SportivistaWidgetEntry(date: $0.date, content: $0) }

        // No network call here either way — this just tells WidgetKit when to
        // invoke getTimeline again so it can recompute against whatever the
        // app has synced into the cache by then. Reload shortly after the
        // last pre-computed entry (end of today, Oslo); `.atEnd` as a
        // fallback for the (practically unreachable) empty-entries case.
        let policy: TimelineReloadPolicy = entries.last.map { .after($0.date.addingTimeInterval(60)) } ?? .atEnd
        completion(Timeline(entries: entries, policy: policy))
    }

    private func currentEntry(now: Date) -> SportivistaWidgetEntry {
        let events = dataStore.loadEvents()
        // loadInterests() (WP-15) is nil until interests.json first syncs (or
        // if the cached copy is corrupt) — fall back to an empty Interests()
        // rather than block the widget on it; FeedCompiler.compile's own
        // default followBroadly list still applies in that case.
        let interests = dataStore.loadInterests() ?? Interests()
        let content = WidgetTimelineBuilder.buildEntries(
            events: events, interests: interests, now: now,
            resultSnapshot: dataStore.loadWidgetResultSnapshot()
        ).first
            ?? WidgetTimelineBuilder.Entry(date: now, hasHighlight: false, timeLabel: "–", title: "Ingenting i dag", channelLabel: "–", isMustSee: false)
        return SportivistaWidgetEntry(date: now, content: content)
    }
}

struct SportivistaWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: SportivistaTimelineProvider.Entry

    var body: some View {
        switch family {
        case .accessoryInline:
            // One line, system-styled, no colour of our own (the OS renders these
            // monochrome) — time + what, nothing else fits honestly.
            Text(inlineText)
        case .accessoryRectangular:
            rectangularBody
        default:
            homeScreenBody
        }
    }

    // MARK: - Home screen (systemSmall / systemMedium)

    private var homeScreenBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                // Brand lock (designprofil rev 2): wordmark + amber colon.
                HStack(spacing: 0) {
                    Text("SPORTIVISTA")
                        .font(.sportivista(.caption, weight: .bold))
                        .foregroundStyle(SportivistaTokens.label)
                        .tracking(1)
                    Text(":")
                        .font(.sportivista(.caption, weight: .heavy))
                        .foregroundStyle(SportivistaTokens.accent)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Sportivista")
                if entry.content.isMustSee {
                    Circle().fill(SportivistaTokens.accent).frame(width: 5, height: 5)
                }
                Spacer()
            }
            Spacer(minLength: 2)
            Text(entry.content.title)
                .font(.sportivista(family == .systemSmall ? .subheadline : .callout, weight: .semibold))
                .foregroundStyle(SportivistaTokens.label)
                .lineLimit(family == .systemSmall ? 3 : 2)
            if entry.content.hasHighlight {
                HStack(spacing: 6) {
                    Text(entry.content.timeLabel)
                    Text("·")
                    Text(entry.content.channelLabel)
                }
                .font(.sportivistaTabular(.caption2))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .lineLimit(1)
            }
            // WP-176: «siste resultat» — medium only. The small variant stays ONE
            // answer (ro); the lock-screen families have no room for a second line
            // that isn't the highlight itself.
            if family == .systemMedium, let line = resultLine {
                Divider().overlay(SportivistaTokens.separator)
                Text(line)
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .lineLimit(1)
                    .accessibilityLabel("Siste resultat: \(line)")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    /// «Lyn – Sogndal 2–1 · OBOS-ligaen» — the app already decided this is safe
    /// to show (spoiler shield applied there, see WidgetResultSnapshot).
    private var resultLine: String? {
        guard let line = entry.content.resultLine, !line.isEmpty else { return nil }
        guard let meta = entry.content.resultMeta, !meta.isEmpty else { return line }
        return "\(line) · \(meta)"
    }

    // MARK: - Lock screen / StandBy (accessory families)

    private var rectangularBody: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Text("SPORTIVISTA:")
                    .font(.sportivista(.caption2, weight: .bold))
                    .tracking(0.5)
                    .widgetAccentable()
                if entry.content.isMustSee {
                    Circle().frame(width: 4, height: 4).widgetAccentable()
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Sportivista")
            Text(entry.content.title)
                .font(.sportivista(.caption, weight: .semibold))
                .lineLimit(1)
            if entry.content.hasHighlight {
                Text("\(entry.content.timeLabel) · \(entry.content.channelLabel)")
                    .font(.sportivistaTabular(.caption2))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    /// The inline family is a single system-drawn line — keep it to when + what,
    /// with the honest «Ingenting i dag» when there is no highlight.
    private var inlineText: String {
        guard entry.content.hasHighlight else { return entry.content.title }
        return "\(entry.content.timeLabel) \(entry.content.title)"
    }
}

struct SportivistaWidget: Widget {
    let kind: String = "SportivistaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SportivistaTimelineProvider()) { entry in
            SportivistaWidgetEntryView(entry: entry)
                // The accessory families are rendered by the system on the lock
                // screen / StandBy with their own vibrant material — giving them
                // our page background would fight it, so the container background
                // is per-family.
                .containerBackground(for: .widget) {
                    SportivistaWidgetBackground()
                }
        }
        .configurationDisplayName("Sportivista")
        .description("Neste must-see-hendelse, og siste resultat.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

/// The per-family container background: the Sportivista surface on the home
/// screen, nothing at all on the lock screen / StandBy (where the system's own
/// vibrant material is the correct backdrop).
private struct SportivistaWidgetBackground: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline, .accessoryRectangular, .accessoryCircular:
            Color.clear
        default:
            SportivistaTokens.background
        }
    }
}
