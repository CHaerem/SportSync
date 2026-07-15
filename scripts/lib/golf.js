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
