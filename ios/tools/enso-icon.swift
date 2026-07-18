#!/usr/bin/env swift
//
//  enso-icon.swift
//  Sportivista — ensō app/PWA icon generator
//
//  CHOSEN VARIANT: v3-grov-contig (teletext mosaic, coarse contiguous 18×18
//  grid). Verified byte-identical (WP-49) to every shipped icon:
//    variants/v3-grov-contig/enso-1024.png = ios/Sportivista/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
//    variants/v3-grov-contig/enso-512.png  = docs/icons/icon-512x512.png
//    variants/v3-grov-contig/enso-192.png  = docs/icons/icon-192x192.png (= docs/favicon.png)
//    variants/v3-grov-contig/enso-180.png  = docs/icons/icon-180x180.png
//
//  REGENERATE the shipped icons (deterministic — seeded RNG, fixed grid):
//    swift ios/tools/enso-icon.swift /tmp/enso-out
//    cp /tmp/enso-out/variants/v3-grov-contig/enso-1024.png ios/Sportivista/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
//    cp /tmp/enso-out/variants/v3-grov-contig/enso-512.png  docs/icons/icon-512x512.png
//    cp /tmp/enso-out/variants/v3-grov-contig/enso-192.png  docs/icons/icon-192x192.png
//    cp /tmp/enso-out/variants/v3-grov-contig/enso-192.png  docs/favicon.png
//    cp /tmp/enso-out/variants/v3-grov-contig/enso-180.png  docs/icons/icon-180x180.png
//  ALWAYS pass an output dir outside the repo: the exploration outputs
//  (variants/ + review grids) were removed from git in WP-49 and must not
//  be re-committed — only the shipped icon files above belong in the repo.
//
//  Draws the Sportivista mark: an ensō (円相) — the zen circle painted in one
//  brushstroke — in flat teletext amber (#FFB000) on the near-black page
//  (#0A0A0C), matching ios/Sportivista/DesignTokens.swift. The identity is
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
//    swift ios/tools/enso-icon.swift <outDir>   # all variants + grids → <outDir>
//    swift ios/tools/enso-icon.swift            # default outDir = ios/docs —
//                                               # AVOID: writes exploration
//                                               # ballast into the repo tree
//
//  Outputs (review material — never commit; see WP-49 policy):
//    <outDir>/enso-varianter.png                # 2x2 review grid (v1)
//    <outDir>/enso-v2-varianter.png / enso-v3-varianter.png
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

// MARK: - v2 · ink physics (bristles + multi-octave noise)
//
//  v1 (above) draws ONE closed ribbon, so it reads as a smooth vector arc —
//  the owner's verdict was "ser litt for generert ut, for lite organisk …
//  må se mer ut som penselstrøk". v2 rebuilds the mark as 20–60 THIN bristle
//  sub-strokes that run ALONG the arc (concentric bands), each with its own
//  radial offset, thickness, ragged brush-down/lift and — the signature — its
//  own BROKEN ink trail. Where the ink "releases" (the last third before the
//  opening, and the frayed rim) the bristles SEPARATE into visible stripes with
//  the page showing through the gaps. The stroke's DIRECTION is therefore in the
//  texture itself (bands follow the arc), not in radial noise.
//
//  Density is expressed as COVERAGE (how many bristles, how wide, how big the
//  gaps) — never as an alpha gradient or glow: every painted pixel is still flat
//  #FFB000 on flat #0A0A0C. All jitter is deterministic multi-octave value noise
//  keyed off a per-variant `seed` (never sine harmonics), so a seed is a
//  repeatable, explorable "hand" you can compare across variants.

// 64-bit integer hash → double in [0,1). SplitMix64 finaliser: no trig, no sine.
func hash01(_ x: UInt64) -> Double {
	var z = x &+ 0x9E3779B97F4A7C15
	z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
	z = z ^ (z >> 31)
	return Double(z >> 11) * (1.0 / 9007199254740992.0) // /2^53
}

// Smoothstep-interpolated 1D value noise on an integer lattice.
func valueNoise(_ x: Double, _ seed: UInt64) -> Double {
	let xi = floor(x)
	let xf = x - xi
	let i = UInt64(bitPattern: Int64(xi))
	let a = hash01(seed &+ i &* 0x100000001B3)
	let b = hash01(seed &+ (i &+ 1) &* 0x100000001B3)
	let u = xf * xf * (3.0 - 2.0 * xf)
	return a + (b - a) * u
}

// Fractal (multi-octave) value noise, normalised to ~[0,1].
func fbm(_ x: Double, _ seed: UInt64, octaves: Int = 4, lacunarity: Double = 2.0, gain: Double = 0.5) -> Double {
	var sum = 0.0, amp = 1.0, freq = 1.0, norm = 0.0
	for o in 0..<octaves {
		sum += amp * valueNoise(x * freq, seed &+ UInt64(o) &* 0x9E3779B1)
		norm += amp
		amp *= gain
		freq *= lacunarity
	}
	return sum / norm
}

// Signed multi-octave noise in ~[-1,1].
func sfbm(_ x: Double, _ seed: UInt64, octaves: Int = 4) -> Double {
	fbm(x, seed, octaves: octaves) * 2.0 - 1.0
}

