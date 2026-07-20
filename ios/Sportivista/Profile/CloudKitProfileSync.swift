//
//  CloudKitProfileSync.swift
//  Sportivista
//
//  WP-19 — the real backend, and the literal form of the P360 privacy promise:
//  the profile syncs to the USER'S OWN private CloudKit database — inside THEIR
//  iCloud quota, in THEIR private zone, NEVER our server. There is no Sportivista
//  backend in this path at all; Apple moves the bytes between the user's own
//  devices. The free-text fields (a rule's `reason`, a note's text) ride in
//  `encryptedValues`, so they are end-to-end encrypted where CloudKit supports
//  it (a custom zone in the private DB — which is exactly what we create).
//
//  ONE record per rule (recordName = entityId), matching the server's
//  `tracked.json` "one entry per entity" shape. Deletions replicate as tombstone
//  RECORDS (a saved record with `deleted = 1`), never as CloudKit record
//  deletions — so a peer holding a stale live copy cannot resurrect an
//  unfollowed entity (the same tombstone discipline the merge enforces).
//
//  THE WEB CHANNEL (`ProfileSnapshot`): CloudKit JS in a browser CANNOT decrypt
//  `encryptedValues`, so the per-record path above is invisible to the web. To
//  sync with the web we ALSO publish one PLAINTEXT snapshot per device
//  (`writeSnapshot` → a ProfileShareCodec payload in a `payload` field, recordName
//  = this device) and fold every device's snapshot back in on `pull`. The native
//  iOS↔iOS path stays E2E; the snapshot is the deliberately-plaintext bridge (its
//  content is still ONLY in the user's own private DB — never shared, never our
//  server). See docs/icloud-sync-setup.md.
//
//  ACCOUNT CONSTRAINT (binding): the free personal team (DEVELOPMENT_TEAM
//  9LVCB72DT8) cannot provision the CloudKit entitlement on a device build
//  (SportivistaDeviceDev), so that build uses LocalOnlyProfileSync. This file
//  nonetheless COMPILES everywhere the CloudKit SDK is present (the Simulator +
//  CI) — it is only ever *run* where a real iCloud account and the iCloud
//  entitlement exist (a paid account, WP-17). Until then it is the prepared
//  switch: flip the backend factory + the entitlement and cross-device sync is on.
//
//  `@unchecked Sendable`: it holds a `CKContainer`/`CKDatabase` (thread-safe
//  reference types Apple has not marked `Sendable`) and no mutable state of its
//  own, so it is safe to share across the coordinator's actor hops.
//

import Foundation
import CloudKit

final class CloudKitProfileSync: ProfileSyncBackend, @unchecked Sendable {
    var label: String { "iCloud" }
    var isEnabled: Bool { true }

    private let database: CKDatabase
    private let zoneID: CKRecordZone.ID

    private enum RecordType {
        static let rule = "ProfileRule"
        static let episodic = "EpisodicNote"
        static let counter = "Counter"
        /// WP — the web-readable channel: one record per device, a single PLAINTEXT
        /// `payload` field (a ProfileShareCodec string of the device's full merged
        /// state). CloudKit JS can read this (it CANNOT read the encryptedValues on
        /// the record types above), so this is how the browser learns the profile.
        static let snapshot = "ProfileSnapshot"
    }

    /// A stable per-device id used as this device's ProfileSnapshot recordName, so
    /// each device owns exactly one snapshot record (no clobbering). Minted once
    /// next to the app's data; matches the DeviceIdentity discipline used for the
    /// rule stamps.
    private let snapshotDeviceID: String

    /// Defaults to the app's default container's PRIVATE database and a dedicated
    /// custom zone (custom zones are what enable `encryptedValues`). A different
    /// container id can be injected for a future multi-container setup.
    init(container: CKContainer = .default(), zoneName: String = "SportivistaProfile") {
        self.database = container.privateCloudDatabase
        self.zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        self.snapshotDeviceID = DeviceIdentity.stableID(directory: dir)
    }

    // MARK: - Pull

    func pull() async throws -> ProfileSyncState {
        try await ensureZone()
        async let rules = fetchRules()
        async let notes = fetchEpisodic()
        async let counters = fetchCounters()
        async let snapshots = fetchSnapshots()
        var state = try await ProfileSyncState(rules: rules, episodic: notes, counters: counters).deduplicated()
        // Fold in every device's snapshot (the WEB writes ONLY a snapshot; other
        // iPhones write both channels). The snapshot carries the FULL state incl.
        // facts, so this is also how facts cross devices. Merge is commutative +
        // idempotent, so the snapshot channel and the per-record channel converge.
        for snap in try await snapshots {
            state = ProfileMerge.merge(local: state, remote: snap).merged
        }
        return state
    }

    /// Decode every device's ProfileSnapshot payload back to a state. A malformed
    /// or absent payload is skipped, not fatal.
    private func fetchSnapshots() async throws -> [ProfileSyncState] {
        try await fetchAll(type: RecordType.snapshot).compactMap { record in
            guard let payload = record["payload"] as? String else { return nil }
            return try? ProfileShareCodec.decode(payload)
        }
    }

    private func fetchRules() async throws -> [SyncedRule] {
        try await fetchAll(type: RecordType.rule).compactMap { record in
            guard
                let json = record.encryptedValues["ruleJSON"] as? Data,
                let rule = try? Self.jsonDecoder.decode(InterestRule.self, from: json),
                let modifiedAt = record["modifiedAt"] as? Date,
                let deviceID = record["deviceID"] as? String
            else { return nil }
            let deleted = (record["deleted"] as? Int64 ?? 0) != 0
            return SyncedRule(rule: rule, modifiedAt: modifiedAt, deviceID: deviceID, deleted: deleted)
        }
    }

