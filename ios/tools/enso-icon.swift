#!/usr/bin/env swift
//
//  enso-icon.swift
//  Zenji — ensō app/PWA icon generator (DRAFT, not wired anywhere)
//
//  Draws the Zenji mark: an ensō (円相) — the zen circle painted in one
//  brushstroke — in flat teletext amber (#FFB000) on the near-black page
//  (#0A0A0C), matching ios/Zenji/DesignTokens.swift. The identity is
//  Tekst-TV, so the ensō is meant to read DIGITAL-japanese, not
//  watercolour-japanese: "a calligrapher drawing with a CRT beam".
//
//  The whole mark is ONE stroke, fully parametrised so variants are cheap:
//    - variable width along the arc (a fine entry, a heavy main drag, a
//      thin lifted tail) — the brush, not a constant ring
//    - a deliberate opening (~20-40°), traditionally low/right
//    - subtle organic radius deviation + a tail overshoot — hand-drawn,
//      but clean enough to read as precision, never slop
//    - NO glow, NO gradient, NO shadow, NO text on the mark. Flat amber
//      on flat dark. An optional CRT raster (scanlines cut into the amber)
//      is the only texture, and only where a variant asks for it.
//
//  Usage:
//    swift ios/tools/enso-icon.swift            # all variants + grid → ios/docs
//    swift ios/tools/enso-icon.swift <outDir>   # override output base dir
//
//  Outputs (nothing live is touched — wiring happens after human choice):
//    <outDir>/enso-varianter.png                # 2x2 review grid
//    <outDir>/variants/<key>/enso-{1024,512,192,180}.png
//        1024 = iOS AppIcon · 512/192 = PWA · 180 = apple-touch
//

import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

// MARK: - Palette (literal WP-10 / DesignTokens.swift values)

let amberCG = CGColor(srgbRed: 1.0, green: 0xB0 / 255.0, blue: 0.0, alpha: 1.0)          // #FFB000
let pageCG  = CGColor(srgbRed: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0C / 255.0, alpha: 1.0) // #0A0A0C
let pageFG  = CGColor(srgbRed: 0xE8 / 255.0, green: 0xE6 / 255.0, blue: 0xE0 / 255.0, alpha: 1.0) // warm off-white
// The CRT scanline: the page colour laid back over the amber so the stroke
// reads as horizontal beam-lines, not a solid fill. Semi-opaque so amber leads.
let scanCG  = CGColor(srgbRed: 0x0A / 255.0, green: 0x0A / 255.0, blue: 0x0C / 255.0, alpha: 0.55)

// MARK: - Variant parameters

/// Every knob the ensō stroke exposes. Change these; get a new character.
struct EnsoParams {
	let key: String              // filename-safe id
	let label: String            // mono caption under the grid cell
	let gapDegrees: Double       // size of the opening (~20-40°)
	let gapBearingDegrees: Double // where the opening points (math angle: 0=E, 90=N, -48≈4:30)
	let rotationDegrees: Double  // extra whole-glyph spin, added on top of the bearing
	let radiusFrac: Double       // centreline radius as a fraction of the half-canvas
	let widthFrac: Double        // heavy-drag stroke width as a fraction of the radius
	let entryTaper: Double       // stroke width at the brush-down end (0…1 of widthFrac)
	let exitTaper: Double        // stroke width at the lifted tail (0…1) — ~0 for a fine flick
	let bodyPeakT: Double        // where along the stroke it is heaviest (0…1)
	let dryBrushAmp: Double      // gentle width modulation (dry-brush swell)
	let dryBrushFreq: Double
	let edgeAmp: Double          // independent outer/inner edge micro-wobble — inked, not extruded
	let wobbleAmp: Double        // organic radial deviation — small = precision, not slop
	let wobbleFreq: Double
	let overshoot: Double        // radial drift of the tail near the gap (the flick past)
	let scanlines: Bool          // cut CRT raster lines into the amber
	let scanlinePitchFrac: Double // scanline pitch as a fraction of the radius
}

