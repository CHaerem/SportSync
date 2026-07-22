/**
 * WP-186 — the LOGO POLICY switch, and the provenance rule that makes it usable.
 *
 * The owner's decision (22.07) is that Sportivista shows real club marks, on the
 * editorial/identifying rationale that newspapers and every sports app rely on.
 * That decision is his to make; the engineering answer to it is NOT to bake the
 * assumption in silently, but to build it as a SWITCH with per-mark provenance,
 * so the position can be reversed mechanically — not archaeologically.
 *
 * Two policies:
 *
 *   free-only  — ship ONLY marks whose copyright licence is proven free
 *                (CC0 / public domain incl. PD-textlogo / CC BY / CC BY-SA,
 *                decided in scripts/lib/logo-license.js against Commons'
 *                machine-readable metadata). This is the legally airtight state.
 *   editorial  — additionally ship marks used to IDENTIFY the club, sourced from
 *                the same provider whose fixtures we already consume (ESPN).
 *                Trademark law permits referential use; the copyright in the
 *                drawing is the exposure, and it is a real, if in practice small,
 *                one — see PLAN.md § WP-186 for the honest legal write-up.
 *
 * `basis` per mark is what makes the switch real: every logo record says which
 * of the two grounds it rests on, so flipping the policy removes exactly one
 * category, everywhere, without touching a client. If a takedown or an App Store
 * review ever asks "where did THIS mark come from and on what basis", the
 * registry answers it per mark.
 *
 * **Fail-closed defaults survive the change**: a missing/corrupt policy file, an
 * unknown policy value, or a logo record without complete provenance all resolve
 * to the conservative outcome (free-only / not shipped). The switch can only be
 * opened deliberately.
 */

import fs from "fs";
import path from "path";

export const LOGO_POLICIES = ["free-only", "editorial"];
export const DEFAULT_LOGO_POLICY = "free-only";

/** The two grounds a shipped mark may rest on. */
export const LOGO_BASES = ["free-license", "editorial-use"];

/** Which bases each policy admits. */
const ALLOWED_BASES = {
	"free-only": new Set(["free-license"]),
	editorial: new Set(["free-license", "editorial-use"]),
};

/** Fields every shipped mark must carry — no provenance, no ship. */
const REQUIRED_FIELDS = ["file", "source", "basis", "sourceUrl"];

/**
 * Read the active policy from `<configDir>/logo-policy.json`.
 * Anything unreadable or unrecognised ⇒ `free-only`.
 */
export function readLogoPolicy(configDir) {
	try {
		const raw = fs.readFileSync(path.join(configDir, "logo-policy.json"), "utf8");
		const policy = JSON.parse(raw)?.policy;
		return LOGO_POLICIES.includes(policy) ? policy : DEFAULT_LOGO_POLICY;
	} catch {
		return DEFAULT_LOGO_POLICY;
	}
}

/**
 * May this logo record be published under `policy`?
 *
 * @param {object|null|undefined} logo the registry's `logo` object.
 * @param {string} policy one of LOGO_POLICIES (anything else ⇒ free-only).
 * @returns {boolean}
 */
export function isLogoAllowed(logo, policy) {
	if (!logo || typeof logo !== "object") return false;
	for (const f of REQUIRED_FIELDS) {
		if (typeof logo[f] !== "string" || !logo[f].trim()) return false;
	}
	if (!LOGO_BASES.includes(logo.basis)) return false;
	// A free-licence claim without a named licence is not a claim we can defend.
	if (logo.basis === "free-license" && !String(logo.license || "").trim()) return false;
	const allowed = ALLOWED_BASES[LOGO_POLICIES.includes(policy) ? policy : DEFAULT_LOGO_POLICY];
	return allowed.has(logo.basis);
}
