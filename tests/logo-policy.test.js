// WP-186: the logo POLICY switch (scripts/lib/logo-policy.js + build-entities).
//
// The owner decided (22.07) to show real club marks on the editorial/identifying
// rationale. The engineering answer to a decision like that is a SWITCH with
// per-mark provenance — so it can be reversed mechanically if the assessment ever
// changes, or if a club asks.
//
// This file proves the switch is real and not decorative: flipping ONE config
// field must strip every editorial mark from what we publish, while the
// provably-free ones survive; and a mark without provenance must never ship
// under either policy.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { readLogoPolicy, isLogoAllowed, LOGO_POLICIES, DEFAULT_LOGO_POLICY } from "../scripts/lib/logo-policy.js";
import { buildEntityIndex } from "../scripts/build-entities.js";

const freeMark = {
	file: "rosenborg.png",
	source: "wikimedia-commons",
	basis: "free-license",
	license: "Public domain",
	sourceUrl: "https://commons.wikimedia.org/wiki/File:Rosenborg.svg",
};
const editorialMark = {
	file: "afc-bournemouth.png",
	source: "espn",
	basis: "editorial-use",
	sourceUrl: "https://a.espncdn.com/i/teamlogos/soccer/500/349.png",
};

describe("the switch", () => {
	it("free-only ships the free mark and EXCLUDES the editorial one", () => {
		expect(isLogoAllowed(freeMark, "free-only")).toBe(true);
		expect(isLogoAllowed(editorialMark, "free-only")).toBe(false);
	});

	it("editorial ships both — free marks are not lost by opening the switch", () => {
		expect(isLogoAllowed(freeMark, "editorial")).toBe(true);
		expect(isLogoAllowed(editorialMark, "editorial")).toBe(true);
	});

	it("an unknown policy value falls back to free-only, never to the open one", () => {
		expect(isLogoAllowed(editorialMark, "everything")).toBe(false);
		expect(isLogoAllowed(editorialMark, undefined)).toBe(false);
		expect(DEFAULT_LOGO_POLICY).toBe("free-only");
		expect(LOGO_POLICIES).toEqual(["free-only", "editorial"]);
	});
});

describe("provenance is mandatory", () => {
	it("no basis ⇒ never shipped, under either policy", () => {
		const { basis, ...noBasis } = editorialMark;
		expect(isLogoAllowed(noBasis, "editorial")).toBe(false);
		expect(isLogoAllowed({ ...noBasis, basis: "vibes" }, "editorial")).toBe(false);
	});

	it("no source or sourceUrl ⇒ never shipped (we must be able to say where it came from)", () => {
		const { source, ...noSource } = editorialMark;
		const { sourceUrl, ...noUrl } = editorialMark;
		expect(isLogoAllowed(noSource, "editorial")).toBe(false);
		expect(isLogoAllowed(noUrl, "editorial")).toBe(false);
	});

	it("a free-license claim with no named licence is not a claim we can defend", () => {
		const { license, ...noLicense } = freeMark;
		expect(isLogoAllowed(noLicense, "free-only")).toBe(false);
	});

	it("garbage in, nothing out", () => {
		for (const bad of [null, undefined, "logo.png", 42, {}, { file: "" }]) {
			expect(isLogoAllowed(bad, "editorial")).toBe(false);
		}
	});
});

describe("reading the config", () => {
	it("a missing or corrupt config file ⇒ free-only (fail-closed)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logopolicy-"));
		expect(readLogoPolicy(dir)).toBe("free-only");
		fs.writeFileSync(path.join(dir, "logo-policy.json"), "{ not json");
		expect(readLogoPolicy(dir)).toBe("free-only");
		fs.writeFileSync(path.join(dir, "logo-policy.json"), JSON.stringify({ policy: "yes-please" }));
		expect(readLogoPolicy(dir)).toBe("free-only");
	});

	it("the CHECKED-IN config is one of the two known policies", () => {
		expect(LOGO_POLICIES).toContain(readLogoPolicy(path.join(process.cwd(), "scripts", "config")));
	});
});

// ── end-to-end: the switch reaches the published artifact ────────────────────

function tempConfig(policy) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logo-e2e-"));
	fs.mkdirSync(path.join(dir, "registry"));
	fs.writeFileSync(
		path.join(dir, "registry", "football.json"),
		JSON.stringify({
			entities: [
				{ id: "rosenborg", name: "Rosenborg", aliases: [], sport: "football", type: "team", logo: freeMark, external: {} },
				{ id: "afc-bournemouth", name: "AFC Bournemouth", aliases: [], sport: "football", type: "team", logo: editorialMark, external: {} },
			],
		})
	);
	fs.writeFileSync(path.join(dir, "logo-policy.json"), JSON.stringify({ policy }));
	return dir;
}

describe("build-entities applies the policy at PUBLISH time", () => {
	it("editorial: both marks reach entities.json", () => {
		const entities = buildEntityIndex(tempConfig("editorial"), {});
		const byId = Object.fromEntries(entities.map((e) => [e.id, e]));
		expect(byId["rosenborg"].logo.basis).toBe("free-license");
		expect(byId["afc-bournemouth"].logo.basis).toBe("editorial-use");
	});

	it("free-only: the editorial mark DISAPPEARS from entities.json, no re-seed, no client change", () => {
		// This is the property the whole design rests on. Flip one field, rebuild,
		// and every surface (web rows, iOS rows, widget) stops showing that
		// category — because they all render what entities.json says.
		const entities = buildEntityIndex(tempConfig("free-only"), {});
		const byId = Object.fromEntries(entities.map((e) => [e.id, e]));
		expect(byId["rosenborg"].logo.basis).toBe("free-license");
		expect(byId["afc-bournemouth"].logo).toBeUndefined();
	});
});
