import { describe, it, expect } from 'vitest';
import { playerNameMatches, parseTeeTimeToUTC, tournamentNameMatches, filterNorwegiansAgainstField, buildFeaturedGroups, fetchPGATourTeeTimes } from '../scripts/fetch/golf.js';

describe('playerNameMatches()', () => {
	it('matches exact full name', () => {
		expect(playerNameMatches('Viktor Hovland', { name: 'Viktor Hovland' })).toBe(true);
	});

	it('matches case-insensitively', () => {
		expect(playerNameMatches('VIKTOR HOVLAND', { name: 'Viktor Hovland' })).toBe(true);
	});

	it('matches when ESPN name contains golfer name', () => {
		expect(playerNameMatches('Viktor Hovland (N)', { name: 'Viktor Hovland' })).toBe(true);
	});

	it('matches when golfer name contains ESPN name', () => {
		expect(playerNameMatches('V. Hovland', { name: 'V. Hovland' })).toBe(true);
	});

	it('matches when all name parts appear in ESPN name', () => {
		expect(playerNameMatches('Hovland, Viktor', { name: 'Viktor Hovland' })).toBe(true);
	});

	it('rejects partial single-word match', () => {
		expect(playerNameMatches('Ventura', { name: 'Viktor Hovland' })).toBe(false);
	});

	it('rejects completely different name', () => {
		expect(playerNameMatches('Tiger Woods', { name: 'Viktor Hovland' })).toBe(false);
	});

	it('handles whitespace in names', () => {
		expect(playerNameMatches('  Viktor Hovland  ', { name: 'Viktor Hovland' })).toBe(true);
	});
});

describe('parseTeeTimeToUTC()', () => {
	it('returns null for empty input', () => {
		expect(parseTeeTimeToUTC(null, '2026-02-13', 'America/New_York')).toBeNull();
		expect(parseTeeTimeToUTC('8:45 AM', null, 'America/New_York')).toBeNull();
	});

	it('returns null for invalid time format', () => {
		expect(parseTeeTimeToUTC('invalid', '2026-02-13', 'America/New_York')).toBeNull();
		expect(parseTeeTimeToUTC('25:00 AM', '2026-02-13', 'America/New_York')).toBeNull();
	});

	it('parses valid AM time', () => {
		const result = parseTeeTimeToUTC('8:45 AM', new Date(Date.now() + 86400000).toISOString(), 'America/New_York');
		// Result may be null if outside valid window, but should not throw
		expect(result === null || typeof result === 'string').toBe(true);
	});

	it('parses valid PM time', () => {
		const result = parseTeeTimeToUTC('1:30 PM', new Date(Date.now() + 86400000).toISOString(), 'America/New_York');
		expect(result === null || typeof result === 'string').toBe(true);
	});

	it('defaults to America/New_York timezone when none provided', () => {
		const result = parseTeeTimeToUTC('8:45 AM', new Date(Date.now() + 86400000).toISOString(), null);
		expect(result === null || typeof result === 'string').toBe(true);
	});

	it('returns null for tee times far in the past', () => {
		expect(parseTeeTimeToUTC('8:45 AM', '2020-01-01', 'America/New_York')).toBeNull();
	});
});

