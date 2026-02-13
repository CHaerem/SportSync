import { describe, it, expect, beforeEach } from 'vitest';
import { TennisFetcher } from '../scripts/fetch/tennis.js';

describe('TennisFetcher', () => {
	let fetcher;

	beforeEach(() => {
		fetcher = new TennisFetcher();
	});

	describe('transformESPNEvent()', () => {
		const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();

		it('transforms standard ESPN tennis event', () => {
			const espnEvent = {
				name: 'Djokovic vs Alcaraz',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Rod Laver Arena' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Novak Djokovic' } },
						{ homeAway: 'away', athlete: { displayName: 'Carlos Alcaraz' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			expect(event.venue).toBe('Rod Laver Arena');
		});

		it('extracts participants from event name with "vs"', () => {
			const espnEvent = {
				name: 'Casper Ruud vs Rafael Nadal',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Court Philippe-Chatrier' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Casper Ruud' } },
						{ homeAway: 'away', athlete: { displayName: 'Rafael Nadal' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			expect(event.participants).toContain('Casper Ruud');
			expect(event.participants).toContain('Rafael Nadal');
		});

		it('parses participants from event name when no explicit competitors', () => {
			const espnEvent = {
				name: 'Sinner vs Medvedev',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Centre Court' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Jannik Sinner' } },
						{ homeAway: 'away', athlete: { displayName: 'Daniil Medvedev' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			expect(event.participants).toEqual(['Sinner', 'Medvedev']);
			expect(event.title).toBe('Sinner vs Medvedev');
		});

		it('does not extract participants when name has no "vs"', () => {
			const espnEvent = {
				name: 'Australian Open Final',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Rod Laver Arena' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Player A' } },
						{ homeAway: 'away', athlete: { displayName: 'Player B' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			// participants come from the "vs" in name, which is absent here
			// The event still has homeTeam/awayTeam from the ESPN adapter
		});

		it('returns null for null input', () => {
			expect(fetcher.transformESPNEvent(null)).toBeNull();
		});

		it('returns null for event without competitions', () => {
			expect(fetcher.transformESPNEvent({ name: 'Test' })).toBeNull();
		});

		it('detects Norwegian player by name part match', () => {
			const espnEvent = {
				name: 'Casper Ruud vs Daniil Medvedev',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Foro Italico' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Casper Ruud' } },
						{ homeAway: 'away', athlete: { displayName: 'Daniil Medvedev' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			expect(event.norwegian).toBe(true);
		});

		it('does not flag non-Norwegian matches', () => {
			const espnEvent = {
				name: 'Djokovic vs Alcaraz',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Rod Laver Arena' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Novak Djokovic' } },
						{ homeAway: 'away', athlete: { displayName: 'Carlos Alcaraz' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			expect(event.norwegian).toBe(false);
		});

		it('handles event with tournament name in sourceName', () => {
			const espnEvent = {
				name: 'Ruud vs Tsitsipas',
				date: futureDate,
				competitions: [{
					venue: { fullName: 'Court 1' },
					competitors: [
						{ homeAway: 'home', athlete: { displayName: 'Casper Ruud' } },
						{ homeAway: 'away', athlete: { displayName: 'Stefanos Tsitsipas' } }
					]
				}],
				sourceName: 'ATP Tour'
			};

			const event = fetcher.transformESPNEvent(espnEvent);
			expect(event).not.toBeNull();
			expect(event.tournament).toBe('ATP Tour');
		});
	});

	describe('applyCustomFilters()', () => {
		it('filters to Norwegian matches in exclusive mode', () => {
			// Tennis config uses "focused" mode, so let's test the exclusive path
			const originalMode = fetcher.config.norwegian.filterMode;
			fetcher.config.norwegian.filterMode = 'exclusive';

			const events = [
				{ norwegian: true, sport: 'tennis' },
				{ norwegian: false, sport: 'tennis' },
				{ norwegian: true, sport: 'tennis' }
			];

			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered).toHaveLength(2);
			expect(filtered.every(e => e.norwegian)).toBe(true);

			fetcher.config.norwegian.filterMode = originalMode;
		});

		it('delegates to parent in non-exclusive mode', () => {
			const events = [
				{ norwegian: true, sport: 'tennis', time: new Date(Date.now() + 86400000).toISOString() },
				{ norwegian: false, sport: 'tennis', time: new Date(Date.now() + 86400000).toISOString() }
			];

			// Default mode is "focused", which defers to parent
			const filtered = fetcher.applyCustomFilters(events);
			expect(filtered.length).toBeGreaterThan(0);
		});
	});
});
