// Formats events into Markdown, JSON, and optionally ICS

async function formatOutput(events) {
	// Format JSON
	const json = events;
	// Format Markdown
	let md = `# Weekly Sports Calendar\n\n| Date | Event | Sport |\n|------|-------|-------|\n`;
	for (const row of events.weekly_events_table) {
		md += `| ${row.date} | ${row.event} | ${row.sport} |\n`;
	}
	md += `\n## Today\n`;
	for (const [sport, desc] of Object.entries(events.today_breakdown)) {
		md += `- **${sport}**: ${desc}\n`;
	}
	// Optionally, generate ICS (not implemented here)
	return { json, md };
}

module.exports = formatOutput;
