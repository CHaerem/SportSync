//
//  ShareCardSpecTests.swift
//  SportivistaTests
//
//  WP-182 · Delbare flater — the delekort's PURE half. The card leaves the
//  device, so its honesty rules matter more than most: it may never invent a
//  channel, and it must word the unknown one exactly the way the board does
//  ("–"). These tests drive `ShareCardSpec` directly (no rendering, no
//  ImageRenderer, no simulator UI) — the SwiftUI view is a thin skin over it.
//

import XCTest
import SwiftUI

final class ShareCardSpecTests: XCTestCase {

    private func iso(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)!
    }

    private func row(time: String, title: String, channel: String) -> AgendaEventRow {
        AgendaEventRow(
            id: "e1", timeLabel: time, title: title, metaLabel: nil,
            channelLabel: channel, isMustSee: false, mustWatch: false, isAIResearch: false,
            event: EventBuilder.make(sport: "football", title: title, time: "2026-07-25T16:00:00Z")
        )
    }

    // MARK: - Honesty

    func testUnknownChannelRendersTheBoardsOwnDash() {
        // AgendaFormat.channelLabel already gives "–" for an unknown channel;
        // the card must carry it through unchanged, never blank it, never guess.
        let spec = ShareCardSpec.event(row: row(time: "18:00", title: "Lyn – Fredrikstad", channel: "–"), dayLine: nil)
        XCTAssertEqual(spec.channelLabel, "–")
    }

    func testEmptyChannelAlsoBecomesTheDash() {
        let spec = ShareCardSpec(kind: .event, time: "18:00", day: nil, title: "T", channel: "")
        XCTAssertEqual(spec.channelLabel, "–")
    }

    func testKnownChannelIsCarriedVerbatim() {
        let spec = ShareCardSpec.event(row: row(time: "18:00", title: "Lyn – Fredrikstad", channel: "NRK1"), dayLine: nil)
        XCTAssertEqual(spec.channelLabel, "NRK1")
    }

    func testSpecReusesTheRowsAlreadyFormattedLabels() {
        // The card can never disagree with the row it was shared from: it takes
        // the row's OWN timeLabel/title/channelLabel rather than re-deriving them.
        let r = row(time: "4.–11. jul.", title: "The Open Championship", channel: "TV 2 Play")
        let spec = ShareCardSpec.event(row: r, dayLine: "lørdag 25. juli")
        XCTAssertEqual(spec.kind, .event)
        XCTAssertEqual(spec.time, "4.–11. jul.")
        XCTAssertEqual(spec.title, "The Open Championship")
        XCTAssertEqual(spec.channel, "TV 2 Play")
        XCTAssertEqual(spec.day, "lørdag 25. juli")
    }

    // MARK: - Day line (Europe/Oslo, Norwegian)

    func testDayLineIsNorwegianAndOslo() {
        // 2026-07-25T22:30Z is already SUNDAY 26 July in Oslo (UTC+2) — the card
        // must say what the board says, not what UTC says.
        XCTAssertEqual(ShareCardSpec.dayLine(for: iso("2026-07-25T22:30:00Z")), "søndag 26. juli")
    }

    func testDayLineIsNilWithoutADate() {
        XCTAssertNil(ShareCardSpec.dayLine(for: nil))
    }

    // MARK: - Plain-text fallback (text-only share targets)

    func testPlainTextIsNaarHvaHvor() {
        let spec = ShareCardSpec(kind: .event, time: "18:00", day: "lørdag 25. juli",
                                 title: "Lyn – Fredrikstad", channel: "NRK1")
        XCTAssertEqual(spec.plainText, "Lyn – Fredrikstad · lørdag 25. juli 18:00 · NRK1")
    }

    func testPlainTextSkipsMissingParts() {
        let spec = ShareCardSpec.brief(headline: "Rolig lørdag.", dayLine: "lørdag 25. juli")
        XCTAssertEqual(spec.plainText, "Rolig lørdag. · lørdag 25. juli")
    }

    // MARK: - Brief

    func testBriefCarriesNoTimeOrChannel() {
        let spec = ShareCardSpec.brief(headline: "Hovland starter tidlig.", dayLine: "lørdag 25. juli")
        XCTAssertEqual(spec.kind, .brief)
        XCTAssertNil(spec.time)
        XCTAssertNil(spec.channel)
        XCTAssertEqual(spec.title, "Hovland starter tidlig.")
    }

    // MARK: - Frame

    func testCardFrameMatchesTheWebCardAndOgImage() {
        // One look wherever a share lands: the iOS card, the web canvas card and
        // docs/og/og-default.png are all 1200×630.
        XCTAssertEqual(ShareCardView.size, CGSize(width: 1200, height: 630))
    }

    /// The renderer actually produces a PNG at the declared frame — a
    /// `Transferable` that yields no data shows up as an empty share sheet.
    @MainActor
    func testRendererProducesAPngAtTheDeclaredSize() {
        let item = ShareCardItem(spec: ShareCardSpec(
            kind: .event, time: "18:00", day: "lørdag 25. juli",
            title: "Lyn – Fredrikstad", channel: "NRK1"
        ))
        guard let data = item.pngData() else { return XCTFail("the card should render to PNG data") }
        XCTAssertGreaterThan(data.count, 1000)
        // PNG IHDR: width/height are big-endian uint32 at byte 16 / 20.
        func uint32(at offset: Int) -> UInt32 {
            data[offset ..< offset + 4].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        }
        XCTAssertEqual(uint32(at: 16), 1200)
        XCTAssertEqual(uint32(at: 20), 630)
        // Dumping the render for eyeballing is opt-in — never a test side effect.
        // (The checked-in evidence in ios/docs/design-v2/share-card-*.png came from
        // this path; flip the flag locally to regenerate it.)
        if ProcessInfo.processInfo.environment["SPORTIVISTA_DUMP_SHARECARD"] != nil {
            let url = (FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                       ?? FileManager.default.temporaryDirectory).appendingPathComponent("sharecard-event.png")
            try? data.write(to: url)
            print("SHARECARD-DUMP \(url.path)")
        }
    }

    func testFooterDefaultsToTheDomain() {
        XCTAssertEqual(ShareCardSpec.brief(headline: "x", dayLine: nil).footer, "sportivista.com")
    }
}
