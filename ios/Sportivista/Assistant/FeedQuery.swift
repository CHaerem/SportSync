//
//  FeedQuery.swift
//  Sportivista
//
//  WP-16.4 — the LOCAL substrate the assistant answers questions against. The
//  "sømløs assistent" brief is explicit: questions are answered from on-device
//  data only (no PCC, no cloud), over the SAME agenda the user is looking at.
//  This is that agenda, flattened into a small, queryable value:
//
//    • build(events:interests:now:) runs the real WP-13 relevance filter
//      (FeedCompiler.isRelevant) + WP-14 formatting (AgendaFormat) so a
//      FeedQuery event carries exactly the when · what · where an agenda row
//      shows — nothing the model could answer with that the user can't see.
//    • today / tonight / next(matching:) / search(_:) are the questions the
//      command line actually gets ("hva bør jeg se i kveld?", "når går neste
//      TdF-etappe?"); each returns rows in agenda order.
//    • toolLines(for:) formats hits for the FM `searchEvents` tool (id first,
//      so the model can cite ids); rows(forIds:) resolves an answer's cited
//      ids back to displayable AnswerRows (a hallucinated id simply drops).
//
//  Pure and Sendable (no disk, no clock — `now` is passed in), so the whole
//  Q&A path is unit-testable against the checked-in events fixture with no
//  model and no running app, exactly like the rest of the assistant core.
//

import Foundation

/// One agenda event, reduced to what a question could be answered with.
struct FeedQueryEvent: Equatable, Sendable {
    var id: String
    var title: String
    var sport: String
    var tournament: String?
    var time: Date?
    var endTime: Date?
    /// Europe/Oslo "yyyy-MM-dd" — the same key the agenda groups on.
    var dayKey: String
    /// "HH:mm" or a multi-day window ("13.–20. juli"), via AgendaFormat.
    var timeLabel: String
    /// First Norwegian channel, or an honest "–".
    var channelLabel: String
    var isMustSee: Bool
    var norwegian: Bool
    /// The server relevance/bell haystack (title + tournament + teams +
    /// players + participants) — matched with the same word-boundary matcher
    /// the feed uses, so "Tour de France" finds "Tour de France 2026".
    var haystack: String
    /// Entity ids the event carries (home/away team + Norwegian players), for
    /// a precise "next event for THIS entity" lookup when ids are present.
    var entityIds: Set<String>
}

struct FeedQuery: Equatable, Sendable {
    /// The moment the agenda was compiled against — every "upcoming"/"tonight"
    /// question is answered relative to this, never a hidden `Date()`.
    var now: Date
    /// Relevant events, chronological (nil-time last).
    var events: [FeedQueryEvent]

    init(now: Date, events: [FeedQueryEvent] = []) {
        self.now = now
        self.events = events
    }

    // MARK: - Build (DataStore [Event] → the queryable agenda)

    /// Bridges + relevance-filters `events` exactly as the agenda does, then
    /// reduces each to a `FeedQueryEvent`. Sorted by start time ascending
    /// (nil-time events last), so every query below returns rows in agenda
    /// order without re-sorting.
    static func build(events: [Event], interests: Interests, now: Date) -> FeedQuery {
        let (feedEvents, lookup) = EventBridge.bridge(events)
        let relevant = feedEvents.filter { FeedCompiler.isRelevant($0, interests: interests, now: now) }
        let rows: [FeedQueryEvent] = relevant.compactMap { fe in
            guard let id = fe.id, let event = lookup[id] else { return nil }
            let title = AgendaFormat.title(homeTeam: fe.homeTeam, awayTeam: fe.awayTeam, fallback: fe.title)
            var ids = Set<String>()
            if let h = event.homeTeamEntityId, !h.isEmpty { ids.insert(h) }
            if let a = event.awayTeamEntityId, !a.isEmpty { ids.insert(a) }
            for p in event.norwegianPlayers { if let e = p.entityId, !e.isEmpty { ids.insert(e) } }
            return FeedQueryEvent(
                id: id,
                title: title,
                sport: fe.sport,
                tournament: event.tournament,
                time: fe.time,
                endTime: fe.endTime,
                dayKey: fe.time.map { FeedCompiler.osloDayKey($0) } ?? FeedCompiler.osloDayKey(now),
                timeLabel: AgendaFormat.timeLabel(time: fe.time, endTime: fe.endTime),
                channelLabel: AgendaFormat.channelLabel(event.streaming),
                isMustSee: FeedCompiler.isMustSee(fe, interests: interests),
                norwegian: fe.norwegian,
                haystack: FeedCompiler.serverHaystack(fe),
                entityIds: ids
            )
        }
        .sorted { ($0.time ?? .distantFuture) < ($1.time ?? .distantFuture) }
        return FeedQuery(now: now, events: rows)
    }

