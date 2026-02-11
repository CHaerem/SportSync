import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventFilters } from '../scripts/lib/filters.js';

// Helper: create an event with defaults
function makeEvent(overrides = {}) {
	return {
		sport: 'football',
		title: 'Test Match',
		time: new Date(Date.now() + 3600000).toISOString(), // 1h from now
		homeTeam: 'Liverpool',
		awayTeam: 'Arsenal',
		tournament: 'Premier League',
		...overrides,
	};
}

describe('EventFilters', () => {
	describe('filterByTimeRange()', () => {
		it('returns events within the specified day range', () => {
			const events = [
				makeEvent({ time: new Date(Date.now() + 3600000).toISOString() }),       // 1h ahead
				makeEvent({ time: new Date(Date.now() + 86400000 * 3).toISOString() }),  // 3 days
				makeEvent({ time: new Date(Date.now() + 86400000 * 10).toISOString() }), // 10 days
			];
			const result = EventFilters.filterByTimeRange(events, 7);
			expect(result).toHaveLength(2);
		});

		it('excludes past events', () => {
			const events = [
				makeEvent({ time: new Date(Date.now() - 86400000).toISOString() }), // yesterday
			];
			expect(EventFilters.filterByTimeRange(events, 7)).toHaveLength(0);
		});

		it('returns empty array for non-array input', () => {
			expect(EventFilters.filterByTimeRange(null)).toEqual([]);
			expect(EventFilters.filterByTimeRange('not-array')).toEqual([]);
		});

		it('handles events with invalid time gracefully', () => {
			const events = [
				makeEvent({ time: 'invalid-date' }),
				makeEvent({ time: new Date(Date.now() + 3600000).toISOString() }),
			];
			const result = EventFilters.filterByTimeRange(events, 7);
			expect(result).toHaveLength(1);
		});
	});

	describe('filterCurrentWeek()', () => {
		it('returns events from the current week', () => {
			const now = new Date();
			const events = [
				makeEvent({ time: now.toISOString() }),
				makeEvent({ time: new Date(now.getTime() + 86400000 * 30).toISOString() }), // 30 days
			];
			const result = EventFilters.filterCurrentWeek(events);
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.length).toBeLessThanOrEqual(2);
		});

		it('returns empty array for non-array input', () => {
			expect(EventFilters.filterCurrentWeek(undefined)).toEqual([]);
		});
	});

	describe('filterByTeams()', () => {
		it('filters events matching team names', () => {
			const events = [
				makeEvent({ homeTeam: 'Liverpool', awayTeam: 'Arsenal' }),
				makeEvent({ homeTeam: 'Barcelona', awayTeam: 'Real Madrid' }),
			];
			const result = EventFilters.filterByTeams(events, ['Liverpool']);
			expect(result).toHaveLength(1);
			expect(result[0].homeTeam).toBe('Liverpool');
		});

		it('matches case-insensitively', () => {
			const events = [makeEvent({ homeTeam: 'Liverpool' })];
			expect(EventFilters.filterByTeams(events, ['liverpool'])).toHaveLength(1);
		});

		it('matches team name in title', () => {
			const events = [makeEvent({ homeTeam: null, awayTeam: null, title: 'Liverpool vs Arsenal' })];
			expect(EventFilters.filterByTeams(events, ['Liverpool'])).toHaveLength(1);
		});

		it('returns all events when teams array is empty', () => {
			const events = [makeEvent()];
			expect(EventFilters.filterByTeams(events, [])).toEqual(events);
		});

		it('returns events unchanged for non-array teams', () => {
			const events = [makeEvent()];
			expect(EventFilters.filterByTeams(events, null)).toEqual(events);
		});
	});

	describe('filterByPlayers()', () => {
		it('filters events by player name', () => {
			const events = [
				makeEvent({ norwegianPlayers: [{ name: 'Viktor Hovland' }] }),
				makeEvent({ title: 'Tennis Final' }),
			];
			const result = EventFilters.filterByPlayers(events, ['Viktor Hovland']);
			expect(result).toHaveLength(1);
		});

		it('matches partial name parts', () => {
			const events = [
				makeEvent({ norwegianPlayers: [{ name: 'Casper Ruud' }] }),
			];
			expect(EventFilters.filterByPlayers(events, ['casper ruud'])).toHaveLength(1);
		});

		it('returns all events when players is empty', () => {
			const events = [makeEvent()];
			expect(EventFilters.filterByPlayers(events, [])).toEqual(events);
		});

		it('returns events for non-array players', () => {
			const events = [makeEvent()];
			expect(EventFilters.filterByPlayers(events, null)).toEqual(events);
		});
	});

	describe('filterByLeagues()', () => {
		it('filters by tournament name', () => {
			const events = [
				makeEvent({ tournament: 'Premier League' }),
				makeEvent({ tournament: 'La Liga' }),
			];
			const result = EventFilters.filterByLeagues(events, ['Premier League']);
			expect(result).toHaveLength(1);
		});

		it('matches partial league name', () => {
			const events = [makeEvent({ tournament: 'Premier League' })];
			expect(EventFilters.filterByLeagues(events, ['premier'])).toHaveLength(1);
		});

		it('uses meta field as fallback', () => {
			const events = [makeEvent({ tournament: undefined, meta: 'Champions League' })];
			expect(EventFilters.filterByLeagues(events, ['Champions'])).toHaveLength(1);
		});

		it('returns all events when leagues is empty', () => {
			const events = [makeEvent()];
			expect(EventFilters.filterByLeagues(events, [])).toEqual(events);
		});
	});

	describe('filterNorwegian()', () => {
		it('returns only Norwegian-flagged events', () => {
			const events = [
				makeEvent({ norwegian: true }),
				makeEvent({ norwegian: false }),
				makeEvent({}),
			];
			expect(EventFilters.filterNorwegian(events)).toHaveLength(1);
		});

		it('returns empty array for non-array input', () => {
			expect(EventFilters.filterNorwegian(null)).toEqual([]);
		});
	});

	describe('filterBySport()', () => {
		it('filters by sport type', () => {
			const events = [
				makeEvent({ sport: 'football' }),
				makeEvent({ sport: 'golf' }),
				makeEvent({ sport: 'tennis' }),
			];
			const result = EventFilters.filterBySport(events, ['football', 'golf']);
			expect(result).toHaveLength(2);
		});

		it('matches case-insensitively', () => {
			const events = [makeEvent({ sport: 'Football' })];
			expect(EventFilters.filterBySport(events, ['football'])).toHaveLength(1);
		});

		it('returns all events when sports is empty', () => {
			const events = [makeEvent()];
			expect(EventFilters.filterBySport(events, [])).toEqual(events);
		});
	});

	describe('sortByTime()', () => {
		it('sorts ascending by default', () => {
			const early = new Date(Date.now() + 1000).toISOString();
			const late = new Date(Date.now() + 99999000).toISOString();
			const events = [makeEvent({ time: late }), makeEvent({ time: early })];
			const result = EventFilters.sortByTime(events);
			expect(result[0].time).toBe(early);
			expect(result[1].time).toBe(late);
		});

		it('sorts descending when specified', () => {
			const early = new Date(Date.now() + 1000).toISOString();
			const late = new Date(Date.now() + 99999000).toISOString();
			const events = [makeEvent({ time: early }), makeEvent({ time: late })];
			const result = EventFilters.sortByTime(events, false);
			expect(result[0].time).toBe(late);
		});

		it('does not mutate original array', () => {
			const events = [makeEvent(), makeEvent()];
			const result = EventFilters.sortByTime(events);
			expect(result).not.toBe(events);
		});

		it('returns empty array for non-array input', () => {
			expect(EventFilters.sortByTime(null)).toEqual([]);
		});
	});

	describe('limitEvents()', () => {
		it('limits to specified count', () => {
			const events = [makeEvent(), makeEvent(), makeEvent()];
			expect(EventFilters.limitEvents(events, 2)).toHaveLength(2);
		});

		it('returns all events when limit is 0 or negative', () => {
			const events = [makeEvent(), makeEvent()];
			expect(EventFilters.limitEvents(events, 0)).toHaveLength(2);
			expect(EventFilters.limitEvents(events, -1)).toHaveLength(2);
		});

		it('returns all events when no limit provided', () => {
			const events = [makeEvent(), makeEvent()];
			expect(EventFilters.limitEvents(events)).toHaveLength(2);
		});

		it('returns empty array for non-array input', () => {
			expect(EventFilters.limitEvents(null, 5)).toEqual([]);
		});
	});

	describe('removeDuplicates()', () => {
		it('removes events with same sport, title, and time', () => {
			const time = new Date().toISOString();
			const events = [
				makeEvent({ sport: 'football', title: 'Match A', time }),
				makeEvent({ sport: 'football', title: 'Match A', time }),
				makeEvent({ sport: 'football', title: 'Match B', time }),
			];
			expect(EventFilters.removeDuplicates(events)).toHaveLength(2);
		});

		it('keeps events with different times', () => {
			const events = [
				makeEvent({ title: 'Match A', time: '2026-02-11T10:00:00Z' }),
				makeEvent({ title: 'Match A', time: '2026-02-12T10:00:00Z' }),
			];
			expect(EventFilters.removeDuplicates(events)).toHaveLength(2);
		});

		it('returns empty array for non-array input', () => {
			expect(EventFilters.removeDuplicates(null)).toEqual([]);
		});
	});

	describe('mergeEventLists()', () => {
		it('merges multiple event lists', () => {
			const list1 = [makeEvent({ title: 'A', time: '2026-02-11T10:00:00Z' })];
			const list2 = [makeEvent({ title: 'B', time: '2026-02-11T12:00:00Z' })];
			const result = EventFilters.mergeEventLists(list1, list2);
			expect(result).toHaveLength(2);
		});

		it('removes duplicates across lists', () => {
			const time = '2026-02-11T10:00:00Z';
			const event = makeEvent({ title: 'Same', time });
			const result = EventFilters.mergeEventLists([event], [{ ...event }]);
			expect(result).toHaveLength(1);
		});

		it('sorts merged result by time ascending', () => {
			const list1 = [makeEvent({ title: 'Late', time: '2026-02-11T18:00:00Z' })];
			const list2 = [makeEvent({ title: 'Early', time: '2026-02-11T08:00:00Z' })];
			const result = EventFilters.mergeEventLists(list1, list2);
			expect(result[0].title).toBe('Early');
		});

		it('ignores non-array arguments', () => {
			const list = [makeEvent({ title: 'Valid' })];
			const result = EventFilters.mergeEventLists(list, null, undefined, 'string');
			expect(result).toHaveLength(1);
		});
	});

	describe('combineFilters()', () => {
		it('applies multiple filters in sequence', () => {
			const events = [
				makeEvent({ sport: 'football', norwegian: true, time: new Date(Date.now() + 3600000).toISOString() }),
				makeEvent({ sport: 'golf', norwegian: false, time: new Date(Date.now() + 3600000).toISOString() }),
				makeEvent({ sport: 'football', norwegian: false, time: new Date(Date.now() + 3600000).toISOString() }),
			];
			const result = EventFilters.combineFilters(events, {
				sports: ['football'],
				norwegian: true,
			});
			expect(result).toHaveLength(1);
			expect(result[0].sport).toBe('football');
			expect(result[0].norwegian).toBe(true);
		});

		it('applies limit after other filters', () => {
			const events = [
				makeEvent({ time: new Date(Date.now() + 3600000).toISOString() }),
				makeEvent({ time: new Date(Date.now() + 7200000).toISOString() }),
				makeEvent({ time: new Date(Date.now() + 10800000).toISOString() }),
			];
			const result = EventFilters.combineFilters(events, { limit: 2 });
			expect(result).toHaveLength(2);
		});

		it('sorts by time by default', () => {
			const late = new Date(Date.now() + 99999000).toISOString();
			const early = new Date(Date.now() + 1000).toISOString();
			const events = [makeEvent({ time: late }), makeEvent({ time: early })];
			const result = EventFilters.combineFilters(events, {});
			expect(result[0].time).toBe(early);
		});

		it('skips sorting when sort is false', () => {
			const late = new Date(Date.now() + 99999000).toISOString();
			const early = new Date(Date.now() + 1000).toISOString();
			const events = [makeEvent({ time: late }), makeEvent({ time: early })];
			const result = EventFilters.combineFilters(events, { sort: false });
			expect(result[0].time).toBe(late);
		});

		it('handles null events gracefully', () => {
			const result = EventFilters.combineFilters(null, { sports: ['football'] });
			expect(result).toEqual([]);
		});
	});
});
