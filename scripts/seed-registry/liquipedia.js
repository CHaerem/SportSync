/**
 * WP-161: esports (CS2) org seed — Liquipedia's Portal:Teams via the same
 * MediaWiki parse API host/contract the esports fetcher uses (APIClient sends
 * Accept-Encoding: gzip, which Liquipedia requires). The portal lists the
 * active, notable orgs by region; the page name is the durable external id.
 *
 * Liquipedia's API terms ask for ~30s between parse-action requests — this is
 * ONE request, run manually/rarely (npm run seed:registry), never in the
 * hourly pipeline.
 */

const PORTAL_URL =
	"https://liquipedia.net/counterstrike/api.php?action=parse&page=Portal:Teams&format=json";

/** Decode the handful of HTML entities MediaWiki emits in team names. */
export function decodeHtmlEntities(s) {
	return String(s || "")
		.replace(/&amp;/g, "&")
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

/**
 * Portal:Teams parse-API response HTML → team candidates, deduped by page
 * name. Skips redlinks (index.php?title=…&action=edit) — those have no page.
 */
export function esportsEntitiesFromPortalHtml(html) {
	const seen = new Set();
	const out = [];
	const re = /<span class="team-template-text"><a href="\/counterstrike\/([^"]+)"[^>]*>([^<]+)<\/a>/g;
	let m;
	while ((m = re.exec(String(html || ""))) !== null) {
		const page = decodeURIComponent(m[1]);
		if (page.includes("index.php") || seen.has(page)) continue;
		seen.add(page);
		out.push({
			name: decodeHtmlEntities(m[2]).trim(),
			aliases: [],
			sport: "esports",
			type: "team",
			external: { liquipedia: page },
		});
	}
	return out;
}

/** Live seed: every active CS2 org on Portal:Teams. */
export async function seedEsports(fetchJson) {
	const json = await fetchJson(PORTAL_URL);
	return esportsEntitiesFromPortalHtml(json?.parse?.text?.["*"] || "");
}
