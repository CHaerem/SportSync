//
//  ResultDigest.swift
//  Sportivista
//
//  WP-176 — the PURE core behind the two result-aware surfaces the app grew in
//  «nivå (a)» (the grunnpakken the owner chose on 22.07):
//
//    1. FULLTIDSVARSEL — one calm local notification when a match/tournament a
//       user has explicitly opted into is OVER («Fulltid: Lyn – Sogndal»).
//    2. WIDGET-LINJEN — the medium widget's «siste resultat» line, pre-rendered
//       here because the widget cannot see the spoiler policy (see
//       WidgetResultSnapshot's header).
//
//  What this is NOT, deliberately and permanently at this level: a goal alert.
//  Sportivista has no server and no APNs; the only clock we get is
//  BGAppRefresh's, which iOS grants on its own terms (~4h floor, best effort).
//  A "GOOOAL" that lands 40 minutes late is worse than none — it teaches the
//  user to distrust the app. So the unit of a result alert is the FINISHED
//  contest, exactly once, and the honest promise is "shortly after iOS next
//  lets us look", never "instantly". See README § Det vi ikke gjør.
//
//  Three rules the plan enforces, in this order:
//    (a) OPT-IN per entity (ResultAlertPreference) — never a blanket switch;
//    (b) SPOILER SHIELD wins — an entity/sport under a spoiler policy still gets
//        its alert (the user asked for it) but the text NEVER carries the score;
//    (c) FÅ — a hard cap per run, a recency window, no alert on a seeding sync.
//
//  Everything here is a pure function of values (two RecentResults snapshots,
//  the profile, the entity list, the shield, the opt-in set, the ledger, now):
//  no I/O, no clock read, no UNUserNotificationCenter — so ResultDigestTests
//  drives the whole flow with a seeded result diff.
//

import Foundation

enum ResultDigest {
    /// At most this many fulltidsvarsler per sync. A Saturday with five followed
    /// teams must not become five buzzes — «varsler skal være FÅ».
    static let maxAlerts = 3

    /// How old a result may be and still be worth a notification. Beyond this it
    /// is history, not news, and a push about it is noise (this is also what
    /// keeps a backfill from alerting about last week).
    static let recencyWindow: TimeInterval = 12 * 60 * 60

    /// A result dated slightly ahead of `now` (clock skew between the fetcher and
    /// the device) is still "just finished"; anything further out is not a result.
    static let futureSlack: TimeInterval = 10 * 60

    struct Output: Equatable {
        /// Ready-to-schedule alerts, ordered newest result first.
        var alerts: [NotificationRequest]
        /// What the widget should show as «siste resultat» (never spoiler-shielded).
        var snapshot: WidgetResultSnapshot
    }

    /// Diff two `recent-results.json` snapshots and decide what (if anything) to
    /// tell the user.
    ///
    /// - Parameters:
    ///   - previousResults: the cache BEFORE the sync. An entirely empty value is
    ///     read as "we had nothing to compare against" (first sync on this
    ///     device, or a cleared cache) and produces NO alerts — a fresh install
    ///     must never open with a burst of notifications about matches the user
    ///     never asked to be told about.
    ///   - optedIn: entity ids with fulltidsvarsel ON (ResultAlertPreference).
    ///   - alreadyDelivered: the delivered ledger, so a result that disappears
    ///     and reappears upstream can't alert twice.
    static func plan(
        previousResults: RecentResults,
        newResults: RecentResults,
        profile: InterestProfile,
        entities: [Entity],
        shield: SpoilerShield,
        optedIn: Set<String>,
        alreadyDelivered: Set<String> = [],
        now: Date,
        maxAlerts: Int = ResultDigest.maxAlerts
    ) -> Output {
        let index = EntityIndex(entities)
        let lens = NewsLens(profile: profile, index: index)
        let newRows = NewsBoard.resultRows(newResults, lens: lens, index: index, shield: shield)

        let snapshot = widgetSnapshot(rows: newRows, now: now)

        // (c) Seeding sync: nothing to diff against ⇒ nothing to announce.
        guard previousResults != RecentResults() else {
            return Output(alerts: [], snapshot: snapshot)
        }
        guard !optedIn.isEmpty else { return Output(alerts: [], snapshot: snapshot) }

        let previousIds = Set(NewsBoard.resultRows(previousResults, lens: lens, index: index, shield: shield).map(\.id))
        let alerts = newRows
            .filter { !previousIds.contains($0.id) }
            .filter { !alreadyDelivered.contains($0.id) }
            .filter { !$0.entityIds.isDisjoint(with: optedIn) }   // (a) per-entity opt-in
            .filter { isRecent($0.date, now: now) }
            .filter { $0.score?.isEmpty == false }                // no outcome ⇒ nothing finished to report
            .sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
            .prefix(maxAlerts)
            .map { request(for: $0, now: now) }

        return Output(alerts: Array(alerts), snapshot: snapshot)
    }

    // MARK: - Recency

    /// A dated result must fall inside the window; an UNDATED one (golf tours
    /// carry no stamp) is judged by its id being new, which is the only honest
    /// signal available — it cannot be older than the sync that introduced it.
    static func isRecent(_ date: Date?, now: Date) -> Bool {
        guard let date else { return true }
        return date <= now.addingTimeInterval(futureSlack) && date >= now.addingTimeInterval(-recencyWindow)
    }

    // MARK: - Notification text (Norwegian, calm, spoiler-aware)

    /// «Fulltid: Lyn – Sogndal» / «Ferdig: The Open» — the finishing word matched
    /// to the sport, because a golf tournament does not have "fulltid".
    static func headline(sport: String) -> String {
        switch sport {
        case "football", "tennis", "handball", "icehockey": return "Fulltid"
        default: return "Ferdig"
        }
    }

    /// The alert for one finished result. (b) SPOILER SHIELD: when the row is
    /// shielded the body says the result exists and stops there — a user who
    /// asked for spoiler protection must never read «2–1» on their lock screen
    /// without choosing to.
    static func request(for row: NewsResultRow, now: Date) -> NotificationRequest {
        let title = "\(headline(sport: row.sport)): \(row.title.isEmpty ? "Kamp" : row.title)"
        let body: String
        if row.spoilerSensitive {
            body = "Resultatet er klart. Åpne når du vil se det."
        } else {
            let outcome = row.score ?? ""
            let meta = (row.meta ?? "").trimmingCharacters(in: .whitespaces)
            body = [outcome, meta].filter { !$0.isEmpty }.joined(separator: " · ")
        }
        return NotificationRequest(id: row.id, title: title, body: body, fireDate: now)
    }

    // MARK: - Widget snapshot

    /// The newest result that is SAFE to show unprompted on a home screen: not
    /// spoiler-shielded, has an outcome, and is recent enough to still be «siste
    /// resultat» rather than a fossil. Independent of the alert opt-in — the
    /// widget mirrors what the app's own RESULTAT section would already show,
    /// under the same shield.
    static func widgetSnapshot(rows: [NewsResultRow], now: Date) -> WidgetResultSnapshot {
        let candidate = rows
            .filter { !$0.spoilerSensitive }
            .filter { $0.score?.isEmpty == false }
            .filter { isRecent($0.date, now: now) }
            .sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
            .first
        guard let row = candidate, let score = row.score else { return .empty }
        let title = row.title.isEmpty ? "Resultat" : row.title
        return WidgetResultSnapshot(line: "\(title) \(score)", meta: row.meta, generatedAt: now)
    }
}