let variants: [EnsoParams] = [
	// 1 — thin, taut, exact. Least brush, most CRT calligraphy. A fuller
	//     brush-down that thins to a fine lifted flick — asymmetric, so it
	//     reads as an inked stroke and never as a loading spinner.
	EnsoParams(key: "stram", label: "stram",
	           gapDegrees: 26, gapBearingDegrees: -50, rotationDegrees: 8,
	           radiusFrac: 0.64, widthFrac: 0.10,
	           entryTaper: 0.42, exitTaper: 0.0, bodyPeakT: 0.30,
	           dryBrushAmp: 0.10, dryBrushFreq: 1.0, edgeAmp: 0.10,
	           wobbleAmp: 0.008, wobbleFreq: 1.0, overshoot: 0.03,
	           scanlines: false, scanlinePitchFrac: 0.0),

	// 2 — heavy brush: a blunt brush-down, a fat main drag, a real overshoot.
	EnsoParams(key: "tung", label: "tung pensel",
	           gapDegrees: 30, gapBearingDegrees: -52, rotationDegrees: -6,
	           radiusFrac: 0.61, widthFrac: 0.185,
	           entryTaper: 0.55, exitTaper: 0.03, bodyPeakT: 0.34,
	           dryBrushAmp: 0.16, dryBrushFreq: 1.0, edgeAmp: 0.13,
	           wobbleAmp: 0.014, wobbleFreq: 1.0, overshoot: 0.055,
	           scanlines: false, scanlinePitchFrac: 0.0),

	// 3 — the signature Tekst-TV take: CRT scanlines cut into the amber stroke.
	EnsoParams(key: "raster", label: "raster-scanlines",
	           gapDegrees: 28, gapBearingDegrees: -46, rotationDegrees: 4,
	           radiusFrac: 0.62, widthFrac: 0.15,
	           entryTaper: 0.46, exitTaper: 0.02, bodyPeakT: 0.33,
	           dryBrushAmp: 0.12, dryBrushFreq: 1.0, edgeAmp: 0.11,
	           wobbleAmp: 0.010, wobbleFreq: 1.0, overshoot: 0.04,
	           scanlines: true, scanlinePitchFrac: 0.05),

	// 4 — a wider, airier opening; more breathing room, a longer lifted tail.
	EnsoParams(key: "vid-apning", label: "vid åpning",
	           gapDegrees: 44, gapBearingDegrees: -38, rotationDegrees: 12,
	           radiusFrac: 0.64, widthFrac: 0.13,
	           entryTaper: 0.40, exitTaper: 0.0, bodyPeakT: 0.30,
	           dryBrushAmp: 0.12, dryBrushFreq: 1.0, edgeAmp: 0.11,
	           wobbleAmp: 0.010, wobbleFreq: 1.0, overshoot: 0.07,
	           scanlines: false, scanlinePitchFrac: 0.0),
]

// MARK: - Maths helpers

let TAU = 2.0 * Double.pi

func smoothstep(_ x: Double) -> Double {
	let u = min(1.0, max(0.0, x))
	return u * u * (3.0 - 2.0 * u)
}

/// Width envelope along the stroke: rises from the brush-down taper to a full
/// heavy drag at `peak`, then falls to the lifted-tail taper.
func envelope(_ t: Double, entry: Double, exit: Double, peak: Double) -> Double {
	if t <= peak {
		return entry + (1.0 - entry) * smoothstep(t / peak)
	} else {
		return 1.0 - (1.0 - exit) * smoothstep((t - peak) / (1.0 - peak))
	}
}

// MARK: - Geometry

