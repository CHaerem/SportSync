//
//  EventDetailSheet.swift
//  Sportivista
//
//  WP-14 — the tap-to-expand detail sheet for a single event: venue,
//  summary, every streaming option as a real link, and — when the event
//  carries `source == "ai-research"` — the AI provenance block (confidence +
//  evidence links). "Åpenhet er en funksjon" (CLAUDE.md): the ⓘ isn't
//  decoration, it's how the app earns trust for events a human didn't
//  curate. Still Tekst-TV throughout (mono, amber, near-black), not the
//  system's default List chrome.
//

import SwiftUI

struct EventDetailSheet: View {
    /// WP-16.4 — the full agenda row, so the sheet has the precomputed context
    /// data (whyShown + followable) alongside the event.
    let row: AgendaEventRow
    /// WP-16.4 — a "Følg <entitet>" tap; the host routes it into the assistant's
    /// diff/confirm flow. No-op default keeps standalone/preview use compiling.
    var onFollow: (Entity) -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    /// WP-16.4 — the "Hvorfor vises denne?" context action, collapsed by default.
    @State private var whyExpanded = false
    /// WP-30 — spoiler protection: a masked result stays hidden until the user
    /// taps to reveal it ("til brukeren har «sett» det").
    @State private var resultRevealed = false

    private var event: Event { row.event }

    private var titleText: String {
        AgendaFormat.title(homeTeam: event.homeTeam, awayTeam: event.awayTeam, fallback: event.title)
    }

    var body: some View {
        NavigationStack {
            List {
                if let venue = event.venue, !venue.isEmpty, venue != "TBD" {
                    DetailRow(label: "Arena", value: venue)
                }
                if let summary = event.summary, !summary.isEmpty {
                    DetailRow(label: "Om", value: summary)
                }

                contextActionsSection

                resultSection

                Section {
                    if event.streaming.isEmpty {
                        Text("Kanal ukjent")
                            .font(.sportivista(.subheadline))
                            .foregroundStyle(SportivistaTokens.secondaryLabel)
                            .listRowBackground(SportivistaTokens.cell)
                    } else {
                        ForEach(Array(event.streaming.enumerated()), id: \.offset) { _, channel in
                            StreamingLinkRow(channel: channel)
                        }
                    }
                } header: {
                    header("HVOR SER JEG DET")
                }

                if event.source == "ai-research" {
                    Section {
                        ProvenanceRows(event: event)
                    } header: {
                        header("ⓘ FUNNET AV AI")
                    }
                }

                // The reminder ("varsel") state lives HERE, quietly, not in
                // the agenda row (DESIGN.md "Radens anatomi": "Varslings-
                // tilstand vises IKKE i raden … bor i detaljarket"). It is an
                // honest read-out of whether this event arms a reminder (the
                // must-watch rule, keyed off interests.json), not a fake
                // control — a user-set per-event override would be a new
                // feature, out of WP-14.1 scope.
                Section {
                    NotifyStatusRow(on: event.mustWatch)
                } header: {
                    header("VARSEL")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(SportivistaTokens.cell)
            .navigationTitle(titleText)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .foregroundStyle(SportivistaTokens.accent)
                        .sportivistaTapTarget()
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func header(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.caption2, weight: .semibold))
            .foregroundStyle(SportivistaTokens.accent)
            .tracking(0.5)
    }

    // MARK: - Context actions (WP-16.4)

    /// The two in-context actions the "sømløs assistent" brief asks for, both
    /// woven into the same flow as everything else: a quiet, deterministic
    /// "Hvorfor vises denne?" (FeedCompiler.whyShown, no model needed) and a
    /// "Følg <entitet>" per followable subject that routes through the
    /// assistant's normal diff/confirm flow (nothing is applied by the tap
    /// alone — the user still confirms the diff).
    @ViewBuilder
    private var contextActionsSection: some View {
        if !row.whyShown.isEmpty || !row.followable.isEmpty {
            Section {
                if !row.whyShown.isEmpty {
                    DisclosureGroup(isExpanded: $whyExpanded) {
                        Text(row.whyShown)
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.label.opacity(0.85))
                            .padding(.vertical, 4)
                    } label: {
                        Text("Hvorfor vises denne?")
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.label)
                            // WP-14.3: the disclosure header is the tap
                            // target for the whole row — guarantee ≥44pt
                            // even though the label text itself is small.
                            .frame(minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .tint(SportivistaTokens.secondaryLabel)
                    .listRowBackground(SportivistaTokens.cell)
                }
                ForEach(row.followable, id: \.id) { entity in
                    Button {
                        // Hand off to the command-line assistant's diff flow,
                        // then close the sheet so the diff ark is unobscured.
                        onFollow(entity)
                        dismiss()
                    } label: {
                        HStack(spacing: 8) {
                            Text("» Følg \(entity.name)")
                                .font(.sportivista(.subheadline, weight: .semibold))
                                .foregroundStyle(SportivistaTokens.accent)
                            Spacer()
                        }
                        // WP-14.3: this IS an action (Følg …) — a comfortable
                        // real row height, not a glyph-small tap.
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .listRowBackground(SportivistaTokens.cell)
                }
            } header: {
                header("HANDLINGER")
            }
        }
    }

    // MARK: - Result (WP-30 — spoiler protection)

    /// The event's result/score. When the user has a spoiler policy on this
    /// event's sport/entity (`row.spoilerSafe == false`), the outcome is MASKED
    /// behind a calm tap-to-reveal, so a glance at the sheet never spoils a game
    /// they're watching on delay. When safe, it shows plainly. Absent otherwise.
    @ViewBuilder
    private var resultSection: some View {
        if let result = event.result, !result.isEmpty {
            Section {
                if row.spoilerSafe || resultRevealed {
                    Text(result)
                        .font(.sportivista(.subheadline))
                        .foregroundStyle(SportivistaTokens.label)
                        .listRowBackground(SportivistaTokens.cell)
                } else {
                    Button {
                        resultRevealed = true
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Skjult — spoilervern på")
                                .font(.sportivista(.subheadline, weight: .semibold))
                                .foregroundStyle(SportivistaTokens.accent)
                            Text("Trykk for å vise resultatet")
                                .font(.sportivista(.caption))
                                .foregroundStyle(SportivistaTokens.secondaryLabel)
                        }
                        // WP-14.3: a real, comfortable tap target.
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .listRowBackground(SportivistaTokens.cell)
                }
            } header: {
                header("RESULTAT")
            }
        }
    }
}

/// A label/value pair, e.g. "ARENA" / "Bislett stadion, Oslo".
struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.sportivista(.caption2, weight: .semibold))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
            Text(value)
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.label)
        }
        .padding(.vertical, 4)
        .listRowBackground(SportivistaTokens.cell)
    }
}

