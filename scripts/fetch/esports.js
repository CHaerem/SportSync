import { fetchJson, iso } from "../lib/helpers.js";

// Minimal real esports integration: attempt to pull HLTV upcoming matches for FaZe (rain) via a lightweight
// community JSON endpoint (if unavailable, return empty without placeholders).
// NOTE: This avoids HTML scraping inside the action. Can be swapped for an official API when available.
const HLTV_UPCOMING = "https://hltv-api.vercel.app/api/matches"; // community mirror

export async function fetchEsports() {
	let matches = [];
	try {
		const data = await fetchJson(HLTV_UPCOMING, { retries: 1 });
		// data expected: array of match objects with { team1:{name}, team2:{name}, event, date }
		if (Array.isArray(data)) {
			const focusTeams = ["FaZe", "Team Liquid", "NAVI", "G2", "Astralis"];
			matches = data.filter(m => {
				const t1 = m.team1?.name || ""; const t2 = m.team2?.name || "";
				return focusTeams.some(ft => t1.includes(ft) || t2.includes(ft));
			}).slice(0,6);
		}
	} catch {}
	const now = Date.now();
	const events = matches.filter(m => m.date && new Date(m.date) > now).map(m => ({
		title: `${m.team1?.name || 'TBD'} vs ${m.team2?.name || 'TBD'}`,
		meta: m.event?.name || 'Esports Match',
		time: new Date(m.date).toISOString(),
		venue: 'Online',
		sport: 'esports',
		streaming: [
			{ platform: 'Twitch', url: 'https://twitch.tv/esl_csgo', type: 'twitch' }
		],
		norwegian: (m.team1?.name || '').includes('FaZe') || (m.team2?.name || '').includes('FaZe') // rain (Norwegian) on FaZe
	}));
	return { lastUpdated: iso(), source: 'HLTV community API', tournaments: events.length ? [{ name: 'CS2 Focus', events }] : [] };
}
