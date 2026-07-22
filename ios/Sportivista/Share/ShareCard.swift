//
//  ShareCard.swift
//  Sportivista
//
//  WP-182 · Delbare flater — the branded delekort a `ShareLink` hands to the
//  system share sheet. Before this, sharing out of Sportivista carried no
//  identity at all (only the profile QR existed); every share was a lost brand
//  exposure. The card renders LOCALLY with `ImageRenderer` — no network, no
//  asset download, nothing to fetch.
//
//  MARKETING SURFACE, not product chrome. DESIGN.md governs the app's own
//  surfaces; a share card is an advert for the app. So amber is used more
//  boldly here than the agenda allows: the big time is amber (in the app's own
//  time column it is `label`). The licence is contained by construction — this
//  file renders into an OFF-SCREEN image that is never part of any on-screen
//  hierarchy, and no other view may use `ShareCardView`. The DESIGN.md
//  amber-invariant on the product surfaces is untouched.
//
//  HONESTY: the card shows only what the row actually carries. An unknown
//  channel renders the same faint "–" `AgendaFormat.channelLabel` gives the
//  board — never an invented channel, never a guessed time.
//
//  DYNAMIC TYPE: the card is a FIXED-SIZE raster (1200×630), not on-screen
//  text, so it renders at fixed points on purpose — the one whitelisted
//  exception in tests/ios-dynamic-type-gate.test.js. It is never displayed as
//  a live view.
//

import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers

// MARK: - Spec (pure — unit-testable with no SwiftUI/rendering)

/// Everything the card draws, resolved from the domain BEFORE any view exists.
/// Keeping it pure is what lets the tests assert the card's honesty (the "–"
/// channel, the Oslo day line) without rendering a pixel.
struct ShareCardSpec: Equatable {
    enum Kind: Equatable { case event, brief }

    var kind: Kind
    /// "18:00" / "4.–11. jul." — `AgendaFormat.timeLabel`'s own output. `nil` on a brief.
    var time: String?
    /// The Oslo day line, e.g. "lørdag 26. juli".
    var day: String?
    var title: String
    /// The first Norwegian channel, or `nil`/empty → the honest "–".
    var channel: String?
    var footer: String = "sportivista.com"

    /// The channel exactly as the board words it — the faint "–" when unknown.
    var channelLabel: String {
        guard let channel, !channel.isEmpty, channel != "–" else { return "–" }
        return channel
    }

    /// The share sheet's accompanying text ("når · hva · hvor"), for platforms
    /// that show text alongside the image.
    var plainText: String {
        [title, [day, time].compactMap { $0 }.joined(separator: " "), channel]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// The card for one agenda row. Reuses the row's ALREADY-formatted labels,
    /// so the card can never disagree with the row it was shared from.
    static func event(row: AgendaEventRow, dayLine: String?) -> ShareCardSpec {
        ShareCardSpec(
            kind: .event,
            time: row.timeLabel,
            day: dayLine,
            title: row.title,
            channel: row.channelLabel
        )
    }

    /// The card for the day's editorial brief.
    static func brief(headline: String, dayLine: String?) -> ShareCardSpec {
        ShareCardSpec(kind: .brief, time: nil, day: dayLine, title: headline, channel: nil)
    }

    /// The Oslo day line for a date, e.g. "lørdag 26. juli". `nil` for no date.
    static func dayLine(for date: Date?) -> String? {
        guard let date else { return nil }
        return dayLineFormatter.string(from: date)
    }

    private static let dayLineFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = FeedCompiler.osloTimeZone
        f.dateFormat = "EEEE d. MMMM"
        return f
    }()
}

// MARK: - The card view (off-screen only)

/// The rendered card. 1200×630 — the same frame as the web `og:image` and the
/// canvas delekort, so the identity is one look wherever a share lands.
struct ShareCardView: View {
    let spec: ShareCardSpec

    static let size = CGSize(width: 1200, height: 630)

    private let amber = Color(hex: 0xFFB000)
    private let pad: CGFloat = 84

    /// The ONLY fixed-size font call in the file (whitelisted in the Dynamic
    /// Type gate): this view is rastered at a fixed frame, never shown live.
    private func cardFont(_ size: CGFloat, _ weight: Font.Weight) -> Font {
        .system(size: size, weight: weight)
    }