/// The quiet reminder read-out (DESIGN.md "Detaljark"): amber "På" when the
/// event arms a reminder, dempet "Av" otherwise — a matter-of-fact status, no
/// exclamation, no fake control.
private struct NotifyStatusRow: View {
    let on: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text(on ? "På" : "Av")
                .font(.sportivista(.subheadline, weight: .semibold))
                .foregroundStyle(on ? SportivistaTokens.accent : SportivistaTokens.secondaryLabel)
            Text(on ? "minner deg før start" : "ingen påminnelse")
                .font(.sportivista(.caption))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
        }
        .padding(.vertical, 2)
        .listRowBackground(SportivistaTokens.cell)
    }
}

/// One streaming option: a real tappable Link when it has a URL, plain text
/// otherwise (mirrors dashboard.js's `streamLink` honesty — never fake a
/// link). A tentative (shared-rights, not-yet-confirmed) entry is marked.
private struct StreamingLinkRow: View {
    let channel: StreamingChannel

    var body: some View {
        Group {
            if let urlString = channel.url, let url = URL(string: urlString) {
                Link(destination: url) {
                    row(linked: true)
                }
            } else {
                row(linked: false)
            }
        }
        .listRowBackground(SportivistaTokens.cell)
    }

    private func row(linked: Bool) -> some View {
        HStack {
            Text(channel.platform?.isEmpty == false ? channel.platform! : "Ukjent kanal")
                .font(.sportivista(.subheadline))
                .foregroundStyle(linked ? SportivistaTokens.accent : SportivistaTokens.label)
            if channel.tentative == true {
                Text("(bekreftes)")
                    .font(.sportivista(.caption2))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            }
            Spacer()
            if linked {
                Text("↗")
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.accent)
            }
        }
    }
}

/// Confidence + every evidence URL as its own link — the "ⓘ-proveniens" the
/// WP-14 brief asks for. Norwegian, matter-of-fact.
private struct ProvenanceRows: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sikkerhet: \(confidenceLabel)")
                .font(.sportivista(.footnote))
                .foregroundStyle(SportivistaTokens.label)
            if event.evidence.isEmpty {
                Text("Ingen kildelenker oppgitt.")
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
            } else {
                ForEach(Array(event.evidence.enumerated()), id: \.offset) { index, urlString in
                    if let url = URL(string: urlString) {
                        Link("Kilde \(index + 1)", destination: url)
                            .font(.sportivista(.footnote))
                            .foregroundStyle(SportivistaTokens.accent)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(SportivistaTokens.cell)
    }

    private var confidenceLabel: String {
        switch event.confidence {
        case "high": return "høy"
        case "medium": return "middels"
        case "low": return "lav"
        default: return "ukjent"
        }
    }
}

#Preview {
    let event = try! SportivistaJSON.decoder.decode(Event.self, from: Data("""
    {"sport":"chess","title":"Sjakk-NM 2026","time":"2026-07-03T16:00:00Z","venue":"Normoria, Kristiansund",
     "summary":"Landsturneringen 2026.","streaming":[{"platform":"Lichess","url":"https://lichess.org"}],
     "source":"ai-research","confidence":"high","evidence":["https://sjakknm2026.no/"]}
    """.utf8))
    return EventDetailSheet(row: AgendaEventRow(
        id: "preview", timeLabel: "18:00", title: "Sjakk-NM 2026", metaLabel: nil,
        channelLabel: "Lichess", isMustSee: false, mustWatch: false, isAIResearch: true,
        event: event, whyShown: "AI-research fant dette for deg", followable: []
    ))
}
