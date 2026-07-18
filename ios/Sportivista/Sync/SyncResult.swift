//
//  SyncResult.swift
//  Sportivista
//
//  WP-12: the outcome of one SyncClient.sync() call.
//
//  - `upToDate`      — the manifest itself hadn't changed (304 Not Modified).
//                      No data-file requests were made at all this run.
//  - `changedFiles`  — the filenames actually written into the cache this
//                      run. May be a SUBSET of what the manifest reported as
//                      changed: a file whose download failed a sha256 check
//                      (or a transient network error) is left out and the
//                      OLD cached copy — if any — is kept; see SyncClient's
//                      per-file reconciliation.
//  - `failure`       — the manifest fetch itself failed (network error, bad
//                      status, undecodable body). The existing cache and
//                      sync state are left completely untouched.
//

import Foundation

enum SyncResult: Equatable {
    case upToDate
    case changedFiles([String])
    case failure(SyncError)
}

/// Errors from the manifest half of a sync. Per-file download problems
/// (network hiccup mid-file, sha256 mismatch) are deliberately NOT surfaced
/// as `.failure` here — they just demote that one file back to "unchanged
/// this run", so a single flaky file never fails the whole sync.
enum SyncError: Error, Equatable {
    case transport(String)
    case unexpectedResponse
    case httpStatus(Int)
    case invalidManifest
}
