// WP-186: the licence gate (scripts/lib/logo-license.js).
//
// This is the test that matters most in the whole work package. A wrong ACCEPT
// ships an infringing asset to every user of a commercial app; a wrong REJECT
// shows a monogram. So the suite is written from the rejection side: the cases
// below are the ones that must never slip through, and the accepts are the small,
// explicit whitelist.
import { describe, it, expect } from "vitest";
import { classifyLicense, normalizeLicense, plainText, LOGO_LICENSE_FAMILIES } from "../scripts/lib/logo-license.js";

/** A Commons `imageinfo` stub. */
const info = (ext) => ({ extmetadata: Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, { value: v }])) });

describe("FAIL-CLOSED: what must be rejected", () => {
	it("rejects a NON-FREE logo — the case Wikipedia is full of", () => {
		// This is the real shape of an English-Wikipedia crest: hosted under a
		// non-free/fair-use rationale, EXPLICITLY not reusable commercially. It is
		// the single most available, most tempting source, and it must lose.
		const v = classifyLicense(
			info({
				License: "fair use",
				LicenseShortName: "Non-free logo",
				UsageTerms: "Non-free media",
				Artist: "Arsenal F.C.",
			})
		);
		expect(v.ok).toBe(false);
		expect(v.reason).toMatch(/non-free|fair use/i);
	});

	it("rejects when the licence field is MISSING entirely", () => {
		expect(classifyLicense(info({ Artist: "Someone" })).ok).toBe(false);
		expect(classifyLicense(info({ Artist: "Someone" })).reason).toMatch(/licence/i);
	});

	it("rejects when there is no extmetadata at all (nothing is 'assumed free')", () => {
		expect(classifyLicense(null).ok).toBe(false);
		expect(classifyLicense({}).ok).toBe(false);
		expect(classifyLicense(undefined).ok).toBe(false);
	});

	it("rejects an UNKNOWN licence string rather than guessing", () => {
		const v = classifyLicense(info({ LicenseShortName: "Club permission, personal use only" }));
		expect(v.ok).toBe(false);
		expect(v.reason).toMatch(/ikke|not whitelisted/i);
	});

	it("rejects NC and ND — free-ish is not free", () => {
		expect(classifyLicense(info({ License: "cc-by-nc-sa-3.0", LicenseShortName: "CC BY-NC-SA 3.0" })).ok).toBe(false);
		expect(classifyLicense(info({ License: "cc-by-nd-4.0", LicenseShortName: "CC BY-ND 4.0" })).ok).toBe(false);
		// The dangerous shape: a prefix match on "cc by" would have let these in.
		expect(classifyLicense(info({ License: "cc-by-nc-4.0" })).ok).toBe(false);
	});

	it("rejects when the two licence fields DISAGREE — ambiguity is not resolved in our favour", () => {
		const v = classifyLicense(info({ License: "cc-by-sa-4.0", LicenseShortName: "Non-free logo" }));
		expect(v.ok).toBe(false);
	});

	it("rejects CC BY / CC BY-SA with no named author — we could not credit it", () => {
		// Attribution is a CONDITION of these licences. If Commons doesn't tell us
		// who to credit, we cannot comply, so we don't ship it.
		expect(classifyLicense(info({ License: "cc-by-sa-4.0", LicenseShortName: "CC BY-SA 4.0" })).ok).toBe(false);
		expect(classifyLicense(info({ License: "cc-by-4.0", LicenseShortName: "CC BY 4.0" })).ok).toBe(false);
	});

	it("rejects 'all rights reserved'", () => {
		expect(classifyLicense(info({ LicenseShortName: "All rights reserved" })).ok).toBe(false);
	});
});

describe("the whitelist: what may pass", () => {
	it("public domain (incl. PD-textlogo — the family most free crests belong to)", () => {
		const pd = classifyLicense(info({ License: "pd", LicenseShortName: "Public domain", Artist: "Liverpool FC" }));
		expect(pd.ok).toBe(true);
		expect(pd.licenseId).toBe("pd");

		const textlogo = classifyLicense(info({ License: "pd-textlogo", LicenseShortName: "PD-textlogo" }));
		expect(textlogo.ok).toBe(true);
		expect(textlogo.licenseId).toBe("pd");
	});

	it("CC0", () => {
		expect(classifyLicense(info({ License: "cc0", LicenseShortName: "CC0" })).licenseId).toBe("cc0");
	});

	it("CC BY / CC BY-SA — but only WITH the author we must credit", () => {
		const by = classifyLicense(info({ License: "cc-by-4.0", LicenseShortName: "CC BY 4.0", Artist: "<a href='#'>Ola</a>" }));
		expect(by.ok).toBe(true);
		expect(by.licenseId).toBe("cc-by");
		expect(by.attribution).toBe("Ola"); // HTML stripped — this is prose from a wiki.

		const sa = classifyLicense(info({ License: "cc-by-sa-3.0", LicenseShortName: "CC BY-SA 3.0", Credit: "Eget arbeid" }));
		expect(sa.ok).toBe(true);
		expect(sa.licenseId).toBe("cc-by-sa");
		expect(sa.attribution).toBe("Eget arbeid");
	});

	it("reports the STRICTEST family when the two fields differ in strictness", () => {
		// Both free, but the duties of the stricter one are the ones that bind us.
		const v = classifyLicense(info({ License: "cc-by-sa-4.0", LicenseShortName: "CC BY-SA 4.0", Artist: "X" }));
		expect(v.licenseId).toBe("cc-by-sa");
	});

	it("records a TRADEMARK restriction without rejecting on it", () => {
		// A club mark is nearly always a trademark. Trademark law governs
		// confusion about origin, not copying of the drawing — referential use is
		// the lawful case, so this is metadata, not a veto.
		const v = classifyLicense(info({ License: "pd", LicenseShortName: "Public domain", Restrictions: "trademarked", Artist: "Rosenborg Ballklub" }));
		expect(v.ok).toBe(true);
		expect(v.trademarked).toBe(true);
	});

	it("the whitelist is exactly four families — a change here is a legal change", () => {
		expect(LOGO_LICENSE_FAMILIES.map((f) => f.id).sort()).toEqual(["cc-by", "cc-by-sa", "cc0", "pd"]);
	});
});

describe("normalisation", () => {
	it("strips the HTML Commons wraps its prose in", () => {
		expect(plainText('<a href="x" rel="nofollow">Foo &amp; Bar</a>')).toBe("Foo & Bar");
	});

	it("folds separators so 'cc-by-sa-4.0' and 'CC BY-SA 4.0' are one thing", () => {
		expect(normalizeLicense("CC BY-SA 4.0")).toBe("cc by-sa 4.0");
		expect(normalizeLicense("cc_by_sa_4.0")).toBe("cc-by-sa-4.0");
	});
});
