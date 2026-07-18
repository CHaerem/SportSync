//
//  AgendaFormat.swift
//  Sportivista
//
//  WP-14 — pure, Foundation-only formatting helpers shared by the app's
//  AgendaViewModel (Sportivista/Agenda/) AND the widget's WidgetTimelineBuilder
//  (Sportivista/Widget/). Lives in Feed/ (not Agenda/) deliberately: it has no
//  SwiftUI dependency and both the app AND the widget extension need it, and
//  SportivistaWidgetExtension's project.yml sources already include the whole
//  Feed/ folder (the "Models/Sync-lese-delen/Feed" set) — so putting these
//  helpers here means the widget target picks them up for free, no separate
//  project.yml entry needed.
//
//  Every function here answers exactly one Tekst-TV row question — "når",
//  "hva", "hvor" — plus the day-section label and the collapsed-series
//  summary line. Kept pure (no Date() calls, no I/O) so every rule is
//  unit-testable in isolation (AgendaFormatTests) with fixed inputs.
//

import Foundation

enum AgendaFormat {

    // MARK: - "Når" — the time column

    private static let hourMinuteFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "HH:mm"
        return f
    }()

    /// "d." — just the day-of-month, used for the START of a multi-day window
    /// so the pair reads "4.–11. jul." rather than repeating the month twice.
    private static let dayOnlyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "d."
        return f
    }()

    /// "d. MMM" — day + abbreviated month, for the END of a multi-day window.
    private static let dayMonthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "d. MMM"
        return f
    }()

    /// The time column: "HH:mm" (tabular mono in the view) for an ordinary
    /// single-day event, or a compact date window ("4.–11. jul.") when the
    /// event spans more than one Europe/Oslo calendar day — a bare start time
    /// would be misleading for something like a golf major or a stage race
    /// that runs for a week. No time at all → an honest "–" (mirrors the
    /// channel column's same convention).
    static func timeLabel(time: Date?, endTime: Date?) -> String {
        guard let time else { return "–" }
        guard let endTime, FeedCompiler.osloDayKey(time) != FeedCompiler.osloDayKey(endTime) else {
            return hourMinuteFormatter.string(from: time)
        }
        return "\(dayOnlyFormatter.string(from: time))–\(dayMonthFormatter.string(from: endTime))"
    }

    // MARK: - "Hva" — the title column

    /// Team-vs-team events read as "Home – Away" (en dash, matching
    /// dashboard.js's eventTitle); anything else (golf, chess, a stage race
    /// stage, …) falls back to the event's own title.
    static func title(homeTeam: String?, awayTeam: String?, fallback: String) -> String {
        guard let home = homeTeam, !home.isEmpty, let away = awayTeam, !away.isEmpty else {
            return fallback
        }
        return "\(home) – \(away)"
    }

    /// The quiet meta line under the title (DESIGN.md "Radens anatomi":
    /// "meta: turnering — én dempet linje ved behov"). Returns the tournament
    /// ONLY when it adds context the title doesn't already carry — i.e. it is
    /// non-empty, not equal to the title, and not already contained in it
    /// (case-insensitive). Otherwise nil, so no empty second line is drawn.
    /// This is what keeps "Sjakk-NM 2026 – eliteklassen" (whose title already
    /// names the tournament) to one line while a bare "Lyn – Sogndal" gains a
    /// dempet "Eliteserien".
    static func metaLabel(tournament: String?, title: String) -> String? {
        guard let tournament, !tournament.isEmpty else { return nil }
        if tournament == title { return nil }
        if title.range(of: tournament, options: .caseInsensitive) != nil { return nil }
        return tournament
    }

    // MARK: - "Hvor" — the channel column

    /// First Norwegian streaming option, or an honest faint "–" when none is
    /// known yet — never silently blank (CLAUDE.md "Calm dashboard" §where to
    /// watch). Mirrors dashboard.js `whereToWatch`'s first-channel convention;
    /// the detail sheet is where every option is listed.
    static func channelLabel(_ streaming: [StreamingChannel]) -> String {
        guard let platform = streaming.first?.platform, !platform.isEmpty else { return "–" }
        return platform
    }

    // MARK: - Day-section label (Europe/Oslo, Norwegian)

    private static let dayLabelFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEEE d. MMMM"
        return f
    }()

    /// Parses a `FeedCompiler.osloDayKey`-shaped "yyyy-MM-dd" string back into
    /// a Date (midnight Oslo time on that day) — `en_US_POSIX` so the fixed
    /// digit pattern parses independent of the device's region settings.
    private static let dayKeyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// "I DAG" / "I MORGEN" / else the Norwegian weekday + date, uppercased —
    /// e.g. "TIRSDAG 15. JULI" — the exact same `"EEEE d. MMMM".uppercased()`
    /// convention ContentView already uses for the header date, just scoped
    /// explicitly to Europe/Oslo (the header's device-local formatter was a
    /// WP-10/12 shortcut; the agenda itself must be Oslo-correct — CLAUDE.md
    /// "Event time filtering").
    static func dayLabel(key: String, todayKey: String, tomorrowKey: String) -> String {
        if key == todayKey { return "I DAG" }
        if key == tomorrowKey { return "I MORGEN" }
        guard let date = dayKeyFormatter.date(from: key) else { return key }
        return dayLabelFormatter.string(from: date).uppercased()
    }

    // MARK: - Collapsed series summary ("Tour de France — 21 etapper denne uka")

    /// One line for a folded stage-race row: tournament name + stage count,
    /// with a quiet "denne uka" qualifier appended only when the LAST stage
    /// falls in the same Europe/Oslo calendar week as `now` — a race that's
    /// wrapping up this week reads differently from one that's still weeks
    /// out. The row itself stays tappable to expand every stage regardless.
    static func seriesSummary(tournament: String, stageCount: Int, lastStageEnd: Date?, now: Date) -> String {
        let name = tournament.isEmpty ? "Etapper" : tournament
        let base = "\(name) — \(stageCount) etapper"
        guard let lastStageEnd, isSameOsloWeek(lastStageEnd, now) else { return base }
        return "\(base) denne uka"
    }

    private static func isSameOsloWeek(_ a: Date, _ b: Date) -> Bool {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = FeedCompiler.osloTimeZone
        let aComponents = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: a)
        let bComponents = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: b)
        return aComponents.yearForWeekOfYear == bComponents.yearForWeekOfYear && aComponents.weekOfYear == bComponents.weekOfYear
    }
}
