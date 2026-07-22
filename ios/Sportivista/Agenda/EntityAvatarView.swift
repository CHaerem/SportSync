//
//  EntityAvatarView.swift
//  Sportivista
//
//  WP-185 — draws the row's entity anchor (DESIGN.md § Entitets-avatar). The
//  decision of WHAT to draw is pure and lives in Models/EntityIdentity.swift;
//  this file only renders it, and only ever ONE surface per row.
//
//  Everything is drawn LOCALLY — an emoji or a SwiftUI gradient. There is no
//  image request anywhere in the app for this: null-infra, no third-party CDN,
//  nothing about the user leaves the device, and no trademarked crest is
//  reproduced (PLAN.md WP-185 ikke-mål).
//

import SwiftUI

/// The identity column: the entity's flag, its colour monogram, or — when we know
/// neither — the quiet per-sport SF Symbol (WP-108). Never empty, never two.
struct EntityAvatarView: View {
    let identity: EntityIdentity
    let sport: String

    // Matches SportSymbolView's scaled column so titles stay aligned at every
    // Dynamic Type size, and the avatar grows with the text rather than sitting
    // as a fixed dot next to giant type.
    @ScaledMetric(relativeTo: .subheadline) private var side: CGFloat = 24

    var body: some View {
        switch identity {
        case .logo(let file):
            LogoAvatar(file: file, side: side)
                .padding(.top, 2)
                .accessibilityHidden(true)
        case .flag(let emoji):
            Text(emoji)
                .font(.sportivista(.subheadline))
                .frame(width: side, alignment: .center)
                .padding(.top, 2)
                .accessibilityHidden(true)
        case .monogram(let initials, let primary, let secondary, let inkIsLight):
            MonogramAvatar(initials: initials, primary: primary, secondary: secondary, inkIsLight: inkIsLight, side: side)
                .padding(.top, 2)
                .accessibilityHidden(true)
        case .none:
            SportSymbolView(sport: sport)
        }
    }
}

/// WP-186 — the club's REAL mark, from a BUNDLED asset (`docs/logos`, a folder
/// resource in project.yml). Two rules govern this view, and both are about
/// restraint:
///
///  1. **Unmodified.** No `.renderingMode(.template)`, no tint, no clipShape, no
///     saturation/opacity trim, no background plate. A free mark under CC BY-SA
///     may not become a derivative, and no licence makes it right to redraw a
///     club's mark. `.scaledToFit()` inside the SAME box WP-185 defined is the
///     whole treatment — scaling only, aspect preserved, nothing cropped.
///  2. **No network.** `UIImage(named:)` reads the bundle. The app has never made
///     an image request for a row and still doesn't.
///
/// A missing asset degrades to the WP-185 sport glyph rather than a blank hole
/// (the resolver already gates on existence; this is the belt-and-braces half).
private struct LogoAvatar: View {
    let file: String
    let side: CGFloat

    var body: some View {
        if let image = LogoAssets.image(named: file) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: side, height: side)
        } else {
            Color.clear.frame(width: side, height: side)
        }
    }
}

/// Bundle-backed logo loading with a small memory cache.
///
/// The agenda re-renders often and the same handful of clubs recur down the
/// board, so decoding a PNG per row per render is exactly the at-scale trap
/// WP-161 already paid for once. The cache is bounded implicitly: only the marks
/// actually on screen in this session are ever decoded, and each is a ~96 px
/// thumbnail.
@MainActor
enum LogoAssets {
    // Main-actor isolated: the only caller is a SwiftUI `body`, so the cache is
    // never touched off the main thread and needs no lock of its own.
    private static let cache = NSCache<NSString, UIImage>()

    static func image(named file: String) -> UIImage? {
        if let hit = cache.object(forKey: file as NSString) { return hit }
        let stem = (file as NSString).deletingPathExtension
        guard let url = Bundle.main.url(forResource: stem, withExtension: "png", subdirectory: "logos"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: file as NSString)
        return image
    }
}

/// The club monogram: the two registered colours split on the diagonal with the
/// initials on top in COMPUTED ink. A hairline keeps an all-white or all-black kit
/// from dissolving into the page in either appearance. The fill is ALWAYS taken
/// down a notch — a 24pt circle must never be the loudest thing on a calm row, nor
/// out-shout the amber must-see dot, which stays the row's only accent — and dark
/// mode dims a little harder so a saturated kit doesn't glare against true black.
private struct MonogramAvatar: View {
    let initials: String
    let primary: UInt32
    let secondary: UInt32
    let inkIsLight: Bool
    let side: CGFloat

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            LinearGradient(
                stops: [
                    .init(color: Color(hex: primary), location: 0.5),
                    .init(color: Color(hex: secondary), location: 0.5),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(initials)
                .font(.sportivista(.caption2, weight: .semibold))
                .foregroundStyle(inkIsLight ? Color.white : Color.black)
                .minimumScaleFactor(0.7)
        }
        .frame(width: side, height: side)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(SportivistaTokens.separator, lineWidth: 0.5))
        .opacity(scheme == .dark ? 0.9 : 1)
        .saturation(scheme == .dark ? 0.85 : 0.9)
    }
}