/// Every knob the v2 stroke exposes. A seed + these = one "hand".
///
/// Model: a SOLID inked mass with frayed, noisy edges (the loaded brush), then
/// dry streaks CARVED back to the page where the ink runs out — more toward the
/// tail and the rim — plus a few full-width cross-gaps that break the tail flick
/// into separate fingers. Density is coverage, never a gradient.
struct EnsoV2Params {
	let key: String              // filename-safe id (dir becomes v2-<key>)
	let label: String            // mono caption in the grid
	// opening / placement (v1 semantics kept)
	let gapDegrees: Double
	let gapBearingDegrees: Double
	let rotationDegrees: Double
	let radiusFrac: Double
	// brush footprint / hand movement
	let widthFrac: Double        // heavy-drag ribbon width as a fraction of radius
	let entryW: Double           // width where the brush first touches (small — a soft inked entry, not a flat cut)
	let landingBulge: Double     // extra swell just after touch-down (the ink pool — densest ink)
	let bodyPeakT: Double        // where the drag is heaviest (0…1)
	let tailW: Double            // width at the very tail — kept broad, then BROKEN (never a clean point)
	// dry streaks (carved back to the page)
	let streaks: Int             // number of dry channels following the arc
	let streakWidth: Double      // carve width as a fraction of the channel spacing
	let dryBody: Double          // streaking through the body (0 solid … 1 shredded)
	let dryTail: Double          // streaking by the tail
	let dryStartT: Double        // where the drying starts ramping toward the tail
	let breakupScale: Double     // along-stroke frequency of the streak on/off (chunky = low)
	let edgeDry: Double          // extra streaking on the rim channels (fraying)
	// edges + the flicked tail
	let edgeFray: Double         // amplitude of the mass's own edge roughness (fraction of half-width)
	let tailBreaks: Int          // full-width cross-gaps in the drying zone (break the flick into fingers)
	let tailRake: Double         // how far the broken fingers vary in length
	let overshoot: Double        // radial flick of the tail past the ring near the gap
	// organic radius
	let wobbleAmp: Double
	// splatter flung off the tail
	let splatter: Int            // 0…3 tiny dabs
	let splatterSpread: Double
	let seed: UInt64
}

// Hand-movement width envelope: a soft inked touch-down (a quick bloom from a
// fine `entryW`, NOT a full-width guillotine), a heavy ink pool just after, the
// heavy drag at `bodyPeakT`, then a broad release toward the tail (kept wide so
// the tail is BROKEN into fingers, never smoothly tapered to a point).
func widthEnvV2(_ t: Double, _ p: EnsoV2Params) -> Double {
	let base: Double
	if t <= p.bodyPeakT {
		base = p.entryW + (1.0 - p.entryW) * smoothstep(t / max(1e-4, p.bodyPeakT))
	} else {
		base = 1.0 - (1.0 - p.tailW) * smoothstep((t - p.bodyPeakT) / max(1e-4, 1.0 - p.bodyPeakT))
	}
	let d = (t - 0.08) / 0.07
	return base + p.landingBulge * exp(-d * d)
}

