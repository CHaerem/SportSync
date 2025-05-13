// Parses user interests and generates filters for event selection

const fs = require("fs").promises;
const path = require("path");
const { query } = require("./llm.js");

async function parseInterests() {
	// Try to read interests from interests.txt (JSON or plain text)
	const interestsPath = path.join(__dirname, "../interests.txt");
	let interests;
	try {
		const raw = await fs.readFile(interestsPath, "utf8");
		// Try to parse as JSON first
		try {
			interests = JSON.parse(raw);
		} catch {
			// Fallback: parse as comma-separated plain text
			const lines = raw
				.split(/\r?\n/)
				.map((l) => l.trim())
				.filter(Boolean);
			interests = {
				sports: lines,
				country_priority: "Norway",
			};
		}
	} catch {
		// Fallback to hardcoded Norway-centric interests
		interests = {
			sports: ["Football", "Golf", "Tennis", "Formula 1", "Chess", "Esports"],
			leagues: [
				"Premier League",
				"La Liga",
				"Serie A",
				"Bundesliga",
				"Ligue 1",
				"UEFA Champions League",
				"UEFA Europa League",
				"UEFA Conference League",
				"Eliteserien",
			],
			athletes: [
				"Viktor Hovland",
				"Kristoffer Ventura",
				"Casper Ruud",
				"Magnus Carlsen",
			],
			teams: ["FaZe Clan"],
			country_priority: "Norway",
		};
	}
	return interests;
}

module.exports = parseInterests;
