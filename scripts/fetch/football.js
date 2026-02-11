import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";
import { fetchOBOSLigaenFromFotballNo } from "./fotball-no.js";

// Teams the user follows — matches involving these get highlighted
const FAVORITE_TEAMS = ["Barcelona", "Liverpool"];

export async function fetchFootballESPN() {
	const tournaments = [];
	const leagues = [
		{ code: "eng.1", name: "Premier League" },
		{ code: "esp.1", name: "La Liga" },
		{ code: "esp.copa_del_rey", name: "Copa del Rey" },
		{ code: "nor.1", name: "Eliteserien" }, // Norwegian top division
		{ code: "nor.2", name: "OBOS-ligaen" }, // Norwegian second division
		{ code: "fifa.world", name: "International" }, // For Norwegian national team matches
	];
	const now = new Date();
	const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
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
		const upcoming = all.filter((e) => new Date(e.date) > now);

		// Filter matches based on league type
		const filteredUpcoming = upcoming.filter((ev) => {
			const homeTeam = ev.competitions[0].competitors.find(c => c.homeAway === "home")?.team.displayName || "";
			const awayTeam = ev.competitions[0].competitors.find(c => c.homeAway === "away")?.team.displayName || "";

			if (league.code.startsWith("nor.")) {
				// For Norwegian club leagues, only include FK Lyn Oslo matches
				const isLynMatch = ["FK Lyn Oslo", "Lyn"].some(team =>
					homeTeam.includes(team) || awayTeam.includes(team)
				);
				return isLynMatch;
			} else if (league.code === "fifa.world") {
				// For international matches, only include Norwegian national team
				const isNorwayMatch = ["Norway", "Norge"].some(team =>
					homeTeam.includes(team) || awayTeam.includes(team)
				);
				return isNorwayMatch;
			} else {
				// For other leagues (Premier League, La Liga), include all matches
				return true;
			}
		}).slice(0, 15);

		if (filteredUpcoming.length) {
			tournaments.push({
				name: league.name,
				events: filteredUpcoming.map((ev) => {
					const homeTeam = ev.competitions[0].competitors.find(c => c.homeAway === "home")?.team.displayName || "";
					const awayTeam = ev.competitions[0].competitors.find(c => c.homeAway === "away")?.team.displayName || "";

					// Check if this is a Norwegian match
					const isNorwegian = league.code.startsWith("nor.") || league.code === "fifa.world";

					// Check if a favorite team is playing
					const isFavorite = FAVORITE_TEAMS.some(fav =>
						homeTeam.includes(fav) || awayTeam.includes(fav)
					);

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
						time: normalizeToUTC(ev.date),
						venue: ev.competitions[0].venue?.fullName || "TBD",
						homeTeam: homeTeam,
						awayTeam: awayTeam,
						sport: "football",
						streaming: streaming,
						norwegian: isNorwegian,
						isFavorite: isFavorite,
					};
				}),
			});
		}
	}

	// Try to get Lyn matches from fotball.no API as fallback
	console.log("Fetching OBOS-ligaen data from fotball.no...");
	try {
		const fotballNoData = await fetchOBOSLigaenFromFotballNo();
		if (fotballNoData.tournaments.length > 0) {
			tournaments.push(...fotballNoData.tournaments);
			console.log(`Added ${fotballNoData.tournaments[0].events.length} Lyn matches from fotball.no`);
		}
	} catch (error) {
		console.warn("Failed to fetch from fotball.no:", error.message);
	}

	return { lastUpdated: iso(), source: "ESPN API + fotball.no", tournaments };
}
