const fs = require("fs").promises;
const path = require("path");
const { query } = require("./llm.js");

// Fetches events from LLM based on filters

async function fetchEvents(filters) {
	const prompt = await fs.readFile(
		path.join(__dirname, "../prompt_templates/events.txt"),
		"utf8"
	);
	const events = await query(prompt, { filters: JSON.stringify(filters) });
	return events;
}

module.exports = fetchEvents;
