// icloud-integration.test.js — drives the REAL icloud-sync.js orchestration
// (configure → setUpAuth → ensureZone → performQuery → mergeSnapshots → saveRecords
// → localStorage → status) against a MOCK `window.CloudKit`. This closes the
// "integration-only" gap: no Apple account, no network — but the actual sync
// flow, not just the pure mapper, is exercised in CI.
//
// The one thing that genuinely can't be in CI is the interactive Sign in with
// Apple + a live private-DB round trip (needs a real Apple ID); that stays a
// one-shot manual/on-device check. Everything up to Apple's wire is covered here.

import { describe, it, expect, beforeEach } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

// A mock CloudKit whose private database records the calls and returns fixtures.
function makeMockCloudKit(records) {
	const calls = { zones: [], queries: 0, saved: [] };
	const database = {
		saveRecordZones: (z) => { calls.zones.push(z); return Promise.resolve({}); },
		performQuery: () => { calls.queries++; return Promise.resolve({ records }); },
		saveRecords: (recs) => { calls.saved.push(...recs); return Promise.resolve({ records: recs }); },
	};
	const container = {
		privateCloudDatabase: database,
		setUpAuth: () => Promise.resolve({ userRecordName: "user-1" }), // already signed in
		whenUserSignsIn: () => new Promise(() => {}),  // never fires in the test
		whenUserSignsOut: () => new Promise(() => {}),
	};
	const CloudKit = { configure: () => {}, getDefaultContainer: () => container };
	return { CloudKit, calls };
}

async function loadSandbox(mockCloudKit) {
	const sandbox = createClientSandbox();
	Object.assign(sandbox, {
		TextEncoder, TextDecoder, btoa, atob, Uint8Array, Response, Blob,
		crypto: globalThis.crypto,
		CompressionStream: globalThis.CompressionStream,
		DecompressionStream: globalThis.DecompressionStream,
		CloudKit: mockCloudKit,
	});
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "profile-sync.js");
	loadClientScript(sandbox, "icloud-config.js"); // ships a real token → enabled() true (with CloudKit present)
	loadClientScript(sandbox, "icloud-sync.js");
	return sandbox;
}

const followState = (id, name) => ({
	rules: [{ rule: { entityId: id, entityName: name, sport: "football", scope: null, weight: 0.5, reason: "r", addedAt: "2026-07-21T10:00:00Z", lens: { sportAsSuch: {} } }, modifiedAt: "2026-07-21T10:00:00Z", deviceID: "dev-phone", deleted: false }],
	episodic: [], counters: [], facts: [],
});

describe("icloud-sync — full orchestration against a mock CloudKit", () => {
	it("enabled() is true when a token AND CloudKit are present", async () => {
		const { CloudKit } = makeMockCloudKit([]);
		const sb = await loadSandbox(CloudKit);
		expect(sb.window.ssICloud.enabled()).toBe(true);
	});

	it("signs in → ensures the zone → pulls a phone snapshot → merges it into the local profile → writes back", async () => {
		// A remote snapshot as the PHONE would have written it (a follow of Liverpool).
		const { CloudKit, calls } = makeMockCloudKit([]);
		let sb = await loadSandbox(CloudKit);
		const phonePayload = await sb.window.ssProfileEncode(followState("team-liverpool", "Liverpool"));
		// Reload with the query returning that snapshot record.
		const mock = makeMockCloudKit([{ recordName: "dev-phone", recordChangeTag: "tag1", fields: { payload: { value: phonePayload } } }]);
		sb = await loadSandbox(mock.CloudKit);

		const res = await new Promise((resolve) => sb.window.ssICloud.init({ onSynced: resolve }));

		// The phone's follow is now in this browser's local profile.
		const local = sb.window.ssProfileLoad();
		expect(sb.window.ssLiveRules(local).map((r) => r.entityId)).toEqual(["team-liverpool"]);
		expect(res).toEqual({ added: 1, removed: 0 });
		// The zone was ensured, the query ran, and the browser wrote its OWN snapshot back.
		expect(mock.calls.zones.length).toBe(1);
		expect(mock.calls.queries).toBe(1);
		expect(mock.calls.saved.length).toBe(1);
		expect(mock.calls.saved[0].recordType).toBe("ProfileSnapshot");
		expect(mock.calls.saved[0].recordName).toMatch(/^web-/);
		// And the written snapshot round-trips back to the merged state.
		const writtenBack = await sb.window.ssProfileDecode(mock.calls.saved[0].fields.payload.value);
		expect(sb.window.ssLiveRules(writtenBack).map((r) => r.entityId)).toEqual(["team-liverpool"]);
	});

	it("empty remote → signs in, writes an (empty) snapshot, reports nothing added/removed", async () => {
		const mock = makeMockCloudKit([]);
		const sb = await loadSandbox(mock.CloudKit);
		const res = await new Promise((resolve) => sb.window.ssICloud.init({ onSynced: resolve }));
		expect(res).toEqual({ added: 0, removed: 0 });
		expect(mock.calls.saved.length).toBe(1); // still publishes this device's snapshot
	});

	it("carries the recordChangeTag when overwriting THIS browser's existing snapshot", async () => {
		// First run to learn this browser's stable device id (web-…).
		let mock = makeMockCloudKit([]);
		let sb = await loadSandbox(mock.CloudKit);
		await new Promise((resolve) => sb.window.ssICloud.init({ onSynced: resolve }));
		const myName = mock.calls.saved[0].recordName;

		// Second run where the remote already holds THIS browser's snapshot (with a tag).
		const myPayload = await sb.window.ssProfileEncode(sb.window.ssProfileLoad());
		mock = makeMockCloudKit([{ recordName: myName, recordChangeTag: "tag-existing", fields: { payload: { value: myPayload } } }]);
		sb = await loadSandbox(mock.CloudKit);
		// Force the same device id so it matches `myName`.
		sb.window.localStorage.setItem("ss-device-id", myName);
		await new Promise((resolve) => sb.window.ssICloud.init({ onSynced: resolve }));
		expect(mock.calls.saved[0].recordChangeTag).toBe("tag-existing");
	});
});
