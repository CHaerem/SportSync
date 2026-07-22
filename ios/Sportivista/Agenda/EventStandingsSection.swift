//
//  EventStandingsSection.swift
//  Sportivista
//
//  WP-171 — the TABELL surface in the event detail sheet: the league table, the
//  golf leaderboard or the F1 championship for the event you just tapped. The
//  web detail sheet has answered "hvor står de?" since WP-14 (detail.js
//  `footballStanding` / `golfContext` / `addF1Context`); the app didn't even
//  sync standings.json. This closes that parity debt.
//
//  Two halves, deliberately split:
//    • `StandingsTable` — PURE. Event + Standings in, rows out. No I/O, no
//      clock, no SwiftUI, so the fixture test drives the real thing.
//    • `EventStandingsSection` — the thin renderer, which reads the cached
//      standings OFF the main actor and respects the SPOILER SHIELD: a table is
//      derived from results (a league table after last night's round, a live
//      leaderboard, the championship after the last race), so it is masked
//      behind the same «Vis tabell» reveal as the sheet's own RESULTAT section
//      whenever `row.spoilerSafe` is false.
//
//  Non-goal (WP-171): NO live updating. The hourly static pipeline's cadence is
//  the cadence — the section reads the cache once when the sheet appears.
//

import SwiftUI

// MARK: - Pure table builder

/// One rendered standings table: a heading, a handful of rows, and an honest
/// footnote when rows were left out.
struct StandingsTable: Equatable {
    var title: String
    var rows: [StandingsTableRow]

    /// How many rows a table shows before the "highlighted" extras (ro — the
    /// sheet answers "hvor står de", it is not a full-table browser).
    static let topRows = 5

    /// Build the table for an event, or `nil` when there is nothing honest to
    /// show (no standings synced, or a sport with no table).
    static func build(event: Event, standings: Standings?) -> StandingsTable? {
        guard let standings, !standings.isEmpty else { return nil }
        switch TextMatch.normalize(event.sport) {
        case "football": return football(event: event, standings: standings.football)
        case "golf": return golf(event: event, tours: standings.golf)
        case "f1": return formula1(standings.f1)
        default: return nil
        }
    }

    // MARK: Football — the league table, with BOTH teams always visible

    private static func football(event: Event, standings: FootballStandings) -> StandingsTable? {
        let tournament = (event.tournament ?? "").lowercased()
        let isSpanish = tournament.contains("la liga") || tournament.contains("copa")
        let table = isSpanish ? standings.laLiga : standings.premierLeague
        guard !table.isEmpty else { return nil }

        let involved = [event.homeTeam, event.awayTeam].compactMap { $0 }.filter { !$0.isEmpty }
        let highlighted = table.filter { entry in
            involved.contains { TextMatch.containsName(entry.team, $0) || TextMatch.containsName($0, entry.team) }
        }
        // HONEST GATE: show a table only when it is actually THIS match's table.
        // Football events cover far more leagues than we publish standings for
        // (Eliteserien, OBOS, friendlies …); without this, an OBOS fixture would
        // render the Premier League top five as if it were its own table. The web
        // detail sheet applies the same rule (detail.js `footballStanding` returns
        // "" unless it finds the teams).
        guard !highlighted.isEmpty else { return nil }
        // Top of the table plus the two teams playing — a team down in 14th is
        // exactly what the tap was asking about, so it is never cut away.
        var picked = Array(table.prefix(topRows))
        for entry in highlighted where !picked.contains(where: { $0.position == entry.position }) {
            picked.append(entry)
        }
        picked.sort { $0.position < $1.position }

        let rows = picked.map { entry in
            StandingsTableRow(
                id: "table|\(entry.position)|\(entry.team)",
                rank: "\(entry.position).",
                name: entry.team,
                value: "\(entry.points)",
                highlighted: highlighted.contains(entry)
            )
        }
        return StandingsTable(title: isSpanish ? "LA LIGA" : "PREMIER LEAGUE", rows: rows)
    }

    // MARK: Golf — the leaderboard, with the tracked (Norwegian) players kept

