/**
 * WP-186 — the licence gate for real club crests.
 *
 * The legal picture, precisely (PLAN.md § WP-186): a club crest carries TWO
 * rights at once. TRADEMARK — using the mark to IDENTIFY the club (referential
 * use, what every sports app and newspaper does) is normally lawful; trademark
 * law protects against confusion about origin/affiliation, not against pointing.
 * COPYRIGHT IN THE DRAWING — here there is no equivalent exception, and it is the
 * real exposure for a commercial app. Wikipedia hosts nearly every crest as
 * `non-free`/fair use, EXPLICITLY not commercially reusable, so it is no source
 * at all. Wikimedia Commons, by contrast, states the licence MACHINE-READABLY in
 * `imageinfo`'s `extmetadata` — so "provably free" can be DECIDED here instead of
 * assumed.
 *
 * This module is the decision, and nothing else: no network, no filesystem, no
 * side effects. It is pure so the rule that matters can be unit-tested with the
 * cases that must FAIL (tests/logo-license.test.js).
 *
 * The one rule everything else follows: **FAIL-CLOSED**. A logo is admitted only
 * when the licence string is EXPLICITLY on the whitelist below. Missing field,
 * unparsable field, unknown licence, non-free, fair use, NC/ND — all rejected.
 * There is deliberately no "probably fine" branch: a wrong accept ships an
 * infringing asset to every user, a wrong reject shows a monogram.
 */

/**
 * The whitelist, as canonical families. A licence must match one of these
 * ANCHORED patterns after normalisation — anchoring is what keeps
 * "CC BY-NC-SA 3.0" from sneaking in through a "cc by" prefix match.
 *
 *  - cc0        — no rights reserved.
 *  - pd         — public domain, incl. {{PD-textlogo}} / {{PD-shape}} /
 *                 {{PD-ineligible}}: a crest below the threshold of originality
 *                 carries no copyright at all. This is the family that actually
 *                 carries most of the free football crests.
 *  - cc-by      — free WITH mandatory credit.
 *  - cc-by-sa   — free WITH mandatory credit, share-alike (which is exactly why
 *                 we never modify a mark; see `docs/logos/README.md`).
 */
const FREE_FAMILIES = [
	{ id: "cc0", label: "CC0", re: /^(?:cc0(?:[ -]1\.0)?(?:[ -]universal)?|cc[ -]zero)$/ },
	{ id: "pd", re: /^(?:public domain(?:[ -].*)?|pd(?:[ -][a-z0-9-]+)*)$/, label: "Public domain" },
	{ id: "cc-by-sa", label: "CC BY-SA", re: /^cc[ -]by[ -]sa(?:[ -]\d(?:\.\d)?)?(?:[ -][a-z]{2}(?:[ -][a-z]+)?)?$/ },
	{ id: "cc-by", label: "CC BY", re: /^cc[ -]by(?:[ -]\d(?:\.\d)?)?(?:[ -][a-z]{2}(?:[ -][a-z]+)?)?$/ },
];

/** Families that MUST carry a named author for us to be able to comply. */
const ATTRIBUTION_REQUIRED = new Set(["cc-by", "cc-by-sa"]);

/**
 * Loud rejects. Redundant with the whitelist (anything not whitelisted is
 * already out) but kept explicit so the rejection REASON in the coverage report
 * is honest — "non-free" is a different fact from "unknown licence", and the
 * owner's decision about the three ways forward depends on which one dominates.
 */
const KNOWN_UNFREE = [
	{ re: /non[- ]free|fair[- ]use|fairuse/, reason: "non-free/fair use" },
	{ re: /\bnc\b|noncommercial|non[- ]commercial/, reason: "non-commercial (NC)" },
	{ re: /\bnd\b|noderiv|no[- ]deriv/, reason: "no-derivatives (ND)" },
	{ re: /all rights reserved|copyright(?!ed free)/, reason: "all rights reserved" },
];

