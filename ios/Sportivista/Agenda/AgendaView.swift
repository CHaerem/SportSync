//
//  AgendaView.swift
//  Sportivista
//
//  WP-81 — the agenda rebuilt as a native, inset-grouped `List` on the
//  Apple-native baseline (DESIGN.md § Agendaen + § Radens anatomi).
//  What changed versus the WP-14 ScrollView/LazyVStack pass:
//   • The board is a native `List` (`.insetGrouped`), one `Section` per day —
//     so the platform owns the separators, grouping, scrolling and inset column.
//   • Each row is a `Button` (`.buttonStyle(.plain)`) — it gets the native
//     pressed-state highlight and a button accessibility role for free, in
//     place of the old naked `.onTapGesture` (a Forbudsliste item).
//   • Row anatomy per the baseline: a leading amber must-see dot, tabular time,
//     the never-truncated title + a quiet meta/channel line, then trailing SF
//     Symbols — `bell.fill` (amber) when the row arms a reminder, `info.circle`
//     when the event is AI-research — and a quiet native-style chevron.
//   • Left swipe → «Følg» on rows that are ABOUT a not-yet-followed entity,
//     routed through the SAME assistant diff/confirm flow the detail sheet uses
//     (`onFollow`); a light `.sensoryFeedback` fires (suppressed under Reduce
//     Motion). Demp/Påminn have no existing action hook wired to the agenda
//     (per-event reminders are explicitly a non-feature — see EventDetailSheet's
//     NotifyStatusRow — and a mute/unfollow host action would have to be wired
//     in ContentView, which WP-83 owns), so only the meaningful, already-backed
//     «Følg» action ships here ("der det er meningsfullt · ikke finn opp ny logikk").
//   • All typography uses the Dynamic Type API (`Font.sportivista` /
//     `Font.sportivistaTabular`) and the semantic colour tokens
//     (`label`/`secondaryLabel`/`separator`/`accent`).
//
//  The detail sheets keep their `.presentationDetents([.medium, .large])`
//  (grabber + drag-to-dismiss), already set on each sheet.
//

import SwiftUI

struct AgendaView: View {
    var viewModel: AgendaViewModel
    /// WP-16.4 — a "Følg <entitet>" action (the detail sheet's context action
    /// and now the row's left-swipe); ContentView routes it into the assistant's
    /// diff/confirm flow. Defaults to a no-op so `#Preview` / standalone use compile.
    var onFollow: (Entity) -> Void = { _ in }
    /// WP-30 — an event's detail was opened; the host records a behaviour "open"
    /// stat for it (personal memory, layer 3). No-op default keeps previews/
    /// standalone use compiling.
    var onOpen: (Event) -> Void = { _ in }
    /// WP-66 — an event id the host asks to open (the assistant's «vis
    /// Brann-kampen» command, resolved against the agenda by AssistantViewModel).
    /// Set to a real event id ⇒ this view raises its detail sheet, then clears it
    /// back to nil so the same row can be re-opened later. Default constant keeps
    /// previews / standalone use compiling.
    var openEventID: Binding<String?> = .constant(nil)

    /// A single optional target drives both sheets. The event case carries the
    /// whole `AgendaEventRow` (not just the `Event`) so the detail sheet has the
    /// precomputed WP-16.4 context data (whyShown + followable) too.
    private enum DetailTarget: Identifiable {
        case event(AgendaEventRow)
        case series(AgendaSeriesRow)

        var id: String {
            switch self {
            case .event(let row): return row.id
            case .series(let s): return s.id
            }
        }
    }