    private static func golf(event: Event, tours: [String: GolfLeaderboard]) -> StandingsTable? {
        let haystack = "\(event.tournament ?? "") \(event.title)".lowercased()
        // Only THIS event's tournament (same honest gate as football): a
        // leaderboard from another week's tour is not this event's table.
        let ordered = tours.keys.sorted().compactMap { key -> GolfLeaderboard? in tours[key] }
        let board = ordered.first { board in
            guard let name = board.name?.lowercased(), !name.isEmpty, !board.leaderboard.isEmpty else { return false }
            return haystack.contains(name)
        }
        guard let board else { return nil }

        var rows = board.leaderboard.prefix(topRows).map { entry in
            StandingsTableRow(
                id: "golf|\(entry.player)",
                rank: entry.positionDisplay ?? entry.position.map { "\($0)." } ?? "–",
                name: entry.player,
                value: entry.score ?? "–",
                highlighted: false
            )
        }
        for entry in board.trackedPlayers where !rows.contains(where: { $0.name == entry.player }) {
            rows.append(StandingsTableRow(
                id: "golf|\(entry.player)",
                rank: entry.positionDisplay ?? entry.position.map { "\($0)." } ?? "–",
                name: entry.player,
                value: entry.score ?? "–",
                highlighted: true
            ))
        }
        return StandingsTable(title: (board.name ?? "LEDERTAVLE").uppercased(), rows: rows)
    }

    // MARK: F1 — the drivers' championship

    private static func formula1(_ standings: F1Standings) -> StandingsTable? {
        guard !standings.drivers.isEmpty else { return nil }
        let rows = standings.drivers.prefix(topRows).map { d in
            StandingsTableRow(
                id: "f1|\(d.driver)",
                rank: "\(d.position).",
                name: d.driver,
                value: "\(d.points)",
                highlighted: false
            )
        }
        return StandingsTable(title: "VM-STILLING", rows: Array(rows))
    }
}

/// One table line: rank · name · value (points / score). `highlighted` marks the
/// row the tap was actually about (a team playing, a tracked Norwegian).
struct StandingsTableRow: Identifiable, Equatable {
    var id: String
    var rank: String
    var name: String
    var value: String
    var highlighted: Bool
}

// MARK: - The sheet section

/// The TABELL section of the event detail sheet. Reads the cached standings
/// off the main actor once, then renders the pure table — masked behind «Vis
/// tabell» whenever the spoiler shield applies to this event, because a table
/// is result-derived and would otherwise leak exactly what the shield exists to
/// hide.
struct EventStandingsSection: View {
    let row: AgendaEventRow
    /// Injected so the fixture tests (and previews) can drive the section with a
    /// literal `Standings` and no cache at all.
    var load: @Sendable () -> Standings? = { DataStore().loadStandings() }

    @State private var standings: Standings?
    @State private var loaded = false
    @State private var revealed = false

    private var table: StandingsTable? { StandingsTable.build(event: row.event, standings: standings) }

    var body: some View {
        Group {
            if let table {
                Section {
                    if row.spoilerSafe || revealed {
                        ForEach(table.rows) { line in
                            StandingsRowView(line: line)
                                .listRowBackground(SportivistaTokens.cell)
                        }
                    } else {
                        Button {
                            revealed = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "eye.slash")
                                    .font(.sportivista(.caption))
                                Text("Vis tabell")
                                    .font(.sportivista(.subheadline, weight: .semibold))
                            }
                            .foregroundStyle(SportivistaTokens.accent)
                            .frame(minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("detail.standings.reveal")
                        .listRowBackground(SportivistaTokens.cell)
                    }
                } header: {
                    Text(table.title)
                        .font(.sportivista(.caption2, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .tracking(0.5)
                        .accessibilityIdentifier("detail.section.standings")
                }
            } else {
                // The load has to hang off a view that EXISTS before the table
                // does — an empty `Group` has no children, so a `.task` on it
                // would never run and the section could never appear (chicken
                // and egg). A zero-height, invisible row carries it and vanishes
                // the moment the table renders.
                Color.clear
                    .frame(height: 0)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .task {
                        guard !loaded else { return }
                        loaded = true
                        let loader = load
                        standings = await Task.detached { loader() }.value
                    }
            }
        }
    }
}

/// One table line: a tabular rank column, the name, and the value on the right.
/// The involved team / tracked player is set apart by WEIGHT, never by a second
/// colour (DESIGN § Farge: amber is the one accent, reserved for action/state).
private struct StandingsRowView: View {
    let line: StandingsTableRow

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(line.rank)
                .font(.sportivistaTabular(.footnote))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .frame(minWidth: 34, alignment: .leading)
            Text(line.name)
                .font(.sportivista(.subheadline, weight: line.highlighted ? .semibold : .regular))
                .foregroundStyle(SportivistaTokens.label)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(line.value)
                .font(.sportivistaTabular(.subheadline, weight: line.highlighted ? .semibold : .regular))
                .foregroundStyle(SportivistaTokens.label)
        }
        .padding(.vertical, 1)
    }
}