/// Paint one v2 ensō in three flat-amber layers: (A) the solid inked mass with
/// frayed edges, (B) dry streaks carved back to the page where the ink runs out,
/// (C) tiny splatter dabs off the tail. No gradient, no glow — every amber pixel
/// is #FFB000, every gap is the bare page.
func drawEnsoV2(_ ctx: CGContext, cx: CGFloat, cy: CGFloat, radius: CGFloat, px: Int, p: EnsoV2Params) {
	let R = Double(radius)
	let gap = p.gapDegrees * .pi / 180.0
	let sweep = TAU - gap
	let start = (p.gapBearingDegrees + p.rotationDegrees) * .pi / 180.0 + gap / 2.0
	let halfBase = R * p.widthFrac * 0.5

	// Detail scale — finer sampling at large sizes; enough steps at small ones
	// that the carved streaks stay crisp rather than aliasing to mud (180px test).
	let detail = min(1.0, max(0.30, Double(px) / 1024.0))
	let steps = max(360, Int(1500.0 * detail))
	let dt = 1.0 / Double(steps - 1)

	let sRad = p.seed ^ 0xA11CE
	let sWid = p.seed ^ 0xB0B0
	let sOut = p.seed ^ 0x0DDF00D
	let sInn = p.seed ^ 0x1CEB00D
	let sCarve = p.seed ^ 0xCA5E

	func rAt(_ t: Double) -> Double {
		var r = R * (1.0 + p.wobbleAmp * sfbm(t * 2.7 + 3.0, sRad, octaves: 4))
		if t > 0.78 { r += R * p.overshoot * smoothstep((t - 0.78) / 0.22) }
		return r
	}
	func halfAt(_ t: Double) -> Double {
		let swell = 1.0 + 0.12 * sfbm(t * 2.2 + 7.0, sWid, octaves: 3)
		return halfBase * widthEnvV2(t, p) * max(0.04, swell)
	}
	func dryAt(_ t: Double) -> Double {
		let ramp = smoothstep((t - p.dryStartT) / max(1e-4, 1.0 - p.dryStartT))
		return p.dryBody + (p.dryTail - p.dryBody) * ramp
	}

	// --- Layer A: the solid inked mass — one closed ribbon with frayed edges ---
	var outer = [CGPoint](); var inner = [CGPoint]()
	outer.reserveCapacity(steps); inner.reserveCapacity(steps)
	for i in 0..<steps {
		let t = Double(i) * dt
		let ang = start + sweep * t
		let r = rAt(t), H = halfAt(t)
		let fray = p.edgeFray * (0.35 + 0.85 * dryAt(t))     // the mass gets rougher as it dries
		let ho = H * (1.0 + fray * sfbm(t * 6.0 + 1.0, sOut, octaves: 3))
		let hi = H * (1.0 + fray * sfbm(t * 6.0 + 40.0, sInn, octaves: 3))
		let nx = cos(ang), ny = sin(ang)
		let ro = r + max(0.03 * H, ho), ri = r - max(0.03 * H, hi)
		outer.append(CGPoint(x: cx + CGFloat(ro * nx), y: cy + CGFloat(ro * ny)))
		inner.append(CGPoint(x: cx + CGFloat(ri * nx), y: cy + CGFloat(ri * ny)))
	}
	let baseP = CGMutablePath()
	baseP.move(to: outer[0])
	for pt in outer.dropFirst() { baseP.addLine(to: pt) }
	for pt in inner.reversed() { baseP.addLine(to: pt) }
	baseP.closeSubpath()
	ctx.addPath(baseP); ctx.setFillColor(amberCG); ctx.drawPath(using: .fill)

	// --- Layer B: dry streaks carved back to the page -------------------------
	// A solid stroke eaten into by streaks where the paper shows. Each streak is
	// a page-coloured band at a fixed radial channel, present only where its
	// noise beats the local dryness, so gaps open up toward the tail and the rim.
	let carve = CGMutablePath()
	let Ns = p.streaks
	for s in 0..<Ns {
		let sS = sCarve &+ UInt64(s) &* 0x2545F4914F6CDD1D
		let uBase = (Double(s) + 0.5) / Double(Ns) * 2.0 - 1.0
		let u = uBase + (hash01(sS &+ 3) - 0.5) * (2.0 / Double(Ns)) * 0.7
		let edge = abs(u)
		var rOut = [CGPoint](); var rIn = [CGPoint]()
		func flush() {
			if rOut.count >= 4 {   // ≥4 samples: a real streak, not a stray sliver
				carve.move(to: rOut[0])
				for pt in rOut.dropFirst() { carve.addLine(to: pt) }
				for pt in rIn.reversed() { carve.addLine(to: pt) }
				carve.closeSubpath()
			}
			rOut.removeAll(keepingCapacity: true); rIn.removeAll(keepingCapacity: true)
		}
		var t = 0.07     // never carve the very landing (the solid ink pool)
		while t <= 1.0 + 1e-9 {
			let strength = min(0.96, dryAt(t) + p.edgeDry * edge)
			let n = fbm(t * p.breakupScale + Double(s) * 5.7, sS ^ 0xE55E, octaves: 4)
			if n < strength {
				let ang = start + sweep * t
				let r = rAt(t), H = halfAt(t)
				let spacing = 2.0 * H / Double(Ns)
				let w = spacing * p.streakWidth * (0.55 + 0.95 * fbm(t * 4.0 + Double(s), sS ^ 0x77, octaves: 2))
				let rc = r + u * H + sfbm(t * 3.0 + Double(s) * 2.0, sS ^ 0x99, octaves: 2) * 0.28 * H
				let nx = cos(ang), ny = sin(ang)
				rOut.append(CGPoint(x: cx + CGFloat((rc + w / 2) * nx), y: cy + CGFloat((rc + w / 2) * ny)))
				rIn.append(CGPoint(x: cx + CGFloat((rc - w / 2) * nx), y: cy + CGFloat((rc - w / 2) * ny)))
			} else {
				flush()
			}
			t += dt
		}
		flush()
	}
	// Full-width cross-gaps in the drying zone: break the flick into fingers of
	// unequal length — a hand movement with speed, not a tapering point.
	for k in 0..<p.tailBreaks {
		let kS = sCarve &+ UInt64(k) &* 0x9E3779B97F4A7C15 &+ 0xB4EA
		let tc = 0.70 + 0.27 * hash01(kS &+ 1)
		let halfLen = (0.004 + 0.018 * hash01(kS &+ 2)) * (1.0 + p.tailRake)
		var rOut = [CGPoint](); var rIn = [CGPoint]()
		var t = max(0.07, tc - halfLen)
		let tEnd = min(1.0, tc + halfLen)
		while t <= tEnd + 1e-9 {
			let ang = start + sweep * t
			let r = rAt(t), H = halfAt(t) * 1.7            // overshoot the mass to cut clean through
			let nx = cos(ang), ny = sin(ang)
			rOut.append(CGPoint(x: cx + CGFloat((r + H) * nx), y: cy + CGFloat((r + H) * ny)))
			rIn.append(CGPoint(x: cx + CGFloat((r - H) * nx), y: cy + CGFloat((r - H) * ny)))
			t += dt
		}
		if rOut.count >= 2 {
			carve.move(to: rOut[0])
			for pt in rOut.dropFirst() { carve.addLine(to: pt) }
			for pt in rIn.reversed() { carve.addLine(to: pt) }
			carve.closeSubpath()
		}
	}
	ctx.addPath(carve); ctx.setFillColor(pageCG); ctx.drawPath(using: .fill)

	// --- Layer C: splatter dabs flung off the tail (amber) --------------------
	if p.splatter > 0 {
		let dab = CGMutablePath()
		for s in 0..<p.splatter {
			let ss = p.seed &+ UInt64(s) &* 0x9E3779B97F4A7C15 &+ 0x5151
			let tt = min(1.03, 0.92 + 0.13 * hash01(ss &+ 1))
			let ang = start + sweep * tt
			let H = halfAt(min(1.0, tt))
			let r = rAt(min(1.0, tt)) + (hash01(ss &+ 2) - 0.3) * p.splatterSpread * R
			let off = (hash01(ss &+ 3) - 0.5) * 2.6 * H
			let nx = cos(ang), ny = sin(ang)
			let rr = r + off
			let cxp = cx + CGFloat(rr * nx), cyp = cy + CGFloat(rr * ny)
			let rad = CGFloat((0.005 + 0.009 * hash01(ss &+ 4)) * R * detail)
			dab.addEllipse(in: CGRect(x: cxp - rad, y: cyp - rad, width: rad * 2, height: rad * 2))
		}
		ctx.addPath(dab); ctx.setFillColor(amberCG); ctx.drawPath(using: .fill)
	}
}

