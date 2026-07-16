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
    /// WP-19 — offline-first profile sync. LocalOnly by default (a no-op on the
    /// free-account/Simulator build); a paid-account build injects CloudKit.
    let profileSync: ProfileSyncCoordinator

    @State private var agenda: AgendaViewModel
    @State private var assistant: AssistantViewModel
    /// WP-16.4 — the assistant "ark" is up (a result or a browse).
    @State private var panelShown = false
    @FocusState private var commandFocused: Bool
    /// WP-31 — the first-run onboarding overlay. Decided once in init (profile
    /// empty AND not yet completed); also re-raised on demand from "Hva jeg
    /// følger" (see `rerunOnboarding`).
    @State private var showOnboarding: Bool
    @AppStorage(OnboardingGate.storageKey) private var onboardingCompleted = false
    #if DEBUG
    /// WP-30 screenshot harness: the "Hva jeg vet om deg" page / a spoiler-masked
    /// detail sheet, presented deterministically under `ZENJI_DEMO` (one sheet
    /// binding — SwiftUI honours only one `.sheet` per view).
    enum DemoSheet: Identifiable {
        case memory
        case spoiler(AgendaEventRow)
        var id: String {
            switch self {
            case .memory: return "memory"
            case .spoiler(let row): return "spoiler-\(row.id)"
            }
        }
    }
    @State private var demoSheet: DemoSheet?
    #endif
    /// WP-32 screenshot harness: force the "Nullstill" disclosure open (and
    /// optionally jump to one level's confirmation ark) deterministically.
    /// Always nil outside DEBUG (only ever assigned inside a `ZENJI_DEMO`
    /// branch, same convention as `onboardingInitialStep` below).
    @State private var resetDemoState: AssistantPanel.ResetDemoState?
    /// WP-66 — an event id the assistant's «vis <hendelse>» command resolved;
    /// handed to AgendaView to raise its detail sheet, then cleared by it.
    @State private var requestedEventID: String?

    @AppStorage(ThemeOverride.storageKey) private var themeOverrideRaw = ThemeOverride.system.rawValue
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    private var themeOverride: ThemeOverride {
        ThemeOverride(rawValue: themeOverrideRaw) ?? .system
    }

    init(
        syncClient: SyncClient = SyncClient(),
        dataStore: DataStore = DataStore(),
        notificationPlanner: NotificationPlanner = NotificationPlanner(),
        profileStore: ProfileStore = ProfileStore(),
        profileSync: ProfileSyncCoordinator = ProfileSyncCoordinator(backend: ProfileSyncBackendFactory.make())
    ) {
        self.syncClient = syncClient
        self.dataStore = dataStore
        self.notificationPlanner = notificationPlanner
        self.profileStore = profileStore
        self.profileSync = profileSync
        #if DEBUG
        // WP-70 — the XCUITest launch harness. Seed a deterministic cache +
        // reset the onboarding/theme `@AppStorage` flags BEFORE the view models
        // read from disk and BEFORE the onboarding decision below, so the whole
        // first frame is fixed. Reused via the existing `ZENJI_DEMO` env var
        // (value "uitest"); a no-op unless that value is set.
        UITestSeed.seedIfRequested(profileStore: profileStore)
        #endif
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

        // WP-31 — first-run decision, made before the first frame so there's no
        // flash of the agenda before the overlay. A ZENJI_DEMO launch never auto-
        // shows onboarding (the `.task` harness raises the requested state instead,
        // so the other demo modes aren't covered by the overlay).
        #if DEBUG
        // WP-70: the "uitest" harness is deliberately NOT treated as a
        // screenshot-demo (which suppresses the overlay) — it drives the REAL
        // onboarding gate, so its "onboarding" launch state shows the first-run
        // overlay exactly as a cold install would.
        let demoValue = ProcessInfo.processInfo.environment["ZENJI_DEMO"]
        let isDemo = demoValue != nil && demoValue != UITestSeed.demoMode
        #else
        let isDemo = false
        #endif
        let completed = UserDefaults.standard.bool(forKey: OnboardingGate.storageKey)
        self._showOnboarding = State(initialValue: !isDemo && OnboardingGate.shouldShow(
            completed: completed, profileIsEmpty: profileStore.load().isEmpty))
    }

    /// DEBUG screenshot harness: which onboarding step a `ZENJI_DEMO=onboarding-*`
    /// launch jumps to. Always defined (nil in the shipping flow).
    private var onboardingInitialStep: OnboardingStep? {
        #if DEBUG
        switch ProcessInfo.processInfo.environment["ZENJI_DEMO"] {
        case "onboarding-welcome": return .welcome
        case "onboarding-converse": return .converse
        case "onboarding-quickpicks": return .quickPicks
        case "onboarding-landing": return .landing
        default: return nil
        }
        #else
        return nil
        #endif
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEEE d. MMMM"
        return f
    }()

    // WP-62 — the date is read from `Date()` at render time (not a per-second
    // `@State`): the ticking clock now lives in its own leaf (`TekstTVClock`)
    // that owns its timer, so ContentView's body is no longer invalidated every
    // second. The date string only changes at midnight and is fresh on any
    // re-render (agenda reload, foreground, panel toggle).
    private var dateLabel: String { Self.dateFormatter.string(from: Date()).uppercased() }

    var body: some View {
        ZStack {
        VStack(alignment: .leading, spacing: 0) {
            header
            Rectangle()
                .fill(ZenjiTokens.hairline)
                .frame(height: 1)
            liveNowLine
            filterLine
            ZStack {
                AgendaView(viewModel: agenda, onFollow: follow, onOpen: { assistant.recordOpened($0) },
                           openEventID: $requestedEventID)
                if panelShown {
                    AssistantPanel(
                        viewModel: assistant, dismiss: closePanel, onRerunOnboarding: rerunOnboarding,
                        onReset: performReset, syncEnabled: profileSync.backend.isEnabled,
                        initialResetState: resetDemoState
                    )
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            CommandLineView(viewModel: assistant, focused: $commandFocused, onOpenBrowse: openBrowse)
        }
        #if DEBUG
        demoOverlay
        #endif
        // WP-31 — the first-run onboarding, above everything (its own command-line
        // idiom + diff), fading away into an agenda that already reflects the
        // choices (every confirm/tap recompiled it behind the overlay).
        if showOnboarding {
            OnboardingView(
                assistant: assistant,
                onFinish: finishOnboarding,
                onSkip: finishOnboarding,
                initialStep: onboardingInitialStep
            )
            .transition(.opacity)
            .zIndex(10)
        }
        }
        .background(ZenjiTokens.background.ignoresSafeArea())
        .foregroundStyle(ZenjiTokens.foreground)
        .preferredColorScheme(themeOverride.colorScheme)
        .task {
            // Recompile the agenda the instant the assistant applies a change
            // (move 4). Set here (not in init) so it can capture `agenda`.
            assistant.onProfileChanged = { agenda.reloadFromCache(now: Date()) }
            // WP-66 — the assistant's command arm's HOST-owned side effects
            // (theme override, re-onboarding, the confirmed reset, opening an
            // event's detail). VM-owned effects run inside the view model.
            assistant.onCommand = { performCommand($0) }
            // WP-67 — the present arm applies an EPHEMERAL filter to the agenda
            // («vis bare golf denne uka»). A pure view layer — never the profile.
            assistant.onPresent = { agenda.applyFilter($0) }
            #if DEBUG
            if let mode = ProcessInfo.processInfo.environment["ZENJI_DEMO"] {
                // WP-18: seed a deterministic lensed golf agenda + the profile
                // rule BEFORE the first reload, so the screenshot shows the lens
                // with no network round-trip.
                if mode == "lens" {
                    LensDemoSeed.seed(profileStore: profileStore)
                    agenda.reloadFromCache(now: Date())
                }
                // WP-67: the presentation-filter screenshot — reuse the lens
                // demo's golf+football board, then apply a golf-only view filter
                // so the quiet «VISER: GOLF» line shows over the filtered agenda.
                if mode == "filter" {
                    LensDemoSeed.seed(profileStore: profileStore)
                    agenda.reloadFromCache(now: Date())
                    agenda.applyFilter(AgendaFilter(sports: ["golf"]))
                }
                // WP-19: seed a small profile so the share panel shows a real QR +
                // link (the export needs a non-empty profile) and raise the ark.
                if mode == "share" {
                    let now = Date()
                    try? profileStore.save(InterestProfile(rules: [
                        InterestRule(entityId: "casper-ruud", entityName: "Casper Ruud", sport: "tennis",
                                     scope: "bare i Grand Slams", weight: 0.8, reason: "Norsk tennisstjerne.",
                                     addedAt: now, lens: .throughNorwegians),
                        InterestRule(entityId: "viktor-hovland", entityName: "Viktor Hovland", sport: "golf",
                                     scope: nil, weight: 0.6, reason: "Følger norsk golf.", addedAt: now),
                    ]), now: now)
                    assistant.reloadProfile()
                    panelShown = true
                }
                // WP-30: memory page + spoiler-masked detail sheet, shown as a
                // full-screen demo overlay (a sheet raised during the launch
                // `.task` is a SwiftUI no-op; the overlay renders the SAME real
                // WhatIKnowView / EventDetailSheet content).
                if mode == "memory" {
                    MemoryDemoSeed.seedMemory(into: MemoryStore(profileStore: profileStore))
                    assistant.refreshMemory()
                    demoSheet = .memory
                }
                if mode == "spoiler" {
                    demoSheet = .spoiler(MemoryDemoSeed.spoilerRow())
                }
                // WP-31 onboarding screenshots — the mock-backed assistant reads
                // "available", so the conversation step renders. Seed per sub-mode
                // and raise the overlay (initialStep jumps to the right step).
                if mode.hasPrefix("onboarding") {
                    switch mode {
                    case "onboarding-converse":
                        // One already-followed rule (so "Følger nå" shows) + a
                        // pending diff (the FORSLAG block).
                        try? profileStore.save(InterestProfile(rules: [
                            InterestRule(entityId: "fk-lyn-oslo", entityName: "FK Lyn Oslo", sport: "football",
                                         scope: nil, weight: 0.5, reason: "Du ba om å følge FK Lyn Oslo.", addedAt: Date()),
                        ]))
                        assistant.reloadProfile()
                        assistant.demoSeed("diff")
                    case "onboarding-quickpicks":
                        if let golf = StarterPacks.all.first(where: { $0.id == "norske-golfere" }) {
                            assistant.toggleStarterPack(golf)
                        }
                    case "onboarding-landing", "onboarding-landed":
                        if let golf = StarterPacks.all.first(where: { $0.id == "norske-golfere" }) {
                            assistant.toggleStarterPack(golf)
                        }
                    default:
                        break
                    }
                    // "onboarding-landed" shows the FILLED agenda (overlay off);
                    // every other onboarding-* mode raises the overlay.
                    if mode != "onboarding-landed" { showOnboarding = true }
                    agenda.reloadFromCache(now: Date())
                }
                // WP-32 — reset-entry/-confirm show the "Nullstill" disclosure
                // open (optionally mid-confirmation) over a seeded profile;
                // reset-onboarding runs the REAL `performReset` path so the
                // onboarding overlay that follows is the exact state a user
                // sees, not a fabricated stand-in.
                if mode.hasPrefix("reset") {
                    try? profileStore.save(InterestProfile(rules: [
                        InterestRule(entityId: "fk-lyn-oslo", entityName: "FK Lyn Oslo", sport: "football",
                                     scope: nil, weight: 0.5, reason: "Du ba om å følge FK Lyn Oslo.", addedAt: Date()),
                    ]))
                    assistant.reloadProfile()
                    agenda.reloadFromCache(now: Date())
                    switch mode {
                    case "reset-entry":
                        resetDemoState = AssistantPanel.ResetDemoState(expanded: true, confirming: nil)
                        panelShown = true
                    case "reset-confirm":
                        resetDemoState = AssistantPanel.ResetDemoState(expanded: true, confirming: .everything)
                        panelShown = true
                    case "reset-onboarding":
                        performReset(.followedOnly)
                    default:
                        break
                    }
                }
                assistant.demoSeed(mode)
                if mode == "diff" || mode == "answer" { panelShown = true }
            }
            #endif
            await refresh()
            // WP-19 — one profile sync round at launch (no-op on LocalOnly).
            await assistant.runBackgroundSync(using: profileSync)
        }
        // A fresh assistant result raises the ark (≤150 ms fade, move 5's calm).
        // WP-31: while onboarding is up it renders its OWN diff/answer inline, so
        // don't also raise the ark behind the overlay.
        .onChange(of: assistant.presentToken) { _, _ in
            guard !showOnboarding else { return }
            commandFocused = false
            withAnimation(.easeOut(duration: 0.15)) { panelShown = true }
        }
        // WP-19 — a scanned QR / opened share link imports on the spot, MERGING
        // into this device's profile (never overwriting); the agenda recompiles
        // via `onProfileChanged`, and the confirmation shows in the assistant ark.
        .onOpenURL { url in
            assistant.importSharedProfile(from: url)
            withAnimation(.easeOut(duration: 0.15)) { panelShown = true }
        }
        // WP-19 — offline-first pull → merge → push on foreground (a no-op on the
        // LocalOnly backend; the real round-trip only happens on a CloudKit build).
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await assistant.runBackgroundSync(using: profileSync) }
        }
    }

    #if DEBUG
    /// Full-screen demo overlay for the WP-30 screenshots — renders the real
    /// memory page / spoiler-masked detail sheet content over an opaque backdrop
    /// (a `.sheet` won't present when raised during the launch `.task`).
    @ViewBuilder
    private var demoOverlay: some View {
        if let demoSheet {
            ZenjiTokens.background.ignoresSafeArea()
            switch demoSheet {
            case .memory: WhatIKnowView(viewModel: assistant)
            case .spoiler(let row): EventDetailSheet(row: row)
            }
        }
    }
    #endif

    // MARK: - Actions

    /// A "Følg <entitet>" tapped in the event detail sheet — hand it to the
    /// assistant's diff/confirm flow (the panel rises via presentToken).
    private func follow(_ entity: Entity) {
        assistant.proposeFollow(entity)
    }

    /// WP-66 — the HOST-owned side of an assistant command. Theme, re-onboarding,
    /// the confirmed reset, and opening an event's detail live here (they own
    /// @AppStorage / the onboarding overlay / the agenda's detail sheet); the
    /// share/memory/forget/notification commands are performed inside the view
    /// model and never reach this closure. When `.openEvent` arrives here its
    /// associated value is the RESOLVED event id (see AssistantViewModel).
    private func performCommand(_ command: AssistantCommand) {
        switch command {
        case let .setTheme(theme):
            themeOverrideRaw = theme.rawValue
        case .rerunOnboarding:
            rerunOnboarding()
        case let .resetProfile(level):
            performReset(level)
        case let .openEvent(id):
            requestedEventID = id
        case .shareProfile, .showMemory, .forgetMemory, .setNotificationLeadTime:
            break
        }
    }

    // MARK: - WP-31 — onboarding

    /// Finish or skip onboarding: mark it done (persistent flag) and fade the
    /// overlay away. The agenda underneath already reflects every confirm/tap
    /// (onProfileChanged recompiled it live), so there's nothing more to do.
    private func finishOnboarding() {
        onboardingCompleted = true
        withAnimation(.easeOut(duration: 0.15)) { showOnboarding = false }
        agenda.reloadFromCache(now: Date())
    }

    /// Re-run onboarding on demand from "Hva jeg følger" — closes the assistant
    /// ark and raises the overlay fresh (it re-enters at `.welcome`).
    private func rerunOnboarding() {
        panelShown = false
        withAnimation(.easeOut(duration: 0.15)) { showOnboarding = true }
    }

    /// WP-32 — the confirmed "Nullstill" action: reset the profile (and, at
    /// the GDPR level, all personal memory + the misunderstood log) on THIS
    /// device, then raise the onboarding overlay immediately — the owner's
    /// ask, verbatim: never having to reinstall the app to re-onboard.
    private func performReset(_ level: ResetLevel) {
        assistant.resetProfile(level)
        onboardingCompleted = false
        agenda.reloadFromCache(now: Date())
        panelShown = false
        if reduceMotion {
            showOnboarding = true
        } else {
            withAnimation(.easeOut(duration: 0.15)) { showOnboarding = true }
        }
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
        agenda.reloadFromCache(now: Date())
        #if DEBUG
        // WP-18/WP-70: the lens screenshot demo and the XCUITest harness both run
        // entirely off their seeded cache — a live sync would clobber it (and make
        // the flows non-deterministic), so don't fetch (and don't schedule
        // notifications) in those modes.
        let demoMode = ProcessInfo.processInfo.environment["ZENJI_DEMO"]
        if demoMode == "lens" || demoMode == "filter" || demoMode == UITestSeed.demoMode { return }
        #endif
        let previousEvents = dataStore.loadEvents()
        _ = await syncClient.sync()
        // WP-60: this view drives its own sync (it also reconciles notifications
        // below), so it must invalidate the agenda's cached entity index too —
        // the sync may have rewritten entities.json.
        agenda.invalidateEntityCache()
        agenda.reloadFromCache(now: Date())
        #if DEBUG
        // The screenshot harness must not trip the first-launch notification
        // permission alert over the design it's capturing.
        if ProcessInfo.processInfo.environment["ZENJI_DEMO"] != nil { return }
        #endif
        await notificationPlanner.reconcile(
            previousEvents: previousEvents,
            newEvents: dataStore.loadEvents(),
            interests: dataStore.loadInterests() ?? Interests(),
            lastSync: dataStore.lastSync,
            // WP-66 — honour the assistant-set notification lead-time preference.
            leadTimeEnabled: NotificationLeadPreference.isLeadTimeEnabled()
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
                    // WP-70: a stable id for the XCUITest theme-toggle flow — the
                    // a11y LABEL cycles (automatisk/mørk/lys), so the test needs a
                    // label-independent handle to tap and then assert the cycle.
                    .accessibilityIdentifier("theme.toggle")
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
                TekstTVClock()
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

    /// WP-67 — the quiet filter line over the agenda when a presentation filter
    /// is active («VISER: GOLF · DENNE UKA ✕»). Tekst-TV to the core: mono,
    /// dempet «VISER:», the amber subject, and a one-tap ✕ that resets. Hidden
    /// when no filter is set — the calm default is an unfiltered board.
    @ViewBuilder
    private var filterLine: some View {
        if let filter = agenda.filter, !filter.isEmpty {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text("VISER:")
                        .font(.zenjiMono(size: 12, weight: .semibold))
                        .foregroundStyle(ZenjiTokens.muted)
                    Text(filter.subjectLabel)
                        .font(.zenjiMono(size: 12, weight: .semibold))
                        .tracking(1)
                        .foregroundStyle(ZenjiTokens.accent)
                        .lineLimit(1)
                        .accessibilityIdentifier("agenda.filter.label")
                    Spacer(minLength: 8)
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { agenda.applyFilter(nil) }
                    } label: {
                        Text("✕")
                            .font(.zenjiMono(size: 13, weight: .semibold))
                            .foregroundStyle(ZenjiTokens.muted)
                    }
                    .accessibilityLabel("Fjern filter")
                    .accessibilityIdentifier("agenda.filter.reset")
                    .zenjiTapTarget()
                }
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("agenda.filterBar")
            Rectangle()
                .fill(ZenjiTokens.hairline)
                .frame(height: 1)
        }
    }
}

