//
//  ContentView.swift
//  Zenji
//
//  WP-10 scaffold → WP-12 sync → WP-14 agenda → WP-14.2 theme override →
//  WP-16.4 the seamless assistant. The screen is now: a Tekst-TV header
//  (ZENJI · dato · ticking clock, plus the theme + assistant glyphs), the
//  quiet live-now line, the day-grouped agenda, and — pinned to the bottom
//  above the safe-area — the always-present KOMMANDOLINJE. The assistant's
//  results (a proposal DIFF, an answer, an explanation) fade in as a flat
//  "ark" (AssistantPanel) over the agenda; the command line stays put beneath
//  it, so the line is unmistakably the primary way in. The header `»_` glyph
//  is now a focus shortcut to that line rather than a button that opens a room.
//
//  ContentView owns BOTH view models and hands them ONE shared ProfileStore, so
//  a follow the assistant applies is the same profile the agenda recompiles
//  against — that shared store, plus `assistant.onProfileChanged` wired to
//  `agenda.reloadFromCache`, is the "umiddelbar konsekvens" (move 4).
//
//  Deliberately keeps `init(syncClient:dataStore:)` compatible with
//  ZenjiApp.swift (which needs zero edits — the WP-14/15 rationale still holds).
//

import SwiftUI

struct ContentView: View {
    let syncClient: SyncClient
    let dataStore: DataStore
    let notificationPlanner: NotificationPlanner
    /// WP-16.4 — the one profile store the agenda AND the assistant share.
    let profileStore: ProfileStore

    @State private var agenda: AgendaViewModel
    @State private var assistant: AssistantViewModel
    @State private var now = Date()
    /// WP-16.4 — the assistant "ark" is up (a result or a browse).
    @State private var panelShown = false
    @FocusState private var commandFocused: Bool

    @AppStorage(ThemeOverride.storageKey) private var themeOverrideRaw = ThemeOverride.system.rawValue
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var themeOverride: ThemeOverride {
        ThemeOverride(rawValue: themeOverrideRaw) ?? .system
    }

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(
        syncClient: SyncClient = SyncClient(),
        dataStore: DataStore = DataStore(),
        notificationPlanner: NotificationPlanner = NotificationPlanner(),
        profileStore: ProfileStore = ProfileStore()
    ) {
        self.syncClient = syncClient
        self.dataStore = dataStore
        self.notificationPlanner = notificationPlanner
        self.profileStore = profileStore
        self._agenda = State(initialValue: AgendaViewModel(dataStore: dataStore, syncClient: syncClient, profileStore: profileStore))
        #if DEBUG
        // Screenshot harness: back the assistant with the deterministic mock
        // (so no "Apple Intelligence off" banner) when a demo mode is requested.
        if ProcessInfo.processInfo.environment["ZENJI_DEMO"] != nil {
            self._assistant = State(initialValue: AssistantViewModel(
                assistant: MockInterestAssistant(), profileStore: profileStore,
                index: EntityIndex(dataStore.loadEntities())
            ))
        } else {
            self._assistant = State(initialValue: AssistantViewModel(dataStore: dataStore, profileStore: profileStore))
        }
        #else
        self._assistant = State(initialValue: AssistantViewModel(dataStore: dataStore, profileStore: profileStore))
        #endif
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEEE d. MMMM"
        return f
    }()

