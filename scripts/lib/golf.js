// Shared golf-leaderboard field extraction.
//
// ESPN golf competitors are mapped into leaderboard rows in three places that all
// pulled the same fields out of the same nested shape: fetch-standings.js
// (`mapCompetitor`) and fetch-results.js (top players + Norwegian players). This
// is the single source of that extraction. Callers pick/rename the fields they
// need (standings adds `positionDisplay`/`headshot` and calls the last-round score
// `today`; results calls it `roundScore`), so this returns the common primitives
// and lets each caller shape its own row — keeping every existing output byte-identical.

/**
 * Extract the fields common to every golf leaderboard row from an ESPN competitor.
 * @param {object} c    ESPN competitor object
 * @param {number} idx  zero-based position in the competitor list (fallback rank)
 * @returns {{position:number, player:string, score:string, round:string, thru:string}}
 */
export function golfCompetitorFields(c, idx) {
	return {
		position: c.order || parseInt(c.status?.position?.displayName || "0", 10) || (idx + 1),
		player: c.athlete?.displayName || c.athlete?.fullName || "Unknown",
		score: typeof c.score === "object" ? (c.score?.displayValue || "E") : (c.score?.toString() || "E"),
		round: c.linescores?.[c.linescores.length - 1]?.displayValue || "-",
		thru: c.status?.thru?.toString() || "-",
	};
}

// --- Participation freshness (WP-95) ---
// A followed golfer who is OUT of an in-progress tournament (missed the cut,
// withdrew, was disqualified) must never be shown as still playing. The
// authoritative signal lives on ESPN's core-API competitor status endpoint
// (…/competitors/{id}/status), whose `type.name` carries STATUS_CUT /
// STATUS_WITHDRAWN / STATUS_DISQUALIFIED and whose `displayValue` /
// `type.shortDetail` carries the human "CUT" / "WD" / "DQ" (the lighter
// site.api scoreboard competitor does NOT expose this — verified 2026-07-18,
// The Open R3: scoreboard competitors had no `.status`, while the core-API
// status resolved to {type:{name:"STATUS_CUT"}, displayValue:"CUT"} for Hovland).
// This maps that ESPN status object to a calm Norwegian label, or null when the
// player is still active. Robust across BOTH shapes so a machine-name rename or a
// missing type still catches the "CUT"/"WD"/"DQ" short code, and vice-versa.

/** Calm Norwegian labels for the ways a golfer leaves a live tournament. */
export const GOLF_OUT_LABELS = {
	cut: "røk cutten",
	withdrawn: "trakk seg",
	disqualified: "diskvalifisert",
};

/**
 * Map an ESPN golf competitor status object to a Norwegian participation label,
 * or null when the player is still active (scheduled / in progress / final-made-cut).
 * @param {object} espnStatus  resolved …/competitors/{id}/status payload
 * @returns {string|null}
 */
export function golfParticipationStatus(espnStatus) {
	if (!espnStatus || typeof espnStatus !== "object") return null;
	const name = String(espnStatus.type?.name || "").toUpperCase();
	// displayValue is "CUT"/"WD"/"DQ" only for departed players; for active players
	// it is a tee-time ISO string or a score, so matching the short codes is safe.
	const short = String(espnStatus.displayValue || espnStatus.type?.shortDetail || "")
		.toUpperCase().trim();
	if (name === "STATUS_CUT" || short === "CUT" || short === "MC") return GOLF_OUT_LABELS.cut;
	if (name === "STATUS_WITHDRAWN" || name === "STATUS_WD" || short === "WD") return GOLF_OUT_LABELS.withdrawn;
	if (name === "STATUS_DISQUALIFIED" || name === "STATUS_DQ" || short === "DQ") return GOLF_OUT_LABELS.disqualified;
	return null;
}

/** True when a participation label means the golfer is out of the tournament. */
export function isOutOfTournament(status) {
	return typeof status === "string" && Object.values(GOLF_OUT_LABELS).includes(status);
}
