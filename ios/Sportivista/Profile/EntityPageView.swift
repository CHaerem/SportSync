//
//  EntityPageView.swift
//  Sportivista
//
//  WP-170 — «laget mitt»-objektet: ONE screen that answers «hva skjer med X?».
//
//  Two entry points, both ONE tap away:
//    • «Det du følger» → a follow row pushes this page (the follow's own
//      settings live at the bottom of the SAME screen — see FollowDetailView,
//      which composes `EntityPageSections`).
//    • the event detail sheet → the event's entities are rows that push this
//      page inside the sheet's own NavigationStack.
//
//  The whole surface is composition (see EntityPage.swift): nothing here fetches,
//  matches or decides anything of its own. The rules that keep it from becoming
//  a FotMob clone are structural, not stylistic:
//    • FIXED section order, no tabs, no infinite scroll, small caps per section.
//    • Every section is OMITTED when it has nothing — never an empty shell, and
//      when the whole page is empty, ONE honest line says so.
//    • Result-derived content (SISTE RESULTAT, TABELL) is behind the SAME
//      `SpoilerShield` reveal WP-30/WP-171/WP-176 use. There is no second
//      spoiler concept in this file.
//    • Depth (squads, xG) is deliberately NOT here — the MER row hands off to
//      the specialist (VISJON v3).
//

import SwiftUI

// MARK: - The standalone screen (event-detail entry point)

/// The entity page as its own pushed screen. Loads its own snapshot off the main
/// actor (a navigation, not a hot path), exactly like `EventStandingsSection`.
struct EntityPageView: View {
    let entity: Entity
    /// WP-172 — the live-score overlay (from ContentView via the event sheet), so an
    /// ongoing match in KOMMENDE shows its running score. nil ⇒ unchanged rows.
    var liveStore: LiveScoreStore? = nil

    @State private var page: EntityPage?
    @State private var loaded = false

    var body: some View {
        List {
            EntityPageSections(entity: entity, page: page, liveStore: liveStore)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SportivistaTokens.background)
        .foregroundStyle(SportivistaTokens.label)
        .navigationTitle(entity.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard !loaded else { return }
            loaded = true
            page = await EntityPageLoader.page(entity: entity, rule: nil)
        }
    }
}

// MARK: - The sections (shared with FollowDetailView)

/// The entity page's body, as `Section`s, so the follow detail can render the
/// SAME page and append its own follow-admin sections underneath. `page == nil`
/// means "still loading" — the anchor shows immediately and the sections fill in,
/// so the screen never opens blank.
struct EntityPageSections: View {
    let entity: Entity
    let page: EntityPage?
    /// WP-170 — «Det du følger» opens the tapped event in the SAME sheet it
    /// already used. nil (the standalone screen) makes the rows calm, plain lines.
    var onSelectEvent: ((EntityUpcomingRow) -> Void)?
    /// WP-172 — the live-score overlay, read per KOMMENDE row so an ongoing match
    /// shows its running score. nil ⇒ no scores (unchanged rows). A spoiler-sensitive
    /// entity (`page.spoilerSensitive`) never shows one — the same shield the TABELL /
    /// RESULTAT sections respect.
    var liveStore: LiveScoreStore? = nil

    /// The anchor's avatar is the WP-185/186 one at ~2× (DESIGN.md
    /// § Entitets-avatar already reserves «samme avatar i stor variant» here).
    private let anchorScale: CGFloat = 2

    var body: some View {
        Group {
            anchorSection
            if let page {
                upcomingSection(page)
                resultsSection(page)
                tableSection(page)
                newsSection(page)
                specialistSection(page)
                if page.isEmpty { emptySection }
            }
        }
    }

    // MARK: Anker

