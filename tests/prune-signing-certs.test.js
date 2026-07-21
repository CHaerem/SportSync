// prune-signing-certs.js — release-lanens selv-opprydning (WP-145): den pure
// seleksjonslogikken (behold navngitte + de nyeste K, tilbakekall resten) og
// FAIL-SOFT-oppførselen (list-/DELETE-feil logges og svelges, aldri kastet).
// Network-fri: `request` injiseres (samme mønster som asc-api.test.js' fetch-injeksjon).
import { describe, it, expect, vi } from "vitest";
import { certsToRevoke, pruneSigningCerts, API_DISPLAY_NAME, KEEP_RECENT } from "../scripts/prune-signing-certs.js";

// Fabrikk for et ASC-sertifikat slik GET /v1/certificates returnerer det.
const cert = (id, displayName, expirationDate) => ({
	type: "certificates",
	id,
	attributes: { displayName, certificateType: "DEVELOPMENT", expirationDate },
});

// En eier-navngitt cert + fire API-mintede med stigende utløp (⇒ stigende alder-nyhet).
const named = cert("NAMED1", "christopher hærem", "2027-06-01T00:00:00.000Z");
const api = [
	cert("API_OLDEST", API_DISPLAY_NAME, "2026-01-01T00:00:00.000Z"),
	cert("API_OLD", API_DISPLAY_NAME, "2026-02-01T00:00:00.000Z"),
	cert("API_NEW", API_DISPLAY_NAME, "2026-03-01T00:00:00.000Z"),
	cert("API_NEWEST", API_DISPLAY_NAME, "2026-04-01T00:00:00.000Z"),
];
const auth = { keyId: "K", issuerId: "I", privateKey: "P" };
const silent = { log: () => {}, error: () => {} };

describe("certsToRevoke", () => {
	it("beholder navngitte + de nyeste K, tilbakekaller resten", () => {
		const revoke = certsToRevoke([named, ...api], { keepRecent: 2 });
		const ids = revoke.map((c) => c.id);
		// De to eldste API-certene tilbakekalles; de to nyeste + det navngitte skånes.
		expect(ids.slice().sort()).toEqual(["API_OLD", "API_OLDEST"]);
		expect(ids).not.toContain("NAMED1"); // ALDRI et navngitt sertifikat
		expect(ids).not.toContain("API_NEWEST");
		expect(ids).not.toContain("API_NEW");
	});

	it("tilbakekaller ALDRI et navngitt sertifikat, selv om det er eneste cert", () => {
		expect(certsToRevoke([named], { keepRecent: 0 })).toEqual([]);
	});

	it("bruker default KEEP_RECENT når keepRecent ikke er gitt", () => {
		const revoke = certsToRevoke([...api]); // 4 API-certer, default = 2
		expect(revoke.map((c) => c.id).sort()).toEqual(["API_OLD", "API_OLDEST"]);
		expect(KEEP_RECENT).toBe(2);
	});

	it("keepRecent ≥ antall API-certer ⇒ ingenting tilbakekalles", () => {
		expect(certsToRevoke([...api], { keepRecent: 10 })).toEqual([]);
	});

	it("keepRecent 0 tilbakekaller alle API-certer (men aldri navngitte)", () => {
		const revoke = certsToRevoke([named, ...api], { keepRecent: 0 });
		expect(revoke.map((c) => c.id).sort()).toEqual(["API_NEW", "API_NEWEST", "API_OLD", "API_OLDEST"]);
	});

	it("tom / manglende / rar input er trygt", () => {
		expect(certsToRevoke([])).toEqual([]);
		expect(certsToRevoke(undefined)).toEqual([]);
		expect(certsToRevoke(null)).toEqual([]);
		expect(certsToRevoke([{}, { attributes: null }, { attributes: {} }])).toEqual([]);
	});

	it("cert uten expirationDate sorteres som eldst (skånes sist)", () => {
		const noDate = cert("API_NODATE", API_DISPLAY_NAME, undefined);
		const revoke = certsToRevoke([noDate, ...api], { keepRecent: 2 });
		// De to nyeste (API_NEWEST, API_NEW) skånes; NODATE er «eldst» og tilbakekalles.
		expect(revoke.map((c) => c.id)).toContain("API_NODATE");
		expect(revoke.map((c) => c.id)).not.toContain("API_NEWEST");
	});

	it("keepIds beskytter CI-identiteten selv om den er ELDST og keepRecent 0 (WP-153)", () => {
		// API_OLDEST er den faste CI-identiteten: aldri tilbakekalt, tross eldst + keepRecent 0.
		const revoke = certsToRevoke([named, ...api], { keepRecent: 0, keepIds: ["API_OLDEST"] });
		const ids = revoke.map((c) => c.id);
		expect(ids).not.toContain("API_OLDEST"); // beskyttet
		expect(ids).not.toContain("NAMED1"); // navngitt, aldri
		// resten av API-certene tilbakekalles fortsatt
		expect(ids.slice().sort()).toEqual(["API_NEW", "API_NEWEST", "API_OLD"]);
	});

	it("keepIds er utenfor keepRecent-regnskapet — beskyttet cert teller ikke som «nyeste»", () => {
		// Beskytt API_NEWEST; keepRecent 1 skal da skåne den NYESTE av de GJENVÆRENDE (API_NEW).
		const revoke = certsToRevoke([...api], { keepRecent: 1, keepIds: ["API_NEWEST"] });
		const ids = revoke.map((c) => c.id).sort();
		expect(ids).toEqual(["API_OLD", "API_OLDEST"]); // API_NEWEST beskyttet, API_NEW skånet av keepRecent
	});

	it("tom/uggyldig keepIds oppfører seg som før (ingen beskyttelse)", () => {
		expect(certsToRevoke([...api], { keepRecent: 2, keepIds: [] }).map((c) => c.id).sort()).toEqual(["API_OLD", "API_OLDEST"]);
		expect(certsToRevoke([...api], { keepRecent: 2, keepIds: ["", null] }).map((c) => c.id).sort()).toEqual(["API_OLD", "API_OLDEST"]);
	});
});

