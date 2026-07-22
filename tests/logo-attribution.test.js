// WP-186: «Merker og kilder» — the web attribution surface (docs/js/logo-attribution.js).
//
// Crediting is not documentation here, it is the CONDITION on which a CC BY /
// CC BY-SA mark may be shown at all. And the editorial marks carry the opposite
// duty: say plainly that they belong to their clubs, and never imply affiliation
// or endorsement — the one claim trademark law actually protects against.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let S;
beforeAll(() => {
	S = createClientSandbox();
	loadClientScript(S, "logo-attribution.js");
});

const manifest = {
	notice: "Klubbmerker tilhører sine respektive klubber og vises utelukkende for å identifisere dem. Sportivista er ikke tilknyttet, sponset av eller godkjent av klubbene.",
	logos: [
		{ id: "rosenborg", name: "Rosenborg", basis: "free-license", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", attribution: "Ola Nordmann", sourceUrl: "https://commons.wikimedia.org/wiki/File:RBK.svg" },
		{ id: "arsenal", name: "Arsenal", basis: "editorial-use", sourceUrl: "https://a.espncdn.com/i/teamlogos/soccer/500/359.png" },
	],
};

describe("the two grounds are credited DIFFERENTLY", () => {
	it("splits the manifest by basis", () => {
		const { free, editorial } = S.ssLogoAttribution.partition(manifest.logos);
		expect(free.map((l) => l.id)).toEqual(["rosenborg"]);
		expect(editorial.map((l) => l.id)).toEqual(["arsenal"]);
	});

	it("a CC BY-SA mark is credited with its licence AND its author — the licence demands both", () => {
		const html = S.ssLogoAttribution.render(manifest);
		expect(html).toContain("Rosenborg");
		expect(html).toContain("CC BY-SA 4.0");
		expect(html).toContain("Ola Nordmann");
		expect(html).toContain("creativecommons.org/licenses/by-sa/4.0/");
	});

	it("the editorial marks get the sober line, and NO claim of affiliation", () => {
		const html = S.ssLogoAttribution.render(manifest);
		expect(html).toMatch(/tilhører sine respektive klubber/);
		expect(html).toMatch(/ikke tilknyttet, sponset av eller godkjent av/);
		expect(html).toMatch(/uendret/);
		// The mark's own name must not be dressed up as a partnership.
		expect(html).not.toMatch(/samarbeid|offisiell partner|i samarbeid med/i);
	});

	it("nothing to credit ⇒ nothing rendered (the surface stays hidden)", () => {
		expect(S.ssLogoAttribution.render({ logos: [] })).toBe("");
		expect(S.ssLogoAttribution.render(null)).toBe("");
	});

	it("escapes third-party prose — attribution text comes from a public wiki", () => {
		const evil = { logos: [{ id: "x", name: "<img src=x onerror=alert(1)>", basis: "free-license", license: "CC BY 4.0", attribution: "\"><script>bad()</script>" }] };
		const html = S.ssLogoAttribution.render(evil);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("the page wiring", () => {
	const index = fs.readFileSync(path.resolve(process.cwd(), "docs", "index.html"), "utf-8");

	it("the surface exists on the board and loads its own module", () => {
		expect(index).toMatch(/id="marks"/);
		expect(index).toMatch(/Merker og kilder/);
		expect(index).toMatch(/js\/logo-attribution\.js/);
	});

	it("the module fetches the manifest from OUR OWN origin — never Commons or a CDN", () => {
		const js = fs.readFileSync(path.resolve(process.cwd(), "docs", "js", "logo-attribution.js"), "utf-8");
		const fetches = [...js.matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
		expect(fetches).toEqual(["logos/ATTRIBUTION.json"]);
	});
});