/// WP-62 — the header's stille tikkende klokke, extracted into its own leaf so
/// its per-second tick invalidates ONLY this ~13pt label, never the whole
/// ContentView body (which hosts the agenda List). It owns its timer + `now`.
/// Under Reduce Motion it ticks once a minute and drops the seconds — the calm
/// cadence DESIGN.md asks for — otherwise once a second; each tick is aligned to
/// the wall-clock boundary so the digits flip exactly on the second/minute.
private struct TekstTVClock: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var now = Date()

    private static let withSeconds: DateFormatter = formatter("HH:mm:ss")
    private static let noSeconds: DateFormatter = formatter("HH:mm")

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = format
        return f
    }

    var body: some View {
        Text((reduceMotion ? Self.noSeconds : Self.withSeconds).string(from: now))
            .font(.zenjiMono(size: 13))
            .monospacedDigit()
            .foregroundStyle(ZenjiTokens.accent)
            // Re-armed if Reduce Motion flips mid-session (rare) — the id change
            // restarts the loop at the new cadence.
            .task(id: reduceMotion) {
                let step: TimeInterval = reduceMotion ? 60 : 1
                while !Task.isCancelled {
                    now = Date()
                    let current = Date().timeIntervalSinceReferenceDate
                    let delay = max((floor(current / step) + 1) * step - current, 0)
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
    }
}

#Preview {
    ContentView()
}
