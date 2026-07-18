//
//  WidgetTimelineBuilder.swift
//  Sportivista
//
//  WP-14 — pure widget-timeline computation: given already-decoded events +
//  interests + "now", produce the list of pre-computed entries the widget
//  should show for the rest of the Europe/Oslo day. Deliberately has NO
//  `import WidgetKit` and touches no disk/network — WidgetKit's own
//  `TimelineEntry`/`Timeline<Entry>` wrapping happens in SportivistaWidget.swift,
//  which is the thin, WidgetKit-coupled layer around this. Same pure-
//  function/thin-wrapper split as BackgroundRefreshScheduling vs.
//  BackgroundRefreshScheduler, and FeedCompiler's predicates vs. its facade —
//  it's what lets WidgetTimelineBuilderTests exercise this from the hostless
//  SportivistaTests bundle with no widget extension host needed.
//
//  The widget shows "the next must-see event (fallback: the next event at
//  all)" — deliberately simpler than the app's AgendaViewModel: no day
//  sections, no series collapsing, just one highlight. One entry is computed
//  per "clock strike" (every full hour) for the rest of today, so the OS can
//  swap entries on its own schedule with NO further network access — the
//  widget's `getTimeline` in SportivistaWidget.swift never calls SyncClient, only
//  DataStore (see that type's own "no network in the widget" contract).
//

import Foundation

enum WidgetTimelineBuilder {
    /// One pre-computed widget entry: the highlight as of `date`.
    struct Entry: Equatable {
        var date: Date
        /// False when there is genuinely nothing relevant upcoming — the
        /// widget then shows a calm "Ingenting i dag" rather than stale text.
        var hasHighlight: Bool
        var timeLabel: String
        var title: String
        var channelLabel: String
        var isMustSee: Bool
    }

    private static var oslo: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = FeedCompiler.osloTimeZone
        return calendar
    }

    /// `now`, then every full hour remaining in the Europe/Oslo calendar day
    /// — "resten av dagen (kl-slag)" per the WP-14 brief. Always at least one
    /// entry (`now` itself), even right before midnight.
    static func ticks(from now: Date, calendar: Calendar = WidgetTimelineBuilder.oslo) -> [Date] {
        var ticks = [now]
        let endOfDay = calendar.startOfDay(for: now).addingTimeInterval(24 * 60 * 60)
        var next = calendar.nextDate(after: now, matching: DateComponents(minute: 0, second: 0), matchingPolicy: .nextTime) ?? endOfDay
        while next < endOfDay {
            ticks.append(next)
            guard let after = calendar.date(byAdding: .hour, value: 1, to: next) else { break }
            next = after
        }
        return ticks
    }

    /// The event to highlight at `now`: the earliest still-relevant event
    /// that hasn't finished (`endTime ?? time >= now`), preferring one that
    /// earns the must-see accent over the merely-relevant nearest one — a
    /// glance at the widget should surface "your thing" over "the next
    /// thing", same spirit as the app's amber dot. `pairs` keeps each
    /// `FeedEvent` alongside its source `Event` (see EventBridge) so the
    /// caller can still read `streaming` for the channel column, which
    /// FeedEvent itself doesn't carry.
    static func nextHighlight(
        pairs: [(feed: FeedEvent, event: Event)],
        interests: Interests,
        now: Date
    ) -> (feed: FeedEvent, event: Event)? {
        let upcoming = pairs.filter { pair in
            guard let time = pair.feed.time else { return false }
            let end = pair.feed.endTime ?? time
            return end >= now && FeedCompiler.isRelevant(pair.feed, interests: interests, now: now)
        }.sorted { (lhs, rhs) in
            (lhs.feed.time ?? .distantFuture) < (rhs.feed.time ?? .distantFuture)
        }
        if let mustSee = upcoming.first(where: { FeedCompiler.isMustSee($0.feed, interests: interests) }) {
            return mustSee
        }
        return upcoming.first
    }

    /// Builds the full set of pre-computed entries for the rest of the day.
    static func buildEntries(events: [Event], interests: Interests, now: Date) -> [Entry] {
        let pairs = zip(events.map { FeedEvent(from: $0) }, events).map { (feed: $0, event: $1) }
        return ticks(from: now).map { tick in
            guard let hit = nextHighlight(pairs: pairs, interests: interests, now: tick) else {
                return Entry(date: tick, hasHighlight: false, timeLabel: "–", title: "Ingenting i dag", channelLabel: "–", isMustSee: false)
            }
            return Entry(
                date: tick,
                hasHighlight: true,
                timeLabel: AgendaFormat.timeLabel(time: hit.feed.time, endTime: hit.feed.endTime),
                title: AgendaFormat.title(homeTeam: hit.feed.homeTeam, awayTeam: hit.feed.awayTeam, fallback: hit.feed.title),
                channelLabel: AgendaFormat.channelLabel(hit.event.streaming),
                isMustSee: FeedCompiler.isMustSee(hit.feed, interests: interests)
            )
        }
    }
}
