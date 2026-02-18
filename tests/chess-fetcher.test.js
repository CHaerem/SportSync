import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChessFetcher } from '../scripts/fetch/chess.js';

describe('ChessFetcher', () => {
	let fetcher;

	beforeEach(() => {
		fetcher = new ChessFetcher();
	});

	describe('findNorwegianPlayers()', () => {
		it('finds Magnus Carlsen in tour name', () => {
			const tour = { name: 'World Championship - Magnus Carlsen vs Opponent' };
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result).toContain('Magnus Carlsen');
		});

		it('finds player by last name in description', () => {
			const tour = {
				name: 'Speed Chess',
				description: 'Featuring Carlsen and other top players'
			};
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result.length).toBeGreaterThan(0);
		});

		it('finds player in info.players field', () => {
			const tour = {
				name: 'Super Tournament',
				info: { players: 'Carlsen, Caruana, Nakamura' }
			};
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result.length).toBeGreaterThan(0);
		});

		it('returns empty array when no Norwegian players found', () => {
			const tour = {
				name: 'US Championship',
				description: 'Featuring Caruana, Nakamura, and So'
			};
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result).toEqual([]);
		});

		it('handles tour with no name or description', () => {
			const result = fetcher.findNorwegianPlayers({});
			expect(result).toEqual([]);
		});

		it('does not false-positive match short last names', () => {
			const tour = { name: 'Military Chess Exhibition' };
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result).toEqual([]);
		});

		it('finds Norwegian players in round names', () => {
			const tour = {
				name: 'Super Tournament',
				rounds: [{ name: 'Carlsen vs Caruana' }]
			};
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result).toContain('Magnus Carlsen');
		});

		it('is case-insensitive', () => {
			const tour = { name: 'MAGNUS CARLSEN INVITATIONAL' };
			const result = fetcher.findNorwegianPlayers(tour);
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe('fetchFromSource()', () => {
		it('returns empty array for unknown source api', async () => {
			const result = await fetcher.fetchFromSource({ api: 'unknown' });
			expect(result).toEqual([]);
		});
	});

	describe('transformToEvents()', () => {
		const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();

		it('normalizes and validates chess events', () => {
			const rawData = [{
				title: 'Round 5 – Tata Steel Masters',
				time: futureDate,
				venue: 'Wijk aan Zee',
				tournament: 'Tata Steel Masters',
				participants: ['Magnus Carlsen'],
				norwegian: true,
				meta: 'Tata Steel Masters'
			}];

			const events = fetcher.transformToEvents(rawData);
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].sport).toBe('chess');
		});

		it('deduplicates identical events', () => {
			const rawData = [
				{
					title: 'Round 5 – Tata Steel Masters',
					time: futureDate,
					venue: 'Wijk aan Zee',
					tournament: 'Tata Steel Masters',
					meta: 'Tata Steel Masters'
				},
				{
					title: 'Round 5 – Tata Steel Masters',
					time: futureDate,
					venue: 'Wijk aan Zee',
					tournament: 'Tata Steel Masters',
					meta: 'Tata Steel Masters'
				}
			];

			const events = fetcher.transformToEvents(rawData);
			expect(events.length).toBe(1);
		});

		it('returns empty array for empty input', () => {
			expect(fetcher.transformToEvents([])).toEqual([]);
		});

		it('skips events that fail validation', () => {
			const rawData = [{
				title: 'Old Tournament',
				time: '2020-01-01T00:00:00Z',
				venue: 'Somewhere'
			}];

			const events = fetcher.transformToEvents(rawData);
			expect(events.length).toBe(0);
		});
	});

	describe('loadJsonFile()', () => {
		it('returns fallback for non-existent file', () => {
			const result = fetcher.loadJsonFile('/nonexistent/path.json', []);
			expect(result).toEqual([]);
		});

		it('returns null fallback by default', () => {
			const result = fetcher.loadJsonFile('/nonexistent/path.json');
			expect(result).toBeNull();
		});
	});

	describe('fetchCuratedTournaments()', () => {
		it('returns empty array when config files do not exist', async () => {
			const source = {
				api: 'curated',
				configFiles: {
					tournaments: 'nonexistent/tournaments.json',
					players: 'nonexistent/players.json'
				}
			};

			const events = await fetcher.fetchCuratedTournaments(source);
			expect(events).toEqual([]);
		});
	});

	describe('fetchLichessBroadcasts()', () => {
		it('returns empty array on API error', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockRejectedValue(new Error('Network error'))
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events).toEqual([]);
		});

		it('returns empty array for invalid response', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue(null)
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events).toEqual([]);
		});

		it('processes active broadcasts with Norwegian players', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					active: [{
						tour: {
							name: 'Carlsen Invitational',
							tier: 5,
							info: { location: 'Oslo' }
						},
						rounds: [
							{ id: 'r1', name: 'Round 1', startsAt: Date.now() + 86400000, finished: false }
						]
					}],
					upcoming: []
				})
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].venue).toBe('Oslo');
			expect(events[0].norwegian).toBe(true);
		});

		it('skips low-tier broadcasts without Norwegian players', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					active: [{
						tour: {
							name: 'Regional Junior Championship',
							tier: 2,
							info: {}
						},
						rounds: [
							{ id: 'r1', name: 'Round 1', startsAt: Date.now() + 86400000, finished: false }
						]
					}],
					upcoming: []
				})
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events).toEqual([]);
		});

		it('skips even elite broadcasts without Norwegian players', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					active: [{
						tour: {
							name: 'World Chess Championship',
							tier: 5,
							info: { location: 'Singapore' }
						},
						rounds: [
							{ id: 'r1', name: 'Game 1', startsAt: Date.now() + 86400000, finished: false }
						]
					}],
					upcoming: []
				})
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events).toEqual([]);
		});

		it('handles broadcasts with no rounds using tour dates', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					active: [{
						tour: {
							name: 'Carlsen Tournament',
							tier: 5,
							dates: [Date.now() + 86400000],
							info: { location: 'Online' }
						},
						rounds: []
					}],
					upcoming: []
				})
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].title).toBe('Carlsen Tournament');
		});

		it('skips finished rounds', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					active: [{
						tour: {
							name: 'Carlsen Cup',
							tier: 5,
							info: {}
						},
						rounds: [
							{ id: 'r1', name: 'Round 1', startsAt: Date.now() - 86400000, finished: true },
							{ id: 'r2', name: 'Round 2', startsAt: Date.now() + 86400000, finished: false }
						]
					}],
					upcoming: []
				})
			};

			const events = await fetcher.fetchLichessBroadcasts({});
			expect(events.length).toBe(1);
			expect(events[0].title).toContain('Round 2');
		});
	});
});
