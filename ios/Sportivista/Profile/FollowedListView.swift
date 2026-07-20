//
//  FollowedListView.swift
//  Sportivista
//
//  WP-105 → WP-120 — "Det du følger" (DESIGN § Deg-skjermen). WP-105 shipped a
//  plain one-section name list whose subtitle read identically on every row
//  («sport · varsler på»); the owner (20.07) called that out as dead information
//  — the surface must answer «what does following this GIVE me?».
//
//  WP-120 makes each row carry value and groups by rule TYPE:
//    • Sections per rule type (UTØVERE / LAG / TURNERINGER / LIGAER / SPORTER /
//      KATEGORIER), so the list reads as what you follow, not one flat blur.
//    • Row = canonical sport symbol (SportSymbol, WP-108) + name + the PER-ENTITY
//      next event as the subtitle («Neste: lør 25. · Strømsgodset – Lyn · TV 2»)
//      or an honest «Ikke satt opp ennå».
//    • Safe handling: a `.swipeActions` «Slutt å følge» (same confirmation as the
//      detail) + a calm undo snackbar after a removal.
//  The next-event / news / grouping is the pure `FollowPresenter` (reusing the
//  lens's own matching — no new fuzzy); writes still go through the one apply
//  path (`AssistantViewModel.follow` / `.removeRule`).
//
//  A «+» toolbar entry opens the Legg til-søk. Interests without the assistant
//  (3b): every follow/unfollow here runs through the SAME ProfileStore apply path
//  the assistant's confirmed diff uses (one source of truth).
//

import SwiftUI

struct FollowedListView: View {
    var viewModel: AssistantViewModel
    @State private var addShown = false
    /// The read snapshot (relevance-filtered agenda + news + index), rebuilt when
    /// the rule set changes so a just-added follow's next event shows at once.
    @State private var snapshot: AssistantViewModel.FollowSnapshot?
    /// Precomputed row subtitles (entityId → «Neste: …» / «Ikke satt opp ennå»),
    /// so scrolling never re-runs the per-rule event scan.
    @State private var subtitles: [String: String] = [:]
    /// The rule a swipe/detail is confirming a stop for (drives the dialog).
    @State private var confirmingStop: InterestRule?
    /// The just-removed follow, shown as a calm undo snackbar for a few seconds.
    @State private var undo: UndoState?

    private var rules: [InterestRule] { viewModel.profile.rules }

    private struct UndoState: Identifiable {
        let id = UUID()
        let rule: InterestRule
        /// The resolved entity to re-follow on «Angre» (nil only if unresolvable).
        let entity: Entity?
    }

