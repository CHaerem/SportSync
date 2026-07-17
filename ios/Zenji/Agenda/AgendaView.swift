//
//  AgendaView.swift
//  Zenji
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
//   • All typography uses the Dynamic Type API (`Font.zenji` /
//     `Font.zenjiTabular`) and the semantic colour tokens
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
                    .listRowBackground(ZenjiTokens.background)
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
        .background(ZenjiTokens.background)
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
            .font(.zenji(.footnote, weight: .semibold))
            .foregroundStyle(ZenjiTokens.secondaryLabel)
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
        .listRowBackground(ZenjiTokens.cell)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if let entity = firstFollowable(item) {
                Button {
                    if !reduceMotion { followHaptic &+= 1 }
                    onFollow(entity)
                } label: {
                    Label("Følg", systemImage: "plus.circle")
                }
                .tint(ZenjiTokens.accent)
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
    /// skipped), point back at the command line instead of reading as "nothing on".
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
                emptyText("Fortell Sportivista hva du følger.")
                HStack(spacing: 8) {
                    Text("»_")
                        .font(.zenji(.callout, weight: .semibold))
                        .foregroundStyle(ZenjiTokens.secondaryLabel)
                    Text("Skriv i linjen nederst.")
                        .font(.zenji(.footnote))
                        .foregroundStyle(ZenjiTokens.secondaryLabel.opacity(0.8))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            emptyText("Ingen kommende arrangementer akkurat nå.")
        }
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .font(.zenji(.callout))
            .foregroundStyle(ZenjiTokens.secondaryLabel)
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
        HStack(alignment: .top, spacing: 10) {
            MustSeeDot(on: row.isMustSee)
            TimeColumn(text: row.timeLabel)
            RowBody(title: row.title, meta: row.metaLabel, channel: row.channelLabel)
            TrailingMarkers(reminder: row.mustWatch, aiResearch: row.isAIResearch)
        }
        .padding(.vertical, 4)
    }
}

/// A collapsed stage race: one summary line ("Tour de France — 21 etapper"),
/// the next stage's own time/channel; expandable via the detail sheet.
struct SeriesRowView: View {
    let row: AgendaSeriesRow

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            MustSeeDot(on: false) // series rows are never visually accented (FeedCompiler.isMustSee)
            TimeColumn(text: row.timeLabel)
            RowBody(title: row.summaryLabel, meta: nil, channel: row.channelLabel)
            TrailingMarkers(reminder: row.mustWatch, aiResearch: row.isAIResearch)
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
            .font(.zenji(.body))
            .foregroundStyle(ZenjiTokens.label)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true) // grow to 2 lines, never clip
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
                        .font(.zenji(.subheadline))
                        .foregroundStyle(ZenjiTokens.secondaryLabel.opacity(0.6))
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
            .fill(on ? ZenjiTokens.accent : Color.clear)
            .frame(width: 6, height: 6)
            .padding(.top, 7)
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

    /// A clock always carries ":"; a window ("13.–20. juli") or honest "–"
    /// never does.
    private var isClock: Bool { text.contains(":") }

    var body: some View {
        Text(text)
            .font(isClock ? .zenjiTabular(.body, weight: .semibold) : .zenjiTabular(.footnote, weight: .medium))
            .foregroundStyle(ZenjiTokens.label)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .frame(minWidth: 58, alignment: .leading)
            .padding(.top, isClock ? 0 : 2)
    }
}

/// The channel ("hvor"): dempet subheadline. An honest, fainter "–" when unknown
/// (DESIGN "Ærlig innhold": ukjent kanal er «–»).
private struct ChannelLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.zenji(.subheadline))
            .foregroundStyle(text == "–" ? ZenjiTokens.secondaryLabel.opacity(0.5) : ZenjiTokens.secondaryLabel)
            .lineLimit(1)
    }
}

/// The quiet meta line ("turnering"): dempet subheadline.
private struct MetaText: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.zenji(.subheadline))
            .foregroundStyle(ZenjiTokens.secondaryLabel)
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
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.accent)
                    .accessibilityLabel("Varsel på")
            }
            if aiResearch {
                Image(systemName: "info.circle")
                    .font(.zenji(.footnote))
                    .foregroundStyle(ZenjiTokens.secondaryLabel)
                    .accessibilityLabel("Funnet av AI")
            }
            Image(systemName: "chevron.forward")
                .font(.zenji(.footnote, weight: .semibold))
                .foregroundStyle(Color(uiColor: .tertiaryLabel))
                .accessibilityHidden(true)
        }
        .padding(.top, 2)
    }
}

#Preview {
    AgendaView(viewModel: AgendaViewModel())
}
