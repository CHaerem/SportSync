import { fetchJson, iso } from "../lib/helpers.js";

export async function fetchF1ESPN() {
	const url =
		"https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard";
	let events = [];
	try {
		const data = await fetchJson(url);
		const now = new Date();
		events = (data.events || [])
			.filter(
				(e) => new Date(e.date) > now && e.status?.type?.name !== "STATUS_FINAL"
			)
			.slice(0, 4)
			.map((ev) => ({
				title: ev.name || ev.shortName,
				meta: "Formula 1 2025 - Race Weekend",
				time: ev.date,
				venue: ev.competitions?.[0]?.venue?.fullName || "F1 Circuit",
				sport: "formula1",
				streaming: [],
				norwegian: false,
			}));
	} catch {}
	return {
		lastUpdated: iso(),
		source: "ESPN F1 Racing API",
		tournaments: [{ name: "Formula 1 2025", events }],
	};
}
