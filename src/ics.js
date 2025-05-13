// Optional: Exports events to ICS format

async function exportICS(events) {
	// Very basic ICS export for demo
	if (!events?.weekly_events_table) return null;
	let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SportSync//EN`;
	for (const row of events.weekly_events_table) {
		ics += `\nBEGIN:VEVENT`;
		ics += `\nSUMMARY:${row.event}`;
		ics += `\nDTSTART;VALUE=DATE:${row.date.replace(/-/g, "")}`;
		ics += `\nDESCRIPTION:${row.sport}`;
		ics += `\nEND:VEVENT`;
	}
	ics += `\nEND:VCALENDAR\n`;
	return ics;
}

module.exports = exportICS;
