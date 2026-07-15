// WP-44 golden test: the deduped fetch-results helpers must reproduce, byte-for-byte,
// the output the pre-refactor logic produced. golden.json was captured from the
// original code (see tests/fixtures/wp44/); this drives the refactored functions
// against the same fixture inputs and asserts identical output.
//
// Date.now() is frozen to FIXED_NOW so the merge retention cutoffs and the
// validators' future-date check are deterministic.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
	mergeFootballResults,
	mergeTennisResults,
	mergeF1Results,
	validateFootballResult,
	validateTennisResult,
	validateF1Result,
	validateGolfResult,
	validateResults,
	matchRssHeadline,
} from "../scripts/fetch-results.js";
import { golfCompetitorFields } from "../scripts/lib/golf.js";
import * as fx from "./fixtures/wp44/inputs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(here, "fixtures/wp44/golden.json"), "utf-8"));

// Reproduce the two golf-row shapes exactly as the callers assemble them from the
// shared extractor (fetch-standings mapCompetitor / fetch-results top players).
function standingsRow(c, idx) {
	const f = golfCompetitorFields(c, idx);
	return {
		position: f.position,
		positionDisplay: c.status?.position?.displayName || null,
		player: f.player,
		score: f.score,
		today: f.round,
		thru: f.thru,
		headshot: c.id ? `https://a.espncdn.com/i/headshots/golf/players/full/${c.id}.png` : null,
	};
}
function resultsRow(c, idx) {
	const f = golfCompetitorFields(c, idx);
	return { position: f.position, player: f.player, score: f.score, roundScore: f.round, thru: f.thru };
}

const byFavoriteThenDateDesc = (a, b) => {
	if (a.isFavorite && !b.isFavorite) return -1;
	if (!a.isFavorite && b.isFavorite) return 1;
	return new Date(b.date) - new Date(a.date);
};

describe("WP-44 fetch-results dedupe — byte-identical golden", () => {
	let realNow;
	beforeAll(() => {
		realNow = Date.now;
		Date.now = () => fx.FIXED_NOW;
	});
	afterAll(() => {
		Date.now = realNow;
	});

	it("mergeFootballResults dedupes, overrides, prunes, preserves order", () => {
		expect(mergeFootballResults(fx.footballExisting, fx.footballFresh)).toEqual(golden.mergeFootball);
	});

	it("mergeTennisResults matches golden", () => {
		expect(mergeTennisResults(fx.tennisExisting, fx.tennisFresh)).toEqual(golden.mergeTennis);
	});

	it("mergeF1Results matches golden (30-day window)", () => {
		expect(mergeF1Results(fx.f1Existing, fx.f1Fresh)).toEqual(golden.mergeF1);
	});

	it("favourites-first/date-desc comparator matches golden", () => {
		const sorted = [...fx.comparatorInput].sort(byFavoriteThenDateDesc).map(x => x.label);
		expect(sorted).toEqual(golden.comparatorSorted);
	});

	it("validateFootballResult matches golden", () => {
		expect(fx.footballValidatorCases.map(validateFootballResult)).toEqual(golden.footballValidator);
	});

	it("validateTennisResult matches golden", () => {
		expect(fx.tennisValidatorCases.map(validateTennisResult)).toEqual(golden.tennisValidator);
	});

	it("validateF1Result matches golden", () => {
		expect(fx.f1ValidatorCases.map(validateF1Result)).toEqual(golden.f1Validator);
	});

	it("validateGolfResult matches golden", () => {
		expect(fx.golfValidatorCases.map(validateGolfResult)).toEqual(golden.golfValidator);
	});

	it("validateResults aggregate matches golden", () => {
		expect(validateResults(fx.validateResultsInput)).toEqual(golden.validateResults);
	});

	it("matchRssHeadline (containsName-based tiers) matches golden", () => {
		const out = fx.rssMatchCases.map(c => matchRssHeadline(c.homeTeam, c.awayTeam, c.rssItems, c.options));
		expect(out).toEqual(golden.rssMatch);
	});

	it("shared golf mapper reproduces standings row shape byte-for-byte", () => {
		expect(fx.golfCompetitorFixtures.map(standingsRow)).toEqual(golden.golfStandingsMapped);
	});

	it("shared golf mapper reproduces results row shape byte-for-byte", () => {
		expect(fx.golfCompetitorFixtures.map(resultsRow)).toEqual(golden.golfResultsMapped);
	});
});