    var body: some View {
        List {
            if rules.isEmpty {
                Section {
                    Text("Ingenting ennå. Trykk + for å søke opp et lag, en utøver eller en turnering å følge.")
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .listRowBackground(SportivistaTokens.cell)
            } else if let snap = snapshot {
                ForEach(snap.presenter.sections(for: rules)) { section in
                    Section {
                        ForEach(section.rules) { rule in
                            NavigationLink {
                                FollowDetailView(viewModel: viewModel, rule: rule)
                            } label: {
                                followRow(rule)
                            }
                            .accessibilityIdentifier("followed.row.\(rule.entityId)")
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    confirmingStop = rule
                                } label: {
                                    Label("Slutt å følge", systemImage: "xmark.circle")
                                }
                                .accessibilityIdentifier("followed.swipe.\(rule.entityId)")
                            }
                        }
                    } header: {
                        groupHeader(section.group.header)
                    }
                    .listRowBackground(SportivistaTokens.cell)
                }
            } else {
                // Snapshot still building — show names immediately (no dead subtitle),
                // the grouped list + subtitles fill in on the next frame.
                Section {
                    ForEach(rules) { rule in
                        NavigationLink {
                            FollowDetailView(viewModel: viewModel, rule: rule)
                        } label: {
                            followRow(rule)
                        }
                    }
                }
                .listRowBackground(SportivistaTokens.cell)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SportivistaTokens.background)
        .foregroundStyle(SportivistaTokens.label)
        .navigationTitle("Det du følger")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    addShown = true
                } label: {
                    Image(systemName: "plus")
                }
                .tint(SportivistaTokens.accent)
                .accessibilityLabel("Legg til")
                .accessibilityIdentifier("followed.add")
            }
        }
        .sheet(isPresented: $addShown) {
            AddFollowSearchView(viewModel: viewModel)
        }
        .task(id: rules) { rebuildSnapshot() }
        .overlay(alignment: .bottom) { undoSnackbar }
        .confirmationDialog(
            confirmingStop.map { "Slutt å følge \($0.entityName)?" } ?? "",
            isPresented: Binding(get: { confirmingStop != nil }, set: { if !$0 { confirmingStop = nil } }),
            titleVisibility: .visible,
            presenting: confirmingStop
        ) { rule in
            Button("Slutt å følge", role: .destructive) { stopFollowing(rule) }
                .accessibilityIdentifier("followed.stop.confirm")
            Button("Avbryt", role: .cancel) { confirmingStop = nil }
        } message: { rule in
            Text("\(rule.entityName) forsvinner fra det du følger, og agendaen oppdateres. Du kan angre.")
        }
    }

    // MARK: - Row

    private func followRow(_ rule: InterestRule) -> some View {
        HStack(spacing: 12) {
            Image(systemName: SportSymbol.name(for: rule.sport))
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.tertiaryLabel)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(rule.entityName)
                    .font(.sportivista(.body, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.label)
                Text(subtitles[rule.entityId] ?? " ")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .lineLimit(2)
            }
        }
        .contentShape(Rectangle())
    }

    private func groupHeader(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }

    // MARK: - Undo snackbar (HIG-native calm safety net)

    @ViewBuilder private var undoSnackbar: some View {
        if let u = undo {
            HStack(spacing: 12) {
                Text("Sluttet å følge \(u.rule.entityName)")
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.label)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Button("Angre") {
                    if let entity = u.entity { viewModel.follow(entity, reason: u.rule.reason) }
                    undo = nil
                }
                .font(.sportivista(.subheadline, weight: .semibold))
                .foregroundStyle(SportivistaTokens.accent)
                .accessibilityIdentifier("followed.undo")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(SportivistaTokens.cell2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(SportivistaTokens.separator))
            .padding(.horizontal, 16)
            .padding(.bottom, 14)
            .transition(.opacity)
            .task(id: u.id) {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if undo?.id == u.id { withAnimation { undo = nil } }
            }
        }
    }

    // MARK: - Actions

    private func stopFollowing(_ rule: InterestRule) {
        let entity = snapshot?.presenter.entity(for: rule)
        viewModel.removeRule(rule)
        confirmingStop = nil
        withAnimation { undo = UndoState(rule: rule, entity: entity) }
    }

    private func rebuildSnapshot() {
        let snap = viewModel.followSnapshot()
        snapshot = snap
        var subs: [String: String] = [:]
        for rule in rules { subs[rule.entityId] = snap.presenter.rowSubtitle(for: rule) }
        subtitles = subs
    }
}

// MARK: - Detail (rad → detalj)

/// One follow's detail. WP-120 adds two value sections ABOVE the descriptive
/// OM/HVORFOR: KOMMENDE (the entity's next 1–3 events, each tappable → the full
/// event detail) and SISTE NYTT (the lens-matched news pointers, tapping opens
/// the source). The device-wide reminder read-out and «Slutt å følge» (behind a
/// calm confirmation) are unchanged from WP-105.
struct FollowDetailView: View {
    var viewModel: AssistantViewModel
    let rule: InterestRule

    @State private var snapshot: AssistantViewModel.FollowSnapshot?
    @State private var detailRow: AgendaEventRow?
    @State private var confirmingStop = false
    @Environment(\.dismiss) private var dismiss
    /// The device-wide reminder preference — the only notify signal the on-device
    /// profile carries (there is no per-entity notify field), shown honestly.
    private let leadTimeOn = NotificationLeadPreference.isLeadTimeEnabled()

