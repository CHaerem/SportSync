import { describe, it, expect } from 'vitest';
import { getNorwegianStreaming, applyNorwegianStreaming, norwegianStreamingMap } from '../scripts/lib/norwegian-streaming.js';

describe('getNorwegianStreaming()', () => {
	it('returns Viaplay for Premier League', () => {
		const result = getNorwegianStreaming('football', 'Premier League');
		expect(result).toHaveLength(1);
		expect(result[0].platform).toBe('Viaplay');
	});

	it('returns TV 2 Play for La Liga', () => {
		const result = getNorwegianStreaming('football', 'La Liga');
		expect(result[0].platform).toBe('TV 2 Play');
	});

	it('returns TV 2 Play for Champions League', () => {
		const result = getNorwegianStreaming('football', 'UEFA Champions League');
		expect(result[0].platform).toBe('TV 2 Play');
	});

	it('returns Discovery+ for Norwegian leagues', () => {
		const eliteserien = getNorwegianStreaming('football', 'Eliteserien');
		expect(eliteserien[0].platform).toBe('Discovery+');

		const obos = getNorwegianStreaming('football', 'OBOS-ligaen');
		expect(obos[0].platform).toBe('Discovery+');
	});

	it('returns default for unknown football league', () => {
		const result = getNorwegianStreaming('football', 'Obscure League');
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('info');
	});

	it('matches league case-insensitively', () => {
		const result = getNorwegianStreaming('football', 'premier league');
		expect(result).toHaveLength(1);
		expect(result[0].platform).toBe('Viaplay');
	});

	it('matches partial league names', () => {
		const result = getNorwegianStreaming('football', 'English Premier League 2025-26');
		expect(result[0].platform).toBe('Viaplay');
	});

	it('returns Viaplay and Discovery+ for PGA Tour golf', () => {
		const result = getNorwegianStreaming('golf', 'PGA Tour');
		expect(result).toHaveLength(2);
		expect(result.map(s => s.platform)).toContain('Viaplay');
		expect(result.map(s => s.platform)).toContain('Discovery+');
	});

	it('returns Discovery+ for tennis', () => {
		const result = getNorwegianStreaming('tennis', 'ATP Tour');
		expect(result[0].platform).toBe('Discovery+');
	});

	it('returns Viaplay for F1', () => {
		const result = getNorwegianStreaming('f1', 'Formula 1');
		expect(result).toHaveLength(2);
		expect(result[0].platform).toBe('Viaplay');
	});

	it('handles formula1 sport alias', () => {
		const result = getNorwegianStreaming('formula1', 'Formula 1');
		expect(result).toHaveLength(2);
		expect(result[0].platform).toBe('Viaplay');
	});

	it('returns chess streaming platforms', () => {
		const result = getNorwegianStreaming('chess', 'World Championship');
		expect(result.length).toBeGreaterThan(0);
	});

	it('returns Twitch for CS2 esports', () => {
		const result = getNorwegianStreaming('esports', 'CS2 Major');
		expect(result.map(s => s.platform)).toContain('Twitch');
	});

	it('returns empty array for unknown sport', () => {
		expect(getNorwegianStreaming('curling', 'World Cup')).toEqual([]);
	});

	it('returns default when league is null', () => {
		const result = getNorwegianStreaming('football', null);
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('info');
	});

	it('returns default when league is empty string', () => {
		const result = getNorwegianStreaming('tennis', '');
		expect(result[0].platform).toBe('Discovery+');
	});
});

describe('applyNorwegianStreaming()', () => {
	it('adds streaming info to football event', () => {
		const event = { sport: 'football', tournament: 'Premier League' };
		const result = applyNorwegianStreaming(event);
		expect(result.streaming).toHaveLength(1);
		expect(result.streaming[0].platform).toBe('Viaplay');
	});

	it('uses meta field for league lookup', () => {
		const event = { sport: 'football', meta: 'La Liga' };
		const result = applyNorwegianStreaming(event);
		expect(result.streaming[0].platform).toBe('TV 2 Play');
	});

	it('uses league field as fallback', () => {
		const event = { sport: 'tennis', league: 'ATP Tour' };
		const result = applyNorwegianStreaming(event);
		expect(result.streaming[0].platform).toBe('Discovery+');
	});

	it('overwrites existing streaming array', () => {
		const event = {
			sport: 'football',
			tournament: 'Premier League',
			streaming: [{ platform: 'OldPlatform' }],
		};
		const result = applyNorwegianStreaming(event);
		expect(result.streaming[0].platform).toBe('Viaplay');
	});

	it('returns null/undefined event unchanged', () => {
		expect(applyNorwegianStreaming(null)).toBeNull();
		expect(applyNorwegianStreaming(undefined)).toBeUndefined();
	});

	it('mutates and returns the same event object', () => {
		const event = { sport: 'golf', tournament: 'PGA Tour' };
		const result = applyNorwegianStreaming(event);
		expect(result).toBe(event);
	});
});

describe('norwegianStreamingMap', () => {
	it('contains all expected sport categories', () => {
		expect(Object.keys(norwegianStreamingMap)).toEqual(
			expect.arrayContaining(['football', 'golf', 'tennis', 'f1', 'chess', 'esports'])
		);
	});

	it('every sport has a default entry', () => {
		for (const [sport, leagues] of Object.entries(norwegianStreamingMap)) {
			expect(leagues.default).toBeDefined();
			expect(Array.isArray(leagues.default)).toBe(true);
			expect(leagues.default.length).toBeGreaterThan(0);
		}
	});

	it('all service entries have platform and type fields', () => {
		for (const [sport, leagues] of Object.entries(norwegianStreamingMap)) {
			for (const [league, services] of Object.entries(leagues)) {
				for (const service of services) {
					expect(service).toHaveProperty('platform');
					expect(service).toHaveProperty('type');
					expect(typeof service.platform).toBe('string');
				}
			}
		}
	});
});
