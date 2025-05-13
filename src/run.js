// Entry point for orchestrating the daily update
// Calls: parseInterests, fetchEvents, formatOutput, costGuard

require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const parseInterests = require("./parseInterests");
const fetchEvents = require("./fetchEvents");
const formatOutput = require("./formatOutput");
const exportICS = require("./ics");

async function costGuard(usage) {
	const maxTokens = parseInt(process.env.MAX_DAILY_TOKENS || "2000", 10);
	if (usage?.total_tokens > maxTokens) {
		throw new Error(
			`Aborting: estimated token usage (${usage.total_tokens}) exceeds MAX_DAILY_TOKENS (${maxTokens})`
		);
	}
}

async function main() {
	// 1. Parse user interests (from a file or env, to be implemented)
	const filters = await parseInterests();

	// 2. Fetch events using filters
	const events = await fetchEvents(filters);

	// 3. Format output (returns { json, md, ics? })
	const { json, md } = await formatOutput(events);

	// 4. Export ICS
	const ics = await exportICS(events);

	// 5. Cost guard (mock usage for now, replace with real usage if available)
	await costGuard({ total_tokens: 1500 }); // Replace with actual usage if available

	// 6. Write outputs
	const outputDir = path.join(__dirname, "../docs/output");
	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(
		path.join(outputDir, "events.json"),
		JSON.stringify(json, null, 2)
	);
	await fs.writeFile(path.join(outputDir, "events.md"), md);
	if (ics) {
		await fs.writeFile(path.join(outputDir, "events.ics"), ics);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
