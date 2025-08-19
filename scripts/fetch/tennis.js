import { fetchJson, iso } from "../lib/helpers.js";

export async function fetchTennisESPN() {
	const url =
		"https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard";
	const tournaments = [];
	try {
		const data = await fetchJson(url);
		const now = new Date();
		const upcoming = (data.events || [])
			.filter((e) => {
				const d = new Date(e.date);
				const status = e.status?.type?.name;
				return (
					d > now && !["STATUS_FINAL", "STATUS_IN_PROGRESS"].includes(status)
				);
			})
			.slice(0, 6);
		if (upcoming.length) {
			tournaments.push({
				name: "ATP Tour",
				events: upcoming.map((ev) => ({
					title: `${ev.competitions[0].competitors[0].athlete.displayName} vs ${ev.competitions[0].competitors[1].athlete.displayName}`,
					meta: ev.competitions[0].notes?.[0]?.headline || "ATP Tournament",
					time: ev.date,
					venue: ev.competitions[0].venue?.fullName || "Tennis Center",
					sport: "tennis",
					streaming: [],
					norwegian: ["Casper Ruud", "Ruud"].some((n) =>
						ev.competitions[0].competitors.some((c) =>
							c.athlete.displayName.includes(n)
						)
					),
				})),
			});
		}
	} catch {}
	return { lastUpdated: iso(), source: "ESPN Tennis API", tournaments };
}
