//
//  ProfileShareCodec.swift
//  Zenji
//
//  WP-19 — the QR / delelenke bridge. The valuable-NOW half of profile-sync:
//  CloudKit needs a paid account, but this needs NOTHING but the two phones (or
//  a phone and a browser). A profile is exported as a COMPRESSED, base64url
//  payload carried in a QR code and a share link; importing it on another device
//  runs the SAME merge — so it is genuine cross-device sync in the zero-infra
//  spirit, with no server ever touched.
//
//  The link is a custom-scheme deep link (`sportivista://profile?v=1&d=<payload>`), so
//  it needs no Associated-Domains entitlement (free-account friendly). The
//  payload is small, self-describing JSON — deliberately simple to re-implement
//  in the web client later (a documented non-goal here).
//
//  THE CONTRACT: import MERGES, never overwrites. `merge(...)` folds the incoming
//  state into the local one through `ProfileMerge` — so a QR from a phone you
//  unfollowed something on will replicate that tombstone, and a newer local edit
//  survives an older imported one. Pure + Foundation-only → fully unit-tested.
//

import Foundation

enum ProfileShareError: Error, Equatable {
    /// Not a decodable Zenji payload (bad base64, bad gzip, bad JSON, wrong link).
    case malformed
    /// A payload/link from a newer format than this build understands.
    case unsupportedVersion(Int)
    /// The payload decoded to an empty profile — nothing to import.
    case empty
}

enum ProfileShareCodec {
    static let scheme = "sportivista"
    static let host = "profile"
    static let version = 1
    private static let versionKey = "v"
    private static let dataKey = "d"

    // MARK: - Payload (compress + base64url)

    /// A profile state → a compact, URL-safe payload string.
    static func encode(_ state: ProfileSyncState) throws -> String {
        let json = try encoder.encode(state.normalized())
        let compressed = try (json as NSData).compressed(using: .zlib) as Data
        return base64URLEncode(compressed)
    }

    /// A payload string → the profile state it carries.
    static func decode(_ payload: String) throws -> ProfileSyncState {
        guard let compressed = base64URLDecode(payload) else { throw ProfileShareError.malformed }
        guard let json = try? (compressed as NSData).decompressed(using: .zlib) as Data else {
            throw ProfileShareError.malformed
        }
        guard let state = try? decoder.decode(ProfileSyncState.self, from: json) else {
            throw ProfileShareError.malformed
        }
        return state
    }

    // MARK: - Deep link (QR + share sheet)

    /// The link a QR code encodes and the share sheet hands off:
    /// `sportivista://profile?v=1&d=<payload>`.
    static func link(for state: ProfileSyncState) throws -> URL {
        let payload = try encode(state)
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.queryItems = [
            URLQueryItem(name: versionKey, value: String(version)),
            URLQueryItem(name: dataKey, value: payload),
        ]
        guard let url = components.url else { throw ProfileShareError.malformed }
        return url
    }

    /// Parse an incoming deep link back to a state. Throws `.malformed` if it's
    /// not one of ours and `.unsupportedVersion` if it's from a newer format.
    static func state(from url: URL) throws -> ProfileSyncState {
        guard url.scheme == scheme, url.host == host,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw ProfileShareError.malformed
        }
        let items = components.queryItems ?? []
        if let raw = items.first(where: { $0.name == versionKey })?.value, let v = Int(raw), v != version {
            throw ProfileShareError.unsupportedVersion(v)
        }
        guard let payload = items.first(where: { $0.name == dataKey })?.value, !payload.isEmpty else {
            throw ProfileShareError.malformed
        }
        return try decode(payload)
    }

    // MARK: - Import = MERGE (never overwrite)

    /// Fold a payload's state into `local` via the CRDT merge. The returned
    /// outcome's `merged` is what to persist; `toPush` is what the SENDER would
    /// still be behind on (unused on import, kept for symmetry/tests).
    static func merge(payload: String, into local: ProfileSyncState) throws -> MergeOutcome {
        let incoming = try decode(payload)
        guard !incoming.deduplicated().isEmpty else { throw ProfileShareError.empty }
        return ProfileMerge.merge(local: local, remote: incoming)
    }

    /// Same, from a deep link.
    static func merge(url: URL, into local: ProfileSyncState) throws -> MergeOutcome {
        let incoming = try state(from: url)
        guard !incoming.deduplicated().isEmpty else { throw ProfileShareError.empty }
        return ProfileMerge.merge(local: local, remote: incoming)
    }

    // MARK: - base64url (RFC 4648 §5, unpadded — URL-safe with no percent-encoding)

    private static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func base64URLDecode(_ string: String) -> Data? {
        var s = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder > 0 { s += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: s)
    }

    // MARK: - Codec (ISO 8601, matching ProfileStore)

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
