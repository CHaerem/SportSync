// starter-packs.test.js (WP-162) — the CI guard that a shipped starter pack can
// never point at a DEAD entity id.
//
// Why it lives here and not in the Swift suite: `OnboardingTests` grounds the
// packs against the checked-in test FIXTURE
// (ios/SportivistaTests/Fixtures/entities.json). When the pipeline renamed an id
// the fixture kept the old one, the Swift test stayed green, and the shipped app
// tapped a pack that followed nothing — the drift hid in the gap between fixture
// and live index. This test closes that gap by reading the ids straight out of
// StarterPacks.swift and checking them against the LIVE published index
// (docs/data/entities.json), which the pipeline rewrites on every run.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const swift = fs.readFileSync(path.join(root, "ios/Sportivista/Onboarding/StarterPacks.swift"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(root, "docs/data/entities.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "ios/SportivistaTests/Fixtures/entities.json"), "utf8"));

/** Every `StarterRule("<id>", …)` id, in file order. */
function starterPackIds(source) {
	return [...source.matchAll(/StarterRule\("([^"]+)"/g)].map((m) => m[1]);
}

describe("starter packs (WP-162)", () => {
	const ids = starterPackIds(swift);

	it("parses a plausible set of ids out of StarterPacks.swift", () => {
		expect(ids.length).toBeGreaterThanOrEqual(15);
	});

	it("every starter-pack id is a LIVE entity in docs/data/entities.json", () => {
		const liveIds = new Set(live.map((e) => e.id));
		const dead = ids.filter((id) => !liveIds.has(id));
		expect(dead).toEqual([]);
	});

	it("no starter pack ships an EDITION-STAMPED id (it would die at the season change)", () => {
		const dated = ids.filter((id) => /-(?:19|20)\d{2}(?:-\d{2})?(?=-|$)/.test(id));
		expect(dated).toEqual([]);
	});

	it("the iOS test fixture resolves the same ids as the live index (no silent drift)", () => {
		const fixtureIds = new Set(fixture.map((e) => e.id));
		expect(ids.filter((id) => !fixtureIds.has(id))).toEqual([]);
	});
});
