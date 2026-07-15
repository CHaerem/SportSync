import { MS_PER_DAY, isEventInWindow } from "./helpers.js";

export class EventFilters {
	static filterByTimeRange(events, days = 7) {
		if (!Array.isArray(events)) return [];

		const now = new Date();
		const future = new Date(now.getTime() + days * MS_PER_DAY);
		return events.filter(event => isEventInWindow(event, now, future));
	}

	static filterCurrentWeek(events) {
		if (!Array.isArray(events)) return [];

		const now = new Date();
		const startOfWeek = new Date(now);
		startOfWeek.setDate(now.getDate() - now.getDay());
		startOfWeek.setHours(0, 0, 0, 0);

		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 7);
		return events.filter(event => isEventInWindow(event, startOfWeek, endOfWeek));
	}
}