    private func fetchEpisodic() async throws -> [EpisodicNote] {
        try await fetchAll(type: RecordType.episodic).compactMap { record in
            guard
                let kind = record["kind"] as? String,
                let createdAt = record["createdAt"] as? Date
            else { return nil }
            var payload: [String: String] = [:]
            if let data = record.encryptedValues["payloadJSON"] as? Data,
               let decoded = try? Self.jsonDecoder.decode([String: String].self, from: data) {
                payload = decoded
            }
            let note = record.encryptedValues["note"] as? String
            let resolvedAt = record["resolvedAt"] as? Date
            return EpisodicNote(id: record.recordID.recordName, kind: kind, createdAt: createdAt,
                                payload: payload, note: note, resolvedAt: resolvedAt)
        }
    }

    private func fetchCounters() async throws -> [Counter] {
        try await fetchAll(type: RecordType.counter).compactMap { record in
            guard let data = record["perDeviceJSON"] as? Data,
                  let perDevice = try? Self.jsonDecoder.decode([String: Int].self, from: data)
            else { return nil }
            return Counter(key: record.recordID.recordName, perDevice: perDevice)
        }
    }

    /// Every record of `type` in our zone. A zone that has never held this type
    /// yet is not an error — treat "unknown record type" / empty as no records.
    private func fetchAll(type: String) async throws -> [CKRecord] {
        let query = CKQuery(recordType: type, predicate: NSPredicate(value: true))
        do {
            let (results, _) = try await database.records(matching: query, inZoneWith: zoneID)
            return results.compactMap { try? $0.1.get() }
        } catch let error as CKError where error.code == .unknownItem || error.code == .invalidArguments {
            return []
        }
    }

    // MARK: - Push (upsert the winners the remote is behind on)

    func push(_ pushSet: PushSet) async throws {
        guard !pushSet.isEmpty else { return }
        try await ensureZone()

        var toSave: [CKRecord] = []
        for r in pushSet.rules { toSave.append(try ruleRecord(r)) }
        for n in pushSet.episodic { toSave.append(try episodicRecord(n)) }
        for c in pushSet.counters { toSave.append(try counterRecord(c)) }

        // We only ever push a merge WINNER, so overwrite the server copy
        // wholesale (`.allKeys`); non-atomic so one bad record can't sink the batch.
        _ = try await database.modifyRecords(saving: toSave, deleting: [],
                                             savePolicy: .allKeys, atomically: false)
    }

    // MARK: - Snapshot (the web-readable channel)

    /// Upsert THIS device's ProfileSnapshot: the full merged state encoded as a
    /// ProfileShareCodec payload in one PLAINTEXT `payload` field, so CloudKit JS
    /// (the browser) can read the whole profile with the user's own Apple sign-in.
    /// recordName = this device, so devices never clobber each other's snapshots.
    /// (v1 writes every sync round; a change-diff skip is a cheap future optimisation.)
    func writeSnapshot(_ state: ProfileSyncState) async throws {
        try await ensureZone()
        let payload = try ProfileShareCodec.encode(state)
        let record = CKRecord(recordType: RecordType.snapshot,
                              recordID: CKRecord.ID(recordName: snapshotDeviceID, zoneID: zoneID))
        record["payload"] = payload as CKRecordValue
        record["updatedAt"] = Date() as CKRecordValue
        _ = try await database.modifyRecords(saving: [record], deleting: [],
                                             savePolicy: .allKeys, atomically: false)
    }

    private func ruleRecord(_ r: SyncedRule) throws -> CKRecord {
        let record = CKRecord(recordType: RecordType.rule,
                              recordID: CKRecord.ID(recordName: r.entityId, zoneID: zoneID))
        record.encryptedValues["ruleJSON"] = try Self.jsonEncoder.encode(r.rule) as CKRecordValue
        record["modifiedAt"] = r.modifiedAt as CKRecordValue
        record["deviceID"] = r.deviceID as CKRecordValue
        record["deleted"] = Int64(r.deleted ? 1 : 0) as CKRecordValue
        return record
    }

    private func episodicRecord(_ n: EpisodicNote) throws -> CKRecord {
        let record = CKRecord(recordType: RecordType.episodic,
                              recordID: CKRecord.ID(recordName: n.id, zoneID: zoneID))
        record["kind"] = n.kind as CKRecordValue
        record["createdAt"] = n.createdAt as CKRecordValue
        record.encryptedValues["payloadJSON"] = try Self.jsonEncoder.encode(n.payload) as CKRecordValue
        if let note = n.note { record.encryptedValues["note"] = note as CKRecordValue }
        if let resolvedAt = n.resolvedAt { record["resolvedAt"] = resolvedAt as CKRecordValue }
        return record
    }

    private func counterRecord(_ c: Counter) throws -> CKRecord {
        let record = CKRecord(recordType: RecordType.counter,
                              recordID: CKRecord.ID(recordName: c.key, zoneID: zoneID))
        record["perDeviceJSON"] = try Self.jsonEncoder.encode(c.perDevice) as CKRecordValue
        return record
    }

    // MARK: - Zone bootstrap

    /// Create our custom zone if it isn't there yet. Saving an existing zone is a
    /// no-op, so this is safe to call before every pull/push.
    private func ensureZone() async throws {
        let zone = CKRecordZone(zoneID: zoneID)
        _ = try await database.modifyRecordZones(saving: [zone], deleting: [])
    }

    // MARK: - JSON (ISO 8601, matching ProfileStore / the QR codec)

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