    @State private var detailTarget: DetailTarget?
    /// A monotonically increasing trigger for the light swipe-action haptic.
    /// `.sensoryFeedback` fires on each change; we only bump it off the Reduce
    /// Motion path (DESIGN § Bevegelse & haptikk: "Reduce Motion …
    /// ingen haptikk").
    @State private var followHaptic = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        List {
            // WP-67: render the (possibly filtered) view of the board. The
            // filter is a pure view layer — `sections` (and the golden vectors)
            // are unchanged; `displayedSections` just hides rows.
            let sections = viewModel.displayedSections
            if sections.isEmpty {
                Section { emptyRow }
                    .listRowBackground(SportivistaTokens.background)
            } else {
                ForEach(sections) { section in
                    Section {
                        ForEach(section.items) { item in
                            rowButton(for: item)
                        }
                    } header: {
                        dayHeader(section.label)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        // WP-99: HIG keyboard avoidance — dragging the agenda dismisses the
        // command line's keyboard interactively (DESIGN § Hjelperen: "scroll
        // lukker tastaturet"). The command line rides above via safeAreaInset.
        .scrollDismissesKeyboard(.interactively)
        .background(SportivistaTokens.background)
        .refreshable {
            await viewModel.refresh()
        }
        .sensoryFeedback(.impact(weight: .light), trigger: followHaptic)
        .sheet(item: $detailTarget) { target in
            switch target {
            case .event(let row):
                EventDetailSheet(row: row, onFollow: onFollow)
            case .series(let series):
                SeriesDetailSheet(series: series)
            }
        }
        // WP-66 — open a specific event's detail on the assistant's command.
        .onChange(of: openEventID.wrappedValue) { _, id in
            guard let id, let row = eventRow(id: id) else { return }
            detailTarget = .event(row)
            onOpen(row.event)
            openEventID.wrappedValue = nil
        }
    }

    /// The compiled agenda row for an event id (WP-66 openEvent), or nil.
    private func eventRow(id: String) -> AgendaEventRow? {
        for section in viewModel.sections {
            for item in section.items {
                if case let .event(row) = item, row.event.id == id { return row }
            }
        }
        return nil
    }

    // MARK: - Day section header (DESIGN § Typografi: gruppeoverskrift)

    private func dayHeader(_ label: String) -> some View {
        Text(label)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
            // WP-99: label-independent handle for UI tests — the label is
            // time-of-day-dependent («I DAG» has no section late at night,
            // when the seeded now+Nh events tip past midnight).
            .accessibilityIdentifier("agenda.dayHeader")
    }

    // MARK: - Rows

    /// One tappable agenda row: a `Button` (native pressed-state + button role),
    /// opening the detail sheet, with the left-swipe «Følg» affordance where the
    /// row is about a not-yet-followed entity.
    @ViewBuilder
    private func rowButton(for item: AgendaItem) -> some View {
        Button {
            open(item)
        } label: {
            rowView(for: item)
        }
        .buttonStyle(.plain)
        .listRowBackground(SportivistaTokens.cell)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if let entity = firstFollowable(item) {
                Button {
                    if !reduceMotion { followHaptic &+= 1 }
                    onFollow(entity)
                } label: {
                    Label("Følg", systemImage: "plus.circle")
                }
                .tint(SportivistaTokens.accent)
            }
        }
    }

    /// The first entity this row is ABOUT that the user doesn't already follow —
    /// what the left-swipe «Følg» offers. Series rows aren't followed this way
    /// (they're the athlete-agnostic collapsed view), so only event rows qualify.
    private func firstFollowable(_ item: AgendaItem) -> Entity? {
        if case let .event(row) = item { return row.followable.first }
        return nil
    }

    @ViewBuilder
    private func rowView(for item: AgendaItem) -> some View {
        switch item {
        case .event(let row):
            EventRowView(row: row)
        case .series(let row):
            SeriesRowView(row: row)
        }
    }

    private func open(_ item: AgendaItem) {
        switch item {
        case .event(let row): detailTarget = .event(row); onOpen(row.event)
        case .series(let row): detailTarget = .series(row); onOpen(row.nextStage)
        }
    }

    /// "Henter data …" before the very first sync ever completes, else the
    /// honest "nothing right now" — `lastSync == nil` is DataStore's own
    /// "never synced" flag (see DataStore.swift), not just "zero events".
    /// WP-31: when the board is empty AND the follow-profile is empty (onboarding
    /// skipped), point at the assistant capsule instead of reading as "nothing on".
    @ViewBuilder
    private var emptyRow: some View {
        if viewModel.filter != nil {
            // WP-67: a filter is active but nothing matches it — honest, and
            // clearly the filter's doing (the ✕ line above resets it), never
            // read as "nothing on".
            emptyText("Ingen treff for filteret.")
        } else if viewModel.lastSync == nil {
            emptyText("Henter data …")
        } else if viewModel.profileIsEmpty {
            VStack(alignment: .leading, spacing: 8) {
                emptyText("Fortell Sportivista hva du følger, så samler den når og hvor du kan se det.")
                HStack(spacing: 8) {
                    Image(systemName: SportSymbol.assistant)
                        .font(.sportivista(.callout, weight: .semibold))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                        .accessibilityHidden(true)
                    Text("Trykk assistenten nederst.")
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel.opacity(0.8))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            emptyText("Ingen kommende arrangementer akkurat nå.")
        }
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.callout))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Rows

/// One ordinary agenda row (DESIGN § Radens anatomi): amber must-see
/// dot, the time (or a multi-day window) in a fixed left column, then the title
/// — up to two lines, never truncated — with a quiet meta line and the channel.
/// A `bell.fill` (amber) trails when the row arms a reminder, an `info.circle`
/// on AI-research events, then the native-style chevron.
struct EventRowView: View {
    let row: AgendaEventRow

    var body: some View {
        AgendaRowScaffold(
            isMustSee: row.isMustSee,
            timeLabel: row.timeLabel,
            sport: row.event.sport,
            reminder: row.mustWatch,
            aiResearch: row.isAIResearch
        ) {
            RowBody(title: row.title, meta: row.metaLabel, channel: row.channelLabel)
        }
    }
}

/// A collapsed stage race: one summary line ("Tour de France — 21 etapper"),
/// the next stage's own time/channel; expandable via the detail sheet.
struct SeriesRowView: View {
    let row: AgendaSeriesRow

    var body: some View {
        AgendaRowScaffold(
            isMustSee: false, // series rows are never visually accented (FeedCompiler.isMustSee)
            timeLabel: row.timeLabel,
            sport: row.nextStage.sport,
            reminder: row.mustWatch,
            aiResearch: row.isAIResearch
        ) {
            RowBody(title: row.summaryLabel, meta: nil, channel: row.channelLabel)
        }
    }
}

/// The layout scaffold shared by ordinary and series agenda rows. It owns the
/// Dynamic Type response for the whole row (WP-134).
///
/// • **Standard sizes (xS–xxxL):** the original horizontal layout, PIXEL-IDENTICAL
///   to the pre-WP-134 row — `[• dot] [tid] [⛳] [tittel …] [markører]`, with the
///   time column holding `.layoutPriority(1)` so a multi-day window reserves its
///   width first (the WP-99 behaviour, unchanged).
/// • **Accessibility sizes (AX1+, `dtSize.isAccessibilitySize`):** the row REFLOWS
///   vertically. At AX the fixed-size time column and the sport glyph would win
///   width negotiation and squeeze the flexible title to ~nothing, drawing OVER it
///   (the reported bug — see the AX brudd-PNGs). So the time/window + sport symbol
///   move onto their own line ABOVE the title, and the title takes the full row
///   width — never truncated to a «…» (DESIGN § Radens anatomi).
///
/// The `dtSize.isAccessibilitySize` branch (rather than `ViewThatFits`) keeps the
/// standard-size tree byte-for-byte the original one, so non-AX rows stay
/// pixel-identical (the binding regression guard).
private struct AgendaRowScaffold<RowBodyContent: View>: View {
    let isMustSee: Bool
    let timeLabel: String
    let sport: String
    let reminder: Bool
    let aiResearch: Bool
    @ViewBuilder var rowBody: () -> RowBodyContent

    @Environment(\.dynamicTypeSize) private var dtSize

    var body: some View {
        Group {
            if dtSize.isAccessibilitySize {
                // AX reflow: tid/vindu + sport-symbol on their own line above the
                // full-width title. The trailing markers (bell/info/chevron) stay
                // on the right so the disclosure affordance keeps its place.
                HStack(alignment: .top, spacing: 10) {
                    MustSeeDot(on: isMustSee)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            TimeColumn(text: timeLabel)
                            SportSymbolView(sport: sport)
                        }
                        rowBody()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    TrailingMarkers(reminder: reminder, aiResearch: aiResearch)
                }
            } else {
                // Standard sizes: the original horizontal layout, unchanged.
                // WP-99: the time column must win width negotiation — a multi-day
                // WINDOW ("16.–19. juli") is far wider than a clock, and without a
                // higher layout priority the flexible RowBody (maxWidth .infinity)
                // squeezes the column below its intrinsic width — its fixed-size
                // text then draws OVER the title. Priority makes the HStack reserve
                // the column's full width first, RowBody takes the rest.
                HStack(alignment: .top, spacing: 10) {
                    MustSeeDot(on: isMustSee)
                    TimeColumn(text: timeLabel)
                        .layoutPriority(1)
                    SportSymbolView(sport: sport)
                    rowBody()
                    TrailingMarkers(reminder: reminder, aiResearch: aiResearch)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Title (≤ 2 lines, never truncated to a "…") + the channel. The title has
/// priority: on a compact width the channel drops to its own dempet line
/// UNDER the title so the title keeps the full column; on a regular width the
/// channel sits quietly on the right. Either way the channel never squeezes
/// the title (DESIGN: "Kanal … Krymper aldri tittelen").
private struct RowBody: View {
    let title: String
    let meta: String?
    let channel: String
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var dtSize

    var body: some View {
        if sizeClass == .regular {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    titleText
                    if let meta { MetaText(meta) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ChannelLabel(text: channel)
                    .fixedSize()
                    .padding(.top, 2)
            }
        } else {
            VStack(alignment: .leading, spacing: 3) {
                titleText
                secondaryLine
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var titleText: some View {
        Text(title)
            .font(.sportivista(.body))
            .foregroundStyle(SportivistaTokens.label)
            // WP-134: DESIGN says the title is NEVER truncated to a «…». At
            // standard sizes it grows to ≤ 2 lines (the calm density). At
            // Accessibility sizes even the full-width title can exceed 2 lines,
            // so the cap is lifted entirely — the row grows tall rather than clip
            // (accessibility beats density; the never-truncate invariant holds).
            .lineLimit(dtSize.isAccessibilitySize ? nil : 2)
            .fixedSize(horizontal: false, vertical: true) // grow vertically, never clip
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The one dempet line under the title on a narrow screen. The channel
    /// (the "hvor" answer) is never truncated; the meta is a "ved behov"
    /// extra, so when "meta · kanal" doesn't fit, the meta is dropped WHOLE
    /// (never shown as an "…"-clipped fragment) and only the channel remains.
    @ViewBuilder
    private var secondaryLine: some View {
        if let meta {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                    MetaText(meta).fixedSize()
                    Text("·")
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.secondaryLabel.opacity(0.6))
                        .fixedSize()
                    ChannelLabel(text: channel).fixedSize()
                }
                ChannelLabel(text: channel).fixedSize()
            }
        } else {
            ChannelLabel(text: channel).fixedSize()
        }
    }
}

/// The gentlest possible emphasis (DESIGN: "Prikken er signalet"): a
/// small filled amber dot when on, an invisible placeholder of the same size
/// when off, so rows stay aligned either way. Left of the time column.
private struct MustSeeDot: View {
    let on: Bool

    var body: some View {
        Circle()
            .fill(on ? SportivistaTokens.accent : Color.clear)
            .frame(width: 6, height: 6)
            .padding(.top, 7)
            .accessibilityHidden(true)
    }
}

/// The quiet per-sport SF Symbol (DESIGN § Radens anatomi, rev. 19.07 eier-funn):
/// sits between the time column and the title so "what kind of event" (cycling vs
/// football) reads at a glance without parsing the meta text. `tertiaryLabel`,
/// NEVER coloured (the amber budget is untouched — the must-see dot is the row's
/// only accent), never emoji/logo. A fixed width keeps every title aligned
/// regardless of glyph width; scales with Dynamic Type. Hidden from VoiceOver —
/// the sport is already carried by the title/meta line, so this is a purely
/// visual at-a-glance aid (same policy as `MustSeeDot`). One canonical table
/// (`SportSymbol`) shared with the detail sheet and the Nyheter rows.
private struct SportSymbolView: View {
    let sport: String
    // WP-134: the glyph column must scale WITH its `.subheadline` font. A fixed
    // 20 pt frame stayed put while the symbol grew at Accessibility sizes, so the
    // glyph overflowed its box and collided with the neighbours. `@ScaledMetric`
    // grows the column in lock-step with the text style, keeping titles aligned.
    @ScaledMetric(relativeTo: .subheadline) private var symbolWidth = 20

    var body: some View {
        Image(systemName: SportSymbol.name(for: sport))
            .font(.sportivista(.subheadline))
            .foregroundStyle(SportivistaTokens.tertiaryLabel)
            .frame(width: symbolWidth, alignment: .center)
            .padding(.top, 2)
            .accessibilityHidden(true)
    }
}

/// The time column. An ordinary "HH:mm" reads at `.body` semibold tabular; a
/// multi-day window ("13.–20. juli") reads a notch quieter (`.footnote`) so a
/// week-long range stays compact and doesn't shove the title off the row — it is
/// a date span, not a clock. Either way it lives in the SAME left column (never
/// merged into the title). `.fixedSize` lets it take exactly the width it needs;
/// the min width keeps "HH:mm" rows aligned.
private struct TimeColumn: View {
    let text: String

    @Environment(\.dynamicTypeSize) private var dtSize

    /// A clock always carries ":"; a window ("13.–20. juli") or honest "–"
    /// never does.
    private var isClock: Bool { text.contains(":") }

    var body: some View {
        Text(text)
            .font(isClock ? .sportivistaTabular(.body, weight: .semibold) : .sportivistaTabular(.footnote, weight: .medium))
            .foregroundStyle(SportivistaTokens.label)
            // WP-134: at Accessibility sizes the column is on its own line (see
            // AgendaRowScaffold), so it no longer needs to win width against the
            // title — let a wide window WRAP instead of forcing its intrinsic
            // width with `.fixedSize`, and drop the min-width alignment padding.
            // At standard sizes the original behaviour is preserved exactly.
            .lineLimit(dtSize.isAccessibilitySize ? 2 : 1)
            .fixedSize(horizontal: !dtSize.isAccessibilitySize, vertical: false)
            .frame(minWidth: dtSize.isAccessibilitySize ? nil : 58, alignment: .leading)
            .padding(.top, isClock ? 0 : 2)
    }
}

/// The channel ("hvor"): dempet subheadline. An honest, fainter "–" when unknown
/// (DESIGN "Ærlig innhold": ukjent kanal er «–»).
private struct ChannelLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.sportivista(.subheadline))
            .foregroundStyle(text == "–" ? SportivistaTokens.secondaryLabel.opacity(0.5) : SportivistaTokens.secondaryLabel)
            .lineLimit(1)
    }
}

/// The quiet meta line ("turnering"): dempet subheadline.
private struct MetaText: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.sportivista(.subheadline))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
            .lineLimit(1)
    }
}

/// The trailing markers (DESIGN § Radens anatomi): `bell.fill` (amber)
/// when the row arms a reminder, `info.circle` on AI-research events, then a
/// quiet native-style chevron so the row reads as a disclosure. SF Symbols scale
/// with Dynamic Type and carry their own accessibility labels. The row is a
/// Button (`.buttonStyle(.plain)`), which does not draw the system chevron, so
/// the chevron is a `chevron.forward` glyph tinted like the native one.
private struct TrailingMarkers: View {
    let reminder: Bool
    let aiResearch: Bool

    var body: some View {
        HStack(spacing: 8) {
            if reminder {
                Image(systemName: "bell.fill")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.accent)
                    .accessibilityLabel("Varsel på")
            }
            if aiResearch {
                Image(systemName: "info.circle")
                    .font(.sportivista(.footnote))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .accessibilityLabel("Funnet av AI")
            }
            Image(systemName: "chevron.forward")
                .font(.sportivista(.footnote, weight: .semibold))
                .foregroundStyle(SportivistaTokens.tertiaryLabel)
                .accessibilityHidden(true)
        }
        .padding(.top, 2)
    }
}

#Preview {
    AgendaView(viewModel: AgendaViewModel())
}
