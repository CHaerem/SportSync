#!/usr/bin/env swift
//
//  generate-og-image.swift
//  Sportivista — link-preview (Open Graph) card generator (WP-182 · Delbare flater)
//
//  Renders the STATIC brand card that every docs/ page points at with
//  `og:image` / `twitter:image`. A shared sportivista.com link used to render
//  in iMessage/Slack with no identity at all; this card is what it renders as
//  now. The output is CHECKED IN (docs/og/*.png) — the web has no build step
//  and the null-infrastructure constraint forbids generating it at request
//  time or fetching it from a CDN.
//
//  This is a MARKETING surface, not product chrome: amber-on-black is used
//  more boldly here than DESIGN.md allows inside the app (the times are amber,
//  where the product renders them in `label`). The card ships as a flat PNG and
//  shares no code with the product's CSS/Swift tokens, so the licence it takes
//  cannot leak back into a product surface.
//
//  Honesty: the card shows NO event titles, channels or results — only the
//  agenda's FORM (a fixed time column + placeholder rules). Nothing on it can
//  be read as a claim about a real fixture.
//
//  Usage:
//    swift design/brand/generate-og-image.swift <output.png> [widthPx] [heightPx]
//    swift design/brand/generate-og-image.swift --all            # regenerate docs/og/
//
//  `--all` writes, relative to the repo root:
//    docs/og/og-default.png    1200×630  (Open Graph / Twitter summary_large_image)
//
//  Verify a regeneration by eye AND by size: PNG encoders are not guaranteed
//  bit-reproducible across tool versions, so a re-render that differs by a few
//  bytes is expected; a re-render that differs VISIBLY is a bug.
//

import Foundation
import AppKit

// MARK: - Tokens (marketing variant of DESIGN.md § Tokens)

let bg = NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 1)               // true black, as the dark product surface
let amber = NSColor(srgbRed: 1.0, green: 0xB0 / 255.0, blue: 0, alpha: 1) // #FFB000
let fg = NSColor.white
let fg2 = NSColor(white: 1, alpha: 0.6)
let fg3 = NSColor(white: 1, alpha: 0.3)

/// The system font with tabular (monospaced) digits — the product's time-column
/// treatment, `Font.sportivistaTabular` / `font-variant-numeric: tabular-nums`.
func tabularFont(_ size: CGFloat, weight: NSFont.Weight) -> NSFont {
	let base = NSFont.systemFont(ofSize: size, weight: weight)
	let settings: [[NSFontDescriptor.FeatureKey: Int]] = [[
		.typeIdentifier: kNumberSpacingType,
		.selectorIdentifier: kMonospacedNumbersSelector
	]]
	let descriptor = base.fontDescriptor.addingAttributes([.featureSettings: settings])
	return NSFont(descriptor: descriptor, size: size) ?? base
}

func systemFont(_ size: CGFloat, weight: NSFont.Weight) -> NSFont {
	NSFont.systemFont(ofSize: size, weight: weight)
}

// MARK: - Drawing

func attributed(_ text: String, font: NSFont, color: NSColor, kern: CGFloat = 0) -> NSAttributedString {
	NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .kern: kern])
}

/// Renders the card at `size` and returns PNG data. The coordinate system is
/// FLIPPED (top-left origin, y grows downward) so the layout below reads the
/// same way the web/iOS layouts do.
func renderCard(width: CGFloat, height: CGFloat) -> Data? {
	guard let rep = NSBitmapImageRep(
		bitmapDataPlanes: nil, pixelsWide: Int(width), pixelsHigh: Int(height),
		bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
		colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
	) else { return nil }
	guard let cg = NSGraphicsContext(bitmapImageRep: rep) else { return nil }

	// Everything scales off the 1200-wide reference frame, so a different export
	// size is proportionally identical.
	let s = width / 1200

	NSGraphicsContext.saveGraphicsState()
	NSGraphicsContext.current = cg
	let ctx = cg.cgContext
	ctx.setFillColor(bg.cgColor)
	ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
	// Flip to a top-left origin.
	ctx.translateBy(x: 0, y: height)
	ctx.scaleBy(x: 1, y: -1)
	let flipped = NSGraphicsContext(cgContext: ctx, flipped: true)
	NSGraphicsContext.current = flipped

	let padX = 84 * s
	var y = 92 * s

	// ── The lockup: SPORTIVISTA + amber colon, zero gap (BRAND.md rule 1), the
	//    colon one weight step heavier than the wordmark (rule 2).
	let markFont = systemFont(76 * s, weight: .bold)
	let colonFont = systemFont(76 * s, weight: .heavy)
	let word = attributed("SPORTIVISTA", font: markFont, color: fg, kern: 4 * s)
	word.draw(at: CGPoint(x: padX, y: y))
	let colon = attributed(":", font: colonFont, color: amber)
	colon.draw(at: CGPoint(x: padX + word.size().width, y: y))
	y += word.size().height + 18 * s

	// ── Tagline (design/brand — the product's one-line promise).
	let tagline = attributed("Hele sporten. Ett rolig utsyn.", font: systemFont(34 * s, weight: .regular), color: fg2)
	tagline.draw(at: CGPoint(x: padX, y: y))
	y += tagline.size().height + 58 * s

	// ── The agenda's FORM: a fixed time column + a placeholder rule per row.
	//    Deliberately content-free (no titles, no channels) — the card must never
	//    look like it is claiming a real fixture.
	let timeFont = tabularFont(46 * s, weight: .semibold)
	let colWidth = 150 * s
	let rowGap = 62 * s
	for time in ["18:00", "20:45", "21:15"] {
		let t = attributed(time, font: timeFont, color: amber)
		t.draw(at: CGPoint(x: padX, y: y))
		let ruleY = (y + t.size().height * 0.58).rounded()
		ctx.setFillColor(fg3.cgColor)
		ctx.fill(CGRect(x: padX + colWidth, y: ruleY, width: width - padX * 2 - colWidth, height: max(1, 2 * s)))
		y += rowGap
	}

	// ── Foot: the domain, quiet.
	let foot = attributed("sportivista.com", font: systemFont(26 * s, weight: .regular), color: fg3)
	foot.draw(at: CGPoint(x: padX, y: height - 92 * s))

	NSGraphicsContext.restoreGraphicsState()
	return rep.representation(using: .png, properties: [:])
}

// MARK: - CLI

let args = Array(CommandLine.arguments.dropFirst())

func write(_ data: Data, to path: String) {
	let url = URL(fileURLWithPath: path)
	try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
	do {
		try data.write(to: url)
		print("wrote \(path) (\(data.count) bytes)")
	} catch {
		FileHandle.standardError.write("failed to write \(path): \(error)\n".data(using: .utf8)!)
		exit(1)
	}
}

if args.first == "--all" {
	guard let data = renderCard(width: 1200, height: 630) else { exit(1) }
	write(data, to: "docs/og/og-default.png")
} else if let out = args.first {
	let w = args.count > 1 ? CGFloat(Double(args[1]) ?? 1200) : 1200
	let h = args.count > 2 ? CGFloat(Double(args[2]) ?? 630) : 630
	guard let data = renderCard(width: w, height: h) else { exit(1) }
	write(data, to: out)
} else {
	print("usage: swift design/brand/generate-og-image.swift <output.png> [width] [height]")
	print("       swift design/brand/generate-og-image.swift --all")
	exit(2)
}
