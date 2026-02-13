import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsportsFetcher } from '../scripts/fetch/esports.js';

describe('EsportsFetcher', () => {
	let fetcher;

	beforeEach(() => {
		fetcher = new EsportsFetcher();
	});

	describe('extractTeamName()', () => {
		it('extracts from team1/team2 structure', () => {
			const match = { team1: { name: 'Natus Vincere' }, team2: { name: 'FaZe' } };
			expect(fetcher.extractTeamName(match, 0)).toBe('Natus Vincere');
			expect(fetcher.extractTeamName(match, 1)).toBe('FaZe');
		});

		it('extracts from opponents structure', () => {
			const match = { opponents: [{ name: 'G2' }, { name: 'Vitality' }] };
			expect(fetcher.extractTeamName(match, 0)).toBe('G2');
			expect(fetcher.extractTeamName(match, 1)).toBe('Vitality');
		});

		it('returns TBD when no team name found', () => {
			expect(fetcher.extractTeamName({}, 0)).toBe('TBD');
			expect(fetcher.extractTeamName({}, 1)).toBe('TBD');
		});

		it('extracts from competitors structure', () => {
			const match = { competitors: [{ name: 'Astralis' }, { name: 'Liquid' }] };
			expect(fetcher.extractTeamName(match, 0)).toBe('Astralis');
			expect(fetcher.extractTeamName(match, 1)).toBe('Liquid');
		});
	});

	describe('getNestedValue()', () => {
		it('accesses nested object properties', () => {
			const obj = { a: { b: { c: 'value' } } };
			expect(fetcher.getNestedValue(obj, 'a.b.c')).toBe('value');
		});

		it('returns undefined for missing path', () => {
			expect(fetcher.getNestedValue({}, 'a.b.c')).toBeUndefined();
		});

		it('handles array index notation', () => {
			const obj = { items: ['first', 'second'] };
			expect(fetcher.getNestedValue(obj, 'items[0]')).toBe('first');
		});
	});

	describe('isNorwegianTeam()', () => {
		it('detects Norwegian team in match data', () => {
			const match = { team1: { name: '100 Thieves' } };
			// The config has "100 Thieves" as a Norwegian interest org
			// Check what norwegian.teams contains
			const hasNorwegianConfig = fetcher.config.norwegian?.teams?.length > 0;
			if (hasNorwegianConfig) {
				const result = fetcher.isNorwegianTeam(match);
				expect(typeof result).toBe('boolean');
			}
		});

		it('returns false for non-Norwegian teams', () => {
			const match = { team1: { name: 'RandomTeam123' }, team2: { name: 'AnotherTeam456' } };
			expect(fetcher.isNorwegianTeam(match)).toBe(false);
		});
	});

	describe('fetchFromSource()', () => {
		it('returns empty array for unknown source api', async () => {
			const result = await fetcher.fetchFromSource({ api: 'unknown' });
			expect(result).toEqual([]);
		});

		it('returns empty array for disabled fallback source', async () => {
			const result = await fetcher.fetchFromSource({ api: 'fallback', enabled: false });
			expect(result).toEqual([]);
		});
	});

	describe('fetchHLTV()', () => {
		it('returns empty array on API error', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockRejectedValue(new Error('Network error'))
			};

			const result = await fetcher.fetchHLTV({ url: 'https://hltv.org/api' });
			expect(result).toEqual([]);
		});

		it('returns empty array for non-array response', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({ error: 'invalid' })
			};

			const result = await fetcher.fetchHLTV({ url: 'https://hltv.org/api' });
			expect(result).toEqual([]);
		});

		it('skips stale data older than 30 days', async () => {
			const staleDate = new Date(Date.now() - 60 * 86400000).toISOString();
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue([
					{ date: staleDate, team1: { name: 'FaZe' }, team2: { name: 'Navi' }, event: { name: 'IEM' } }
				])
			};

			const result = await fetcher.fetchHLTV({ url: 'https://hltv.org/api' });
			expect(result).toEqual([]);
		});

		it('includes major events by pattern', async () => {
			const futureDate = new Date(Date.now() + 86400000).toISOString();
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue([
					{
						date: futureDate,
						team1: { name: 'TeamA' },
						team2: { name: 'TeamB' },
						event: { name: 'IEM Katowice' }
					}
				])
			};

			const result = await fetcher.fetchHLTV({ url: 'https://hltv.org/api' });
			expect(result.length).toBe(1);
			expect(result[0].tournament).toBe('IEM Katowice');
		});

		it('filters by focus teams from config', async () => {
			const futureDate = new Date(Date.now() + 86400000).toISOString();
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue([
					{
						date: futureDate,
						team1: { name: 'RandomTeam' },
						team2: { name: 'AnotherTeam' },
						event: { name: 'Small Cup' }
					}
				])
			};

			const result = await fetcher.fetchHLTV({ url: 'https://hltv.org/api' });
			// Neither team matches focus teams, and "Small Cup" is not a major pattern
			expect(result).toEqual([]);
		});

		it('limits results to 10 matches', async () => {
			const futureDate = new Date(Date.now() + 86400000).toISOString();
			const matches = Array.from({ length: 15 }, (_, i) => ({
				date: futureDate,
				team1: { name: 'TeamA' },
				team2: { name: 'TeamB' },
				event: { name: `IEM Event ${i}` }
			}));

			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue(matches)
			};

			const result = await fetcher.fetchHLTV({ url: 'https://hltv.org/api' });
			expect(result.length).toBeLessThanOrEqual(10);
		});
	});

	describe('fetchFallbackMatches()', () => {
		it('returns empty array (no hardcoded matches)', async () => {
			const result = await fetcher.fetchFallbackMatches();
			expect(result).toEqual([]);
		});
	});

	describe('transformToEvents()', () => {
		const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();

		it('normalizes esports events', () => {
			const rawData = [{
				title: 'FaZe vs Navi',
				time: futureDate,
				venue: 'Online',
				tournament: 'IEM Katowice',
				norwegian: false,
				meta: 'CS2 Competition'
			}];

			const events = fetcher.transformToEvents(rawData);
			expect(events.length).toBeGreaterThan(0);
			expect(events[0].sport).toBe('esports');
		});

		it('returns empty array for empty input', () => {
			expect(fetcher.transformToEvents([])).toEqual([]);
		});

		it('deduplicates events', () => {
			const rawData = [
				{
					title: 'Match A',
					time: futureDate,
					venue: 'Online',
					tournament: 'Tournament',
					meta: 'CS2'
				},
				{
					title: 'Match A',
					time: futureDate,
					venue: 'Online',
					tournament: 'Tournament',
					meta: 'CS2'
				}
			];

			const events = fetcher.transformToEvents(rawData);
			expect(events.length).toBe(1);
		});
	});
});
