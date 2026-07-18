// asc-api.js — App Store Connect-klienten bak release-lanen: JWT-form,
// feil-som-unntak, og den pure byggnummer-logikken.
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { ascJwt, ascRequest, nextBuildNumber } from "../scripts/lib/asc-api.js";

// Ekte EC-nøkkel (P-256, samme kurve som Apples .p8) generert per testkjøring —
// ingen fixtures med nøkkelmateriale i repoet.
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const auth = { keyId: "KEY123", issuerId: "iss-uuid", privateKey: pem };

describe("ascJwt", () => {
	it("bygger en ES256-JWT med Apple-kravene i header/payload", () => {
		const jwt = ascJwt(auth, 1_000_000);
		const [h, p] = jwt
			.split(".")
			.slice(0, 2)
			.map((part) => JSON.parse(Buffer.from(part, "base64url")));
		expect(h).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
		expect(p).toEqual({ iss: "iss-uuid", iat: 1_000_000, exp: 1_001_200, aud: "appstoreconnect-v1" });
	});

	it("signaturen verifiserer mot nøkkelen (ieee-p1363, ikke DER)", () => {
		const jwt = ascJwt(auth, 1_000_000);
		const [h, p, s] = jwt.split(".");
		const ok = crypto.verify(
			"sha256",
			Buffer.from(h + "." + p),
			{ key: publicKey, dsaEncoding: "ieee-p1363" },
			Buffer.from(s, "base64url"),
		);
		expect(ok).toBe(true);
	});
});

describe("ascRequest", () => {
	it("sender Bearer-JWT og parser JSON-svar", async () => {
		let seen;
		const fetchImpl = async (url, opts) => {
			seen = { url, opts };
			return { ok: true, text: async () => '{"data":[]}' };
		};
		const res = await ascRequest(auth, "GET", "/v1/builds", undefined, fetchImpl);
		expect(res).toEqual({ data: [] });
		expect(seen.url).toBe("https://api.appstoreconnect.apple.com/v1/builds");
		expect(seen.opts.headers.Authorization).toMatch(/^Bearer ey/);
		expect(seen.opts.body).toBeUndefined();
	});

	it("kaster på HTTP-feil — CI skal feile høyt, ikke fortsette tomt", async () => {
		const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "FORBIDDEN" });
		await expect(ascRequest(auth, "GET", "/v1/builds", undefined, fetchImpl)).rejects.toThrow(/403/);
	});
});

describe("nextBuildNumber", () => {
	it("maks kjente + 1", () => {
		const builds = [{ attributes: { version: "4" } }, { attributes: { version: "2" } }];
		expect(nextBuildNumber(builds)).toBe(5);
	});

	it("1 ved første opplasting (tom liste)", () => {
		expect(nextBuildNumber([])).toBe(1);
		expect(nextBuildNumber(undefined)).toBe(1);
	});

	it("ignorerer ikke-numeriske version-strenger", () => {
		const builds = [{ attributes: { version: "abc" } }, { attributes: { version: "7" } }];
		expect(nextBuildNumber(builds)).toBe(8);
	});
});