    private static let clockFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    private static let clockFormatterNoSeconds: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "HH:mm"
        return f
    }()

    private var dateLabel: String { Self.dateFormatter.string(from: now).uppercased() }
    private var clockLabel: String {
        (reduceMotion ? Self.clockFormatterNoSeconds : Self.clockFormatter).string(from: now)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Rectangle()
                .fill(ZenjiTokens.hairline)
                .frame(height: 1)
            liveNowLine
            ZStack {
                AgendaView(viewModel: agenda, onFollow: follow)
                if panelShown {
                    AssistantPanel(viewModel: assistant, dismiss: closePanel)
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            CommandLineView(viewModel: assistant, focused: $commandFocused, onOpenBrowse: openBrowse)
        }
        .background(ZenjiTokens.background.ignoresSafeArea())
        .foregroundStyle(ZenjiTokens.foreground)
        .preferredColorScheme(themeOverride.colorScheme)
        .task {
            // Recompile the agenda the instant the assistant applies a change
            // (move 4). Set here (not in init) so it can capture `agenda`.
            assistant.onProfileChanged = { agenda.reloadFromCache(now: Date()) }
            #if DEBUG
            if let mode = ProcessInfo.processInfo.environment["ZENJI_DEMO"] {
                // WP-18: seed a deterministic lensed golf agenda + the profile
                // rule BEFORE the first reload, so the screenshot shows the lens
                // with no network round-trip.
                if mode == "lens" {
                    LensDemoSeed.seed(profileStore: profileStore)
                    agenda.reloadFromCache(now: Date())
                }
                assistant.demoSeed(mode)
                if mode == "diff" || mode == "answer" { panelShown = true }
            }
            #endif
            await refresh()
        }
        .onReceive(clock) { now = $0 }
        // A fresh assistant result raises the ark (≤150 ms fade, move 5's calm).
        .onChange(of: assistant.presentToken) { _, _ in
            commandFocused = false
            withAnimation(.easeOut(duration: 0.15)) { panelShown = true }
        }
    }

    // MARK: - Actions

    /// A "Følg <entitet>" tapped in the event detail sheet — hand it to the
    /// assistant's diff/confirm flow (the panel rises via presentToken).
    private func follow(_ entity: Entity) {
        assistant.proposeFollow(entity)
    }

    /// The command line's `»_` — open the assistant in browse mode.
    private func openBrowse() {
        commandFocused = false
        withAnimation(.easeOut(duration: 0.15)) { panelShown = true }
    }

    private func closePanel() {
        withAnimation(.easeOut(duration: 0.15)) { panelShown = false }
    }

    private func refresh() async {
        agenda.reloadFromCache(now: now)
        #if DEBUG
        // WP-18: the lens screenshot demo runs entirely off its seeded cache —
        // a live sync would clobber it, so don't fetch (and don't schedule
        // notifications) in that mode.
        if ProcessInfo.processInfo.environment["ZENJI_DEMO"] == "lens" { return }
        #endif
        let previousEvents = dataStore.loadEvents()
        _ = await syncClient.sync()
        agenda.reloadFromCache(now: now)
        #if DEBUG
        // The screenshot harness must not trip the first-launch notification
        // permission alert over the design it's capturing.
        if ProcessInfo.processInfo.environment["ZENJI_DEMO"] != nil { return }
        #endif
        await notificationPlanner.reconcile(
            previousEvents: previousEvents,
            newEvents: dataStore.loadEvents(),
            interests: dataStore.loadInterests() ?? Interests(),
            lastSync: dataStore.lastSync
        )
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .center, spacing: 6) {
                    // The mosaic ensō — a stille brand mark, mirrors the web
                    // masthead's `.wordmark-enso` (docs/index.html): the SAME
                    // template-rendered SVG, coloured via the accent token so
                    // it follows dark/light automatically. Decorative only —
                    // no tap target (DESIGN.md "Header").
                    Image("EnsoMark")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 20, height: 20)
                        .foregroundStyle(ZenjiTokens.accent)
                        .accessibilityHidden(true)
                    Text("ZENJI")
                        .font(.zenjiMono(size: 28, weight: .bold))
                        .foregroundStyle(ZenjiTokens.accent)
                        .tracking(2)
                }
                // WP-14.3 (owner feedback): the "P100" Tekst-TV page-index
                // glyph read as unexplained noise — dropped, no replacement.
                // The DESIGN.md line update for this lives in a separate
                // session's commit, not this package.
                Text(dateLabel)
                    .font(.zenjiMono(size: 13))
                    .foregroundStyle(ZenjiTokens.muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                HStack(spacing: 12) {
                    Button {
                        themeOverrideRaw = themeOverride.next.rawValue
                    } label: {
                        Text(themeOverride.glyph)
                            .font(.zenjiMono(size: 15, weight: .semibold))
                            .foregroundStyle(ZenjiTokens.muted)
                    }
                    .accessibilityLabel(themeOverride.accessibilityLabel)
                    // WP-14.3: the glyph itself stays DESIGN.md-small — only
                    // the invisible hit area grows to the HIG's ≥44×44pt.
                    .zenjiTapTarget()
                    // WP-16.4: the assistant glyph is now a FOCUS SHORTCUT to
                    // the command line (the primary entry), not a button that
                    // opens a separate screen.
                    Button {
                        commandFocused = true
                    } label: {
                        Text("»_")
                            .font(.zenjiMono(size: 15, weight: .semibold))
                            .foregroundStyle(ZenjiTokens.muted)
                    }
                    .accessibilityLabel("Skriv til assistenten")
                    .zenjiTapTarget()
                }
                Text(clockLabel)
                    .font(.zenjiMono(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(ZenjiTokens.accent)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var liveNowLine: some View {
        if !agenda.liveNow.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(agenda.liveNow) { row in
                    HStack(spacing: 8) {
                        Text("▌ LIVE")
                            .font(.zenjiMono(size: 12, weight: .semibold))
                            .foregroundStyle(ZenjiTokens.live)
                        Text(row.title)
                            .font(.zenjiMono(size: 13))
                            .foregroundStyle(ZenjiTokens.foreground)
                            .lineLimit(1)
                        Text("·")
                            .font(.zenjiMono(size: 13))
                            .foregroundStyle(ZenjiTokens.muted.opacity(0.6))
                        Text(row.channelLabel)
                            .font(.zenjiMono(size: 13))
                            .foregroundStyle(ZenjiTokens.muted)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: 640, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            Rectangle()
                .fill(ZenjiTokens.hairline)
                .frame(height: 1)
        }
    }
}

#Preview {
    ContentView()
}