    /// The DISPLAY face at a fixed card size (WP-183). The card is one of the
    /// display font's exactly three surfaces; like `cardFont` it is a fixed-size
    /// raster, so `UIFontMetrics` is deliberately NOT applied — Dynamic Type
    /// cannot reflow an image that has already left the device. Fails soft to
    /// `cardFont` if the face is not in the bundle.
    private func cardDisplayFont(_ size: CGFloat, _ weight: SportivistaDisplayWeight) -> Font {
        guard let face = UIFont(name: weight.postScriptName, size: size) else {
            return cardFont(size, weight.systemFallback)
        }
        return Font(face)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            lockup
                .padding(.bottom, spec.kind == .event ? 58 : 46)
            if spec.kind == .event { eventBody } else { briefBody }
            Spacer(minLength: 0)
            Text(spec.footer)
                .font(cardFont(24, .regular))
                .foregroundStyle(.white.opacity(0.3))
        }
        // Padding FIRST, then the hard frame: the other order sizes the content
        // to 630pt and then pads it past the frame, clipping the footer away.
        .padding(.horizontal, pad)
        .padding(.vertical, 74)
        .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
        .background(Color.black)
    }

    /// BRAND.md: zero gap, wordmark in `label`, only the colon amber, and the
    /// colon one weight step heavier than the wordmark.
    private var lockup: some View {
        HStack(spacing: 0) {
            Text("SPORTIVISTA")
                .font(cardDisplayFont(34, .semibold))
                .tracking(2)
                .foregroundStyle(.white)
            Text(":")
                .font(cardDisplayFont(34, .bold))
                .foregroundStyle(amber)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sportivista")
    }

    private var eventBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let time = spec.time, !time.isEmpty {
                Text(time)
                    // WP-183 — the card's big time in the display face (digits
                    // tabular in the file; `.monospacedDigit()` kept so the SF
                    // fallback path still lines up).
                    .font(cardDisplayFont(96, .bold).monospacedDigit())
                    .foregroundStyle(amber)
                    .padding(.bottom, 14)
            }
            if let day = spec.day, !day.isEmpty {
                Text(day)
                    .font(cardFont(28, .regular))
                    .foregroundStyle(.white.opacity(0.6))
                    .padding(.bottom, 18)
            }
            Text(spec.title)
                .font(cardFont(56, .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .padding(.bottom, 18)
            Text(spec.channelLabel)
                .font(cardFont(30, .regular))
                .foregroundStyle(.white.opacity(spec.channelLabel == "–" ? 0.3 : 0.6))
        }
    }

    private var briefBody: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let day = spec.day, !day.isEmpty {
                Text(day)
                    .font(cardFont(28, .regular))
                    .foregroundStyle(.white.opacity(0.6))
            }
            Text(spec.title)
                .font(cardFont(50, .semibold))
                .foregroundStyle(.white)
                .lineLimit(5)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Transferable

/// What `ShareLink` actually hands over: the rendered PNG, plus a plain-text
/// representation so a text-only target (a note, an SMS field) still gets the
/// honest "når · hva · hvor" line instead of nothing.
struct ShareCardItem: Transferable {
    let spec: ShareCardSpec

    /// Renders the card to PNG data. `nil` only if the renderer produces no
    /// image, in which case `ShareLink` falls back to the text representation.
    @MainActor
    func pngData() -> Data? {
        let renderer = ImageRenderer(content: ShareCardView(spec: spec))
        renderer.scale = 1
        renderer.isOpaque = true
        return renderer.uiImage?.pngData()
    }

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { item in
            let data = await item.pngData()
            return data ?? Data()
        }
        .suggestedFileName("sportivista.png")

        ProxyRepresentation(exporting: { (item: ShareCardItem) in item.spec.plainText })
    }
}

#Preview("Delekort — event") {
    ShareCardView(spec: ShareCardSpec(
        kind: .event, time: "18:00", day: "lørdag 26. juli",
        title: "Lyn – Fredrikstad", channel: "NRK1"
    ))
    .scaleEffect(0.3)
}

#Preview("Delekort — brief") {
    ShareCardView(spec: ShareCardSpec(
        kind: .brief, time: nil, day: "lørdag 26. juli",
        title: "Rolig lørdag: Hovland starter tidlig, og Lyn spiller i kveld.",
        channel: nil
    ))
    .scaleEffect(0.3)
}
