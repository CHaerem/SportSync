// profile-codec-golden.test.js — the CROSS-PLATFORM codec gate.
//
// tests/fixtures/profile-payloads/liverpool.swift-golden.txt is a
// ProfileShareCodec payload emitted by the REAL iOS Swift codec
// (ProfileCodecGoldenTests.test_dumpGoldenPayload). This test decodes it with the
// JS codec (docs/js/profile-sync.js) and asserts the exact state — proving the
// two are byte-compatible across the real interop risks: Apple's `.zlib` == raw
// DEFLATE (JS deflate-raw), ISO-8601 second precision, base64url (no padding),
// sorted keys, and the synthesized Lens JSON shape. A JS-only round-trip can't
// catch a drift from Swift's actual bytes; this can.
//
// If Swift's codec changes intentionally, regenerate both sides:
//   TEST_RUNNER_DUMP_GOLDEN=1 xcodebuild test … -only-testing:…/test_dumpGoldenPayload
// then update the .txt fixture AND ProfileCodecGoldenTests.goldenPayload.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let W;
const swiftPayload = fs.readFileSync(
	path.resolve(process.cwd(), "tests", "fixtures", "profile-payloads", "liverpool.swift-golden.txt"),
	"utf-8"
).trim();

beforeAll(() => {
	const sandbox = createClientSandbox();
	Object.assign(sandbox, {
		TextEncoder, TextDecoder, btoa, atob, Uint8Array, Response, Blob,
		crypto: globalThis.crypto,
		CompressionStream: globalThis.CompressionStream,
		DecompressionStream: globalThis.DecompressionStream,
	});
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "lens.js");
	loadClientScript(sandbox, "profile-sync.js");
	W = sandbox.window;
});

describe("cross-platform codec golden (Swift → JS)", () => {
	it("the JS codec decodes a Swift-emitted payload to the exact state", async () => {
		const state = await W.ssProfileDecode(swiftPayload);
		expect(state.rules.length).toBe(1);
		const r = state.rules[0];
		expect(r.rule.entityId).toBe("team-liverpool");
		expect(r.rule.entityName).toBe("Liverpool");
		expect(r.rule.sport).toBe("football");
		expect(r.rule.weight).toBe(0.5);
		expect(r.rule.reason).toBe("Fulgt fra web");
		expect(r.deviceID).toBe("dev-phone");
		expect(r.deleted).toBe(false);
		expect(r.rule.lens).toEqual({ sportAsSuch: {} });
		// ISO-8601 at SECOND precision (Swift .iso8601 — no milliseconds).
		expect(r.rule.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		expect(r.modifiedAt).toBe(r.rule.addedAt);
	});

	it("re-encoding the decoded state reproduces the Swift bytes (JS → Swift-compatible)", async () => {
		const state = await W.ssProfileDecode(swiftPayload);
		const reencoded = await W.ssProfileEncode(state);
		expect(reencoded).toBe(swiftPayload); // byte-identical round trip across platforms
	});
});