    private var anchorSection: some View {
        Section {
            HStack(spacing: 14) {
                EntityAvatarView(identity: EntityIdentityResolver.identity(for: entity), sport: entity.sport, scale: anchorScale)
                VStack(alignment: .leading, spacing: 2) {
                    Text(entity.name)
                        .font(.sportivista(.title3, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.label)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(anchorSubtitle)
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("entity.anchor")
        }
        .listRowBackground(SportivistaTokens.cell)
    }

    /// «Fotball · lag» — honest about what we actually know; either half is
    /// dropped when it is unknown rather than printed as an empty word.
    private var anchorSubtitle: String {
        let sport = entity.sport.isEmpty ? "" : SportVocabulary.display(for: entity.sport)
        let type = entity.type.isEmpty ? "" : FollowVocabulary.typeLabel(entity.type)
        return [sport, type].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: KOMMENDE

    @ViewBuilder private func upcomingSection(_ page: EntityPage) -> some View {
        if !page.upcoming.isEmpty {
            Section {
                ForEach(page.upcoming) { row in
                    // WP-172 — an ongoing match's running score, spoiler-gated on the
                    // whole entity (never forced on a shielded follow).
                    let live = page.spoilerSensitive ? nil : liveStore?.score(for: row.id)
                    if row.event != nil, let onSelectEvent {
                        Button { onSelectEvent(row) } label: { upcomingRow(row, liveScore: live) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("followed.upcoming.\(row.id)")
                    } else {
                        upcomingRow(row, chevron: false, liveScore: live)
                            .accessibilityIdentifier("entity.upcoming.\(row.id)")
                    }
                }
            } header: {
                sectionHeader("KOMMENDE")
            }
            .listRowBackground(SportivistaTokens.cell)
        }
    }

    private func upcomingRow(_ row: EntityUpcomingRow, chevron: Bool = true, liveScore: LiveScore? = nil) -> some View {
        HStack(spacing: 12) {
            SportSymbolView(sport: row.sport)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.sportivista(.body))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                // WP-172 — for an ongoing match the score + clock leads (live-coloured,
                // tabular); then the calm when·where line. No score ⇒ the plain line.
                HStack(spacing: 6) {
                    if let liveScore {
                        Text(liveScore.display)
                            .font(.sportivistaTabular(.footnote, weight: .semibold))
                            .foregroundStyle(liveScore.isLive ? SportivistaTokens.live : SportivistaTokens.secondaryLabel)
                            .accessibilityLabel(liveScore.accessibilityLabel)
                        Text("·")
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.secondaryLabel.opacity(0.6))
                    }
                    Text(whenWhere(row))
                        .font(.sportivistaTabular(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
            }
            Spacer(minLength: 4)
            if chevron {
                Image(systemName: "chevron.forward")
                    .font(.sportivista(.footnote, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.tertiaryLabel)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
    }

    /// «lør 25. · 18:00 · TV 2» — the channel is appended only when we know one;
    /// an unknown channel stays the honest «–» the row already carries.
    private func whenWhere(_ row: EntityUpcomingRow) -> String {
        row.channelLabel == "–" ? row.whenLabel : "\(row.whenLabel) · \(row.channelLabel)"
    }

    // MARK: SISTE RESULTAT

    @ViewBuilder private func resultsSection(_ page: EntityPage) -> some View {
        if !page.results.isEmpty {
            Section {
                ForEach(page.results) { row in
                    // The SAME row (and the same «Vis resultat» shield) the
                    // Nyheter board renders — one implementation, no drift.
                    NewsResultRowView(row: row)
                }
            } header: {
                sectionHeader("SISTE RESULTAT")
            }
            .listRowBackground(SportivistaTokens.cell)
        }
    }

    // MARK: TABELL

    @ViewBuilder private func tableSection(_ page: EntityPage) -> some View {
        if let table = page.table {
            Section {
                EntityStandingsRows(table: table, spoilerSensitive: page.spoilerSensitive)
            } header: {
                sectionHeader(table.title)
                    .accessibilityIdentifier("entity.section.standings")
            }
            .listRowBackground(SportivistaTokens.cell)
        }
    }

    // MARK: SISTE NYTT

    @ViewBuilder private func newsSection(_ page: EntityPage) -> some View {
        if !page.news.isEmpty {
            Section {
                ForEach(page.news) { item in
                    newsRow(item)
                }
            } header: {
                sectionHeader("SISTE NYTT")
            } footer: {
                Text("Pekere til kilden — Sportivista lager aldri egne sammendrag.")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .listRowBackground(SportivistaTokens.cell)
        }
    }

    @ViewBuilder private func newsRow(_ item: NewsItem) -> some View {
        let content = HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.source.isEmpty ? "kilde" : item.source)
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            Spacer(minLength: 4)
            Image(systemName: "arrow.up.forward")
                .font(.sportivista(.footnote, weight: .semibold))
                .foregroundStyle(SportivistaTokens.accent)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())

        if let url = URL(string: item.link) {
            Link(destination: url) { content }
                .accessibilityLabel("Åpne: \(item.title)")
        } else {
            content
        }
    }

    // MARK: MER (the hand-off)

    @ViewBuilder private func specialistSection(_ page: EntityPage) -> some View {
        if let link = page.specialist {
            Section {
                Link(destination: link.url) {
                    HStack(spacing: 8) {
                        Text("Åpne i \(link.label)")
                            .font(.sportivista(.body))
                            .foregroundStyle(SportivistaTokens.accent)
                        Spacer(minLength: 4)
                        Image(systemName: "arrow.up.forward")
                            .font(.sportivista(.footnote, weight: .semibold))
                            .foregroundStyle(SportivistaTokens.accent)
                            .accessibilityHidden(true)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .accessibilityIdentifier("entity.specialist")
            } header: {
                sectionHeader("MER")
            } footer: {
                Text("Vi svarer på når og hvor. Dybden — tropp, statistikk — er andres fag.")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .listRowBackground(SportivistaTokens.cell)
        }
    }

    // MARK: Empty

    private var emptySection: some View {
        Section {
            Text("Ingenting på tavla om \(entity.name) akkurat nå. Siden fyller seg når det kommer events, resultater eller nyheter.")
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("entity.empty")
        }
        .listRowBackground(SportivistaTokens.cell)
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }
}

// MARK: - TABELL rows (spoiler-masked)

/// The entity's table, behind the SAME «Vis tabell» reveal the event sheet uses
/// (`EventStandingsSection`): a table is result-derived, so it would otherwise
/// leak exactly what the shield exists to hide.
private struct EntityStandingsRows: View {
    let table: StandingsTable
    let spoilerSensitive: Bool
    @State private var revealed = false

    var body: some View {
        if !spoilerSensitive || revealed {
            ForEach(table.rows) { line in
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
            .accessibilityIdentifier("entity.standings.reveal")
        }
    }
}

// MARK: - Loading (off the main actor)

/// The entity page's cache reads + decodes + build. Same shape as
/// `NewsModel.computeBoard`: `nonisolated async` returning `sending`, guarded by
/// the shared `MainThreadGuard` so a regression that runs it on main trips in
/// DEBUG.
enum EntityPageLoader {
    nonisolated static func page(
        entity: Entity,
        rule: InterestRule?,
        dataStore: DataStore = DataStore(),
        profileStore: ProfileStore = ProfileStore(),
        now: Date = Date()
    ) async -> sending EntityPage {
        await Task.detached(priority: .userInitiated) {
            build(entity: entity, rule: rule, dataStore: dataStore, profileStore: profileStore, now: now)
        }.value
    }

    nonisolated static func build(
        entity: Entity,
        rule: InterestRule?,
        dataStore: DataStore,
        profileStore: ProfileStore,
        now: Date
    ) -> sending EntityPage {
        MainThreadGuard.assertOffMain("EntityPage build (cache reads + JSON decode)")
        let syncState = profileStore.loadSyncState()
        let index = EntityIndex(dataStore.loadEntities())
        let events = dataStore.loadEvents()
        let base = dataStore.loadInterests() ?? Interests()
        let effective = EffectiveInterests.merge(profile: syncState.profile, into: base, index: index)
        let byId = Dictionary(
            events.compactMap { e -> (String, Event)? in e.id.map { ($0, e) } },
            uniquingKeysWith: { first, _ in first }
        )
        return EntityPage.build(
            entity: entity,
            rule: rule,
            feed: FeedQuery.build(events: events, interests: effective, now: now),
            index: index,
            eventsById: byId,
            news: dataStore.loadNews(),
            results: dataStore.loadRecentResults(),
            standings: dataStore.loadStandings(),
            tracked: dataStore.loadTracked(),
            shield: SpoilerShield(memory: MemoryState(from: syncState)),
            now: now
        )
    }
}
