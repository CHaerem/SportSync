//
//  TextMatch.swift
//  Zenji
//
//  WP-13 — the single most correctness-critical port. These are bit-faithful
//  Swift ports of the SERVER text matchers in scripts/lib/helpers.js
//  (`normalizeText`, `containsName`) — the diacritic-insensitive,
//  word-boundary containment used by relevance (unscoped) and the reminder
//  bell (sport-scoped). Kept as pure, side-effect-free functions so they are
//  unit-testable in isolation and give identical answers to the JS for every
//  golden feed-vector input.
//
//  IMPORTANT — two DIFFERENT matchers coexist by design (DIVERGENCES.md §2):
//    • SERVER matching (this file: `normalize` + `containsName`) folds
//      diacritics ("Barça" ≡ "Barca") AND requires word boundaries ("Lyn"
//      matches "Lyn Oslo"/"Vålerenga-Lyn" but NOT "Brooklyn").
//    • CLIENT accent matching (FeedCompiler.isMustSee) uses a NAIVE plain
//      `lowercased()` + substring `contains` — no diacritic folding, no word
//      boundaries — so it fires on "Brooklyn".contains("lyn"). That naive
//      behaviour is PINNED, so it lives inline in isMustSee and must NOT be
//      routed through this file.
//

import Foundation

enum TextMatch {

    /// Port of server `normalizeText` (helpers.js:69): NFD-decompose, strip
    /// every Unicode Mark (JS `/\p{M}/gu` == general categories Mn/Mc/Me),
    /// then lowercase — in that order.
    ///
    /// - "Barça" → "barca"  (ç → c + combining cedilla, mark stripped)
    /// - "Vålerenga" → "valerenga" (å → a + combining ring, mark stripped)
    /// - "Tromsø" → "tromsø"  (ø has no canonical decomposition — stays, as
    ///   in JS; parity holds even though it is not vector-exercised)
    static func normalize(_ s: String?) -> String {
        guard let s = s, !s.isEmpty else { return "" }
        let decomposed = s.decomposedStringWithCanonicalMapping // NFD
        var scalars = String.UnicodeScalarView()
        for scalar in decomposed.unicodeScalars {
            switch scalar.properties.generalCategory {
            case .nonspacingMark, .spacingMark, .enclosingMark:
                continue // JS: .replace(/\p{M}/gu, "")
            default:
                scalars.append(scalar)
            }
        }
        return String(scalars).lowercased()
    }

    /// Port of the JS metacharacter escape `/[.*+?^${}()|[\]\\]/g` — the exact
    /// same character set the reference escapes before building its RegExp, so
    /// a name containing a regex special is treated literally, identically.
    static func escapeRegex(_ s: String) -> String {
        let specials: Set<Character> = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]
        var out = ""
        out.reserveCapacity(s.count)
        for ch in s {
            if specials.contains(ch) { out.append("\\") }
            out.append(ch)
        }
        return out
    }

    /// Port of server `containsName` (helpers.js:81): word-boundary,
    /// accent-insensitive containment. Both sides are `normalize`d first, then
    /// the name is matched with the boundary regex
    /// `(?:^|[^\p{L}\p{N}])<name>(?:[^\p{L}\p{N}]|$)`.
    ///
    /// "Lyn" matches "Lyn Oslo" and "Vålerenga – Lyn" but NOT "Brooklyn" —
    /// boundaries kill the substring false-positive class.
    static func containsName(_ haystack: String, _ name: String) -> Bool {
        let n = normalize(name).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return false }
        let h = normalize(haystack)
        let pattern = "(?:^|[^\\p{L}\\p{N}])\(escapeRegex(n))(?:[^\\p{L}\\p{N}]|$)"
        // ICU (NSRegularExpression) supports \p{L}/\p{N}; case-insensitive is
        // redundant after normalize() but matches the JS "iu" flags exactly.
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return false
        }
        let range = NSRange(h.startIndex..., in: h)
        return re.firstMatch(in: h, options: [], range: range) != nil
    }
}
