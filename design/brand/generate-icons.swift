#!/usr/bin/env swift
//
//  generate-icons.swift
//  Sportivista — kolonet app-icon / web-icon generator (WP-97 · Design-biblioteket)
//
//  Renders the kolonet mark (design/brand/kolonet.svg — two amber #FFB000
//  filled circles stacked vertically) onto a square canvas at any size, with
//  an opaque background colour (or transparent, for a source-vector-style
//  export). This is the CHECKED-IN, parametrised replacement for the
//  icon-generation script that previously only ever existed in a session
//  scratchpad (WP-97 finding: the mark could not be regenerated from the
//  repo before this file).
//
//  Geometry is fixed at a 1024×1024 reference frame (verified pixel-for-pixel
//  against the shipped ios/Sportivista/Assets.xcassets/AppIcon.appiconset/
//  AppIcon-1024.png — see the PR for the inspection transcript):
//    - radius = 118          (both circles, same size)
//    - gap    = 168          (vertical, edge-to-edge, between the two circles)
//    - both circles centred on x = 512; the PAIR is vertically centred on the
//      canvas (y = 512), so top circle cy = 310, bottom circle cy = 714 at 1024.
//  Every other size scales both numbers by the same fraction of 1024, so the
//  mark is proportionally identical at every export size.
//
//  Usage — single file:
//    swift design/brand/generate-icons.swift <output.png> <sizePx> [background]
//      <output.png>  path to write
//      <sizePx>      integer canvas size (square)
//      [background]  "#RRGGBB" (default "#000000", opaque) or the literal
//                    word "transparent" (alpha 0 — the source-vector look)
//
//  Usage — regenerate the whole shipped set into a scratch directory (never
//  writes into ios/ or docs/ directly — copy the outputs yourself after
//  reviewing them, the same never-write-into-the-tree convention the icon
//  tooling has always used):
//    swift design/brand/generate-icons.swift --all <outDir>
//  writes, all on #000000 opaque background:
//    <outDir>/AppIcon-1024.png   (1024 — iOS app icon)
//    <outDir>/icon-512x512.png   (512  — PWA)
//    <outDir>/icon-192x192.png   (192  — PWA / favicon)
//    <outDir>/icon-180x180.png   (180  — apple-touch-icon)
//    <outDir>/favicon.png        (192  — same render as icon-192x192.png)
//
//  Usage — the three iOS 18 app-icon appearances (WP-180):
//    swift design/brand/generate-icons.swift --appicon-variants <outDir>
//  writes AppIcon-1024.png (amber on #000000), AppIcon-1024-dark.png (amber on
//  transparent — iOS supplies the dark plate) and AppIcon-1024-tinted.png
//  (greyscale on transparent — the system tints through the luminance). All three
//  share the geometry below, so a variant can never drift from the light icon.
//
//  Verification (documented in the WP-97 PR): the 1024 output was compared
//  against ios/Sportivista/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
//  pixel-by-pixel (max per-channel delta reported) rather than assumed
//  byte-identical, since the original generating script is unrecoverable and
//  PNG encoders + antialiasing rounding are not guaranteed bit-reproducible
//  across tool versions.
//

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// MARK: - Geometry (design/brand/kolonet.svg, 1024×1024 reference frame)

let referenceFrame: Double = 1024
let radiusAtReference: Double = 118
let gapAtReference: Double = 168 // vertical, edge-to-edge, between the two circles

let amberCG = CGColor(srgbRed: 0xFF / 255.0, green: 0xB0 / 255.0, blue: 0x00 / 255.0, alpha: 1.0) // #FFB000

/// The grey the tinted app-icon variant uses for the dots (WP-180). iOS' tinted
/// appearance reads the artwork as LUMINANCE and paints the user's tint through
/// it, so the mark must be greyscale — but it should keep the amber's own weight
/// rather than an arbitrary grey. This is #FFB000's Rec.709 luma computed on the
/// encoded sRGB bytes: 0.2126·255 + 0.7152·176 + 0.0722·0 ≈ 180 → #B4B4B4.
let tintedGreyCG = CGColor(srgbRed: 0xB4 / 255.0, green: 0xB4 / 255.0, blue: 0xB4 / 255.0, alpha: 1.0)

// MARK: - Argument parsing

func fail(_ message: String) -> Never {
	FileHandle.standardError.write("generate-icons: \(message)\n".data(using: .utf8)!)
	exit(1)
}

func parseBackground(_ raw: String) -> CGColor? {
	if raw.lowercased() == "transparent" { return nil }
	var hex = raw
	if hex.hasPrefix("#") { hex.removeFirst() }
	guard hex.count == 6, let value = UInt32(hex, radix: 16) else {
		fail("invalid background \"\(raw)\" — expected \"#RRGGBB\" or \"transparent\"")
	}
	let r = Double((value >> 16) & 0xFF) / 255.0
	let g = Double((value >> 8) & 0xFF) / 255.0
	let b = Double(value & 0xFF) / 255.0
	return CGColor(srgbRed: r, green: g, blue: b, alpha: 1.0)
}