func renderIconV2(px: Int, p: EnsoV2Params) -> CGImage {
	let ctx = makeContext(px)
	let f = CGFloat(px)
	ctx.setFillColor(pageCG)
	ctx.fill(CGRect(x: 0, y: 0, width: f, height: f))
	drawEnsoV2(ctx, cx: f / 2, cy: f / 2, radius: f / 2 * CGFloat(p.radiusFrac), px: px, p: p)
	return ctx.makeImage()!
}

// Four v2 variants, each a distinctly different "hand". Tuned by rendering and
// LOOKING at every one at 1024 and 180 (see the PR notes for what was rejected).
let variantsV2: [EnsoV2Params] = [
	// 1 — tørr & rask: lighter, quick, streaked most of the way round, a fast
	//     broken flick. Long dry channels stay visible through the body.
	EnsoV2Params(key: "torr-rask", label: "tørr & rask",
		gapDegrees: 30, gapBearingDegrees: -50, rotationDegrees: 4,
		radiusFrac: 0.62, widthFrac: 0.17,
		entryW: 0.18, landingBulge: 0.20, bodyPeakT: 0.30, tailW: 0.34,
		streaks: 10, streakWidth: 0.72,
		dryBody: 0.28, dryTail: 0.60, dryStartT: 0.40, breakupScale: 9, edgeDry: 0.22,
		edgeFray: 0.30, tailBreaks: 3, tailRake: 0.6, overshoot: 0.06,
		wobbleAmp: 0.020, splatter: 2, splatterSpread: 0.045, seed: 20260714),

	// 2 — våt tung: the beloved heavy weight, now clearly brushed. A dense, solid
	//     body with a strong ink pool just after touch-down; the streaking is
	//     real but mostly saved for the last third — closest to v1 "tung" in mass.
	EnsoV2Params(key: "vat-tung", label: "våt tung",
		gapDegrees: 30, gapBearingDegrees: -52, rotationDegrees: -6,
		radiusFrac: 0.60, widthFrac: 0.215,
		entryW: 0.22, landingBulge: 0.26, bodyPeakT: 0.34, tailW: 0.38,
		streaks: 12, streakWidth: 0.60,
		dryBody: 0.12, dryTail: 0.50, dryStartT: 0.56, breakupScale: 7, edgeDry: 0.16,
		edgeFray: 0.24, tailBreaks: 2, tailRake: 0.4, overshoot: 0.06,
		wobbleAmp: 0.016, splatter: 1, splatterSpread: 0.035, seed: 71),

	// 3 — nesten brutt: medium mass, but the tail genuinely disintegrates into
	//     separated fingers + a few flung dabs; the ring almost falls apart at
	//     the release.
	EnsoV2Params(key: "nesten-brutt", label: "nesten brutt",
		gapDegrees: 34, gapBearingDegrees: -48, rotationDegrees: 8,
		radiusFrac: 0.62, widthFrac: 0.185,
		entryW: 0.16, landingBulge: 0.22, bodyPeakT: 0.28, tailW: 0.32,
		streaks: 10, streakWidth: 0.90,
		dryBody: 0.20, dryTail: 0.80, dryStartT: 0.46, breakupScale: 11, edgeDry: 0.26,
		edgeFray: 0.34, tailBreaks: 4, tailRake: 0.9, overshoot: 0.05,
		wobbleAmp: 0.022, splatter: 3, splatterSpread: 0.055, seed: 337),

	// 4 — rablet (joker): properly wet/raw calligraphy. A bigger radial wobble,
	//     a real overshoot flick past the gap, a heavily frayed rim and more
	//     splatter. The wildest one — betting it reads as HAND.
	EnsoV2Params(key: "rablet", label: "rablet (joker)",
		gapDegrees: 26, gapBearingDegrees: -46, rotationDegrees: 12,
		radiusFrac: 0.63, widthFrac: 0.20,
		entryW: 0.20, landingBulge: 0.32, bodyPeakT: 0.32, tailW: 0.34,
		streaks: 11, streakWidth: 0.82,
		dryBody: 0.22, dryTail: 0.70, dryStartT: 0.40, breakupScale: 12, edgeDry: 0.30,
		edgeFray: 0.46, tailBreaks: 4, tailRake: 1.0, overshoot: 0.12,
		wobbleAmp: 0.040, splatter: 3, splatterSpread: 0.075, seed: 999),
]