    // MARK: - Queries

    /// Events not yet finished at `now` (`endTime ?? time >= now`), in order.
    func upcoming() -> [FeedQueryEvent] {
        events.filter { e in
            guard let t = e.time else { return false }
            return (e.endTime ?? t) >= now
        }
    }

    /// Upcoming events on today's Europe/Oslo calendar day.
    func today() -> [FeedQueryEvent] {
        let key = FeedCompiler.osloDayKey(now)
        return upcoming().filter { $0.dayKey == key }
    }

    /// "I kveld" — today's evening events (Oslo start hour ≥ 18); if none are
    /// left this evening, falls back to whatever is still coming today, so the
    /// question always gets an honest answer rather than a blank.
    func tonight() -> [FeedQueryEvent] {
        let evening = today().filter { e in
            guard let t = e.time else { return false }
            return Self.osloHour(t) >= 18
        }
        return evening.isEmpty ? today() : evening
    }

    /// The next upcoming event matching a resolved entity — by carried id
    /// first, else by the entity's name/aliases word-boundary-matching the
    /// haystack (so "Tour de France 2026" answers "neste TdF-etappe").
    func next(matching entity: Entity) -> FeedQueryEvent? {
        let terms = ([entity.name] + entity.aliases).filter { !$0.isEmpty }
        return upcoming().first { e in
            if e.entityIds.contains(entity.id) { return true }
            return terms.contains { TextMatch.containsName(e.haystack, $0) }
        }
    }

    /// Free-text search over upcoming events — word-boundary name match, plus
    /// Norwegian sport-keyword expansion ("sykkel" → every cycling event).
    func search(_ query: String, limit: Int = 6) -> [FeedQueryEvent] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return Array(upcoming().prefix(limit)) }
        let sport = EntityIndex.sportKeyword(in: trimmed)
        let hits = upcoming().filter { e in
            if let sport, e.sport == sport { return true }
            return TextMatch.containsName(e.haystack, trimmed) || TextMatch.containsName(e.title, trimmed)
        }
        return Array(hits.prefix(limit))
    }

    // MARK: - Resolution + tool formatting

    /// Resolve an answer's cited ids back to displayable rows (order preserved,
    /// unknown ids dropped), for the UI beneath the prose.
    func rows(forIds ids: [String], todayKey: String? = nil, tomorrowKey: String? = nil) -> [AnswerRow] {
        let today = todayKey ?? FeedCompiler.osloDayKey(now)
        let tomorrow = tomorrowKey ?? FeedCompiler.osloDayKey(now.addingTimeInterval(86_400))
        let byId = Dictionary(events.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return ids.compactMap { id in
            guard let e = byId[id] else { return nil }
            return AnswerRow(
                id: e.id,
                dayLabel: AgendaFormat.dayLabel(key: e.dayKey, todayKey: today, tomorrowKey: tomorrow),
                timeLabel: e.timeLabel,
                title: e.title,
                channelLabel: e.channelLabel
            )
        }
    }

    /// Lines for the FM `searchEvents` tool — id first so the model cites real
    /// ids; then day, time, title, channel. Bounded so the tool answer stays
    /// small.
    static func toolLines(for hits: [FeedQueryEvent], limit: Int = 8) -> String {
        guard !hits.isEmpty else { return "Ingen kommende hendelser passer." }
        return hits.prefix(limit).map { e in
            "\(e.id) | \(e.dayKey) \(e.timeLabel) | \(e.title) | \(e.channelLabel)"
        }.joined(separator: "\n")
    }

    // MARK: - Helpers

    private static func osloHour(_ date: Date) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = FeedCompiler.osloTimeZone
        return cal.component(.hour, from: date)
    }
}
