//
//  ProfileQRCode.swift
//  Sportivista
//
//  WP-19 — the QR image for the "Del profil" flow. A thin CoreImage wrapper: the
//  actual payload/merge logic lives in ProfileShareCodec (pure, Foundation-only);
//  this only turns a string into a crisp, monochrome QR bitmap.
//
//  Kept deliberately small and side-effect-free (a string in, an image out) so
//  it is testable in the Simulator/CI without a camera or an iCloud account.
//  Rendered as pure black modules on a clear background; the SwiftUI view tints
//  it to the page's ink token so it reads as part of the page surface rather
//  than a glossy sticker.
//

import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

enum ProfileQRCode {
    /// WP-62 — one shared `CIContext` for every QR render. A `CIContext` is
    /// expensive to build (it spins up a Metal/CoreImage pipeline), so making a
    /// fresh one per render was a real jank source; it is stateless and
    /// thread-safe to reuse, so a single static instance serves the whole app.
    private static let ciContext = CIContext()

    /// A monochrome QR image encoding `string`, upscaled by `scale` with nearest-
    /// neighbour so the modules stay razor-sharp (never blurred). `nil` only if
    /// CoreImage can't build the code (e.g. an empty string).
    static func image(for string: String, scale: CGFloat = 10) -> UIImage? {
        guard !string.isEmpty else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        // "M" = ~15% error correction — comfortable for a screen-to-camera scan
        // without bloating the module count for a large payload.
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }

        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = ciContext.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
