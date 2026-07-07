// Norwegian broadcast rights — deterministic map applied at build time so followed
// events ALWAYS show a Norwegian channel (or honestly nothing), never a foreign
// broadcaster like FOX/ESPN. The verify agent refines per-event on top of this;
// this guarantees a correct default. Mirrors .claude/skills/norwegian-rights.

// Fallback landing URLs — the sport/live section, not the bare homepage, so a tap
// lands closer to the broadcast and is likelier to be claimed by the app's
// universal links (deep per-event URLs from the verify agent override these).
const CH = {
	viaplay: { platform: "Viaplay", url: "https://viaplay.no" },
	tv2: { platform: "TV 2 Play", url: "https://play.tv2.no/sport" },
	nrk: { platform: "NRK", url: "https://tv.nrk.no/direkte" },
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

// Norwegian → English canonical nation names. ESPN emits English ("Morocco"),
// tvkampen emits Norwegian ("Marokko"); without this map the two never match
// and every national-team fixture falls back to the shared-rights guess.
// Keys are pre-normalized the same way normTeam() normalizes (lowercase, no
// punctuation — so "Sør-Korea" → "sørkorea").
const NATION_CANON = {
	marokko: "morocco", frankrike: "france", brasil: "brazil", norge: "norway",
	spania: "spain", tyskland: "germany", sveits: "switzerland", danmark: "denmark",
	østerrike: "austria", island: "iceland", belgia: "belgium", nederland: "netherlands",
	sverige: "sweden", kroatia: "croatia", sørkorea: "south korea", "korea republic": "south korea",
	japan: "japan", mexico: "mexico", portugal: "portugal", england: "england",
	skottland: "scotland", wales: "wales", usa: "usa", "united states": "usa",
	"forente stater": "usa", argentina: "argentina", egypt: "egypt", colombia: "colombia",
	canada: "canada", paraguay: "paraguay", uruguay: "uruguay", ecuador: "ecuador",
	australia: "australia", senegal: "senegal", nigeria: "nigeria", ghana: "ghana",
	kamerun: "cameroon", algerie: "algeria", tunisia: "tunisia", elfenbenskysten: "ivory coast",
	kappverde: "cape verde", "kapp verde": "cape verde", saudiarabia: "saudi arabia",
	"saudi arabia": "saudi arabia", qatar: "qatar", iran: "iran", polen: "poland",
	serbia: "serbia", italia: "italy", sørafrika: "south africa",
};

function isNationVsNation(ev) {
	const h = normTeam(ev.homeTeam || "");
	const a = normTeam(ev.awayTeam || "");
	return NATIONS.has(h) && NATIONS.has(a);
}

// A World Cup fixture — ESPN sometimes labels these only "International", so we
// also treat any nation-vs-nation match as WC-adjacent for channel resolution.
function isWorldCup(ev) {
	const hay = `${ev.tournament || ""} ${ev.context || ""} ${ev.meta || ""} ${ev.title || ""}`.toLowerCase();
	return /world cup|fifa|\bvm\b/.test(hay) || isNationVsNation(ev);
}

// Norwegian WC 2026 rights are shared by NRK + TV 2 ONLY. When we can't confirm
// which of the two carries a specific match, this single tentative label is more
// honest (and calmer) than two chips that read as "airs on both".
const WC_SHARED = { platform: "NRK / TV 2", url: "https://tv.nrk.no", tentative: true };

/** The confident Norwegian rights for an event, or [] when we shouldn't guess. */
export function norwegianRights(ev) {
	const sport = (ev.sport || "").toLowerCase();
	const comp = `${ev.tournament || ""} ${ev.context || ""} ${ev.meta || ""}`.toLowerCase();
	const title = (ev.title || "").toLowerCase();
	const hay = `${comp} ${title}`;

	if (sport === "football") {
		if (/world cup|fifa|\bvm\b/.test(hay)) return [WC_SHARED]; // NRK/TV 2 shared — exact channel TBD
		if (/premier league/.test(hay)) return [CH.tv2];
		if (/la\s?liga/.test(hay)) return [CH.tv2];
		if (/champions|europa|conference/.test(hay)) return [CH.tv2];
		if (/obos|eliteserie|norwegian|cup|nm\b/.test(hay)) return [CH.tv2];
		if (isNationVsNation(ev)) return [WC_SHARED]; // landskamp / WC labelled only "International"
		return [];
	}
	if (sport === "golf") return /masters/.test(hay) ? [CH.discovery] : [CH.viaplay];
	if (sport === "f1" || sport === "formula1") return [CH.viaplay];
	// Tour de France 2026 rights are SHARED: TV 2 (Play/Direkte) + WBD (Max/Eurosport,
	// which alone carries the first hour of each stage). Both are valid "where to watch".
	if (sport === "cycling") return /tour de france/.test(hay) ? [CH.tv2, CH.max] : [];
	if (sport === "tennis") {
		// Wimbledon (like all Grand Slams) is Warner Bros. Discovery in Norway —
		// HBO Max + Eurosport, NOT TV 2. Finals are also free on WBD's REX channel.
		if (/wimbledon/.test(hay)) return [CH.max, CH.eurosport];
		if (/roland|french open|australian open|us open/.test(hay)) return [CH.discovery, CH.eurosport];
		return [];
	}
	if (/biathlon|skiskyting|cross-country|langrenn|nordic|ski jump|hopp|alpine|alpint/.test(`${sport} ${hay}`)) return [CH.nrk];
	// chess has no Norwegian TV rights — Sjakk-NM streams on Direktesport/Lichess,
	// international chess (EWC etc.) on Chess.com/Twitch/YouTube. Keep the event's
	// own free streams (handled in normalizeStreaming) rather than guessing a channel.
	return [];
}

/**
 * Normalize an event's streaming to Norwegian options:
 *   1. confident rights map wins;
 *   2. else keep only already-Norwegian entries (drop FOX/ESPN/Apple TV/…);
 *   3. esports keeps its (free, platform-agnostic) streams as-is.
 */
export function normalizeStreaming(ev) {
	const sport = (ev.sport || "").toLowerCase();
	// esports and chess are watched on event-specific free streams (BLAST.tv /
	// Twitch / YouTube; Lichess / Chess.com / Direktesport), not Norwegian TV —
	// keep whatever the event/researcher supplied rather than forcing a channel.
	if (sport === "esports" || sport === "chess") return ev.streaming || [];
	const mapped = norwegianRights(ev);
	if (mapped.length) return mapped;
	return (ev.streaming || []).filter((s) => NORWEGIAN_RE.test(s.platform || s));
}

// ── Real Norwegian TV listings (tvkampen.com) — actual data over the static map ──

const CHANNEL_URLS = [
	["tv 2 play", "https://play.tv2.no/sport"], ["tv2 play", "https://play.tv2.no/sport"],
	["tv 2 sport", "https://play.tv2.no/sport"], ["tv 2", "https://play.tv2.no/sport"],
	["viaplay", "https://viaplay.no"], ["v sport", "https://viaplay.no"],
	["nrk", "https://tv.nrk.no/direkte"],
	["discovery", "https://www.discoveryplus.no"], ["eurosport", "https://www.eurosport.no"],
	["max", "https://www.max.com"], ["vg", "https://www.vg.no/sport"],
];
function urlForChannel(name) {
	const k = name.trim().toLowerCase();
	for (const [needle, url] of CHANNEL_URLS) if (k.includes(needle)) return url;
	return "";
}

function normTeam(s) {
	const n = (s || "").toLowerCase()
		.replace(/\b(fc|fk|cf|afc|sk|if|il|bk|ff)\b/g, "")
		.replace(/[^a-z0-9æøå ]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return NATION_CANON[n] || n; // map Norwegian nation names to English canonical
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
		let name = String(b).trim();
		if (!NORWEGIAN_RE.test(name)) continue; // drop betting/foreign leftovers
		// NRK's channels (NRK1/NRK2/NRK TV/NRK Sport) are interchangeable to a
		// viewer and all live at tv.nrk.no — collapse to a single "NRK" so a match
		// doesn't show "NRK1 +1" for what is really one broadcaster.
		if (/^nrk/i.test(name)) name = "NRK";
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ platform: name, url: urlForChannel(name) });
	}
	// tvkampen pads most listings with generic aggregators (Viaplay/Eurosport/MAX)
	// after the real broadcaster(s), which are listed primary-first. Keep the calm
	// UI to the first two so "where to watch" stays a glance, not a sprawl.
	return out.slice(0, 2);
}

/**
 * For a World Cup fixture, keep only the actual Norwegian rights holders
 * (NRK / TV 2) and collapse channel variants (NRK1, NRK TV → NRK; TV 2 Sport 1
 * → TV 2 Play). tvkampen pads WC listings with aggregators (Viaplay/Eurosport/
 * MAX) and foreign nets (SVT) that don't hold WC rights in Norway — drop them so
 * a match resolves to its single true broadcaster instead of a noisy list.
 */
function worldCupChannels(channels) {
	const out = [];
	const seen = new Set();
	for (const c of channels) {
		const p = String(c.platform || c).toLowerCase();
		let entry = null;
		if (/nrk/.test(p)) entry = CH.nrk;
		else if (/tv\s?2/.test(p)) entry = CH.tv2;
		else continue; // not a WC rights holder → drop
		if (seen.has(entry.platform)) continue;
		seen.add(entry.platform);
		out.push(entry);
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
			let s = listingStreaming(listing);
			// WC: trust the real listing to say WHICH of NRK/TV 2, drop aggregator noise.
			if (isWorldCup(ev)) s = worldCupChannels(s);
			if (s.length) return s;
		}
	}
	return normalizeStreaming(ev);
}
