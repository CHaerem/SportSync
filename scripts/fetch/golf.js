import { fetchJson, iso } from "../lib/helpers.js";

export async function fetchGolfESPN() {
	const tours = [
		{
			url: "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
			name: "PGA Tour",
		},
		{
			url: "https://site.api.espn.com/apis/site/v2/sports/golf/eur/scoreboard",
			name: "DP World Tour",
		},
	];
	const tournaments = [];
	const now = new Date();
	for (const tour of tours) {
		try {
			const data = await fetchJson(tour.url);
			const events = (data.events || [])
				.filter(
					(e) =>
						new Date(e.date) > now &&
						!["STATUS_FINAL", "STATUS_IN_PROGRESS"].includes(
							e.status?.type?.name
						)
				)
				.slice(0, 4);
			if (events.length) {
				tournaments.push({
					name: tour.name,
					events: events.map((ev) => ({
						title: ev.name || "Golf Tournament",
						meta: tour.name,
						time: ev.date,
						venue:
							ev.competitions?.[0]?.venue?.fullName ||
							ev.competitions?.[0]?.venue?.address?.city ||
							"TBD",
						sport: "golf",
						streaming: [],
						norwegian: false,
					})),
				});
			}
		} catch {}
	}
	return { lastUpdated: iso(), source: "ESPN API", tournaments };
}
