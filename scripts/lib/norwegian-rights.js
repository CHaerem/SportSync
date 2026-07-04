// Norwegian broadcast rights — deterministic map applied at build time so followed
// events ALWAYS show a Norwegian channel (or honestly nothing), never a foreign
// broadcaster like FOX/ESPN. The verify agent refines per-event on top of this;
// this guarantees a correct default. Mirrors .claude/skills/norwegian-rights.

const CH = {
	viaplay: { platform: "Viaplay", url: "https://viaplay.no" },
	tv2: { platform: "TV 2 Play", url: "https://play.tv2.no" },
	nrk: { platform: "NRK", url: "https://tv.nrk.no" },
	discovery: { platform: "Discovery+", url: "https://www.discoveryplus.no" },
	eurosport: { platform: "Eurosport", url: "https://www.eurosport.no" },
	max: { platform: "Max", url: "https://www.max.com" },
};

// Anything matching this is a Norwegian service we can trust to keep as-is.
const NORWEGIAN_RE = /viaplay|tv\s?2|nrk|discovery\+?|eurosport|\bmax\b|v sport|vg\+?|amedia|strim/i;

// National sides — ESPN often labels these matches only "International", so we
// detect nation-vs-nation to route World Cup / landskamper to NRK/TV 2 (never FOX).
const NATIONS = new Set([
	"argentina", "brazil", "norway", "france", "spain", "portugal", "belgium", "germany",
	"italy", "netherlands", "croatia", "switzerland", "denmark", "sweden", "united states",
	"usa", "mexico", "canada", "colombia", "paraguay", "uruguay", "ghana", "morocco",
	"cape verde", "japan", "south korea", "korea republic", "australia", "senegal", "nigeria",
	"egypt", "cameroon", "poland", "austria", "serbia", "ecuador", "iran", "saudi arabia",
	"qatar", "tunisia", "ivory coast", "algeria", "england", "scotland", "wales",
]);
function isNationVsNation(ev) {
	const h = (ev.homeTeam || "").trim().toLowerCase();
	const a = (ev.awayTeam || "").trim().toLowerCase();
	return NATIONS.has(h) && NATIONS.has(a);
}

/** The confident Norwegian rights for an event, or [] when we shouldn't guess. */
export function norwegianRights(ev) {
	const sport = (ev.sport || "").toLowerCase();
	const comp = `${ev.tournament || ""} ${ev.context || ""} ${ev.meta || ""}`.toLowerCase();
	const title = (ev.title || "").toLowerCase();
	const hay = `${comp} ${title}`;

	if (sport === "football") {
		if (/world cup|fifa|\bvm\b/.test(hay)) return [CH.nrk, CH.tv2]; // shared per-match
		if (/premier league/.test(hay)) return [CH.tv2];
		if (/la\s?liga/.test(hay)) return [CH.tv2];
		if (/champions|europa|conference/.test(hay)) return [CH.tv2];
		if (/obos|eliteserie|norwegian|cup|nm\b/.test(hay)) return [CH.tv2];
		if (isNationVsNation(ev)) return [CH.nrk, CH.tv2]; // landskamp / WC labelled only "International"
		return [];
	}
	if (sport === "golf") return /masters/.test(hay) ? [CH.discovery] : [CH.viaplay];
	if (sport === "f1" || sport === "formula1") return [CH.viaplay];
	if (sport === "cycling") return /tour de france/.test(hay) ? [CH.tv2] : [];
	if (sport === "tennis") {
		if (/wimbledon/.test(hay)) return [CH.tv2];
		if (/roland|french open|australian open|us open/.test(hay)) return [CH.discovery, CH.eurosport];
		return [];
	}
	if (/biathlon|skiskyting|cross-country|langrenn|nordic|ski jump|hopp|alpine|alpint/.test(`${sport} ${hay}`)) return [CH.nrk];
	if (sport === "chess") return [CH.nrk];
	return [];
}

/**
 * Normalize an event's streaming to Norwegian options:
 *   1. confident rights map wins;
 *   2. else keep only already-Norwegian entries (drop FOX/ESPN/Apple TV/…);
 *   3. esports keeps its (free, platform-agnostic) streams as-is.
 */
export function normalizeStreaming(ev) {
	if ((ev.sport || "").toLowerCase() === "esports") return ev.streaming || [];
	const mapped = norwegianRights(ev);
	if (mapped.length) return mapped;
	return (ev.streaming || []).filter((s) => NORWEGIAN_RE.test(s.platform || s));
}

// ── Real Norwegian TV listings (tvkampen.com) — actual data over the static map ──

const CHANNEL_URLS = [
	["tv 2 play", "https://play.tv2.no"], ["tv2 play", "https://play.tv2.no"],
	["tv 2 sport", "https://play.tv2.no"], ["tv 2", "https://play.tv2.no"],
	["viaplay", "https://viaplay.no"], ["v sport", "https://viaplay.no"],
	["nrk", "https://tv.nrk.no"],
	["discovery", "https://www.discoveryplus.no"], ["eurosport", "https://www.eurosport.no"],
	["max", "https://www.max.com"], ["vg", "https://www.vg.no/sport"],
];
function urlForChannel(name) {
	const k = name.trim().toLowerCase();
	for (const [needle, url] of CHANNEL_URLS) if (k.includes(needle)) return url;
	return "";
}

function normTeam(s) {
	return (s || "").toLowerCase()
		.replace(/\b(fc|fk|cf|afc|sk|if|il|bk|ff)\b/g, "")
		.replace(/[^a-z0-9æøå ]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
function teamsMatch(a, b) {
	const na = normTeam(a), nb = normTeam(b);
	return !!(na && nb && (na === nb || na.includes(nb) || nb.includes(na)));
}

/** Find the tvkampen listing for a football event by team names. */
export function matchTvListing(ev, listings) {
	if (!ev.homeTeam || !ev.awayTeam || !Array.isArray(listings)) return null;
	return listings.find((l) => teamsMatch(l.homeTeam, ev.homeTeam) && teamsMatch(l.awayTeam, ev.awayTeam)) || null;
}

/** Convert a tvkampen listing's broadcasters to Norwegian streaming objects (drops foreign/betting). */
function listingStreaming(listing) {
	const seen = new Set();
	const out = [];
	for (const b of listing.broadcasters || []) {
		const name = String(b).trim();
		if (!NORWEGIAN_RE.test(name)) continue; // drop betting/foreign leftovers
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ platform: name, url: urlForChannel(name) });
	}
	return out;
}

/**
 * Resolve an event's streaming, preferring REAL scraped Norwegian TV listings
 * (tvkampen) for football, falling back to the deterministic rights map.
 * @param {object} ev
 * @param {Array} tvListings - tv-listings.json `listings` array
 */
export function resolveStreaming(ev, tvListings) {
	if ((ev.sport || "").toLowerCase() === "football") {
		const listing = matchTvListing(ev, tvListings);
		if (listing) {
			const s = listingStreaming(listing);
			if (s.length) return s;
		}
	}
	return normalizeStreaming(ev);
}
