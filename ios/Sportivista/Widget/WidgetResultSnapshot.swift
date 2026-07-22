//
//  WidgetResultSnapshot.swift
//  Sportivista
//
//  WP-176 — the widget's «siste resultat»-linje, PRE-RENDERED by the app.
//
//  Why pre-rendered instead of computed in the widget like the agenda line is:
//  the widget target deliberately compiles no profile and no personal memory
//  (project.yml lists its Sync files one by one, and Profile//Memory/News are
//  not among them) — which means the widget cannot know the user's SPOILER
//  policy. A result rendered on the home screen without that knowledge would be
//  precisely the spoiler the app spent WP-30/WP-171 shielding. So the app, which
//  does hold the profile + the shield, decides what (if anything) is safe to
//  show and writes that one line into the App Group cache; the widget renders a
//  string it was handed and can never leak more than the app already would.
//
//  An ABSENT file (never written, or written back to `.empty` when nothing is
//  safe to show) means the widget shows no result line at all — the honest quiet
//  state, never a stale one.
//

import Foundation

struct WidgetResultSnapshot: Codable, Equatable, Sendable {
    /// The App Group cache filename. Sportivista-owned bookkeeping alongside the
    /// synced files (like `sync-state.json`), NOT something the server publishes
    /// — it is derived per device from that device's own profile.
    static let filename = "widget-result.json"

    /// «Lyn – Sogndal 2–1» — outcome INCLUDED, because the app already verified
    /// this result is not spoiler-shielded for this user. Nil ⇒ no line.
    var line: String?
    /// «OBOS-ligaen» — the quiet second half of the line. Optional.
    var meta: String?
    /// When the app computed it (so a future surface could age it out honestly).
    var generatedAt: Date?

    static let empty = WidgetResultSnapshot(line: nil, meta: nil, generatedAt: nil)

    init(line: String? = nil, meta: String? = nil, generatedAt: Date? = nil) {
        self.line = line
        self.meta = meta
        self.generatedAt = generatedAt
    }

    var hasResult: Bool { !(line ?? "").isEmpty }
}
