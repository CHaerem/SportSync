/**
 * WP-161: chess seed — the FIDE top-100 lists (open + women) from
 * ratings.fide.com. HTML rows carry the profile id (the durable external id),
 * "Lastname, Firstname" name, federation and rating.
 *
 * No surname aliases: a bare surname ("So", "Ding") is a common word and would
 * poison word-boundary server matching (news/entityId enrichment) — the
 * catalog/tracked layer already carries curated aliases for the elite names.
 */

const LISTS = [
	{ list: "open", url: "https://ratings.fide.com/a_top.php?list=open" },
	{ list: "women", url: "https://ratings.fide.com/a_top.php?list=women" },
];

/** "Carlsen, Magnus" → "Magnus Carlsen" (defensive: names without a comma pass through). */
export function flipFideName(name) {
	const m = String(name || "").split(",");
	if (m.length === 2) return `${m[1].trim()} ${m[0].trim()}`;
	return String(name || "").trim();
}

/**
 * One FIDE top-list HTML page → athlete candidates. Parses each row's
 * /profile/{id} link + name, and the federation code from the flag cell.
 */
export function chessEntitiesFromTopList(html) {
	const out = [];
	const rowRe = /<a href=\/profile\/(\d+)>([^<]+)<\/a>[\s\S]*?flag-wrapper">\s*<img[^>]*>\s*([A-Z]{2,3})/g;
	let m;
	while ((m = rowRe.exec(String(html || ""))) !== null) {
		out.push({
			name: flipFideName(m[2]),
			aliases: [],
			sport: "chess",
			type: "athlete",
			country: m[3],
			external: { fideId: m[1] },
		});
	}
	return out;
}

/** Live seed: FIDE top-100 open + top-100 women. */
export async function seedChess(fetchText) {
	const out = [];
	for (const { url } of LISTS) {
		out.push(...chessEntitiesFromTopList(await fetchText(url)));
	}
	return out;
}