/// The v2 comparison grid: a banner, the v1 "tung" reference row, then each v2
/// variant as a row of [full 1024, downscaled] · [true 180px, 1:1]. The 180
/// cell is drawn at exact pixel size inside a faint frame — the honest hard test.
func renderGridV2(_ vs: [EnsoV2Params], ref: EnsoParams) -> CGImage {
	let cell: CGFloat = 500
	let colGap: CGFloat = 44
	let pad: CGFloat = 52
	let labelH: CGFloat = 58
	let rowGap: CGFloat = 30
	let banner: CGFloat = 130
	let colHead: CGFloat = 42

	let rows = vs.count + 1
	let W = Int(pad + cell + colGap + cell + pad)
	let H = Int(pad + banner + colHead + CGFloat(rows) * (cell + labelH + rowGap) + pad)
	let Hf = CGFloat(H)

	let cs = CGColorSpaceCreateDeviceRGB()
	let g = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8,
	                  bytesPerRow: 0, space: cs,
	                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	g.setAllowsAntialiasing(true); g.setShouldAntialias(true); g.interpolationQuality = .high
	g.setFillColor(pageCG); g.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: Hf))

	drawLabel(g, "ENSŌ v2 · blekkfysikk · #FFB000 på #0A0A0C", centerX: CGFloat(W) / 2,
	          baselineY: Hf - (pad + banner * 0.38), size: 30, color: pageFG)
	drawLabel(g, "blekkmasse + karvede tørrstriper · seed-styrt multi-oktav støy · dekning, ikke glød",
	          centerX: CGFloat(W) / 2, baselineY: Hf - (pad + banner * 0.72), size: 18, color: amberCG)

	let colAx = pad + cell / 2
	let colBx = pad + cell + colGap + cell / 2
	let rowMidX = pad + cell + colGap / 2
	let headTop = pad + banner
	drawLabel(g, "1024px", centerX: colAx, baselineY: Hf - (headTop + colHead * 0.5), size: 20, color: pageFG)
	drawLabel(g, "180px (1:1)", centerX: colBx, baselineY: Hf - (headTop + colHead * 0.5), size: 20, color: pageFG)

	func drawRow(_ index: Int, label: String, big: CGImage, small: CGImage) {
		let top = pad + banner + colHead + CGFloat(index) * (cell + labelH + rowGap)
		let aRect = CGRect(x: pad, y: Hf - (top + cell), width: cell, height: cell)
		g.draw(big, in: aRect)
		let bLeft = pad + cell + colGap
		let sSize: CGFloat = 180
		let bx = bLeft + (cell - sSize) / 2
		let byTop = top + (cell - sSize) / 2
		let bRect = CGRect(x: bx, y: Hf - (byTop + sSize), width: sSize, height: sSize)
		g.draw(small, in: bRect)
		g.setStrokeColor(CGColor(srgbRed: 1, green: 0xB0 / 255.0, blue: 0, alpha: 0.30))
		g.setLineWidth(1)
		g.stroke(bRect)
		drawLabel(g, label, centerX: rowMidX, baselineY: Hf - (top + cell + labelH * 0.62),
		          size: 26, color: amberCG)
	}

	drawRow(0, label: "v1 · tung pensel (ref)",
	        big: renderIcon(px: 1024, p: ref), small: renderIcon(px: 180, p: ref))
	for (i, p) in vs.enumerated() {
		drawRow(i + 1, label: p.label,
		        big: renderIconV2(px: 1024, p: p), small: renderIconV2(px: 180, p: p))
	}
	return g.makeImage()!
}

// MARK: - v3 · teletext mosaic (blokkgrafikk, ekte kvantisering)
//
//  v1 (smooth vector ribbon) and v2 (ink-physics bristles) were BOTH rejected as
//  "still too robot-made" — faux analogue calligraphy is a DEAD direction. v3
//  stops pretending to be a hand and lets the machine be a machine, with pride:
//  the ensō is drawn the way a REAL 1985 teletext page would have drawn it —
//  2×3-sixel block graphics, hard-quantised, no antialiasing, stair-stepped edges
//  as the POINT (not the flaw). Amber #FFB000 flat on #0A0A0C. No glow, no
//  gradient, no scanlines — just blocks that are ON or OFF.
//
//  Pipeline: an underlying ensō ring (v1/v2's variable-thickness arc, reused as
//  the source field) is THRESHOLDED onto a real subpixel grid → a boolean mosaic.
//  Ring thickness varies around the circle in WHOLE CELL STEPS (a heavier
//  "nedslag" drag, thinner toward the opening) — the calligrapher's dynamics
//  translated into block weight. The opening sits low/right; a hinted tail is
//  left as one or two free-standing block fragments (the flick).
//
//  Grid resolution divides 180 EXACTLY (18|180, 30|180) so the blocks are
//  knife-sharp at the 180px home-turf test. NB the four export sizes share no
//  common divisor beyond 4 (180 = 2²·3²·5, but 512/1024 = 2⁹/2¹⁰), so ONE grid
//  cannot land whole on all of them: 180 is honoured exactly, and 192/512/1024
//  snap each block edge to the nearest integer pixel (≤1px variance, still zero
//  antialiasing — crisp, just imperceptibly uneven at the big sizes).
//
//  Two teletext modes: contiguous (solid blocks that merge into shapes) and
//  separated (each block shrunk inside its cell, leaving the page between them →
//  the classic perforated dot texture).

