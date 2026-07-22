//
//  EntityIdentity.swift
//  Sportivista
//
//  WP-185 — the per-ENTITY visual anchor on an agenda row (Swift twin of
//  docs/js/entity-avatar.js). The owner's finding 21.07: the board "er litt for
//  anonym og kjedelig … vi mangler blant annet logoer/flagg". The row was pure
//  text, and the WP-108 sport symbol names the SPORT, never the entity.
//
//  So every row now carries ONE quiet anchor, built from metadata we own and
//  drawn LOCALLY — no image request, ever:
//
//    1. FLAG      — athletes + national teams, from the registry's ISO country.
//                   An emoji: zero assets, zero rights, scales with Dynamic Type.
//    2. MONOGRAM  — clubs/orgs: the club's two registered colours + 1–2 initials
//                   (the Kontakter/Kalender idiom), rendered by EntityAvatarView.
//                   NEVER a crest — club crests are trademarks (PLAN WP-185 ikke-mål).
//    3. .none     — the honest fallback: the caller keeps the sport glyph. No empty
//                   hole, no invented colour.
//
//  Pure Swift on purpose (no SwiftUI/UIKit): this file lands in the app, the
//  WIDGET and the test bundle via `path: Sportivista/Models` in project.yml, so it
//  must not drag a UI framework into the widget. The SwiftUI drawing lives in
//  Agenda/EntityAvatarView.swift.
//
//  Calm invariants (DESIGN.md § Entitets-avatar):
//   • at most ONE coloured avatar surface per row;
//   • the avatar is the ENTITY's colours — amber remains the app's single accent
//     and is never used here;
//   • monogram ink is COMPUTED from luminance, never hardcoded white (half the
//     clubs in the register play in white).
//

import Foundation

/// What an agenda row draws in its identity column.
enum EntityIdentity: Equatable, Hashable, Sendable {
    /// A country flag emoji ("🇳🇴") — athletes and national teams.
    case flag(String)
    /// 1–2 initials over the entity's own two colours (packed 0xRRGGBB).
    case monogram(initials: String, primary: UInt32, secondary: UInt32, inkIsLight: Bool)
    /// Nothing known — the caller falls back to the sport symbol.
    case none

    var isNone: Bool { self == .none }
}

enum EntityIdentityResolver {
    // MARK: - Flags

    /// The UK home nations have no alpha-2 code but DO have RGI emoji flags built
    /// from tag sequences. Sport treats them as countries, so an England row must
    /// not fly a Union Jack. Northern Ireland has no RGI sequence and is
    /// deliberately absent — no flag beats a wrong flag.
    private static let tagFlags: [String: String] = [
        "GB-ENG": "gbeng",
        "GB-SCT": "gbsct",
        "GB-WLS": "gbwls",
    ]

