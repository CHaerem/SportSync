// icloud-sync.js — two-way profile sync with the iOS app via CloudKit JS.
//
// The browser CANNOT read the app's per-record encryptedValues (E2E), so the app
// also publishes a plaintext ProfileSnapshot per device (see CloudKitProfileSync
// .writeSnapshot). This module signs the user in with their own Apple ID, reads
// every device's ProfileSnapshot from THEIR OWN private database, merges them
// into this browser's local profile (the same CRDT as the app), and writes back
// this browser's own snapshot — genuine two-way sync, zero Sportivista server.
//
// Depends on: cloudkit.js (Apple CDN, loaded before this file), profile-sync.js
// (merge + codec + store), icloud-config.js (the public token). All CloudKit
// network calls are integration-only (verified on-device with a real account +
// the Dashboard schema); the pure record<->state mapping is unit-tested.
//
// Calm by DESIGN.md: one amber accent, a quiet status line, NO spinner. When the
// token is unset or the user isn't signed in, the board just keeps working on the
// local/QR profile — sync is strictly additive.

window.ssICloud = (function () {
	const cfg = (typeof window !== 'undefined' && window.SPORTIVISTA_ICLOUD) || {};
	const RECORD_TYPE = 'ProfileSnapshot';

	function enabled() {
		return !!(cfg.apiToken && typeof CloudKit !== 'undefined');
	}

	// --- pure mapping (unit-tested) ------------------------------------------

	/** A CloudKit record → its payload string (or null). Tolerant of the two
	 *  shapes CloudKit JS returns a String field in. */
	function recordPayload(record) {
		const f = record && record.fields && record.fields.payload;
		if (!f) return null;
		return typeof f === 'string' ? f : (f.value != null ? String(f.value) : null);
	}

	/** This browser's snapshot recordName — its stable device id (profile-sync). */
	function webRecordName() {
		return typeof ssDeviceId === 'function' ? ssDeviceId() : 'web-unknown';
	}

	/** The CloudKit record dict to save this browser's snapshot. `changeTag` is
	 *  required by CloudKit JS to OVERWRITE an existing record (omit on create). */
	function snapshotRecord(payload, changeTag) {
		const rec = {
			recordType: RECORD_TYPE,
			recordName: webRecordName(),
			zoneID: { zoneName: cfg.zoneName || 'SportivistaProfile' },
			fields: { payload: { value: payload } },
		};
		if (changeTag) rec.recordChangeTag = changeTag;
		return rec;
	}

	/** Decode every snapshot record → states, and fold them (+ local) into one
	 *  merged state via the shared CRDT. Async: decode is deflate-raw. */
	async function mergeSnapshots(records, localState) {
		let merged = localState;
		for (const rec of records || []) {
			const payload = recordPayload(rec);
			if (!payload) continue;
			try {
				const incoming = await ssProfileDecode(payload);
				merged = ssProfileMerge(merged, incoming).merged;
			} catch { /* skip a malformed snapshot */ }
		}
		return merged;
	}

	// --- CloudKit plumbing (integration-only) --------------------------------

	let container = null, database = null;

	function configure() {
		if (!enabled()) return false;
		CloudKit.configure({
			containers: [{
				containerIdentifier: cfg.containerIdentifier,
				apiTokenAuth: { apiToken: cfg.apiToken, persist: true },
				environment: cfg.environment || 'production',
			}],
		});
		container = CloudKit.getDefaultContainer();
		database = container.privateCloudDatabase;
		return true;
	}

	/** One sync round: pull all snapshots → merge into local → save own snapshot.
	 *  Returns {added, removed} or null on any failure (offline-first, never throws). */
	async function sync() {
		if (!database) return null;
		try {
			const zoneName = cfg.zoneName || 'SportivistaProfile';
			// Ensure the custom zone exists — either side may bootstrap it, so a web
			// user who signs in BEFORE any device has written still gets a working
			// zone (else the query fails with "zone not found"). Best-effort: a
			// re-save of an existing zone / an unsupported call is harmless.
			try { await database.saveRecordZones([{ zoneID: { zoneName } }]); } catch { /* exists / unsupported */ }
			const resp = await database.performQuery({ recordType: RECORD_TYPE, zoneID: { zoneName } });
			if (resp.hasErrors) return null;
			const before = ssProfileLoad();
			const beforeLive = new Set(ssLiveRules(before).map((r) => r.entityId));
			const merged = await mergeSnapshots(resp.records || [], before);
			const saved = ssProfileSave(merged);
			// Publish this browser's own snapshot (upsert; carry the change tag if
			// our record already exists so CloudKit accepts the overwrite).
			const mine = (resp.records || []).find((r) => r.recordName === webRecordName());
			const payload = await ssProfileEncode(saved);
			await database.saveRecords([snapshotRecord(payload, mine && mine.recordChangeTag)]);
			const afterLive = new Set(ssLiveRules(saved).map((r) => r.entityId));
			let added = 0, removed = 0;
			for (const id of afterLive) if (!beforeLive.has(id)) added++;
			for (const id of beforeLive) if (!afterLive.has(id)) removed++;
			return { added, removed };
		} catch { return null; }
	}

	/** Wire the Sign in with Apple flow into #apple-sign-in-button / -out-button
	 *  and a #icloud-status line. No-op (and stays hidden) when the token is unset. */
	function init(opts) {
		const onSynced = (opts && opts.onSynced) || (() => {});
		const box = document.getElementById('icloud-box');
		const status = document.getElementById('icloud-status');
		const say = (m) => { if (status) { status.textContent = m; status.hidden = false; } };
		if (!enabled()) return; // token unset → leave the disclosure hidden
		if (box) box.hidden = false;
		if (!configure()) return;
		container.setUpAuth().then((userIdentity) => {
			if (userIdentity) whenSignedIn();
		});
		container.whenUserSignsIn().then(whenSignedIn).catch(() => {});
		container.whenUserSignsOut().then(() => say('Logget ut av iCloud.')).catch(() => {});
		async function whenSignedIn() {
			say('Synker med iCloud …');
			const res = await sync();
			if (!res) { say('Logget inn, men synk er ikke tilgjengelig akkurat nå — prøv igjen om litt.'); return; }
			if (!res.added && !res.removed) say('Synket med iCloud — alt er oppdatert.');
			else say(`Synket med iCloud · la til ${res.added}, fjernet ${res.removed}.`);
			onSynced(res);
		}
	}

	return { enabled, init, sync, mergeSnapshots, recordPayload, snapshotRecord, webRecordName };
})();