/** Strip the HTML Commons wraps `Artist`/`Credit` in, and collapse whitespace. */
export function plainText(html) {
	return String(html || "")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/** Canonical form for matching: lowercase, HTML stripped, punctuation calmed. */
export function normalizeLicense(raw) {
	return plainText(raw)
		.toLowerCase()
		.replace(/[_/]/g, "-")
		.replace(/\s*,\s*/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** The `extmetadata` value shape is `{ value }`; missing keys must stay undefined. */
function meta(extmetadata, key) {
	const v = extmetadata && extmetadata[key];
	return v && typeof v === "object" ? v.value : v;
}

/**
 * Decide whether ONE Commons file may be shipped.
 *
 * @param {object} imageinfo one `imageinfo` entry from the Commons API.
 * @returns {{ok: true, license, licenseId, licenseUrl, attribution, trademarked}}
 *        | {ok: false, reason: string, license?: string}
 *
 * Both the machine field (`License`, e.g. "pd", "cc-by-sa-4.0") and the human
 * one (`LicenseShortName`) are consulted, and BOTH must be free when both are
 * present: a file whose machine tag says `cc-by-sa-4.0` while its short name
 * says "Non-free logo" is exactly the ambiguity we refuse to resolve in our own
 * favour.
 */
export function classifyLicense(imageinfo) {
	const ext = (imageinfo && imageinfo.extmetadata) || null;
	if (!ext) return { ok: false, reason: "no extmetadata (licence unknown)" };

	const machine = meta(ext, "License");
	const short = meta(ext, "LicenseShortName");
	const candidates = [machine, short].filter((v) => plainText(v) !== "");
	if (!candidates.length) return { ok: false, reason: "no licence field" };

	const verdicts = candidates.map((raw) => {
		const norm = normalizeLicense(raw);
		const unfree = KNOWN_UNFREE.find((u) => u.re.test(norm));
		if (unfree) return { free: false, reason: unfree.reason, norm };
		const fam = FREE_FAMILIES.find((f) => f.re.test(norm));
		if (!fam) return { free: false, reason: `licence not whitelisted (“${plainText(raw)}”)`, norm };
		return { free: true, fam, norm };
	});

	const bad = verdicts.find((v) => !v.free);
	if (bad) return { ok: false, reason: bad.reason, license: plainText(short || machine) };

	// Both agreed the file is free; report the STRICTEST family seen (CC BY-SA
	// before CC BY before PD/CC0), because that is the one whose duties bind us.
	const order = ["cc-by-sa", "cc-by", "pd", "cc0"];
	const fam = verdicts.map((v) => v.fam).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0];

	const attribution = plainText(meta(ext, "Artist")) || plainText(meta(ext, "Credit"));
	if (ATTRIBUTION_REQUIRED.has(fam.id) && !attribution) {
		return { ok: false, reason: `${fam.label} without a named author — cannot credit`, license: fam.label };
	}

	return {
		ok: true,
		licenseId: fam.id,
		license: plainText(short) || fam.label,
		licenseUrl: plainText(meta(ext, "LicenseUrl")) || undefined,
		attribution: attribution || undefined,
		// Commons' `Restrictions` flags NON-copyright constraints ("trademarked",
		// "insignia", "personality rights"). A trademark does NOT make the drawing
		// unfree, and referential use of a club's mark is the lawful case — so we
		// record it for honesty rather than rejecting on it.
		trademarked: /trademark/i.test(plainText(meta(ext, "Restrictions"))) || undefined,
	};
}

/** Only rasters get shipped: `iiurlwidth` renders SVG to PNG for us server-side. */
export function isSupportedMime(mime) {
	return ["image/png", "image/svg+xml", "image/jpeg", "image/gif", "image/webp"].includes(String(mime || ""));
}

export const LOGO_LICENSE_FAMILIES = FREE_FAMILIES.map((f) => ({ id: f.id, label: f.label }));
