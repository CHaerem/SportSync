import { fetchJson, iso } from "../lib/helpers.js";

export async function fetchFootballESPN() {
	const tournaments = [];
	const leagues = [
		{ code: "eng.1", name: "Premier League" },
		{ code: "esp.1", name: "La Liga" },
		{ code: "nor.1", name: "Eliteserien" }, // Norwegian top division
		{ code: "nor.2", name: "OBOS-ligaen" }, // Norwegian second division
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
				if (Array.isArray(data.events)) {
					all.push(...data.events);
					// Log Norwegian league attempts for debugging
					if (league.code.startsWith("nor.")) {
						console.log(`${league.name} (${league.code}): Found ${data.events.length} matches on ${day}`);
						if (data.events.length > 0) {
							// Look for Lyn specifically
							const lynMatches = data.events.filter(e => 
								e.competitions?.[0]?.competitors?.some(c => 
									c.team?.displayName?.toLowerCase().includes('lyn')
								)
							);
							if (lynMatches.length > 0) {
								console.log(`Found ${lynMatches.length} Lyn matches!`);
							}
						}
					}
				}
				await new Promise((r) => setTimeout(r, 150));
			} catch (err) {
				if (league.code.startsWith("nor.")) {
					console.log(`Failed to fetch ${league.name} (${league.code}): ${err.message}`);
				}
			}
		}
		const upcoming = all.filter((e) => new Date(e.date) > now).slice(0, 6);
		if (upcoming.length) {
			tournaments.push({
				name: league.name,
				events: upcoming.map((ev) => {
					const homeTeam = ev.competitions[0].competitors.find(c => c.homeAway === "home")?.team.displayName || "";
					const awayTeam = ev.competitions[0].competitors.find(c => c.homeAway === "away")?.team.displayName || "";
					
					// Check if this is a Norwegian match (FK Lyn Oslo or other Norwegian clubs)
					const norwegianTeams = ["FK Lyn Oslo", "Lyn", "Brann", "Rosenborg", "Molde", "Bodø/Glimt", "Viking", "Strømsgodset"];
					const isNorwegian = norwegianTeams.some(team => 
						homeTeam.includes(team) || awayTeam.includes(team)
					) || league.code.startsWith("nor.");
					
					// Set appropriate streaming based on league
					const streaming = league.code.startsWith("nor.") ? [
						{
							platform: "TV2 Play",
							url: "https://play.tv2.no",
							type: "tv2"
						}
					] : [];
					
					return {
						title: `${homeTeam} vs ${awayTeam}`,
						meta: league.name,
						time: ev.date,
						venue: ev.competitions[0].venue?.fullName || "TBD",
						homeTeam: homeTeam,
						awayTeam: awayTeam,
						sport: "football",
						streaming: streaming,
						norwegian: isNorwegian,
					};
				}),
			});
		}
	}
	return { lastUpdated: iso(), source: "ESPN API", tournaments };
}