struct EnsoV3Params {
	let key: String
	let label: String
	let grid: Int                  // N subpixels per axis — MUST divide 180
	let separated: Bool            // separated-mode gaps around each block
	let sepBlockFrac: Double        // block size as a fraction of the cell (separated)
	// ensō geometry (canvas normalised to [-1,1]; half-canvas = 1.0)
	let radiusFrac: Double         // centreline radius / half-canvas
	let gapDegrees: Double
	let gapBearingDegrees: Double   // math angle of the opening centre (-48 ≈ 4:30, low/right)
	let rotationDegrees: Double
	// thickness envelope, expressed in WHOLE CELLS (rounded → stepped weight)
	let entryCells: Double         // thickness at brush-down (stroke start, by the gap)
	let peakCells: Double          // heaviest drag
	let tailCells: Double          // thickness at the lifted tail (other side of the gap)
	let bodyPeakT: Double          // where along the stroke the drag is heaviest (0…1)
	// quantisation
	let coverThreshold: Double     // cell ON when supersampled coverage ≥ this
	let wobbleAmp: Double          // gentle radius wobble (small — the grid does the work)
	// tail: free-standing block fragments past the lift (the flick)
	let tailFragments: Int
	// joker: a partial second concentric band over the heavy arc
	let doubleBand: Bool
	let bandOffsetCells: Double     // radial offset of the 2nd band (in cells, outward)
	let bandStartT: Double
	let bandEndT: Double
	let bandCells: Double
	let seed: UInt64
}

let variantsV3: [EnsoV3Params] = [
	// 1 — grov-contiguous: the coarsest grid, few big blocks, the stair-step huge
	//     and unapologetic. 18|180 → 10px blocks at 180.
	EnsoV3Params(key: "grov-contig", label: "grov-contiguous",
		grid: 18, separated: false, sepBlockFrac: 0.70,
		radiusFrac: 0.60, gapDegrees: 42, gapBearingDegrees: -48, rotationDegrees: 6,
		entryCells: 1.6, peakCells: 3.0, tailCells: 1.0, bodyPeakT: 0.42,
		coverThreshold: 0.42, wobbleAmp: 0.010,
		tailFragments: 1,
		doubleBand: false, bandOffsetCells: 0, bandStartT: 0, bandEndT: 0, bandCells: 0,
		seed: 30140714),

	// 2 — fin-contiguous: a denser grid, so the ring reads rounder and the whole-
	//     cell thickness steps read as graded weight. 30|180 → 6px blocks at 180.
	EnsoV3Params(key: "fin-contig", label: "fin-contiguous",
		grid: 30, separated: false, sepBlockFrac: 0.70,
		radiusFrac: 0.62, gapDegrees: 36, gapBearingDegrees: -50, rotationDegrees: 4,
		entryCells: 2.2, peakCells: 4.2, tailCells: 1.2, bodyPeakT: 0.40,
		coverThreshold: 0.42, wobbleAmp: 0.012,
		tailFragments: 2,
		doubleBand: false, bandOffsetCells: 0, bandStartT: 0, bandEndT: 0, bandCells: 0,
		seed: 30240714),

	// 3 — separated: a bolder mid grid (20|180 → 9px cells) with every block shrunk
	//     inside its cell → the classic separated-graphics dot texture. Coarser than
	//     fin on purpose: the perforated ring must still read as a clean circle with
	//     a clear opening at icon size, not dissolve into a dot cloud.
	EnsoV3Params(key: "separert", label: "separated",
		grid: 20, separated: true, sepBlockFrac: 0.66,
		radiusFrac: 0.62, gapDegrees: 42, gapBearingDegrees: -50, rotationDegrees: 4,
		entryCells: 1.8, peakCells: 3.2, tailCells: 1.2, bodyPeakT: 0.40,
		coverThreshold: 0.42, wobbleAmp: 0.012,
		tailFragments: 2,
		doubleBand: false, bandOffsetCells: 0, bandStartT: 0, bandEndT: 0, bandCells: 0,
		seed: 30340714),

	// 4 — dobbel-rad (joker): asymmetric weight — a heavy body plus a partial
	//     SECOND concentric row over the "nedslag" arc that drops away toward the
	//     opening, where the ring thins to a single broken row. The wildest one.
	EnsoV3Params(key: "dobbel-rad", label: "dobbel-rad (joker)",
		grid: 30, separated: false, sepBlockFrac: 0.70,
		radiusFrac: 0.58, gapDegrees: 40, gapBearingDegrees: -46, rotationDegrees: 8,
		entryCells: 1.2, peakCells: 3.2, tailCells: 1.0, bodyPeakT: 0.48,
		coverThreshold: 0.42, wobbleAmp: 0.014,
		tailFragments: 2,
		doubleBand: true, bandOffsetCells: 3.0, bandStartT: 0.22, bandEndT: 0.66, bandCells: 1.4,
		seed: 30440714),
]

/// Thickness envelope in WHOLE CELLS: a soft brush-down, a heavy drag at
/// `bodyPeakT`, a thin lifted tail — then ROUNDED to an integer so the ring's
/// weight changes in visible whole-cell steps (never a smooth analogue taper).
func thickCellsV3(_ t: Double, _ p: EnsoV3Params) -> Double {
	let base: Double
	if t <= p.bodyPeakT {
		base = p.entryCells + (p.peakCells - p.entryCells) * smoothstep(t / max(1e-4, p.bodyPeakT))
	} else {
		base = p.peakCells - (p.peakCells - p.tailCells) * smoothstep((t - p.bodyPeakT) / max(1e-4, 1.0 - p.bodyPeakT))
	}
	return max(1.0, base.rounded())
}

