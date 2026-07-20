// icloud-sync.test.js — the PURE record<->state mapping in docs/js/icloud-sync.js.
// The CloudKit network calls (configure/setUpAuth/performQuery/saveRecords) are
// integration-only (verified on-device with a real account + the Dashboard
// schema — see docs/icloud-sync-setup.md). Here we prove the browser correctly
// reads a ProfileSnapshot payload, merges snapshots via the shared CRDT, and
// shapes its own snapshot record.

import { describe, it, expect, beforeAll } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let W;
beforeAll(() => {
	const sandbox = createClientSandbox();
	Object.assign(sandbox, { TextEncoder, TextDecoder, btoa, atob, Uint8Array, Response, Blob, crypto: globalThis.crypto, CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream });
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "profile-sync.js");
	loadClientScript(sandbox, "icloud-config.js");
	loadClientScript(sandbox, "icloud-sync.js");
	W = sandbox.window;
});

const ruleState = (id, name) => ({
	rules: [{ rule: { entityId: id, entityName: name, sport: "football", scope: null, weight: 0.5, reason: "r", addedAt: "2026-07-20T10:00:00Z", lens: { sportAsSuch: {} } }, modifiedAt: "2026-07-20T10:00:00Z", deviceID: "dev-a", deleted: false }],
	episodic: [], counters: [], facts: [],
});

describe("recordPayload", () => {
	it("reads the CloudKit String-field shape and the bare string", () => {
		expect(W.ssICloud.recordPayload({ fields: { payload: { value: "ABC" } } })).toBe("ABC");
		expect(W.ssICloud.recordPayload({ fields: { payload: "XYZ" } })).toBe("XYZ");
		expect(W.ssICloud.recordPayload({ fields: {} })).toBe(null);
	});
});

describe("snapshotRecord", () => {
	it("shapes an upsert record keyed on this browser's device id, with the change tag on update", () => {
		const create = W.ssICloud.snapshotRecord("PAYLOAD");
		expect(create.recordType).toBe("ProfileSnapshot");
		expect(create.recordName).toMatch(/^web-/);
		expect(create.zoneID.zoneName).toBe("SportivistaProfile");
		expect(create.fields.payload.value).toBe("PAYLOAD");
		expect(create.recordChangeTag).toBeUndefined();
		const update = W.ssICloud.snapshotRecord("PAYLOAD", "tag-123");
		expect(update.recordChangeTag).toBe("tag-123");
	});
});

describe("mergeSnapshots", () => {
	it("decodes every snapshot payload and folds them + local into one merged state", async () => {
		const s1 = await W.ssProfileEncode(ruleState("liverpool", "Liverpool"));
		const s2 = await W.ssProfileEncode(ruleState("arsenal", "Arsenal"));
		const records = [
			{ recordName: "dev-1", fields: { payload: { value: s1 } } },
			{ recordName: "dev-2", fields: { payload: { value: s2 } } },
		];
		const local = ruleState("chelsea", "Chelsea");
		const merged = await W.ssICloud.mergeSnapshots(records, local);
		const ids = W.ssLiveRules(merged).map((r) => r.entityId).sort();
		expect(ids).toEqual(["arsenal", "chelsea", "liverpool"]);
	});

	it("skips a malformed snapshot without throwing", async () => {
		const good = await W.ssProfileEncode(ruleState("liverpool", "Liverpool"));
		const records = [{ fields: { payload: { value: "!!not-a-payload!!" } } }, { fields: { payload: { value: good } } }];
		const merged = await W.ssICloud.mergeSnapshots(records, W.ssEmptyState());
		expect(W.ssLiveRules(merged).map((r) => r.entityId)).toEqual(["liverpool"]);
	});
});

describe("enabled", () => {
	it("is false with no token (sync stays off, board keeps working)", () => {
		expect(W.ssICloud.enabled()).toBe(false); // icloud-config ships an empty token
	});
});
