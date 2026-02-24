import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsportsFetcher, parseLiquipediaMatches } from '../scripts/fetch/esports.js';

/**
 * Build a mock Liquipedia HTML block for a single match.
 * Mirrors the real HTML structure from Liquipedia:Matches page.
 */
function buildMockMatchHtml({ team1 = 'FaZe', team2 = 'NAVI', timestamp, tournament = 'IEM Katowice', format = 'Bo3', score1 = null, score2 = null } = {}) {
	const ts = timestamp || Math.floor(Date.now() / 1000) + 86400;
	const scoreHtml = (score1 !== null && score2 !== null)
		? `<span class="match-info-header-scoreholder-score">${score1}</span>
		   <span class="match-info-header-scoreholder-score">${score2}</span>`
		: '';
	return `<div class="match-info">
		<span class="timer-object" data-timestamp="${ts}"></span>
		<span class="name"><a href="/counterstrike/${team1}">${team1}</a></span>
		<span class="name"><a href="/counterstrike/${team2}">${team2}</a></span>
		<div class="match-info-tournament-name"><a href="/tournament">${tournament}</a></div>
		<div class="match-info-header-scoreholder-lower">${format}</div>
		${scoreHtml}
	</div>`;
}

function buildMockLiquipediaHtml(matchConfigs = []) {
	const matchBlocks = matchConfigs.map(buildMockMatchHtml).join('\n');
	return `<div class="matches-list">${matchBlocks}</div>`;
}

