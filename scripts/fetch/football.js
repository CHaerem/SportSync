import { fetchJson, iso } from "../lib/helpers.js";

export async function fetchFootballESPN() {
	const tournaments = [];
	const leagues = [
		{ code: "eng.1", name: "Premier League" },
		{ code: "esp.1", name: "La Liga" },
	];
	const now = new Date();
	const days = [0, 1, 2].map((offset) => {
		const d = new Date(now.getTime() + offset * 86400000);
		return d.toISOString().split("T")[0].replace(/-/g, "");
	});
	for (const league of leagues) {
		let all = [];
		for (const day of days) {
			try {
				const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${day}`;
				const data = await fetchJson(url);
				if (Array.isArray(data.events)) all.push(...data.events);
				await new Promise((r) => setTimeout(r, 150));
			} catch {}
		}
		const upcoming = all.filter((e) => new Date(e.date) > now).slice(0, 6);
		if (upcoming.length) {
			tournaments.push({
				name: league.name,
				events: upcoming.map((ev) => ({
					title: `${ev.competitions[0].competitors[0].team.displayName} vs ${ev.competitions[0].competitors[1].team.displayName}`,
					meta: league.name,
					time: ev.date,
					venue: ev.competitions[0].venue?.fullName || "TBD",
					homeTeam: ev.competitions[0].competitors.find(
						(c) => c.homeAway === "home"
					)?.team.displayName,
					awayTeam: ev.competitions[0].competitors.find(
						(c) => c.homeAway === "away"
					)?.team.displayName,
					sport: "football",
					streaming: [],
					norwegian: false,
				})),
			});
		}
	}
	return { lastUpdated: iso(), source: "ESPN API", tournaments };
}