/// Quantise the underlying ensō field onto an N×N boolean mosaic. A cell is ON
/// when its supersampled coverage of the ring ≥ threshold. Computed ONCE per
/// variant and rendered identically at every export size, so the mosaic pattern
/// is fixed — only the pixel scale changes.
func buildGridV3(_ p: EnsoV3Params) -> [[Bool]] {
	let N = p.grid
	let cellNorm = 2.0 / Double(N)
	var grid = Array(repeating: Array(repeating: false, count: N), count: N)
	let gap = p.gapDegrees * .pi / 180.0
	let sweep = TAU - gap
	let start = (p.gapBearingDegrees + p.rotationDegrees) * .pi / 180.0 + gap / 2.0
	let sRad = p.seed ^ 0xF00D

	func rAt(_ t: Double) -> Double {
		p.radiusFrac * (1.0 + p.wobbleAmp * sfbm(t * 2.3 + 1.5, sRad, octaves: 3))
	}
	// Membership of a normalised point in the (pre-quantisation) ensō field.
	func inField(_ x: Double, _ y: Double) -> Bool {
		let rho = sqrt(x * x + y * y)
		let theta = atan2(y, x)
		var d = (theta - start).truncatingRemainder(dividingBy: TAU)
		if d < 0 { d += TAU }
		if d > sweep { return false }              // inside the opening
		let t = d / sweep
		let R = rAt(t)
		let halfW = thickCellsV3(t, p) / 2.0 * cellNorm
		if abs(rho - R) <= halfW { return true }
		if p.doubleBand && t >= p.bandStartT && t <= p.bandEndT {
			let R2 = R + p.bandOffsetCells * cellNorm
			let halfW2 = p.bandCells / 2.0 * cellNorm
			if abs(rho - R2) <= halfW2 { return true }
		}
		return false
	}

	let ss = 3   // 3×3 supersampling per cell → a stable coverage threshold
	for j in 0..<N {
		for i in 0..<N {
			let cx0 = -1.0 + Double(i) * cellNorm
			let cy1 = 1.0 - Double(j) * cellNorm     // top edge of the cell (y up)
			var hits = 0
			for sj in 0..<ss {
				for si in 0..<ss {
					let x = cx0 + (Double(si) + 0.5) / Double(ss) * cellNorm
					let y = cy1 - (Double(sj) + 0.5) / Double(ss) * cellNorm
					if inField(x, y) { hits += 1 }
				}
			}
			if Double(hits) / Double(ss * ss) >= p.coverThreshold { grid[j][i] = true }
		}
	}

	// Tail fragments: 1–2 free-standing blocks just past the lift, stepping into
	// the opening and slightly outward — separated from the ring by empty cells.
	for k in 0..<p.tailFragments {
		let ang = start + sweep + Double(k + 1) * (gap * 0.20)
		let R = rAt(1.0) + (0.7 + Double(k) * 1.3) * cellNorm
		let x = R * cos(ang), y = R * sin(ang)
		let i = Int((x + 1.0) / cellNorm)
		let j = Int((1.0 - y) / cellNorm)
		if i >= 0 && i < N && j >= 0 && j < N { grid[j][i] = true }
	}
	return grid
}

/// A context with antialiasing OFF — block edges land hard on integer pixels.
func makeContextSharp(_ px: Int) -> CGContext {
	let cs = CGColorSpaceCreateDeviceRGB()
	let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8,
	                    bytesPerRow: 0, space: cs,
	                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	ctx.setAllowsAntialiasing(false)
	ctx.setShouldAntialias(false)
	ctx.interpolationQuality = .none
	return ctx
}

/// Paint the mosaic at a given size. Each ON cell is one flat-amber rectangle
/// with edges snapped to integer pixels (exact at 180, ≤1px snap elsewhere).
func renderIconV3(px: Int, grid: [[Bool]], p: EnsoV3Params) -> CGImage {
	let ctx = makeContextSharp(px)
	let f = CGFloat(px)
	ctx.setFillColor(pageCG)
	ctx.fill(CGRect(x: 0, y: 0, width: f, height: f))
	let N = grid.count
	ctx.setFillColor(amberCG)
	for j in 0..<N {
		for i in 0..<N where grid[j][i] {
			let x0 = (CGFloat(i) * f / CGFloat(N)).rounded()
			let x1 = (CGFloat(i + 1) * f / CGFloat(N)).rounded()
			let yTopPx = (CGFloat(j) * f / CGFloat(N)).rounded()       // measured from the top
			let yBotPx = (CGFloat(j + 1) * f / CGFloat(N)).rounded()
			var rx = x0, ry = f - yBotPx, rw = x1 - x0, rh = yBotPx - yTopPx
			if p.separated {
				let gx = max(CGFloat(1), ((rw * (1 - CGFloat(p.sepBlockFrac))) / 2).rounded())
				let gy = max(CGFloat(1), ((rh * (1 - CGFloat(p.sepBlockFrac))) / 2).rounded())
				rx += gx; ry += gy; rw -= 2 * gx; rh -= 2 * gy
			}
			if rw > 0 && rh > 0 { ctx.fill(CGRect(x: rx, y: ry, width: rw, height: rh)) }
		}
	}
	return ctx.makeImage()!
}