    private var upcoming: [FeedQueryEvent] { snapshot?.presenter.nextEvents(for: rule, limit: 3) ?? [] }
    private var news: [NewsItem] { snapshot?.presenter.newsItems(for: rule, limit: 3) ?? [] }
    /// WP-125: this follow's name resolves to nothing we know — likely mistyped.
    private var isUnresolved: Bool { snapshot?.presenter.matchState(for: rule) == .unresolved }
    /// Nearest real names for an unresolved follow (reuses the index fuzzy).
    private var nameSuggestions: [Entity] { snapshot?.presenter.nameSuggestions(for: rule) ?? [] }

    var body: some View {
        List {
            if isUnresolved {
                Section {
                    Text("Vi finner ingen kamper eller nyheter for «\(rule.entityName)». Navnet stemmer kanskje ikke helt.")
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.label)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(nameSuggestions, id: \.id) { suggestion in
                        suggestionRow(suggestion)
                    }
                } header: {
                    groupHeader("SJEKK NAVNET")
                } footer: {
                    Text(nameSuggestions.isEmpty
                        ? "Prøv å legge til på nytt med et litt annet navn."
                        : "Kanskje du mente ett av disse? Legg det til på nytt om navnet er feil.")
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            if !upcoming.isEmpty {
                Section {
                    ForEach(upcoming, id: \.id) { event in
                        Button {
                            detailRow = agendaRow(for: event)
                        } label: {
                            kommendeRow(event)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("followed.upcoming.\(event.id)")
                    }
                } header: {
                    groupHeader("KOMMENDE")
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            if !news.isEmpty {
                Section {
                    ForEach(news) { item in
                        newsRow(item)
                    }
                } header: {
                    groupHeader("SISTE NYTT")
                } footer: {
                    Text("Pekere til kilden — Sportivista lager aldri egne sammendrag.")
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            Section {
                detailInfoRow("Sport", SportVocabulary.display(for: rule.sport))
                if let scope = rule.scope, !scope.isEmpty {
                    detailInfoRow("Avgrensning", scope)
                }
                if !rule.lens.isDefault {
                    detailInfoRow("Perspektiv", rule.lens.label)
                }
            } header: {
                groupHeader("OM")
            }
            .listRowBackground(SportivistaTokens.cell)

            if !rule.reason.isEmpty {
                Section {
                    Text(rule.reason)
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.label)
                        .fixedSize(horizontal: false, vertical: true)
                } header: {
                    groupHeader("HVORFOR")
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            Section {
                HStack(spacing: 8) {
                    Text(leadTimeOn ? "På" : "Av")
                        .font(.sportivista(.subheadline, weight: .semibold))
                        .foregroundStyle(leadTimeOn ? SportivistaTokens.accent : SportivistaTokens.secondaryLabel)
                    Text(leadTimeOn ? "minner deg før start" : "ingen påminnelse")
                        .font(.sportivista(.caption))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .padding(.vertical, 2)
            } header: {
                groupHeader("VARSEL")
            } footer: {
                Text("Varsel før start styres samlet i Deg › Varsel før start.")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            .listRowBackground(SportivistaTokens.cell)

            Section {
                Button(role: .destructive) {
                    confirmingStop = true
                } label: {
                    Text("Slutt å følge")
                        .font(.sportivista(.body, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.destructive)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("followed.stop")
            }
            .listRowBackground(SportivistaTokens.cell)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SportivistaTokens.background)
        .foregroundStyle(SportivistaTokens.label)
        .navigationTitle(rule.entityName)
        .navigationBarTitleDisplayMode(.inline)
        .task { snapshot = viewModel.followSnapshot() }
        .sheet(item: $detailRow) { row in
            EventDetailSheet(row: row, onFollow: { viewModel.follow($0) })
        }
        .confirmationDialog(
            "Slutt å følge \(rule.entityName)?",
            isPresented: $confirmingStop,
            titleVisibility: .visible
        ) {
            Button("Slutt å følge", role: .destructive) {
                viewModel.removeRule(rule)
                dismiss()
            }
            .accessibilityIdentifier("followed.stop.confirm")
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("\(rule.entityName) forsvinner fra det du følger, og agendaen oppdateres. Du kan legge til igjen når som helst.")
        }
    }

    // MARK: - KOMMENDE row

    private func kommendeRow(_ event: FeedQueryEvent) -> some View {
        HStack(spacing: 12) {
            Image(systemName: SportSymbol.name(for: event.sport))
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.tertiaryLabel)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.sportivista(.body))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                Text(whenWhereLabel(event))
                    .font(.sportivistaTabular(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.forward")
                .font(.sportivista(.footnote, weight: .semibold))
                .foregroundStyle(SportivistaTokens.tertiaryLabel)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
    }

    /// «lør 25. · 18:00 · TV 2» for a single-day event; the multi-day window
    /// (already a date range) stands on its own, with the channel appended.
    private func whenWhereLabel(_ event: FeedQueryEvent) -> String {
        var parts: [String] = []
        if event.timeLabel.contains("–") {
            parts.append(event.timeLabel)
        } else if let presenter = snapshot?.presenter {
            parts.append("\(presenter.shortDayLabel(dayKey: event.dayKey)) · \(event.timeLabel)")
        } else {
            parts.append(event.timeLabel)
        }
        if event.channelLabel != "–" { parts.append(event.channelLabel) }
        return parts.joined(separator: " · ")
    }

    // MARK: - SISTE NYTT row

    @ViewBuilder private func newsRow(_ item: NewsItem) -> some View {
        let content = HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.sportivista(.subheadline))
                    .foregroundStyle(SportivistaTokens.label)
                    .fixedSize(horizontal: false, vertical: true)
                Text(newsMeta(item))
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

    private func newsMeta(_ item: NewsItem) -> String {
        let source = item.source.isEmpty ? "kilde" : item.source
        guard let published = item.publishedAt else { return source }
        return "\(source) · \(Self.relativeFormatter.localizedString(for: published, relativeTo: Date()))"
    }

    // MARK: - Detail rows / helpers

    // MARK: - SJEKK NAVNET row (WP-125 lens-miss suggestion)

    /// One calm, informational nearest-name suggestion — the name + its sport.
    /// Deliberately not a button: the honest read is "check the name"; correcting
    /// it is done through the normal Legg til-søk, so nothing is changed by tap.
    private func suggestionRow(_ entity: Entity) -> some View {
        HStack(spacing: 12) {
            Image(systemName: SportSymbol.name(for: entity.sport))
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.tertiaryLabel)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(entity.name)
                    .font(.sportivista(.body))
                    .foregroundStyle(SportivistaTokens.label)
                Text(SportVocabulary.display(for: entity.sport))
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("followed.suggestion.\(entity.id)")
    }

    private func detailInfoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.label)
            Spacer()
            Text(value)
                .font(.sportivista(.body))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .multilineTextAlignment(.trailing)
        }
    }

    private func groupHeader(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }

    /// Build the full agenda row for a KOMMENDE event so it can open the SAME
    /// event-detail sheet the agenda uses (venue · streaming · AI provenance).
    /// whyShown/followable default empty — this surface is already scoped to a
    /// followed entity.
    private func agendaRow(for event: FeedQueryEvent) -> AgendaEventRow? {
        guard let full = snapshot?.eventsById[event.id] else { return nil }
        return AgendaEventRow(
            id: event.id,
            timeLabel: event.timeLabel,
            title: event.title,
            metaLabel: AgendaFormat.metaLabel(tournament: full.tournament, title: event.title),
            channelLabel: event.channelLabel,
            isMustSee: event.isMustSee,
            mustWatch: event.isMustSee,
            isAIResearch: full.source == "ai-research",
            event: full
        )
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.unitsStyle = .short
        return f
    }()
}

// MARK: - Shared Norwegian vocabulary for the follow surfaces

enum FollowVocabulary {
    /// A Norwegian word for an entity's `type` (athlete/team/tournament/…), for
    /// the Legg til search rows' «sport · type» line.
    static func typeLabel(_ type: String) -> String {
        switch type {
        case "athlete": return "utøver"
        case "team": return "lag"
        case "tournament": return "turnering"
        case "league": return "liga"
        case "sport": return "sport"
        case "category": return "kategori"
        default: return type
        }
    }
}
