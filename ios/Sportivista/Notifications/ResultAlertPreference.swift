//
//  ResultAlertPreference.swift
//  Sportivista
//
//  WP-176 — the OPT-IN store for fulltidsvarsler (a local notification when a
//  followed team/athlete's match is over). Two deliberate properties:
//
//    • AV som default, PER ENTITET. A result notification is by definition a
//      spoiler, so it can never be a blanket switch someone discovers after the
//      fact — the user turns it on for the one team they actually want pinged
//      about, from that follow's own page (FollowDetailView § VARSEL).
//    • En per-ENHET-preferanse, ikke en del av følgeprofilen. Same reasoning as
//      NotificationLeadPreference/ThemeOverride: which of MY devices buzzes is a
//      device concern, not something to replicate to every other device through
//      the CRDT profile. A reset never touches it.
//
//  It also owns the small DELIVERED ledger: the ids of the result rows this
//  device has already alerted on. The sync-diff (previous vs. new
//  recent-results.json) is the primary guard against a repeat; the ledger is the
//  belt to that suspenders, for the case where a fetcher hiccup drops a result
//  and re-adds it on the next run. Bounded — an alert ledger is bookkeeping, not
//  history.
//

import Foundation

enum ResultAlertPreference {
    /// UserDefaults key: the entity ids opted into fulltidsvarsler (absent ⇒ none).
    static let optInKey = "sportivista.notify.resultAlertEntities"
    /// UserDefaults key: the ids of already-delivered result alerts (oldest first).
    static let deliveredKey = "sportivista.notify.resultAlertDelivered"
    /// How many delivered ids to remember. Comfortably more than a busy weekend
    /// produces, far less than "a history".
    static let ledgerLimit = 60

    // MARK: - Per-entity opt-in

    static func optedInEntityIds(_ defaults: UserDefaults = .standard) -> Set<String> {
        Set(defaults.stringArray(forKey: optInKey) ?? [])
    }

    static func isEnabled(entityId: String, _ defaults: UserDefaults = .standard) -> Bool {
        optedInEntityIds(defaults).contains(entityId)
    }

    /// Turn fulltidsvarsler on/off for ONE followed entity. Stored sorted so the
    /// persisted value is stable (no churn from set ordering).
    static func setEnabled(_ enabled: Bool, entityId: String, _ defaults: UserDefaults = .standard) {
        guard !entityId.isEmpty else { return }
        var ids = optedInEntityIds(defaults)
        if enabled { ids.insert(entityId) } else { ids.remove(entityId) }
        defaults.set(ids.sorted(), forKey: optInKey)
    }

    // MARK: - Delivered ledger

    static func deliveredIds(_ defaults: UserDefaults = .standard) -> [String] {
        defaults.stringArray(forKey: deliveredKey) ?? []
    }

    /// Append delivered ids, keeping the newest `ledgerLimit` and no duplicates.
    static func markDelivered(_ ids: [String], _ defaults: UserDefaults = .standard) {
        guard !ids.isEmpty else { return }
        var ledger = deliveredIds(defaults)
        for id in ids where !ledger.contains(id) { ledger.append(id) }
        if ledger.count > ledgerLimit { ledger.removeFirst(ledger.count - ledgerLimit) }
        defaults.set(ledger, forKey: deliveredKey)
    }
}