/// Build the closed brushstroke polygon: a centreline arc with a deliberate
/// gap, walked out along the radial normal by ±width/2 (variable width),
/// forward on the outer edge and back on the inner edge.
func ensoPath(centerX: CGFloat, centerY: CGFloat, radius: CGFloat, p: EnsoParams) -> CGPath {
	let samples = 1600
	let gap = p.gapDegrees * .pi / 180.0
	let sweep = TAU - gap
	// Both stroke ends flank the gap; the brush travels the long way around.
	let start = (p.gapBearingDegrees + p.rotationDegrees) * .pi / 180.0 + gap / 2.0
	let baseW = Double(radius) * p.widthFrac
	let R = Double(radius)

	var outer = [CGPoint]()
	var inner = [CGPoint]()
	outer.reserveCapacity(samples)
	inner.reserveCapacity(samples)

	for i in 0..<samples {
		let t = Double(i) / Double(samples - 1)
		let ang = start + sweep * t

		// Organic radial deviation (two-harmonic so it is a living circle, not
		// a clean egg) + a tail overshoot near the gap.
		var r = R * (1.0 + p.wobbleAmp * (sin(p.wobbleFreq * TAU * t + 0.7)
		                                  + 0.5 * sin((p.wobbleFreq * 2.0 + 0.3) * TAU * t + 2.1)))
		if t > 0.82 {
			r += R * p.overshoot * smoothstep((t - 0.82) / 0.18)
		}

		// Variable stroke width: envelope × gentle dry-brush swell.
		let env = envelope(t, entry: p.entryTaper, exit: p.exitTaper, peak: p.bodyPeakT)
		let dry = 1.0 + p.dryBrushAmp * sin(p.dryBrushFreq * TAU * t + 1.3)
		let w = baseW * env * max(0.02, dry)

		// The two edges of a real brushstroke are independent — modulate outer
		// and inner half-widths on their own low frequencies so the ribbon is
		// inked, never extruded (this is what kills the "loading spinner" read).
		let outerHalf = w / 2.0 * (1.0 + p.edgeAmp * sin(1.7 * TAU * t + 0.4))
		let innerHalf = w / 2.0 * (1.0 + p.edgeAmp * sin(2.3 * TAU * t + 3.1))

		let dx = cos(ang), dy = sin(ang)
		let ro = r + outerHalf, ri = r - innerHalf
		outer.append(CGPoint(x: centerX + CGFloat(ro * dx), y: centerY + CGFloat(ro * dy)))
		inner.append(CGPoint(x: centerX + CGFloat(ri * dx), y: centerY + CGFloat(ri * dy)))
	}

	let path = CGMutablePath()
	path.move(to: outer[0])
	for pt in outer.dropFirst() { path.addLine(to: pt) }
	for pt in inner.reversed() { path.addLine(to: pt) }
	path.closeSubpath()
	return path
}

// MARK: - Drawing

func makeContext(_ px: Int) -> CGContext {
	let cs = CGColorSpaceCreateDeviceRGB()
	let ctx = CGContext(data: nil, width: px, height: px,
	                    bitsPerComponent: 8, bytesPerRow: 0, space: cs,
	                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	ctx.setAllowsAntialiasing(true)
	ctx.setShouldAntialias(true)
	ctx.interpolationQuality = .high
	return ctx
}

/// Paint the ensō (flat amber, plus CRT scanlines if the variant asks) at a
/// given centre/radius. Assumes the page background is already filled.
func drawEnso(_ ctx: CGContext, centerX: CGFloat, centerY: CGFloat, radius: CGFloat, p: EnsoParams) {
	let path = ensoPath(centerX: centerX, centerY: centerY, radius: radius, p: p)
	ctx.addPath(path)
	ctx.setFillColor(amberCG)
	ctx.fillPath()

	guard p.scanlines else { return }
	ctx.saveGState()
	ctx.addPath(path)
	ctx.clip()
	let pitch = max(CGFloat(2), radius * CGFloat(p.scanlinePitchFrac))
	let lineH = pitch * 0.42
	ctx.setFillColor(scanCG)
	var y = centerY - radius * 1.35
	let yMax = centerY + radius * 1.35
	while y < yMax {
		ctx.fill(CGRect(x: centerX - radius * 1.45, y: y, width: radius * 2.9, height: lineH))
		y += pitch
	}
	ctx.restoreGState()
}

func renderIcon(px: Int, p: EnsoParams) -> CGImage {
	let ctx = makeContext(px)
	let f = CGFloat(px)
	ctx.setFillColor(pageCG)
	ctx.fill(CGRect(x: 0, y: 0, width: f, height: f))
	drawEnso(ctx, centerX: f / 2, centerY: f / 2, radius: f / 2 * CGFloat(p.radiusFrac), p: p)
	return ctx.makeImage()!
}

/// Draw a centred, kerned mono caption on its baseline (Core Text, no AppKit).
func drawLabel(_ ctx: CGContext, _ text: String, centerX: CGFloat, baselineY: CGFloat, size: CGFloat, color: CGColor) {
	let font = CTFontCreateWithName("Menlo" as CFString, size, nil)
	let attrs: [CFString: Any] = [
		kCTFontAttributeName: font,
		kCTForegroundColorAttributeName: color,
		kCTKernAttributeName: size * 0.06,
	]
	let astr = CFAttributedStringCreate(nil, text as CFString, attrs as CFDictionary)!
	let line = CTLineCreateWithAttributedString(astr)
	var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
	let w = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))
	ctx.textPosition = CGPoint(x: centerX - w / 2, y: baselineY)
	CTLineDraw(line, ctx)
}

