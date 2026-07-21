// testflight-upload.js — release-lanens selv-helende byggnummer-race-fiks (WP-151):
// den rene kollisjons-parseren + arkiver→last-opp-retry-orkestreringen. Network-/
// xcodebuild-fritt: `archive`/`upload` injiseres som mocks (samme injeksjonsmønster
// som asc-api.test.js / prune-signing-certs.test.js).
import { describe, it, expect, vi } from "vitest";
import { parseBuildCollision, uploadWithRetry } from "../scripts/testflight-upload.js";

// Den EKTE ASC-feilteksten en tett kjøring får (exit 70) når byggnummeret allerede
// er registrert på en fersk opplasting fra en kjøring rett før.
const collisionErr = (n) =>
	"error: exportArchive The provided entity includes an attribute with a value that " +
	`has already been used. The bundle version must be higher than the previously uploaded version: '${n}'.`;

const ok = (output = "EXPORT SUCCEEDED\nUpload succeeded") => ({ ok: true, output });
const fail = (output) => ({ ok: false, output });
const quietLog = { warn: () => {}, log: () => {}, error: () => {} };

describe("parseBuildCollision", () => {
	it("trekker ut det allerede-brukte byggnummeret fra ASCs kollisjonsfeil", () => {
		expect(parseBuildCollision(collisionErr(42))).toBe(42);
	});

	it("tåler nummeret uten omsluttende apostrofer", () => {
		expect(
			parseBuildCollision("The bundle version must be higher than the previously uploaded version: 7"),
		).toBe(7);
	});

	it("returnerer null for en output UTEN kollisjonen (annen feil / suksess)", () => {
		expect(parseBuildCollision("EXPORT SUCCEEDED\nUpload succeeded")).toBeNull();
		expect(parseBuildCollision("error: some unrelated signing failure")).toBeNull();
	});

	it("returnerer null for tom/manglende input", () => {
		expect(parseBuildCollision(null)).toBeNull();
		expect(parseBuildCollision(undefined)).toBeNull();
		expect(parseBuildCollision("")).toBeNull();
	});
});

describe("uploadWithRetry", () => {
	it("suksess på første forsøk → arkiverer med start-nummeret, ingen retry", async () => {
		const archive = vi.fn(async () => ok("ARCHIVE SUCCEEDED"));
		const upload = vi.fn(async () => ok());
		const res = await uploadWithRetry({ build: 5, archive, upload, log: quietLog });
		expect(res).toEqual({ build: 5, attempts: 1 });
		expect(archive).toHaveBeenCalledTimes(1);
		expect(archive).toHaveBeenCalledWith(5);
		expect(upload).toHaveBeenCalledTimes(1);
	});

	it("kollisjon så suksess → re-arkiverer med N+1 og bruker det faktiske nummeret", async () => {
		const archive = vi.fn(async () => ok("ARCHIVE SUCCEEDED"));
		// Første opplasting kolliderer (ASC har allerede bygg 5), andre lykkes.
		const upload = vi
			.fn()
			.mockResolvedValueOnce(fail(collisionErr(5)))
			.mockResolvedValueOnce(ok());
		const res = await uploadWithRetry({ build: 5, archive, upload, maxAttempts: 3, log: quietLog });
		expect(res).toEqual({ build: 6, attempts: 2 });
		// Re-arkivert med 6 (nytt byggnummer bakes inn ved arkivering).
		expect(archive.mock.calls.map((c) => c[0])).toEqual([5, 6]);
		expect(upload).toHaveBeenCalledTimes(2);
	});

	it("bumper til max(N+1, current+1) når ASC rapporterer et HØYERE brukt nummer", async () => {
		const archive = vi.fn(async () => ok());
		// Vi startet på 10, men ASC har allerede sett 12 (en annen kjøring hoppet forbi).
		const upload = vi
			.fn()
			.mockResolvedValueOnce(fail(collisionErr(12)))
			.mockResolvedValueOnce(ok());
		const res = await uploadWithRetry({ build: 10, archive, upload, log: quietLog });
		expect(res.build).toBe(13);
		expect(archive.mock.calls.map((c) => c[0])).toEqual([10, 13]);
	});

	it("flere kollisjoner på rad → øker nummeret hver gang til det lykkes", async () => {
		const archive = vi.fn(async () => ok());
		const upload = vi
			.fn()
			.mockResolvedValueOnce(fail(collisionErr(5)))
			.mockResolvedValueOnce(fail(collisionErr(6)))
			.mockResolvedValueOnce(ok());
		const res = await uploadWithRetry({ build: 5, archive, upload, maxAttempts: 3, log: quietLog });
		expect(res).toEqual({ build: 7, attempts: 3 });
		expect(archive.mock.calls.map((c) => c[0])).toEqual([5, 6, 7]);
	});

	it("oppbrukte forsøk (vedvarende kollisjon) → feiler høyt", async () => {
		const archive = vi.fn(async () => ok());
		const upload = vi.fn(async () => fail(collisionErr(5))); // kolliderer alltid
		await expect(
			uploadWithRetry({ build: 5, archive, upload, maxAttempts: 3, log: quietLog }),
		).rejects.toThrow(/vedvarte etter 3 forsøk/);
		expect(upload).toHaveBeenCalledTimes(3);
	});

	it("opplastingsfeil som IKKE er en byggnummer-kollisjon → feiler umiddelbart uten retry", async () => {
		const archive = vi.fn(async () => ok());
		const upload = vi.fn(async () => fail("error: some other export failure"));
		await expect(
			uploadWithRetry({ build: 5, archive, upload, log: quietLog }),
		).rejects.toThrow(/ikke en byggnummer-kollisjon/);
		expect(upload).toHaveBeenCalledTimes(1);
		expect(archive).toHaveBeenCalledTimes(1);
	});

	it("arkiverings-feil → feiler høyt uten å prøve å laste opp", async () => {
		const archive = vi.fn(async () => fail("ARCHIVE FAILED\nerror: signing broke"));
		const upload = vi.fn(async () => ok());
		await expect(
			uploadWithRetry({ build: 5, archive, upload, log: quietLog }),
		).rejects.toThrow(/arkivering feilet/);
		expect(upload).not.toHaveBeenCalled();
	});

	it("avviser et ugyldig start-byggnummer", async () => {
		await expect(
			uploadWithRetry({ build: 0, archive: async () => ok(), upload: async () => ok(), log: quietLog }),
		).rejects.toThrow(/ugyldig start-byggnummer/);
	});
});