describe("pruneSigningCerts", () => {
	it("lister, tilbakekaller de riktige og rapporterer et sammendrag", async () => {
		const deleted = [];
		const request = vi.fn(async (_auth, method, path) => {
			if (method === "GET") return { data: [named, ...api] };
			if (method === "DELETE") {
				deleted.push(path);
				return null; // ASC svarer 204 uten body
			}
		});
		const summary = await pruneSigningCerts({ auth, request, keepRecent: 2, log: silent });
		expect(summary).toEqual({ found: 5, named: 1, apiMinted: 4, kept: 3, revoked: 2, failed: 0 });
		expect(deleted.slice().sort()).toEqual(["/v1/certificates/API_OLD", "/v1/certificates/API_OLDEST"]);
		// GET-en spør bredt (limit=200) så cap-ede kontoer ryddes fullstendig.
		expect(request).toHaveBeenCalledWith(auth, "GET", "/v1/certificates?limit=200");
	});

	it("FAIL-SOFT: en DELETE-feil logges og kjøringen fortsetter (kaster ikke)", async () => {
		const request = vi.fn(async (_auth, method, path) => {
			if (method === "GET") return { data: [...api] };
			if (method === "DELETE" && path.endsWith("API_OLDEST")) throw new Error("409 CONFLICT");
			return null;
		});
		const errors = [];
		const summary = await pruneSigningCerts({ auth, request, keepRecent: 2, log: { log: () => {}, error: (m) => errors.push(m) } });
		// Én DELETE feilet, den andre lyktes — prune kastet ikke.
		expect(summary.revoked).toBe(1);
		expect(summary.failed).toBe(1);
		expect(errors.join(" ")).toMatch(/API_OLDEST/);
	});

	it("FAIL-SOFT: en list-feil logges og gir tomt sammendrag (kaster ikke, exit 0)", async () => {
		const request = vi.fn(async () => {
			throw new Error("500 SERVER");
		});
		const errors = [];
		const summary = await pruneSigningCerts({ auth, request, log: { log: () => {}, error: (m) => errors.push(m) } });
		expect(summary).toEqual({ found: 0, named: 0, apiMinted: 0, kept: 0, revoked: 0, failed: 0 });
		expect(request).toHaveBeenCalledTimes(1); // ingen DELETE-forsøk etter list-feil
		expect(errors.join(" ")).toMatch(/kunne ikke liste/);
	});

	it("ingen API-mintede certer ⇒ ingen DELETE (bare eierens navngitte finnes)", async () => {
		const request = vi.fn(async (_auth, method) => (method === "GET" ? { data: [named] } : null));
		const summary = await pruneSigningCerts({ auth, request, log: silent });
		expect(summary).toEqual({ found: 1, named: 1, apiMinted: 0, kept: 1, revoked: 0, failed: 0 });
		expect(request).toHaveBeenCalledTimes(1); // kun GET
	});

	it("keepIds beskytter CI-identiteten mot dens egen prune (WP-153)", async () => {
		const deleted = [];
		const request = vi.fn(async (_auth, method, path) => {
			if (method === "GET") return { data: [named, ...api] };
			if (method === "DELETE") { deleted.push(path); return null; }
		});
		// API_NEWEST er CI-identiteten. keepRecent 0 ⇒ alle andre API-certer ryddes, men den beskyttede overlever.
		const summary = await pruneSigningCerts({ auth, request, keepRecent: 0, keepIds: ["API_NEWEST"], log: silent });
		expect(deleted).not.toContain("/v1/certificates/API_NEWEST"); // aldri CI-identiteten
		expect(deleted.slice().sort()).toEqual([
			"/v1/certificates/API_NEW",
			"/v1/certificates/API_OLD",
			"/v1/certificates/API_OLDEST",
		]);
		expect(summary).toEqual({ found: 5, named: 1, apiMinted: 4, kept: 2, revoked: 3, failed: 0 });
	});
});
