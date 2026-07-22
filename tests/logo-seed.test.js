// WP-186: the network-free half of the logo seeder (scripts/seed-registry/logos.js).
//
// The risky part of this pipeline is not the licence check (tests/logo-license.js
// covers that) but the IDENTITY step: a wrong Wikidata match ships the WRONG
// club's crest, which is worse than no crest at all. So the matcher is written to
// abstain, and this file pins that it does.
import { describe, it, expect } from "vitest";
import { normalizeName, pickCandidate, logoFileName, isPng, espnLogoUrl, LOGO_WIDTH } from "../scripts/seed-registry/logos.js";

describe("name normalisation", () => {
	it("drops club-form noise so 'Liverpool F.C.' and 'Liverpool' are one club", () => {
		expect(normalizeName("Liverpool F.C.")).toBe(normalizeName("Liverpool"));
		expect(normalizeName("AFC Bournemouth")).toBe("bournemouth");
		expect(normalizeName("Rosenborg BK")).toBe("rosenborg");
	});

	it("folds diacritics and punctuation", () => {
		expect(normalizeName("Bodø/Glimt")).toBe("bodo glimt");
		expect(normalizeName("Beşiktaş J.K.")).toBe("besiktas jk");
	});

	it("keeps SOMETHING when a name is nothing but noise words", () => {
		expect(normalizeName("FC")).toBe("fc");
	});
});

describe("candidate matching abstains rather than guesses", () => {
	const entity = { name: "Rosenborg", aliases: ["Rosenborg BK"], sport: "football" };

	it("takes an exact normalised match on the name or an alias", () => {
		expect(pickCandidate(entity, [{ id: "Q186785", labels: ["Rosenborg BK"], sports: ["Q2736"] }])).toBe("Q186785");
	});

	it("refuses a near-miss — no fuzzy scoring, no 'closest' fallback", () => {
		expect(pickCandidate(entity, [{ id: "Q1", labels: ["Rosenborg 2"], sports: ["Q2736"] }])).toBeNull();
		expect(pickCandidate(entity, [{ id: "Q1", labels: ["Rosenborgs Ballklub Trondheim"], sports: [] }])).toBeNull();
	});

	it("refuses a same-name club from the WRONG sport", () => {
		// The trap the registry is full of: a football club and a handball club
		// sharing a town name. A crest on the wrong row is a visible lie.
		expect(pickCandidate(entity, [{ id: "Q9", labels: ["Rosenborg"], sports: ["Q8418"] }])).toBeNull();
	});

	it("refuses when TWO candidates both qualify — ambiguity resolves to the monogram", () => {
		const two = [
			{ id: "Q1", labels: ["Rosenborg"], sports: ["Q2736"] },
			{ id: "Q2", labels: ["Rosenborg BK"], sports: [] },
		];
		expect(pickCandidate(entity, two)).toBeNull();
	});

	it("accepts a candidate that declares no sport at all (P641 is often absent)", () => {
		expect(pickCandidate(entity, [{ id: "Q3", labels: ["Rosenborg"], sports: [] }])).toBe("Q3");
	});

	it("no candidates ⇒ null", () => {
		expect(pickCandidate(entity, [])).toBeNull();
		expect(pickCandidate(entity, undefined)).toBeNull();
	});
});

describe("assets", () => {
	it("names the file after the entity's STABLE id, so the client can validate it locally", () => {
		expect(logoFileName("afc-bournemouth")).toBe("afc-bournemouth.png");
	});

	it("only accepts real PNG bytes — a JPEG 'logo' is a matte-white box on true black", () => {
		expect(isPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(true);
		expect(isPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]))).toBe(false);
		expect(isPng(Buffer.alloc(0))).toBe(false);
		expect(isPng(null)).toBe(false);
	});

	it("ships a ~96 px rendition — a 24 pt avatar at @3x, with headroom", () => {
		expect(LOGO_WIDTH).toBe(96);
	});
});

describe("the editorial source is enumerated, never guessed", () => {
	it("football resolves to ESPN's own soccer asset path", () => {
		expect(espnLogoUrl("football", "349")).toBe("https://a.espncdn.com/i/teamlogos/soccer/500/349.png");
	});

	it("a sport with no VERIFIED path gets nothing — F1 keeps its monogram", () => {
		// ESPN's F1 teams endpoint carries no `logos` at all; a guessed URL would
		// have been a 404 at best and someone else's image at worst.
		expect(espnLogoUrl("f1", "106842")).toBeNull();
		expect(espnLogoUrl("handball", "1")).toBeNull();
		expect(espnLogoUrl("football", undefined)).toBeNull();
	});
});