/// Compose all variants into one 2x2 review grid, each cell a true-to-icon
/// render with its variant name in mono beneath it.
func renderGrid(_ vs: [EnsoParams]) -> CGImage {
	let cell: CGFloat = 512
	let pad: CGFloat = 46
	let labelH: CGFloat = 76
	let banner: CGFloat = 92
	let cols = 2
	let rows = (vs.count + cols - 1) / cols

	let W = Int(pad + CGFloat(cols) * (cell + pad))
	let H = Int(pad + banner + CGFloat(rows) * (cell + labelH + pad))
	let Hf = CGFloat(H)

	// makeContext is square-only (for icons); the grid needs an exact W×H canvas.
	let cs = CGColorSpaceCreateDeviceRGB()
	let gctx = CGContext(data: nil, width: W, height: H,
	                     bitsPerComponent: 8, bytesPerRow: 0, space: cs,
	                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	gctx.setAllowsAntialiasing(true)
	gctx.setShouldAntialias(true)
	gctx.interpolationQuality = .high

	gctx.setFillColor(pageCG)
	gctx.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: Hf))

	// Banner (top-origin → CG y-up conversion).
	let bannerBaselineTop = pad + banner * 0.42
	drawLabel(gctx, "ENSŌ  ·  #FFB000  på  #0A0A0C", centerX: CGFloat(W) / 2,
	          baselineY: Hf - bannerBaselineTop, size: 30, color: pageFG)

	for (idx, p) in vs.enumerated() {
		let c = idx % cols
		let row = idx / cols
		let cellLeft = pad + CGFloat(c) * (cell + pad)
		let cellTop = pad + banner + CGFloat(row) * (cell + labelH + pad)
		let centerX = cellLeft + cell / 2
		let centerYtop = cellTop + cell / 2
		let centerY = Hf - centerYtop
		drawEnso(gctx, centerX: centerX, centerY: centerY,
		         radius: cell / 2 * CGFloat(p.radiusFrac), p: p)

		let labelBaselineTop = cellTop + cell + labelH * 0.60
		drawLabel(gctx, p.label, centerX: centerX,
		          baselineY: Hf - labelBaselineTop, size: 30, color: amberCG)
	}
	return gctx.makeImage()!
}

// MARK: - PNG output

func writePNG(_ image: CGImage, to url: URL) {
	guard let dest = CGImageDestinationCreateWithURL(
		url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
		FileHandle.standardError.write("failed to create PNG destination: \(url.path)\n".data(using: .utf8)!)
		exit(1)
	}
	CGImageDestinationAddImage(dest, image, nil)
	guard CGImageDestinationFinalize(dest) else {
		FileHandle.standardError.write("failed to finalize PNG: \(url.path)\n".data(using: .utf8)!)
		exit(1)
	}
}

// MARK: - Main

let fm = FileManager.default

// Resolve output base relative to this script (ios/tools/…) → ios/docs, so it
// works regardless of the working directory. Override with argv[1].
let scriptDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent() // ios/tools
let defaultOut = scriptDir.deletingLastPathComponent().appendingPathComponent("docs") // ios/docs
let outBase = CommandLine.arguments.count > 1
	? URL(fileURLWithPath: CommandLine.arguments[1])
	: defaultOut

try? fm.createDirectory(at: outBase, withIntermediateDirectories: true)

let iconSizes = [1024, 512, 192, 180]
var written = 0

for p in variants {
	let dir = outBase.appendingPathComponent("variants").appendingPathComponent(p.key)
	try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
	for size in iconSizes {
		let url = dir.appendingPathComponent("enso-\(size).png")
		writePNG(renderIcon(px: size, p: p), to: url)
		written += 1
	}
	print("  \(p.key): \(iconSizes.map { "\($0)" }.joined(separator: "/")) px")
}

let gridURL = outBase.appendingPathComponent("enso-varianter.png")
writePNG(renderGrid(variants), to: gridURL)
written += 1

print("\nWrote \(written) PNG(s) under \(outBase.path)")
print("Review grid: \(gridURL.path)")
