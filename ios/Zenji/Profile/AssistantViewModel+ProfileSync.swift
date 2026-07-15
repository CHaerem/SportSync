//
//  AssistantViewModel+ProfileSync.swift
//  Zenji
//
//  WP-19 — profil-sync (QR-bro + bakgrunns-sync): the view-model arm behind
//  the share panel (QR/link export), the deep-link/pasted-code import (always
//  a MERGE, never an overwrite), and the offline-first background sync round.
//
//  Moved here from AssistantViewModel.swift by WP-48, so the profile domain
//  lives in Profile/ with the stores/codecs it drives (ProfileStore,
//  ProfileShareCodec, ProfileSyncCoordinator). Pure code motion — no logic
//  changes. The two stored properties this arm writes (`lastImportSummary` /
//  `shareImportMessage`) remain declared in the class body (an extension
//  can't hold stored state); everything else about profile sync is here.
//

import Foundation

extension AssistantViewModel {

    /// A calm summary of what a QR/link import changed — shown after a merge.
    struct ProfileImportSummary: Equatable, Sendable {
        var added: Int
        var updated: Int
        var removed: Int
        var isNoop: Bool { added == 0 && updated == 0 && removed == 0 }
    }

    /// The deep link that SHARES this device's profile (QR + share sheet). Nil
    /// only if encoding somehow fails (never expected for a well-formed profile).
    var profileShareURL: URL? {
        try? ProfileShareCodec.link(for: profileStore.loadSyncState())
    }

    /// Import a shared profile from a deep link — MERGES into the local profile
    /// (never overwrites), persists, and recompiles the agenda. Pure + offline.
    func importSharedProfile(from url: URL) {
        importMerging { try ProfileShareCodec.merge(url: url, into: $0) }
    }

    /// Import from a pasted string — the whole `zenji://…` link or just its
    /// payload (both accepted), for the manual import field.
    func importSharedProfile(fromPayload raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let url = URL(string: trimmed), url.scheme == ProfileShareCodec.scheme {
            importSharedProfile(from: url)
        } else {
            importMerging { try ProfileShareCodec.merge(payload: trimmed, into: $0) }
        }
    }

    private func importMerging(_ merge: (ProfileSyncState) throws -> MergeOutcome) {
        shareImportMessage = nil
        lastImportSummary = nil
        let before = profileStore.loadSyncState()
        do {
            let outcome = try merge(before)
            try? profileStore.saveSyncState(outcome.merged)
            lastImportSummary = Self.summary(before: before.profile, after: outcome.merged.profile)
            reloadProfile()
            onProfileChanged?()
        } catch ProfileShareError.empty {
            shareImportMessage = "Koden inneholdt ingen profil å slå sammen."
        } catch ProfileShareError.unsupportedVersion {
            shareImportMessage = "Koden er laget av en nyere versjon av Zenji enn denne."
        } catch {
            shareImportMessage = "Dette var ikke en gyldig Zenji-profilkode."
        }
        presentToken &+= 1
    }

    private static func summary(before: InterestProfile, after: InterestProfile) -> ProfileImportSummary {
        let beforeByID = Dictionary(before.rules.map { ($0.entityId, $0) }, uniquingKeysWith: { a, _ in a })
        let afterByID = Dictionary(after.rules.map { ($0.entityId, $0) }, uniquingKeysWith: { a, _ in a })
        var added = 0, updated = 0, removed = 0
        for (id, rule) in afterByID {
            if let prior = beforeByID[id] { if prior != rule { updated += 1 } } else { added += 1 }
        }
        for id in beforeByID.keys where afterByID[id] == nil { removed += 1 }
        return ProfileImportSummary(added: added, updated: updated, removed: removed)
    }

    /// Re-read the persisted profile into memory (after an external merge — a QR
    /// import or a background CloudKit sync).
    func reloadProfile() {
        profile = profileStore.load()
    }

    /// One offline-first background sync round through `coordinator` (LocalOnly by
    /// default → a no-op). Persists the merged state and recompiles if it changed.
    func runBackgroundSync(using coordinator: ProfileSyncCoordinator) async {
        guard coordinator.backend.isEnabled else { return }
        let result = await coordinator.sync(local: profileStore.loadSyncState())
        guard result.didSync else { return }
        try? profileStore.saveSyncState(result.merged)
        let updated = result.merged.profile
        if updated != profile {
            profile = updated
            onProfileChanged?()
        }
    }
}
