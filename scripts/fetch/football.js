import { fetchJson, iso } from "../lib/helpers.js";

export async function fetchFootballESPN() {
	const tournaments = [];
	const leagues = [
		{ code: "eng.1", name: "Premier League" },
		{ code: "esp.1", name: "La Liga" },
	];
	
	// Add Norwegian OBOS-ligaen manual data for FK Lyn Oslo
	await addNorwegianFootball(tournaments);
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

// Norwegian football data for OBOS-ligaen with FK Lyn Oslo focus
async function addNorwegianFootball(tournaments) {
	const now = new Date();
	const currentWeekStart = new Date(now);
	currentWeekStart.setDate(now.getDate() - now.getDay());
	const currentWeekEnd = new Date(currentWeekStart);
	currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
	
	// Known FK Lyn Oslo fixtures in OBOS-ligaen (updated manually based on current season)
	const lynFixtures = [
		{
			homeTeam: "Egersund",
			awayTeam: "FK Lyn Oslo", 
			date: "2025-08-19T16:00:00Z", // Actual fixture from search results
			venue: "Eigerøy stadion, Egersund"
		},
		{
			homeTeam: "Raufoss",
			awayTeam: "FK Lyn Oslo",
			date: "2025-08-24T15:00:00Z", // Upcoming fixture from search results
			venue: "NAMMO stadion, Raufoss"
		}
		// More fixtures would be added here based on actual OBOS-ligaen schedule
	];
	
	// Filter for matches within current week
	const thisWeekMatches = lynFixtures.filter(match => {
		const matchDate = new Date(match.date);
		return matchDate >= currentWeekStart && matchDate <= currentWeekEnd;
	});
	
	if (thisWeekMatches.length > 0) {
		console.log(`Found ${thisWeekMatches.length} FK Lyn Oslo matches this week in OBOS-ligaen`);
		
		const events = thisWeekMatches.map(match => ({
			title: `${match.homeTeam} vs ${match.awayTeam}`,
			meta: "OBOS-ligaen",
			time: match.date,
			venue: match.venue,
			homeTeam: match.homeTeam,
			awayTeam: match.awayTeam,
			sport: "football",
			streaming: [
				{
					platform: "TV2 Play",
					url: "https://play.tv2.no",
					type: "tv2"
				}
			],
			norwegian: true, // FK Lyn Oslo is Norwegian club
		}));
		
		tournaments.push({
			name: "OBOS-ligaen",
			events: events
		});
	} else {
		console.log("No FK Lyn Oslo matches found this week in OBOS-ligaen");
	}
}
