import { describe, it, expect } from 'vitest';
import { parseIcsForLynMatches, extractIcsField, parseIcsDateTime } from '../scripts/fetch/fotball-no.js';

describe('fotball-no', () => {
	describe('extractIcsField()', () => {
		it('extracts a simple field value', () => {
			const data = 'SUMMARY:Lyn 1896 - Bryne FK\nLOCATION:Bislett Stadion';
			expect(extractIcsField(data, 'SUMMARY')).toBe('Lyn 1896 - Bryne FK');
			expect(extractIcsField(data, 'LOCATION')).toBe('Bislett Stadion');
		});

		it('extracts field with parameters (TZID)', () => {
			const data = 'DTSTART;TZID=Europe/Oslo:20260615T180000';
			expect(extractIcsField(data, 'DTSTART')).toBe('20260615T180000');
		});

		it('returns null for missing field', () => {
			expect(extractIcsField('SUMMARY:Test', 'LOCATION')).toBeNull();
		});

		it('handles empty event data', () => {
			expect(extractIcsField('', 'SUMMARY')).toBeNull();
		});
	});

	describe('parseIcsDateTime()', () => {
		it('parses date-only format (YYYYMMDD)', () => {
			const result = parseIcsDateTime('20260615');
			expect(result).toBeInstanceOf(Date);
			expect(result.getUTCHours()).toBe(12);
			expect(result.getUTCMonth()).toBe(5); // June = 5
			expect(result.getUTCDate()).toBe(15);
		});

		it('parses datetime format (YYYYMMDDTHHMMSS) in summer (CEST)', () => {
			const result = parseIcsDateTime('20260615T180000');
			expect(result).toBeInstanceOf(Date);
			// 18:00 CEST = 16:00 UTC (summer, offset -2)
			expect(result.getUTCHours()).toBe(16);
		});

		it('parses datetime format in winter (CET)', () => {
			const result = parseIcsDateTime('20261215T180000');
			expect(result).toBeInstanceOf(Date);
			// 18:00 CET = 17:00 UTC (winter, offset -1)
			expect(result.getUTCHours()).toBe(17);
		});

		it('returns null for null input', () => {
			expect(parseIcsDateTime(null)).toBeNull();
		});

		it('returns null for empty string', () => {
			expect(parseIcsDateTime('')).toBeNull();
		});

		it('returns null for invalid format', () => {
			expect(parseIcsDateTime('abc')).toBeNull();
		});
	});

	describe('parseIcsForLynMatches()', () => {
		function buildIcsEvent({ summary, dtstart, location }) {
			return `BEGIN:VEVENT\nSUMMARY:${summary}\nDTSTART:${dtstart}\nLOCATION:${location}\nEND:VEVENT`;
		}

		it('extracts Lyn matches from ICS data', () => {
			const ics = buildIcsEvent({
				summary: 'Lyn 1896 - Bryne FK',
				dtstart: '20260615T180000',
				location: 'Bislett Stadion'
			});

			const matches = parseIcsForLynMatches(ics);
			expect(matches).toHaveLength(1);
			expect(matches[0].homeTeam).toBe('Lyn 1896');
			expect(matches[0].awayTeam).toBe('Bryne FK');
			expect(matches[0].venue).toBe('Bislett Stadion');
			expect(matches[0].sport).toBe('football');
			expect(matches[0].norwegian).toBe(true);
			expect(matches[0].meta).toBe('OBOS-ligaen');
		});

		it('extracts away Lyn matches', () => {
			const ics = buildIcsEvent({
				summary: 'KFUM Oslo - Lyn 1896',
				dtstart: '20260622T150000',
				location: 'Ekeberg'
			});

			const matches = parseIcsForLynMatches(ics);
			expect(matches).toHaveLength(1);
			expect(matches[0].homeTeam).toBe('KFUM Oslo');
			expect(matches[0].awayTeam).toBe('Lyn 1896');
		});

		it('ignores non-Lyn matches', () => {
			const ics = buildIcsEvent({
				summary: 'Bryne FK - KFUM Oslo',
				dtstart: '20260615T180000',
				location: 'Bryne Stadion'
			});

			const matches = parseIcsForLynMatches(ics);
			expect(matches).toHaveLength(0);
		});

		it('handles multiple events, extracting only Lyn', () => {
			const events = [
				buildIcsEvent({ summary: 'Bryne FK - KFUM Oslo', dtstart: '20260615T140000', location: 'Bryne' }),
				buildIcsEvent({ summary: 'Lyn 1896 - Sogndal', dtstart: '20260615T180000', location: 'Bislett' }),
				buildIcsEvent({ summary: 'Ranheim - Aalesund', dtstart: '20260616T160000', location: 'Extra Arena' })
			].join('\n');

			const matches = parseIcsForLynMatches(events);
			expect(matches).toHaveLength(1);
			expect(matches[0].title).toBe('Lyn 1896 - Sogndal');
		});

		it('handles DTSTART with TZID parameter', () => {
			const ics = 'BEGIN:VEVENT\nSUMMARY:Lyn 1896 - Bryne FK\nDTSTART;TZID=Europe/Oslo:20260615T180000\nLOCATION:Bislett\nEND:VEVENT';

			const matches = parseIcsForLynMatches(ics);
			expect(matches).toHaveLength(1);
			expect(matches[0].time).toBeTruthy();
		});

		it('uses TBD for missing location', () => {
			const ics = 'BEGIN:VEVENT\nSUMMARY:Lyn 1896 - Bryne FK\nDTSTART:20260615T180000\nEND:VEVENT';

			const matches = parseIcsForLynMatches(ics);
			expect(matches).toHaveLength(1);
			expect(matches[0].venue).toBe('TBD');
		});

		it('includes streaming info', () => {
			const ics = buildIcsEvent({
				summary: 'Lyn 1896 - Bryne FK',
				dtstart: '20260615T180000',
				location: 'Bislett'
			});

			const matches = parseIcsForLynMatches(ics);
			expect(matches[0].streaming).toHaveLength(1);
			expect(matches[0].streaming[0].platform).toBe('TV2 Play');
		});

		it('returns empty array for empty ICS data', () => {
			expect(parseIcsForLynMatches('')).toEqual([]);
		});

		it('skips events without two teams in summary', () => {
			const ics = buildIcsEvent({
				summary: 'Lyn 1896 treningskamp',
				dtstart: '20260615T180000',
				location: 'Bislett'
			});

			const matches = parseIcsForLynMatches(ics);
			expect(matches).toHaveLength(0);
		});
	});
});
