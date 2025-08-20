import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";
import https from "https";

// Fetch OBOS-ligaen calendar from fotball.no
// This returns iCalendar format data which we need to parse
export async function fetchOBOSLigaenFromFotballNo() {
	try {
		// Tournament ID 199422 appears to be for 2025 season
		const url = "https://www.fotball.no/footballapi/Calendar/GetCalendar?tournamentId=199422";
		
		const icsData = await new Promise((resolve, reject) => {
			https.get(url, (res) => {
				let data = '';
				res.on('data', (chunk) => data += chunk);
				res.on('end', () => resolve(data));
				res.on('error', reject);
			}).on('error', reject);
		});
		
		// Parse iCalendar data to extract Lyn matches
		const lynMatches = parseIcsForLynMatches(icsData);
		
		// Filter for current week
		const now = new Date();
		const startOfWeek = new Date(now);
		startOfWeek.setDate(now.getDate() - now.getDay());
		startOfWeek.setHours(0, 0, 0, 0);
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 7);
		
		const currentWeekMatches = lynMatches.filter(match => {
			const matchDate = new Date(match.time);
			return matchDate >= startOfWeek && matchDate < endOfWeek;
		});
		
		return {
			lastUpdated: iso(),
			source: "fotball.no OBOS-ligaen API",
			tournaments: currentWeekMatches.length > 0 ? [{
				name: "OBOS-ligaen",
				events: currentWeekMatches
			}] : []
		};
		
	} catch (error) {
		console.warn("Failed to fetch from fotball.no:", error.message);
		return {
			lastUpdated: iso(),
			source: "fotball.no OBOS-ligaen API (failed)",
			tournaments: []
		};
	}
}

function parseIcsForLynMatches(icsData) {
	const matches = [];
	const events = icsData.split('BEGIN:VEVENT');
	
	for (const event of events) {
		if (!event.includes('END:VEVENT')) continue;
		
		// Extract event data
		const summary = extractIcsField(event, 'SUMMARY');
		const dtstart = extractIcsField(event, 'DTSTART');
		const location = extractIcsField(event, 'LOCATION');
		
		// Check if this is a Lyn match
		if (summary && (summary.includes('Lyn 1896') || summary.includes('Lyn'))) {
			// Parse the teams from summary (format: "Team A - Team B")
			const teams = summary.split(' - ');
			if (teams.length === 2) {
				const homeTeam = teams[0].trim();
				const awayTeam = teams[1].trim();
				
				// Parse the datetime
				let matchTime;
				if (dtstart.includes('TZID=')) {
					// Extract just the date/time part after the timezone
					const timePart = dtstart.split(':').pop();
					matchTime = parseIcsDateTime(timePart);
				} else {
					matchTime = parseIcsDateTime(dtstart);
				}
				
				if (matchTime) {
					matches.push({
						title: summary,
						meta: "OBOS-ligaen",
						time: normalizeToUTC(matchTime),
						venue: location || "TBD",
						homeTeam: homeTeam,
						awayTeam: awayTeam,
						sport: "football",
						streaming: [
							{
								platform: "TV2 Play",
								url: "https://play.tv2.no",
								type: "tv2"
							}
						],
						norwegian: true
					});
				}
			}
		}
	}
	
	return matches;
}

function extractIcsField(eventData, fieldName) {
	const regex = new RegExp(`^${fieldName}[^:]*:(.*)$`, 'm');
	const match = eventData.match(regex);
	return match ? match[1].trim() : null;
}

function parseIcsDateTime(dtString) {
	if (!dtString) return null;
	
	try {
		// ICS format: YYYYMMDDTHHMMSS or YYYYMMDD
		const cleanDt = dtString.replace(/[^0-9T]/g, '');
		
		if (cleanDt.length === 8) {
			// Date only: YYYYMMDD
			const year = cleanDt.substring(0, 4);
			const month = cleanDt.substring(4, 6);
			const day = cleanDt.substring(6, 8);
			return new Date(`${year}-${month}-${day}T12:00:00Z`);
		} else if (cleanDt.length === 15) {
			// DateTime: YYYYMMDDTHHMMSS
			const year = cleanDt.substring(0, 4);
			const month = cleanDt.substring(4, 6);
			const day = cleanDt.substring(6, 8);
			const hour = cleanDt.substring(9, 11);
			const minute = cleanDt.substring(11, 13);
			const second = cleanDt.substring(13, 15);
			
			// Assume Norwegian timezone (CET/CEST) for fotball.no events
			// Convert to UTC by subtracting 1 hour (CET) or 2 hours (CEST)
			const localDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
			
			// Rough check for daylight saving time (CEST: March-October)
			const isDST = month >= '03' && month <= '10';
			const offsetHours = isDST ? 2 : 1;
			
			return new Date(localDate.getTime() - (offsetHours * 60 * 60 * 1000));
		}
	} catch (error) {
		console.warn("Failed to parse ICS datetime:", dtString, error);
	}
	
	return null;
}