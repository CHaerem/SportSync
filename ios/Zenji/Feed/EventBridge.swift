//
//  EventBridge.swift
//  Zenji
//
//  WP-14 — bridges the full WP-11 `[Event]` (what DataStore actually caches)
//  into the WP-13 `[FeedEvent]` FeedCompiler operates on, WHILE keeping a way
//  back to the original `Event` for the fields FeedEvent deliberately drops
//  (streaming, venue, summary, evidence, …) that the agenda row / detail
//  sheet still need to display. `FeedEvent(from:)` (Feed/FeedEvent.swift,
//  WP-13) already does the field-for-field bridge for a SINGLE event; this
//  file is the WP-14 addition that does it for a whole array and returns a
//  lookup back to the source `Event`.
//
//  Why a lookup keyed by a string id rather than, say, zipping the two arrays
//  positionally: FeedCompiler.compile() filters, re-sorts and re-groups its
//  `[FeedEvent]` input — the output no longer has any positional
//  correspondence to the input array, so callers (AgendaViewModel, the
//  widget's WidgetTimelineBuilder) need an actual key to look the original
//  `Event` back up by. `Event.id` (WP-02) is a stable hash of
//  `sport|title|time` and is emitted by build-events.js for essentially every
//  event on every rebuild — but it IS optional on the model (older/malformed
//  payloads), so a stable fallback key is synthesized for the rare event that
//  arrives without one, mirroring the same "sport|title|time" fallback
//  dashboard.js uses client-side (dashboard.js:66) when a payload predates
//  the id field.
//

import Foundation

enum EventBridge {
    /// A stable, non-optional key for `event` — its own `id` when present,
    /// else a deterministic fallback built from the fields that make up that
    /// id server-side. Never empty, so it's always usable as a dictionary key.
    static func stableId(for event: Event) -> String {
        if let id = event.id, !id.isEmpty { return id }
        return "\(event.sport)|\(event.title)|\(event.time.timeIntervalSince1970)"
    }

    /// Bridges `events` into FeedCompiler's input type, stamping every
    /// `FeedEvent.id` with `stableId(for:)` (overriding whatever `Event.id`
    /// bridged over as-is, which may be nil), and returns a lookup from that
    /// same id back to the original `Event` for the fields FeedEvent omits.
    static func bridge(_ events: [Event]) -> (feedEvents: [FeedEvent], lookup: [String: Event]) {
        var feedEvents: [FeedEvent] = []
        var lookup: [String: Event] = [:]
        feedEvents.reserveCapacity(events.count)
        for event in events {
            let id = stableId(for: event)
            var feedEvent = FeedEvent(from: event)
            feedEvent.id = id
            feedEvents.append(feedEvent)
            lookup[id] = event
        }
        return (feedEvents, lookup)
    }
}
