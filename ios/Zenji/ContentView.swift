//
//  ContentView.swift
//  Zenji
//
//  WP-10 scaffold → WP-12 wired in sync → WP-14 replaces the placeholder
//  agenda with the real one: a Tekst-TV header (ZENJI · dato · a quietly
//  ticking clock, no other chrome — CLAUDE.md "Calm dashboard") above
//  AgendaView, which does the actual day-grouped rendering. WP-15 adds the
//  one NotificationPlanner hook in `refresh()` below (the "after a
//  successful sync" reconcile point) — deliberately the ONLY WP-15 touch in
//  this file; the real agenda rendering is WP-14's. WP-14.2 adds the manual
//  theme override glyph next to `»_` and applies `.preferredColorScheme` at
//  this view's root — see `ThemeOverride.swift` for the pure cycling/mapping
//  logic.
//
//  Deliberately keeps its public `init(syncClient:dataStore:)` call
//  compatible with the WP-12 scaffold (the third parameter,
//  `notificationPlanner`, defaults): WP-15 (NotificationPlanner) landed in
//  parallel and the brief asked to keep `ZenjiApp.swift` changes to an
//  absolute minimum to avoid a merge conflict — `ZenjiApp.swift` constructs
//  this view with just `syncClient`/`dataStore` and needs zero edits.
//

import SwiftUI

struct ContentView: View {
    let syncClient: SyncClient
    let dataStore: DataStore
    let notificationPlanner: NotificationPlanner

    @State private var viewModel: AgendaViewModel
    @State private var now = Date()
    /// WP-16: the FM-lekegrind, reached from the header glyph below.
    @State private var showingAssistant = false
    /// WP-14.2: persisted manual theme override, applied at this view's root
    /// via `.preferredColorScheme` below — covers every screen and `.sheet`
    /// (AssistantView included) with the one setting.
    @AppStorage(ThemeOverride.storageKey) private var themeOverrideRaw = ThemeOverride.system.rawValue
    /// DESIGN.md "Bevegelse & lyd": the ticking clock is the app's only
    /// continuous motion — under Reduce Motion it drops the seconds and reads
    /// static (HH:mm).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var themeOverride: ThemeOverride {
        ThemeOverride(rawValue: themeOverrideRaw) ?? .system
    }

    /// Ticks once a second — the "tikkende klokke-følelse" in the header,
    /// same idea as the web masthead's clock (dashboard.js `startClock`), just
    /// quieter (no seconds ticking sound, obviously — just the digits).
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(
        syncClient: SyncClient = SyncClient(),
        dataStore: DataStore = DataStore(),
        notificationPlanner: NotificationPlanner = NotificationPlanner()
    ) {
        self.syncClient = syncClient
        self.dataStore = dataStore
        self.notificationPlanner = notificationPlanner
        self._viewModel = State(initialValue: AgendaViewModel(dataStore: dataStore, syncClient: syncClient))
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
            AgendaView(viewModel: viewModel)
        }
        .background(ZenjiTokens.background.ignoresSafeArea())
        .foregroundStyle(ZenjiTokens.foreground)
        // WP-14.2: forces the whole window's appearance (this screen, every
        // `.sheet` presented from it) when the owner has picked mørk/lys;
        // `nil` for `.system` defers back to the device setting.
        .preferredColorScheme(themeOverride.colorScheme)
        .task {
            await refresh()
        }
        .onReceive(clock) { now = $0 }
        .sheet(isPresented: $showingAssistant) {
            AssistantView()
        }
    }

    /// Loads whatever is already cached immediately (so the agenda isn't
    /// blank while the network round-trip is in flight — WP-12's "kall sync
    /// ved app-start" hook), then syncs and reloads. WP-15: reconciles local
    /// notifications after the sync completes, diffing whatever was cached
    /// before against whatever is cached now — this orchestration (rather
    /// than delegating straight to `viewModel.refresh(now:)`) is what lets
    /// the "previous events" snapshot land exactly between the two cache
    /// reloads, same shape as the WP-15 original.
    private func refresh() async {
        viewModel.reloadFromCache(now: now)
        let previousEvents = dataStore.loadEvents()
        _ = await syncClient.sync()
        viewModel.reloadFromCache(now: now)
        await notificationPlanner.reconcile(
            previousEvents: previousEvents,
            newEvents: dataStore.loadEvents(),
            interests: dataStore.loadInterests() ?? Interests(),
            lastSync: dataStore.lastSync
        )
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 5) {
                // Wordmark — amber, heavy mono (DESIGN.md "Header").
                Text("ZENJI")
                    .font(.zenjiMono(size: 28, weight: .bold))
                    .foregroundStyle(ZenjiTokens.accent)
                    .tracking(2)
                // Tekst-TV page index + date, both dempet.
                HStack(spacing: 8) {
                    Text("P100")
                        .foregroundStyle(ZenjiTokens.muted)
                    Text(dateLabel)
                        .foregroundStyle(ZenjiTokens.muted)
                }
                .font(.zenjiMono(size: 13))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                HStack(spacing: 12) {
                    // Theme override — cycles system → mørk → lys per tap
                    // (DESIGN.md "Header"); state shown quantized (◐/●/○), no
                    // settings screen. Mirrors the web dashboard's toggle.
                    Button {
                        themeOverrideRaw = themeOverride.next.rawValue
                    } label: {
                        Text(themeOverride.glyph)
                            .font(.zenjiMono(size: 15, weight: .semibold))
                            .foregroundStyle(ZenjiTokens.muted)
                    }
                    .accessibilityLabel(themeOverride.accessibilityLabel)
                    // Assistant entry — a mono prompt glyph, dempet, NOT a speech
                    // bubble/emoji (DESIGN.md "Header").
                    Button {
                        showingAssistant = true
                    } label: {
                        Text("»_")
                            .font(.zenjiMono(size: 15, weight: .semibold))
                            .foregroundStyle(ZenjiTokens.muted)
                    }
                    .accessibilityLabel("Assistent")
                }
                // The living clock — amber, tabular, the app's only motion.
                Text(clockLabel)
                    .font(.zenjiMono(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(ZenjiTokens.accent)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// DESIGN.md "Agendaens semantikk" §4: a quiet line under the header when
    /// something is on right now — a `▌ LIVE` marker in the live colour, then
    /// title · channel, at most two. Invisible (and takes no space) otherwise.
    @ViewBuilder
    private var liveNowLine: some View {
        if !viewModel.liveNow.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(viewModel.liveNow) { row in
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