/// The v3 comparison grid: a banner, then each variant as a row of
/// [full 1024, nearest-neighbour] · [true 180px, 1:1]. Nearest-neighbour scaling
/// keeps the preview blocky; the 180 cell is the honest hard test.
func renderGridV3(_ vs: [EnsoV3Params]) -> CGImage {
	let cell: CGFloat = 500
	let colGap: CGFloat = 44
	let pad: CGFloat = 52
	let labelH: CGFloat = 58
	let rowGap: CGFloat = 30
	let banner: CGFloat = 130
	let colHead: CGFloat = 42

	let rows = vs.count
	let W = Int(pad + cell + colGap + cell + pad)
	let H = Int(pad + banner + colHead + CGFloat(rows) * (cell + labelH + rowGap) + pad)
	let Hf = CGFloat(H)

	let cs = CGColorSpaceCreateDeviceRGB()
	let g = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8,
	                  bytesPerRow: 0, space: cs,
	                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	g.interpolationQuality = .none
	g.setShouldAntialias(true)
	g.setFillColor(pageCG); g.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: Hf))

	drawLabel(g, "ENSŌ v3 · teletext-mosaikk · #FFB000 på #0A0A0C", centerX: CGFloat(W) / 2,
	          baselineY: Hf - (pad + banner * 0.38), size: 30, color: pageFG)
	drawLabel(g, "ekte 2×3-sixel kvantisering · blokk PÅ/AV · hele-celle tykkelsessteg · knivskarp på 180",
	          centerX: CGFloat(W) / 2, baselineY: Hf - (pad + banner * 0.72), size: 17, color: amberCG)

	let colAx = pad + cell / 2
	let colBx = pad + cell + colGap + cell / 2
	let rowMidX = pad + cell + colGap / 2
	let headTop = pad + banner
	drawLabel(g, "1024px", centerX: colAx, baselineY: Hf - (headTop + colHead * 0.5), size: 20, color: pageFG)
	drawLabel(g, "180px (1:1)", centerX: colBx, baselineY: Hf - (headTop + colHead * 0.5), size: 20, color: pageFG)

	for (index, p) in vs.enumerated() {
		let grid = buildGridV3(p)
		let big = renderIconV3(px: 1024, grid: grid, p: p)
		let small = renderIconV3(px: 180, grid: grid, p: p)
		let top = pad + banner + colHead + CGFloat(index) * (cell + labelH + rowGap)
		g.setShouldAntialias(false)
		let aRect = CGRect(x: pad, y: Hf - (top + cell), width: cell, height: cell)
		g.draw(big, in: aRect)
		let bLeft = pad + cell + colGap
		let sSize: CGFloat = 180
		let bx = bLeft + (cell - sSize) / 2
		let byTop = top + (cell - sSize) / 2
		let bRect = CGRect(x: bx, y: Hf - (byTop + sSize), width: sSize, height: sSize)
		g.draw(small, in: bRect)
		g.setShouldAntialias(true)
		g.setStrokeColor(CGColor(srgbRed: 1, green: 0xB0 / 255.0, blue: 0, alpha: 0.30))
		g.setLineWidth(1); g.stroke(bRect)
		drawLabel(g, p.label, centerX: rowMidX, baselineY: Hf - (top + cell + labelH * 0.62),
		          size: 26, color: amberCG)
	}
	return g.makeImage()!
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

// --- v2 (ink physics) -------------------------------------------------------
// Full size set per variant under variants/v2-<key>/, plus the v2 review grid
// (with the v1 "tung" reference row). Nothing live is touched — wiring waits
// for the owner's choice.
for p in variantsV2 {
	let dir = outBase.appendingPathComponent("variants").appendingPathComponent("v2-\(p.key)")
	try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
	for size in iconSizes {
		let url = dir.appendingPathComponent("enso-\(size).png")
		writePNG(renderIconV2(px: size, p: p), to: url)
		written += 1
	}
	print("  v2-\(p.key): \(iconSizes.map { "\($0)" }.joined(separator: "/")) px")
}

let tungRef = variants.first { $0.key == "tung" }!
let gridV2URL = outBase.appendingPathComponent("enso-v2-varianter.png")
writePNG(renderGridV2(variantsV2, ref: tungRef), to: gridV2URL)
written += 1

// --- v3 (teletext mosaic) ---------------------------------------------------
// The chosen direction — the owner picked v3-grov-contig (shipped as the app/PWA
// icon, see header). Full size set per variant under variants/v3-<key>/, plus
// the v3 review grid. Nothing live is touched by running this script.
for p in variantsV3 {
	let grid = buildGridV3(p)
	let dir = outBase.appendingPathComponent("variants").appendingPathComponent("v3-\(p.key)")
	try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
	for size in iconSizes {
		let url = dir.appendingPathComponent("enso-\(size).png")
		writePNG(renderIconV3(px: size, grid: grid, p: p), to: url)
		written += 1
	}
	print("  v3-\(p.key): \(iconSizes.map { "\($0)" }.joined(separator: "/")) px")
}

let gridV3URL = outBase.appendingPathComponent("enso-v3-varianter.png")
writePNG(renderGridV3(variantsV3), to: gridV3URL)
written += 1

print("\nWrote \(written) PNG(s) under \(outBase.path)")
print("Review grid (v1): \(gridURL.path)")
print("Review grid (v2): \(gridV2URL.path)")
print("Review grid (v3): \(gridV3URL.path)")