    /// ISO 3166 code → flag emoji, or nil when we can't render one honestly.
    static func flagEmoji(_ iso: String?) -> String? {
        let code = (iso ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        if let tags = tagFlags[code] {
            var s = String(UnicodeScalar(0x1F3F4)!)
            for ch in tags.unicodeScalars {
                guard let scalar = UnicodeScalar(0xE0000 + ch.value) else { return nil }
                s.unicodeScalars.append(scalar)
            }
            s.unicodeScalars.append(UnicodeScalar(0xE007F)!)
            return s
        }
        guard code.count == 2, code.allSatisfy({ $0.isASCII && $0.isUppercase }) else { return nil }
        var flag = ""
        for ch in code.unicodeScalars {
            guard let scalar = UnicodeScalar(0x1F1E6 + ch.value - 65) else { return nil }
            flag.unicodeScalars.append(scalar)
        }
        return flag
    }

    // MARK: - Monogram

    /// Club-form tokens that carry no identity ("AFC Bournemouth" is "Bournemouth").
    /// Dropped only when at least one real word survives.
    private static let clubNoise: Set<String> = ["fc", "afc", "cf", "ac", "sc", "bk", "fk", "if", "il", "sk", "ik", "hk", "kfum", "club", "klubb"]

    /// 1–2 uppercase initials — the Kontakter rule (first word + last word).
    static func monogramInitials(_ name: String) -> String {
        let cleaned = name.replacingOccurrences(of: "[()\\[\\]{}\"'’.]", with: " ", options: .regularExpression)
        let words = cleaned.split(whereSeparator: { $0.isWhitespace || $0 == "-" || $0 == "–" || $0 == "—" || $0 == "/" }).map(String.init)
        let real = words.filter { !clubNoise.contains($0.lowercased()) }
        let use = real.isEmpty ? words : real
        guard let first = use.first else { return "" }
        if use.count == 1 { return String(first.prefix(1)).uppercased() }
        return (String(first.prefix(1)) + String(use[use.count - 1].prefix(1))).uppercased()
    }

    /// `#rrggbb` → the packed 0xRRGGBB value, or nil when it isn't canonical hex.
    /// Strict on purpose: the pipeline normalises (registry.schema.json enforces
    /// the pattern), so anything else is a corrupt cache, not a colour.
    static func packedHex(_ hex: String?) -> UInt32? {
        guard var s = hex?.trimmingCharacters(in: .whitespaces).lowercased() else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, s.allSatisfy({ $0.isHexDigit }) else { return nil }
        return UInt32(s, radix: 16)
    }

    /// sRGB relative luminance (WCAG 2.x) of a packed colour, 0…1.
    static func luminance(_ packed: UInt32) -> Double {
        let channels = [(packed >> 16) & 0xFF, (packed >> 8) & 0xFF, packed & 0xFF].map { v -> Double in
            let c = Double(v) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }

    /// True when WHITE ink wins the WCAG contrast comparison against the fill.
    /// Judged on the MEAN luminance of both fills, because the initials straddle
    /// the diagonal split. Never hardcoded — Rosenborg's white kit needs black ink.
    static func inkIsLight(primary: UInt32, secondary: UInt32) -> Bool {
        let l = (luminance(primary) + luminance(secondary)) / 2
        let contrast = { (other: Double) in (max(l, other) + 0.05) / (min(l, other) + 0.05) }
        return contrast(1.0) > contrast(0.0)
    }

    // MARK: - The ladder

    /// An entity → its row identity. The FLAG wins over the monogram: a national
    /// team carries both a country and (from ESPN) kit colours, and the country's
    /// flag is the truer anchor. A CLUB with a `country` but no `national` (Wikidata
    /// stamps P17 on Norwegian handball clubs) must NOT fly that flag — hence the
    /// explicit gate.
    static func identity(for entity: Entity?) -> EntityIdentity {
        guard let entity else { return .none }
        if entity.type == "athlete" || entity.national, let flag = flagEmoji(entity.country) {
            return .flag(flag)
        }
        if let primary = packedHex(entity.colors?.primary) {
            let secondary = packedHex(entity.colors?.secondary) ?? primary
            let initials = monogramInitials(entity.name)
            if !initials.isEmpty {
                return .monogram(initials: initials, primary: primary, secondary: secondary,
                                 inkIsLight: inkIsLight(primary: primary, secondary: secondary))
            }
        }
        return .none
    }
}

/// A cheap, build-once lookup from an event's team/participant NAMES to the
/// entities that actually carry identity metadata.
///
/// Why not reuse `EntityIndex.servedEntity`: that is a fuzzy, scored resolver
/// over the whole ~3 700-entity index, and calling it per row per reload is
/// exactly the at-scale trap WP-161 already paid for once (per-instance index
/// builds / linear scans blew the runner budget). This is O(n) once per compile
/// and O(1) per row, and it only indexes entities that HAVE an avatar to give.
struct EntityIdentityIndex: Sendable {
    private let byId: [String: Entity]
    private let byName: [String: Entity]

    init(_ entities: [Entity]) {
        var ids: [String: Entity] = [:]
        var names: [String: Entity] = [:]
        for e in entities {
            let hasFlag = e.country != nil && (e.type == "athlete" || e.national)
            let hasColors = e.colors?.primary != nil
            guard hasFlag || hasColors else { continue }
            ids[e.id] = e
            for term in [e.name] + e.aliases {
                let key = TextMatch.normalize(term)
                if !key.isEmpty && names[key] == nil { names[key] = e }
            }
        }
        byId = ids
        byName = names
    }

    var isEmpty: Bool { byId.isEmpty }

    func entity(id: String?) -> Entity? {
        guard let id, !id.isEmpty else { return nil }
        return byId[id]
    }

    func entity(name: String?) -> Entity? {
        guard let name else { return nil }
        let key = TextMatch.normalize(name)
        return key.isEmpty ? nil : byName[key]
    }

    /// The ONE entity a row is anchored on (DESIGN § Entitets-avatar: max one
    /// coloured surface per row). Order: the server's own stamped ids first
    /// (authoritative), then the team names, then a Norwegian player, then a named
    /// participant. The AWAY team is tried too — on a board built for a Norwegian
    /// fan the away side is often the one they came for ("Universitatea Cluj –
    /// Brann"). `.none` when nothing resolves.
    func identity(for event: Event) -> EntityIdentity {
        guard !isEmpty else { return .none }
        let resolved = entity(id: event.homeTeamEntityId)
            ?? entity(id: event.awayTeamEntityId)
            ?? entity(name: event.homeTeam)
            ?? entity(name: event.awayTeam)
            ?? event.norwegianPlayers.lazy.compactMap { entity(id: $0.entityId) }.first
            ?? event.norwegianPlayers.lazy.compactMap { entity(name: $0.name) }.first
            ?? event.participants.lazy.compactMap { entity(name: $0.name) }.first
        return EntityIdentityResolver.identity(for: resolved)
    }
}
