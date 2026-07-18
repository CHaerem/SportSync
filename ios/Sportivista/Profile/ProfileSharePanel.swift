//
//  ProfileSharePanel.swift
//  Sportivista
//
//  WP-19 — the "Del / Importer profil" disclosure inside the assistant ark. The
//  free-account cross-device bridge, surfaced calmly: export the profile as a QR
//  code + a share link, or paste one in to MERGE it into this device's profile.
//  No emoji, one amber accent, hairline boxes, ≥44pt hit areas — DESIGN.md to the
//  letter. All logic lives in AssistantViewModel + ProfileShareCodec; this only
//  lays it out (the QR bitmap comes from ProfileQRCode, tinted to the ink token
//  so it reads as part of the teletext surface, never a glossy sticker).
//

import SwiftUI

struct ProfileSharePanel: View {
    var viewModel: AssistantViewModel

    @State private var expanded = false
    @State private var importDraft = ""
    /// WP-62 — the QR bitmap, computed ONCE per share payload in `.task` rather
    /// than rebuilt in `body` on every re-render (each render spun up a fresh
    /// CoreImage render — a real jank source). Keyed on the payload string so it
    /// recomputes only when what's shared actually changes.
    @State private var qrImage: UIImage?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 18) {
                exportBlock
                Rectangle().fill(SportivistaTokens.separator).frame(height: 1)
                importBlock
                Text("iClouds egen kanal synker automatisk mellom enhetene dine når du har betalt Apple-konto; QR-koden virker uten, og deler kun det du følger — aldri via vår server.")
                    .font(.sportivistaTabular(.caption2, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 12)
        } label: {
            Text("DEL / IMPORTER PROFIL")
                .font(.sportivistaTabular(.caption, weight: .bold))
                .foregroundStyle(SportivistaTokens.label.opacity(0.5))
                .tracking(1.5)
        }
        .tint(SportivistaTokens.secondaryLabel)
        .onChange(of: viewModel.presentToken) { _, _ in
            if viewModel.lastImportSummary != nil || viewModel.shareImportMessage != nil { expanded = true }
        }
        // WP-66 — the assistant's «del profil / vis QR» command reveals this
        // disclosure (the same idiom as an import bumping presentToken above).
        .onChange(of: viewModel.shareRequestToken) { _, _ in expanded = true }
        #if DEBUG
        // Screenshot harness: open the disclosure so `SPORTIVISTA_DEMO=share` captures
        // the export/import UI directly (never compiled into a release build).
        .onAppear { if ProcessInfo.processInfo.environment["SPORTIVISTA_DEMO"] == "share" { expanded = true } }
        #endif
    }

    // MARK: - Export

    @ViewBuilder
    private var exportBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("DEL DENNE ENHETEN")
                .font(.sportivistaTabular(.caption2, weight: .bold))
                .foregroundStyle(SportivistaTokens.label.opacity(0.45))
                .tracking(1.5)
            if viewModel.profile.isEmpty {
                Text("Ingenting å dele ennå — begynn å følge noe i linjen.")
                    .font(.sportivistaTabular(.caption, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.55))
            } else if let url = viewModel.profileShareURL {
                if let image = qrImage {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 180, height: 180)
                        .colorMultiply(SportivistaTokens.label)
                        .padding(12)
                        .background(SportivistaTokens.label.opacity(0.04))
                        .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.15), lineWidth: 1))
                        .accessibilityLabel("QR-kode med profilen din")
                }
                Text("Skann med kameraet på en annen enhet, eller del lenken:")
                    .font(.sportivistaTabular(.caption, weight: .regular))
                    .foregroundStyle(SportivistaTokens.label.opacity(0.65))
                ShareLink(item: url) {
                    Text("› Del profillenke")
                        .font(.sportivistaTabular(.footnote, weight: .bold))
                        .foregroundStyle(SportivistaTokens.accent)
                }
                .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.accent, fullWidth: true))
            }
        }
        // WP-62 — render the QR bitmap ONCE per share payload (not per body
        // re-render). Keyed on the link string so it recomputes only when what's
        // shared actually changes; the CoreImage render reuses one static
        // CIContext (ProfileQRCode).
        .task(id: viewModel.profileShareURL?.absoluteString) {
            qrImage = viewModel.profileShareURL.flatMap { ProfileQRCode.image(for: $0.absoluteString) }
        }
    }

    // MARK: - Import

    @ViewBuilder
    private var importBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("IMPORTER FRA EN ANNEN ENHET")
                .font(.sportivistaTabular(.caption2, weight: .bold))
                .foregroundStyle(SportivistaTokens.label.opacity(0.45))
                .tracking(1.5)
            Text("Lim inn en profillenke. Den slås SAMMEN med det du følger her — ingenting overskrives.")
                .font(.sportivistaTabular(.caption, weight: .regular))
                .foregroundStyle(SportivistaTokens.label.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
            TextField("sportivista://profile?…", text: $importDraft, axis: .vertical)
                .font(.sportivistaTabular(.caption, weight: .regular))
                .textFieldStyle(.plain)
                .lineLimit(1...3)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .padding(8)
                .background(SportivistaTokens.label.opacity(0.06))
                .overlay(Rectangle().stroke(SportivistaTokens.label.opacity(0.2), lineWidth: 1))
            Button("Slå sammen") {
                viewModel.importSharedProfile(fromPayload: importDraft)
                importDraft = ""
            }
            .font(.sportivistaTabular(.footnote, weight: .bold))
            .foregroundStyle(SportivistaTokens.live)
            .buttonStyle(SportivistaActionButtonStyle(tint: SportivistaTokens.live))
            .disabled(importDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            if let summary = viewModel.lastImportSummary {
                Text(summaryText(summary))
                    .font(.sportivistaTabular(.caption, weight: .regular))
                    .foregroundStyle(SportivistaTokens.accent.opacity(0.9))
            }
            if let message = viewModel.shareImportMessage {
                Text(message)
                    .font(.sportivistaTabular(.caption, weight: .regular))
                    .foregroundStyle(SportivistaTokens.destructive)
            }
        }
    }

    private func summaryText(_ s: AssistantViewModel.ProfileImportSummary) -> String {
        guard !s.isNoop else { return "Slått sammen — ingen nye endringer." }
        var parts: [String] = []
        if s.added > 0 { parts.append("+\(s.added) nye") }
        if s.updated > 0 { parts.append("±\(s.updated) endret") }
        if s.removed > 0 { parts.append("−\(s.removed) fjernet") }
        return "Slått sammen: " + parts.joined(separator: ", ") + "."
    }
}
