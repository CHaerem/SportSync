//
//  CoverageRequest.swift
//  Sportivista
//
//  WP-165 — the demand signal. A soft-follow of something OUTSIDE the catalog
//  («Følg likevel») must not be «fulgt men dødt for alltid»: the server should
//  FIND OUT the demand exists. This builds the PRE-FILLED, PUBLIC GitHub issue a
//  calm optional tap opens — the user reviews and sends it themselves (no
//  auto-post, privacy-honest). The `coverage-request` label + `### Entitet` /
//  `### Sport` body are exactly what scripts/lib/demand.js aggregates into
//  coverage-gaps.json.demand[], and mirror the web builder (profile-ui.js
//  coverageRequestUrl) + the issue form (.github/ISSUE_TEMPLATE/coverage-request.yml)
//  so all three parse identically.
//
//  Privacy: the issue carries ONLY the entity name + optional sport — never a
//  profile, follow-list, device or account. It is an anonymous "please cover X".
//

import SwiftUI

enum CoverageRequest {
    /// The repo the public coverage-request issues live in (matches web SS_REPO).
    static let repo = "CHaerem/sportivista"
    /// The label the server aggregates on (matches coverage-request.yml).
    static let label = "coverage-request"
    /// Issue title prefix (matches the template + web builder).
    static let titlePrefix = "[dekning]"
    /// Placeholder written when the user hasn't resolved a sport.
    static let sportUnset = "(ikke satt)"

    /// Build the pre-filled `issues/new` URL for a coverage request. Returns nil for
    /// an empty name. The body's `### Entitet` / `### Sport` sections are the parse
    /// contract shared with the server and web.
    static func issueURL(name: String, sport: String? = nil) -> URL? {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return nil }
        let sportValue: String = {
            guard let s = sport?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return sportUnset }
            return s
        }()
        let body = [
            "Offentlig, anonymt ønske om dekning fra Sportivista — kun navn + sport, ingen profil- eller enhetsdata.",
            "### Entitet\n\n\(trimmedName)",
            "### Sport\n\n\(sportValue)",
        ].joined(separator: "\n\n")

        var components = URLComponents()
        components.scheme = "https"
        components.host = "github.com"
        components.path = "/\(repo)/issues/new"
        components.queryItems = [
            URLQueryItem(name: "labels", value: label),
            URLQueryItem(name: "title", value: "\(titlePrefix) \(trimmedName)"),
            URLQueryItem(name: "body", value: body),
        ]
        return components.url
    }
}

/// The calm, reusable «meld inn ønsket» affordance: one quiet accent link + a
/// footnote about what it means. Renders nothing when the name can't build a URL.
/// DESIGN.md-quiet — footnote type, one accent, no icon-noise.
struct CoverageRequestLink: View {
    let name: String
    var sport: String?

    init(name: String, sport: String? = nil) {
        self.name = name
        self.sport = sport
    }

    var body: some View {
        if let url = CoverageRequest.issueURL(name: name, sport: sport) {
            VStack(alignment: .leading, spacing: 3) {
                Link("Meld inn ønsket til Sportivista", destination: url)
                    .font(.sportivista(.footnote, weight: .semibold))
                    .foregroundStyle(SportivistaTokens.accent)
                    .accessibilityIdentifier("coveragerequest.link")
                Text("Åpner et offentlig, anonymt ønske (kun navn + sport). Du sender det selv.")
                    .font(.sportivista(.caption))
                    .foregroundStyle(SportivistaTokens.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
