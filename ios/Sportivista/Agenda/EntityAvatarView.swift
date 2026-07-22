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
