import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FootballFetcher } from '../scripts/fetch/football.js';

// Mock fotball-no module
vi.mock('../scripts/fetch/fotball-no.js', () => ({
	fetchOBOSLigaenFromFotballNo: vi.fn()
}));

import { fetchOBOSLigaenFromFotballNo } from '../scripts/fetch/fotball-no.js';

describe('FootballFetcher', () => {
	let fetcher;

	beforeEach(() => {
		fetcher = new FootballFetcher();
		vi.clearAllMocks();
	});

	describe('checkFavorite()', () => {
		it('returns true when home team matches a favorite', () => {
			expect(fetcher.checkFavorite('FC Barcelona', 'Real Madrid')).toBe(true);
		});

		it('returns true when away team matches a favorite', () => {
			expect(fetcher.checkFavorite('Real Madrid', 'FC Barcelona')).toBe(true);
		});

		it('returns true for Lyn matches', () => {
			expect(fetcher.checkFavorite('FK Lyn Oslo', 'Skeid')).toBe(true);
		});

		it('matches case-insensitively', () => {
			expect(fetcher.checkFavorite('BARCELONA', 'Other')).toBe(true);
		});

		it('returns false when neither team is a favorite', () => {
			expect(fetcher.checkFavorite('Arsenal', 'Chelsea')).toBe(false);
		});

		it('handles null/undefined team names', () => {
			expect(fetcher.checkFavorite(null, 'Chelsea')).toBe(false);
			expect(fetcher.checkFavorite('Arsenal', undefined)).toBe(false);
			expect(fetcher.checkFavorite(null, null)).toBe(false);
		});

		it('matches partial team names containing favorite', () => {
			expect(fetcher.checkFavorite('Barcelona SC', 'Chelsea')).toBe(true);
		});
	});

	describe('transformToEvents()', () => {
		const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();

		it('transforms ESPN events correctly', () => {
			const espnEvents = [{
				name: 'Barcelona vs Real Madrid',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Camp Nou' },
					competitors: [
						{ homeAway: 'home', team: { displayName: 'Barcelona' } },
						{ homeAway: 'away', team: { displayName: 'Real Madrid' } }
					]
				}],
				leagueName: 'La Liga',
				status: { type: { name: 'STATUS_SCHEDULED' } }
			}];

			const events = fetcher.transformToEvents(espnEvents);
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].sport).toBe('football');
			expect(events[0].homeTeam).toBe('Barcelona');
			expect(events[0].awayTeam).toBe('Real Madrid');
		});

		it('transforms fotball.no events (already formatted)', () => {
			const fotballNoEvents = [{
				title: 'Lyn 1896 - Skeid',
				sport: 'football',
				meta: 'OBOS-ligaen',
				time: futureDate,
				venue: 'Bislett Stadion',
				homeTeam: 'Lyn 1896',
				awayTeam: 'Skeid',
				norwegian: true,
				streaming: [{ platform: 'TV2 Play', type: 'tv2' }]
			}];

			const events = fetcher.transformToEvents(fotballNoEvents);
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].sport).toBe('football');
			expect(events[0].homeTeam).toBe('Lyn 1896');
		});

		it('sets isFavorite on ESPN events', () => {
			const espnEvents = [{
				name: 'Barcelona vs Chelsea',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Camp Nou' },
					competitors: [
						{ homeAway: 'home', team: { displayName: 'Barcelona' } },
						{ homeAway: 'away', team: { displayName: 'Chelsea' } }
					]
				}],
				leagueName: 'La Liga',
				status: { type: { name: 'STATUS_SCHEDULED' } }
			}];

			const events = fetcher.transformToEvents(espnEvents);
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].isFavorite).toBe(true);
		});

		it('sets isFavorite on fotball.no events', () => {
			const fotballNoEvents = [{
				title: 'Lyn 1896 - Skeid',
				sport: 'football',
				meta: 'OBOS-ligaen',
				time: futureDate,
				venue: 'Bislett Stadion',
				homeTeam: 'Lyn 1896',
				awayTeam: 'Skeid',
				norwegian: true
			}];

			const events = fetcher.transformToEvents(fotballNoEvents);
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].isFavorite).toBe(true);
		});

		it('returns empty array for empty input', () => {
			expect(fetcher.transformToEvents([])).toEqual([]);
		});

		it('deduplicates events', () => {
			const espnEvents = [
				{
					name: 'Barcelona vs Real Madrid',
					date: futureDate,
					competitions: [{
						venue: { fullName: 'Camp Nou' },
						competitors: [
							{ homeAway: 'home', team: { displayName: 'Barcelona' } },
							{ homeAway: 'away', team: { displayName: 'Real Madrid' } }
						]
					}],
					leagueName: 'La Liga'
				},
				{
					name: 'Barcelona vs Real Madrid',
					date: futureDate,
					competitions: [{
						venue: { fullName: 'Camp Nou' },
						competitors: [
							{ homeAway: 'home', team: { displayName: 'Barcelona' } },
							{ homeAway: 'away', team: { displayName: 'Real Madrid' } }
						]
					}],
					leagueName: 'La Liga'
				}
			];

			const events = fetcher.transformToEvents(espnEvents);
			expect(events.length).toBe(1);
		});

		it('skips events that fail transformation', () => {
			const badEvents = [
				null,
				{ name: 'No competition' },
				{ competitions: [null] }
			];

			const events = fetcher.transformToEvents(badEvents);
			expect(events.length).toBe(0);
		});

		it('handles ESPN events without home/away designation', () => {
			const espnEvents = [{
				name: 'Player A vs Player B',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Venue' },
					competitors: [
						{ team: { displayName: 'Player A' } },
						{ team: { displayName: 'Player B' } }
					]
				}],
				leagueName: 'Cup'
			}];

			const events = fetcher.transformToEvents(espnEvents);
			expect(events.length).toBeGreaterThan(0);
		});
	});

	describe('applyCustomFilters()', () => {
		const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();

		it('keeps non-Norwegian league events regardless of norwegian flag', () => {
			const events = [
				{ leagueCode: 'eng.1', tournament: 'Premier League', time: futureDate, sport: 'football' },
				{ leagueCode: 'esp.1', tournament: 'La Liga', time: futureDate, sport: 'football' }
			];

			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered.length).toBe(2);
		});

		it('filters Norwegian league events to only norwegian-flagged ones', () => {
			const events = [
				{ leagueCode: 'nor.2', tournament: 'OBOS-ligaen', norwegian: true, time: futureDate, sport: 'football' },
				{ leagueCode: 'nor.2', tournament: 'OBOS-ligaen', norwegian: false, time: futureDate, sport: 'football' },
				{ leagueCode: 'nor.1', tournament: 'Eliteserien', norwegian: false, time: futureDate, sport: 'football' }
			];

			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered.length).toBe(1);
			expect(filtered[0].norwegian).toBe(true);
		});

		it('filters International matches to only norwegian-flagged ones', () => {
			const events = [
				{ leagueCode: 'fifa.world', tournament: 'World Cup', norwegian: true, time: futureDate, sport: 'football' },
				{ leagueCode: 'fifa.world', tournament: 'World Cup', norwegian: false, time: futureDate, sport: 'football' }
			];

			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered.length).toBe(1);
			expect(filtered[0].norwegian).toBe(true);
		});

		it('identifies OBOS-ligaen by tournament name', () => {
			const events = [
				{ tournament: 'OBOS-ligaen', norwegian: true, time: futureDate, sport: 'football' },
				{ tournament: 'OBOS-ligaen', norwegian: false, time: futureDate, sport: 'football' }
			];

			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered.length).toBe(1);
		});

		it('identifies Eliteserien by tournament name', () => {
			const events = [
				{ tournament: 'Eliteserien', norwegian: true, time: futureDate, sport: 'football' },
				{ tournament: 'Eliteserien', norwegian: false, time: futureDate, sport: 'football' }
			];

			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered.length).toBe(1);
		});
	});

	describe('fetchFotballNo()', () => {
		it('returns events from fotball.no on success', async () => {
			fetchOBOSLigaenFromFotballNo.mockResolvedValue({
				tournaments: [{
					name: 'OBOS-ligaen',
					events: [
						{ title: 'Lyn - Skeid', time: new Date().toISOString(), sport: 'football' },
						{ title: 'Lyn - KFUM', time: new Date().toISOString(), sport: 'football' }
					]
				}]
			});

			const events = await fetcher.fetchFotballNo();
			expect(events).toHaveLength(2);
		});

		it('returns empty array when fotball.no returns no tournaments', async () => {
			fetchOBOSLigaenFromFotballNo.mockResolvedValue({
				tournaments: []
			});

			const events = await fetcher.fetchFotballNo();
			expect(events).toEqual([]);
		});

		it('returns empty array when fotball.no returns null', async () => {
			fetchOBOSLigaenFromFotballNo.mockResolvedValue(null);

			const events = await fetcher.fetchFotballNo();
			expect(events).toEqual([]);
		});

		it('returns empty array on fetch error', async () => {
			fetchOBOSLigaenFromFotballNo.mockRejectedValue(new Error('Network error'));

			const events = await fetcher.fetchFotballNo();
			expect(events).toEqual([]);
		});

		it('flattens events from multiple tournaments', async () => {
			fetchOBOSLigaenFromFotballNo.mockResolvedValue({
				tournaments: [
					{ name: 'OBOS-ligaen', events: [{ title: 'Match 1' }] },
					{ name: 'Cup', events: [{ title: 'Match 2' }, { title: 'Match 3' }] }
				]
			});

			const events = await fetcher.fetchFotballNo();
			expect(events).toHaveLength(3);
		});
	});

	describe('fetchFromSource()', () => {
		it('routes fotball.no source to fetchFotballNo', async () => {
			fetchOBOSLigaenFromFotballNo.mockResolvedValue({
				tournaments: [{
					name: 'OBOS-ligaen',
					events: [
						{ title: 'Lyn - Skeid', time: new Date().toISOString(), sport: 'football', meta: 'OBOS-ligaen' }
					]
				}]
			});

			const source = { api: 'fotball.no', enabled: true };
			const events = await fetcher.fetchFromSource(source);

			expect(events).toHaveLength(1);
			expect(events[0].tournament).toBe('OBOS-ligaen');
			expect(events[0].leagueName).toBe('OBOS-ligaen');
			expect(events[0].leagueCode).toBe('nor.2');
		});

		it('skips disabled fotball.no source', async () => {
			const source = { api: 'fotball.no', enabled: false };
			const result = await fetcher.fetchFromSource(source);
			// Disabled fotball.no falls through to super.fetchFromSource
			// which checks api === "espn", so returns null
			expect(result).toBeNull();
		});

		it('returns empty array when fotball.no has no data', async () => {
			fetchOBOSLigaenFromFotballNo.mockResolvedValue({ tournaments: [] });

			const source = { api: 'fotball.no', enabled: true };
			const events = await fetcher.fetchFromSource(source);
			expect(events).toEqual([]);
		});
	});
});