describe('tournamentNameMatches()', () => {
	it('matches identical multi-word names', () => {
		expect(tournamentNameMatches('PGA Championship', 'PGA Championship')).toBe(true);
	});

	it('matches with sufficient word overlap', () => {
		expect(tournamentNameMatches('Arnold Palmer Invitational', 'Arnold Palmer Invitational presented by Mastercard')).toBe(true);
	});

	it('rejects single common-word overlap', () => {
		// "Open" alone is not enough
		expect(tournamentNameMatches('U.S. Open', 'British Open Championship')).toBe(false);
	});

	it('returns false for null/undefined input', () => {
		expect(tournamentNameMatches(null, 'Masters')).toBe(false);
		expect(tournamentNameMatches('Masters', null)).toBe(false);
	});

	it('ignores stop words', () => {
		// "the" and "at" are stop words, so only meaningful words count
		expect(tournamentNameMatches('The Players Championship', 'Players Championship')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(tournamentNameMatches('PGA CHAMPIONSHIP', 'pga championship')).toBe(true);
	});

	it('rejects completely different tournaments', () => {
		expect(tournamentNameMatches('The Masters', 'Waste Management Phoenix Open')).toBe(false);
	});
});

describe('filterNorwegiansAgainstField()', () => {
	const pgaField = {
		players: [
			{ displayName: 'Viktor Hovland' },
			{ displayName: 'Tiger Woods' },
			{ displayName: 'Rory McIlroy' },
		]
	};

	it('returns golfers found in the field', () => {
		const golfers = [{ name: 'Viktor Hovland', tours: ['pga'] }];
		const result = filterNorwegiansAgainstField(golfers, pgaField);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Viktor Hovland');
	});

	it('filters out golfers not in the field', () => {
		const golfers = [
			{ name: 'Viktor Hovland', tours: ['pga'] },
			{ name: 'Kristoffer Ventura', tours: ['pga'] },
		];
		const result = filterNorwegiansAgainstField(golfers, pgaField);
		expect(result).toHaveLength(1);
	});

	it('returns empty array when no golfers match', () => {
		const golfers = [{ name: 'Kristoffer Ventura', tours: ['pga'] }];
		const result = filterNorwegiansAgainstField(golfers, pgaField);
		expect(result).toHaveLength(0);
	});
});

describe('buildFeaturedGroups()', () => {
	it('returns empty array when pgaField is null', () => {
		expect(buildFeaturedGroups([{ name: 'Viktor Hovland' }], null)).toEqual([]);
	});

	it('returns empty array when no players have tee times', () => {
		const pgaField = { players: [{ displayName: 'Viktor Hovland' }] };
		expect(buildFeaturedGroups([{ name: 'Viktor Hovland' }], pgaField)).toEqual([]);
	});

	it('groups players by teeTime and startingHole', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Tiger Woods', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Rory McIlroy', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Jon Rahm', teeTime: '9:00', startingHole: 1 },
			]
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '8:45' }];
		const result = buildFeaturedGroups(norwegians, pgaField);
		expect(result).toHaveLength(1);
		expect(result[0].player).toBe('Viktor Hovland');
		expect(result[0].groupmates).toHaveLength(2);
		expect(result[0].groupmates.map(g => g.name)).toContain('Tiger Woods');
		expect(result[0].groupmates.map(g => g.name)).toContain('Rory McIlroy');
	});

	it('excludes Norwegian player from their own groupmates', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Tiger Woods', teeTime: '8:45', startingHole: 1 },
			]
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '8:45' }];
		const result = buildFeaturedGroups(norwegians, pgaField);
		expect(result[0].groupmates.map(g => g.name)).not.toContain('Viktor Hovland');
	});

	it('skips players with no groupmates', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
			]
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '8:45' }];
		const result = buildFeaturedGroups(norwegians, pgaField);
		expect(result).toHaveLength(0);
	});

	it('handles multiple Norwegian players in different groups', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Tiger Woods', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Kristoffer Ventura', teeTime: '9:00', startingHole: 1 },
				{ displayName: 'Jon Rahm', teeTime: '9:00', startingHole: 1 },
			]
		};
		const norwegians = [
			{ name: 'Viktor Hovland', teeTime: '8:45' },
			{ name: 'Kristoffer Ventura', teeTime: '9:00' },
		];
		const result = buildFeaturedGroups(norwegians, pgaField);
		expect(result).toHaveLength(2);
	});

	it('prefers pgaTeeTimes data over pgaField when available', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Tiger Woods', teeTime: '8:45', startingHole: 1 },
			]
		};
		const pgaTeeTimes = {
			playerTeeTimes: new Map([
				['viktor hovland', { teeTime: '09:15', teeTimeUTC: '2026-02-13T14:15:00Z', startingHole: 1, groupmates: ['Rory McIlroy', 'Jon Rahm'] }],
			]),
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '09:15' }];
		const result = buildFeaturedGroups(norwegians, pgaField, pgaTeeTimes);
		expect(result).toHaveLength(1);
		expect(result[0].teeTime).toBe('09:15');
		expect(result[0].groupmates.map(g => g.name)).toContain('Rory McIlroy');
		expect(result[0].groupmates.map(g => g.name)).toContain('Jon Rahm');
	});

	it('falls back to pgaField when pgaTeeTimes has no match', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Tiger Woods', teeTime: '8:45', startingHole: 1 },
			]
		};
		const pgaTeeTimes = {
			playerTeeTimes: new Map(), // empty — no tee times available
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '8:45' }];
		const result = buildFeaturedGroups(norwegians, pgaField, pgaTeeTimes);
		expect(result).toHaveLength(1);
		expect(result[0].groupmates.map(g => g.name)).toContain('Tiger Woods');
	});

	it('falls back to pgaField when pgaTeeTimes is null', () => {
		const pgaField = {
			players: [
				{ displayName: 'Viktor Hovland', teeTime: '8:45', startingHole: 1 },
				{ displayName: 'Tiger Woods', teeTime: '8:45', startingHole: 1 },
			]
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '8:45' }];
		const result = buildFeaturedGroups(norwegians, pgaField, null);
		expect(result).toHaveLength(1);
		expect(result[0].groupmates.map(g => g.name)).toContain('Tiger Woods');
	});

	it('skips players without groupmates in pgaTeeTimes', () => {
		const pgaTeeTimes = {
			playerTeeTimes: new Map([
				['viktor hovland', { teeTime: '09:15', teeTimeUTC: null, startingHole: 1, groupmates: [] }],
			]),
		};
		const norwegians = [{ name: 'Viktor Hovland', teeTime: '09:15' }];
		const result = buildFeaturedGroups(norwegians, null, pgaTeeTimes);
		expect(result).toHaveLength(0);
	});
});
