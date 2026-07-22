//
//  MarksAndSourcesView.swift
//  Sportivista
//
//  WP-186 — «Merker og kilder», the attribution surface (twin of the web's
//  docs/js/logo-attribution.js).
//
//  This screen is not a nicety. Two different duties meet here:
//
//   • A mark shipped under CC BY or CC BY-SA may only be shown WITH credit —
//     crediting is the condition of use, so the list is part of the licence
//     compliance, not documentation about it.
//   • A mark shipped on the EDITORIAL basis (the owner's 22.07 decision) needs
//     the opposite kind of honesty: a plain statement that it belongs to its club
//     and is shown to identify it, and NO suggestion of affiliation, sponsorship
//     or endorsement — that suggestion is exactly what trademark law protects
//     against, and it is the one thing referential use must not do.
//
//  The data is the manifest written beside the assets by
//  scripts/seed-registry/logos.js (`docs/logos/ATTRIBUTION.json`), bundled with
//  them. Nothing is fetched.
//

import SwiftUI

/// One credited mark, as written by the seeder.
struct LogoAttributionEntry: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var sport: String?
    var file: String
    var source: String
    var basis: String
    var license: String?
    var licenseUrl: String?
    var attribution: String?
    var sourceUrl: String
}

struct LogoAttributionManifest: Codable, Equatable {
    var policy: String?
    var notice: String?
    var logos: [LogoAttributionEntry]

    static let empty = LogoAttributionManifest(policy: nil, notice: nil, logos: [])

    var freeLicensed: [LogoAttributionEntry] { logos.filter { $0.basis == "free-license" } }
    var editorial: [LogoAttributionEntry] { logos.filter { $0.basis == "editorial-use" } }

    /// Read the bundled manifest. A missing file simply means this build ships no
    /// marks — an empty screen, never an error.
    static func bundled(_ bundle: Bundle = .main) -> LogoAttributionManifest {
        guard let url = bundle.url(forResource: "ATTRIBUTION", withExtension: "json", subdirectory: "logos")
                ?? bundle.url(forResource: "ATTRIBUTION", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let manifest = try? JSONDecoder().decode(LogoAttributionManifest.self, from: data)
        else { return .empty }
        return manifest
    }
}

private let defaultNotice = "Klubbmerker tilhører sine respektive klubber og vises utelukkende for å identifisere dem. Sportivista er ikke tilknyttet, sponset av eller godkjent av klubbene."

struct MarksAndSourcesView: View {
    var manifest: LogoAttributionManifest = .bundled()

    var body: some View {
        List {
            if !manifest.editorial.isEmpty {
                Section {
                    Text(manifest.notice ?? defaultNotice)
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                    Text("Merkene vises uendret, i original form og farge.")
                        .font(.sportivista(.footnote))
                        .foregroundStyle(SportivistaTokens.tertiaryLabel)
                } header: {
                    header("KLUBBMERKER (\(manifest.editorial.count))")
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            if !manifest.freeLicensed.isEmpty {
                Section {
                    ForEach(manifest.freeLicensed) { entry in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.name)
                                .font(.sportivista(.body))
                                .foregroundStyle(SportivistaTokens.label)
                            Text(creditLine(entry))
                                .font(.sportivista(.caption))
                                .foregroundStyle(SportivistaTokens.secondaryLabel)
                        }
                    }
                } header: {
                    header("FRITT LISENSIERTE MERKER (\(manifest.freeLicensed.count))")
                } footer: {
                    Text("Brukt på lisensens vilkår, uendret.")
                        .font(.sportivista(.caption))
                        .foregroundStyle(SportivistaTokens.tertiaryLabel)
                }
                .listRowBackground(SportivistaTokens.cell)
            }

            if manifest.logos.isEmpty {
                Section {
                    Text("Denne versjonen viser ingen klubbmerker.")
                        .font(.sportivista(.body))
                        .foregroundStyle(SportivistaTokens.secondaryLabel)
                }
                .listRowBackground(SportivistaTokens.cell)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SportivistaTokens.background)
        .navigationTitle("Merker og kilder")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("deg.marks")
    }

    /// "CC BY-SA 4.0 · Opphavsperson" — the licence first, since that is the duty.
    func creditLine(_ entry: LogoAttributionEntry) -> String {
        [entry.license, entry.attribution].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · ")
    }

    private func header(_ text: String) -> some View {
        Text(text)
            .font(.sportivista(.footnote, weight: .semibold))
            .foregroundStyle(SportivistaTokens.secondaryLabel)
    }
}