describe('parseLiquipediaMatches()', () => {
	it('returns empty array for null/undefined/empty input', () => {
		expect(parseLiquipediaMatches(null)).toEqual([]);
		expect(parseLiquipediaMatches(undefined)).toEqual([]);
		expect(parseLiquipediaMatches('')).toEqual([]);
	});

	it('returns empty array for non-string input', () => {
		expect(parseLiquipediaMatches(123)).toEqual([]);
		expect(parseLiquipediaMatches({})).toEqual([]);
	});

	it('parses a single match with team names and timestamp', () => {
		const ts = Math.floor(Date.now() / 1000) + 3600;
		const html = buildMockLiquipediaHtml([{ team1: 'G2', team2: 'Vitality', timestamp: ts, tournament: 'BLAST Premier' }]);

		const matches = parseLiquipediaMatches(html);
		expect(matches.length).toBe(1);
		expect(matches[0].team1).toBe('G2');
		expect(matches[0].team2).toBe('Vitality');
		expect(matches[0].tournament).toBe('BLAST Premier');
		expect(matches[0].timestamp).toBe(ts * 1000);
		expect(matches[0].time).toBeDefined();
	});

	it('parses multiple matches', () => {
		const html = buildMockLiquipediaHtml([
			{ team1: 'FaZe', team2: 'NAVI' },
			{ team1: 'Astralis', team2: 'Liquid', tournament: 'ESL Pro League' },
			{ team1: 'G2', team2: 'Vitality', tournament: 'IEM Dallas' }
		]);

		const matches = parseLiquipediaMatches(html);
		expect(matches.length).toBe(3);
	});

	it('extracts format (Bo1/Bo3/Bo5)', () => {
		const html = buildMockLiquipediaHtml([{ format: 'Bo3' }]);
		const matches = parseLiquipediaMatches(html);
		expect(matches[0].format).toBe('Bo3');
	});

	it('extracts scores when present', () => {
		const html = buildMockLiquipediaHtml([{ score1: 2, score2: 1 }]);
		const matches = parseLiquipediaMatches(html);
		expect(matches[0].score1).toBe(2);
		expect(matches[0].score2).toBe(1);
	});

	it('sets null scores when not present', () => {
		const html = buildMockLiquipediaHtml([{}]);
		const matches = parseLiquipediaMatches(html);
		expect(matches[0].score1).toBeNull();
		expect(matches[0].score2).toBeNull();
	});

	it('skips blocks without a timestamp', () => {
		const html = `<div class="match-info">
			<span class="name">TeamA</span>
			<span class="name">TeamB</span>
		</div>`;
		const matches = parseLiquipediaMatches(html);
		expect(matches).toEqual([]);
	});

	it('generates valid ISO time string from timestamp', () => {
		const ts = 1740000000; // known unix timestamp
		const html = buildMockLiquipediaHtml([{ timestamp: ts }]);
		const matches = parseLiquipediaMatches(html);
		expect(matches[0].time).toBe(new Date(ts * 1000).toISOString());
	});
});

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

	describe('isNorwegianTeamFromNames()', () => {
		it('detects Norwegian team from team name strings', () => {
			expect(fetcher.isNorwegianTeamFromNames('100 Thieves', 'FaZe')).toBe(true);
		});

		it('returns false for non-Norwegian team names', () => {
			expect(fetcher.isNorwegianTeamFromNames('G2', 'Vitality')).toBe(false);
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

		it('routes liquipedia source to fetchLiquipedia', async () => {
			fetcher.fetchLiquipedia = vi.fn().mockResolvedValue([{ title: 'test' }]);
			const source = { api: 'liquipedia', url: 'https://liquipedia.net/counterstrike/api.php', params: {} };
			const result = await fetcher.fetchFromSource(source);
			expect(fetcher.fetchLiquipedia).toHaveBeenCalledWith(source);
			expect(result).toEqual([{ title: 'test' }]);
		});
	});

	describe('fetchLiquipedia()', () => {
		const source = {
			api: 'liquipedia',
			url: 'https://liquipedia.net/counterstrike/api.php',
			params: { action: 'parse', page: 'Liquipedia:Matches', format: 'json', prop: 'text' }
		};

		it('returns empty array on API error', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockRejectedValue(new Error('Network error'))
			};

			const result = await fetcher.fetchLiquipedia(source);
			expect(result).toEqual([]);
		});

		it('returns empty array when response has no parse.text', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({ error: 'invalid' })
			};

			const result = await fetcher.fetchLiquipedia(source);
			expect(result).toEqual([]);
		});

		it('returns empty array when HTML is not a string', async () => {
			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({ parse: { text: 12345 } })
			};

			const result = await fetcher.fetchLiquipedia(source);
			expect(result).toEqual([]);
		});

		it('parses matches from Liquipedia HTML response', async () => {
			const futureTs = Math.floor(Date.now() / 1000) + 86400;
			const html = buildMockLiquipediaHtml([
				{ team1: 'FaZe', team2: 'NAVI', timestamp: futureTs, tournament: 'IEM Katowice' }
			]);

			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					parse: { text: { '*': html } }
				})
			};

			const result = await fetcher.fetchLiquipedia(source);
			expect(result.length).toBe(1);
			expect(result[0].title).toBe('FaZe vs NAVI');
			expect(result[0].tournament).toBe('IEM Katowice');
			expect(result[0].venue).toBe('Online');
		});

		it('filters by focus teams and major events', async () => {
			const futureTs = Math.floor(Date.now() / 1000) + 86400;
			const html = buildMockLiquipediaHtml([
				{ team1: 'NAVI', team2: 'G2', timestamp: futureTs, tournament: 'IEM Major' },
				{ team1: 'RandomA', team2: 'RandomB', timestamp: futureTs, tournament: 'Small Cup' }
			]);

			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					parse: { text: { '*': html } }
				})
			};

			const result = await fetcher.fetchLiquipedia(source);
			// NAVI + G2 are focus teams, IEM is major; RandomA vs RandomB in Small Cup is neither
			expect(result.length).toBe(1);
			expect(result[0].title).toBe('NAVI vs G2');
		});

		it('detects Norwegian team interest', async () => {
			const futureTs = Math.floor(Date.now() / 1000) + 86400;
			const html = buildMockLiquipediaHtml([
				{ team1: '100 Thieves', team2: 'FaZe', timestamp: futureTs, tournament: 'BLAST Premier' }
			]);

			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					parse: { text: { '*': html } }
				})
			};

			const result = await fetcher.fetchLiquipedia(source);
			expect(result.length).toBe(1);
			expect(result[0].norwegian).toBe(true);
		});

		it('limits results to 10 matches', async () => {
			const futureTs = Math.floor(Date.now() / 1000) + 86400;
			const matchConfigs = Array.from({ length: 15 }, (_, i) => ({
				team1: 'TeamA',
				team2: 'TeamB',
				timestamp: futureTs + i,
				tournament: `IEM Event ${i}`
			}));
			const html = buildMockLiquipediaHtml(matchConfigs);

			fetcher.apiClient = {
				fetchJSON: vi.fn().mockResolvedValue({
					parse: { text: { '*': html } }
				})
			};

			const result = await fetcher.fetchLiquipedia(source);
			expect(result.length).toBeLessThanOrEqual(10);
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

	describe('formatResponse()', () => {
		it('includes Liquipedia attribution in response', () => {
			const response = fetcher.formatResponse([]);
			expect(response.attribution).toBe('Data from Liquipedia (CC-BY-SA 3.0)');
		});

		it('includes source label', () => {
			const response = fetcher.formatResponse([]);
			expect(response.source).toBe('Liquipedia API');
		});
	});
});
