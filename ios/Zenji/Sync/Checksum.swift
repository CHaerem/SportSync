//
//  Checksum.swift
//  Zenji
//
//  WP-12: sha256 hex digest, used to verify a downloaded data file against
//  the hash manifest.json declared for it before the bytes are trusted into
//  the cache (a corrupt/truncated download must never silently replace a
//  good cached file — see SyncClient).
//

import CryptoKit
import Foundation

extension Data {
    /// Lowercase hex sha256 digest — same format as manifest.json's
    /// `files[…].sha256` (produced server-side by build-manifest.js).
    var sha256Hex: String {
        SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
    }
}
