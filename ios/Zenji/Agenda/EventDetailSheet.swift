//
//  EventDetailSheet.swift
//  Zenji
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
    let event: Event
    @Environment(\.dismiss) private var dismiss

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

                Section {
                    if event.streaming.isEmpty {
                        Text("–")
                            .font(.zenjiMono(size: 14))
                            .foregroundStyle(ZenjiTokens.foreground.opacity(0.4))
                            .listRowBackground(ZenjiTokens.background)
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
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ZenjiTokens.background)
            .navigationTitle(titleText)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Lukk") { dismiss() }
                        .foregroundStyle(ZenjiTokens.accent)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func header(_ text: String) -> some View {
        Text(text)
            .font(.zenjiMono(size: 11, weight: .semibold))
            .foregroundStyle(ZenjiTokens.accent)
            .tracking(0.5)
    }
}

/// A label/value pair, e.g. "ARENA" / "Bislett stadion, Oslo".
struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.zenjiMono(size: 10, weight: .semibold))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.45))
            Text(value)
                .font(.zenjiMono(size: 14))
                .foregroundStyle(ZenjiTokens.foreground)
        }
        .padding(.vertical, 4)
        .listRowBackground(ZenjiTokens.background)
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
        .listRowBackground(ZenjiTokens.background)
    }

    private func row(linked: Bool) -> some View {
        HStack {
            Text(channel.platform?.isEmpty == false ? channel.platform! : "Ukjent kanal")
                .font(.zenjiMono(size: 14))
                .foregroundStyle(linked ? ZenjiTokens.accent : ZenjiTokens.foreground)
            if channel.tentative == true {
                Text("(bekreftes)")
                    .font(.zenjiMono(size: 11))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
            }
            Spacer()
            if linked {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 10))
                    .foregroundStyle(ZenjiTokens.accent.opacity(0.7))
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
                .font(.zenjiMono(size: 13))
                .foregroundStyle(ZenjiTokens.foreground.opacity(0.85))
            if event.evidence.isEmpty {
                Text("Ingen kildelenker oppgitt.")
                    .font(.zenjiMono(size: 12))
                    .foregroundStyle(ZenjiTokens.foreground.opacity(0.5))
            } else {
                ForEach(Array(event.evidence.enumerated()), id: \.offset) { index, urlString in
                    if let url = URL(string: urlString) {
                        Link("Kilde \(index + 1)", destination: url)
                            .font(.zenjiMono(size: 13))
                            .foregroundStyle(ZenjiTokens.accent)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(ZenjiTokens.background)
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
    EventDetailSheet(event: try! ZenjiJSON.decoder.decode(Event.self, from: Data("""
    {"sport":"chess","title":"Sjakk-NM 2026","time":"2026-07-03T16:00:00Z","venue":"Normoria, Kristiansund",
     "summary":"Landsturneringen 2026.","streaming":[{"platform":"Lichess","url":"https://lichess.org"}],
     "source":"ai-research","confidence":"high","evidence":["https://sjakknm2026.no/"]}
    """.utf8)))
}