// MARK: - Rendering

/// Render the kolonet mark at `size` px onto `background` (nil = transparent),
/// in `foreground` (default: the amber #FFB000 of the source vector).
func renderKolonet(size: Int, background: CGColor?, foreground: CGColor = amberCG) -> CGImage {
	let cs = CGColorSpaceCreateDeviceRGB()
	let ctx = CGContext(
		data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
		space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
	)!
	ctx.setAllowsAntialiasing(true)
	ctx.setShouldAntialias(true)
	ctx.interpolationQuality = .high

	let f = Double(size)
	if let background {
		ctx.setFillColor(background)
		ctx.fill(CGRect(x: 0, y: 0, width: f, height: f))
	}

	let radiusFrac = radiusAtReference / referenceFrame
	let gapFrac = gapAtReference / referenceFrame
	let r = f * radiusFrac
	let g = f * gapFrac
	let centerToCenter = g + 2 * r
	let cx = f / 2
	let topCY = f / 2 - centerToCenter / 2
	let bottomCY = f / 2 + centerToCenter / 2

	ctx.setFillColor(foreground)
	ctx.fillEllipse(in: CGRect(x: cx - r, y: topCY - r, width: 2 * r, height: 2 * r))
	ctx.fillEllipse(in: CGRect(x: cx - r, y: bottomCY - r, width: 2 * r, height: 2 * r))

	return ctx.makeImage()!
}

func writePNG(_ image: CGImage, to url: URL) {
	guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
		fail("could not create PNG destination at \(url.path)")
	}
	CGImageDestinationAddImage(dest, image, nil)
	guard CGImageDestinationFinalize(dest) else {
		fail("could not finalize PNG at \(url.path)")
	}
}

// MARK: - Main

let args = CommandLine.arguments

if args.count >= 2, args[1] == "--all" {
	guard args.count >= 3 else { fail("--all requires <outDir>") }
	let outDir = URL(fileURLWithPath: args[2])
	try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
	let black = parseBackground("#000000")
	let sizes: [(name: String, size: Int)] = [
		("AppIcon-1024.png", 1024),
		("icon-512x512.png", 512),
		("icon-192x192.png", 192),
		("icon-180x180.png", 180),
		("favicon.png", 192),
	]
	for (name, size) in sizes {
		let image = renderKolonet(size: size, background: black)
		writePNG(image, to: outDir.appendingPathComponent(name))
		print("  \(name): \(size)x\(size)")
	}
	print("\nWrote \(sizes.count) PNG(s) under \(outDir.path)")
	exit(0)
}

// WP-180 — the three iOS 18 app-icon appearances, rendered from the SAME geometry
// so the variants can never drift from the light one (or from kolonet.svg).
//   AppIcon-1024.png         light/any: amber dots on opaque #000000 (unchanged)
//   AppIcon-1024-dark.png    dark:      amber dots on TRANSPARENT — iOS composites
//                                       them over its own dark icon background, so
//                                       shipping our own black plate would double it
//   AppIcon-1024-tinted.png  tinted:    greyscale dots on transparent — the system
//                                       paints the user's tint through the luminance
if args.count >= 2, args[1] == "--appicon-variants" {
	guard args.count >= 3 else { fail("--appicon-variants requires <outDir>") }
	let outDir = URL(fileURLWithPath: args[2])
	try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
	let variants: [(name: String, background: CGColor?, foreground: CGColor)] = [
		("AppIcon-1024.png", parseBackground("#000000"), amberCG),
		("AppIcon-1024-dark.png", nil, amberCG),
		("AppIcon-1024-tinted.png", nil, tintedGreyCG),
	]
	for (name, background, foreground) in variants {
		let image = renderKolonet(size: 1024, background: background, foreground: foreground)
		writePNG(image, to: outDir.appendingPathComponent(name))
		print("  \(name): 1024x1024")
	}
	print("\nWrote \(variants.count) app-icon appearance(s) under \(outDir.path)")
	exit(0)
}

guard args.count >= 3 else {
	fail(
		"""
		usage:
		  swift generate-icons.swift <output.png> <sizePx> [background]
		  swift generate-icons.swift --all <outDir>
		  swift generate-icons.swift --appicon-variants <outDir>
		"""
	)
}

let outputPath = args[1]
guard let sizePx = Int(args[2]), sizePx > 0 else { fail("sizePx must be a positive integer, got \"\(args[2])\"") }
let backgroundArg = args.count >= 4 ? args[3] : "#000000"
let background = parseBackground(backgroundArg)

let image = renderKolonet(size: sizePx, background: background)
writePNG(image, to: URL(fileURLWithPath: outputPath))
print("wrote \(outputPath) (\(sizePx)x\(sizePx), background \(backgroundArg))")
