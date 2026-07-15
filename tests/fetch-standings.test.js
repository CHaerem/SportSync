// fetch-standings: buildDriverTeamMap — infers driver→team from ESPN F1 standings
// by correlating each constructor's per-race points with pairs of drivers whose
// per-race points sum to them. No network; fixtures mirror ESPN's entry shape.
import { describe, it, expect } from "vitest";
import { buildDriverTeamMap } from "../scripts/fetch-standings.js";

// ESPN marks per-race stats with `played`; season aggregates (rank, points) lack it
// and must be ignored by the correlation.
const raceStat = (name, value) => ({ name, value, played: true });
const driver = (name, races) => ({
	athlete: { displayName: name },
	stats: [{ name: "rank", value: 1 }, ...Object.entries(races).map(([r, v]) => raceStat(r, v))],
});
const constructorEntry = (team, races) => ({
	team: team ? { displayName: team } : {},
	stats: [{ name: "points", value: 999 }, ...Object.entries(races).map(([r, v]) => raceStat(r, v))],
});
const group = (entries) => ({ standings: { entries } });

describe("buildDriverTeamMap", () => {
	it("maps each driver pair to the constructor whose per-race points they sum to", () => {
		const drivers = [
			driver("Lando Norris", { bahrain: 25, jeddah: 18 }),
			driver("Oscar Piastri", { bahrain: 18, jeddah: 25 }),
			driver("Max Verstappen", { bahrain: 15, jeddah: 12 }),
			driver("Yuki Tsunoda", { bahrain: 12, jeddah: 10 }),
		];
		const constructors = group([
			constructorEntry("McLaren", { bahrain: 43, jeddah: 43 }),
			constructorEntry("Red Bull", { bahrain: 27, jeddah: 22 }),
		]);
		expect(buildDriverTeamMap(drivers, constructors)).toEqual({
			"Lando Norris": "McLaren",
			"Oscar Piastri": "McLaren",
			"Max Verstappen": "Red Bull",
			"Yuki Tsunoda": "Red Bull",
		});
	});

	it("finds teammate pairs that are not adjacent in the driver standings", () => {
		const drivers = [
			driver("A1", { r1: 20 }),
			driver("B1", { r1: 5 }),
			driver("A2", { r1: 10 }),
			driver("B2", { r1: 7 }),
		];
		const constructors = group([
			constructorEntry("Team A", { r1: 30 }),
			constructorEntry("Team B", { r1: 12 }),
		]);
		expect(buildDriverTeamMap(drivers, constructors)).toEqual({
			A1: "Team A",
			A2: "Team A",
			B1: "Team B",
			B2: "Team B",
		});
	});

	it("treats races a driver missed as 0 points", () => {
		const drivers = [
			driver("Rookie", { r1: 6 }), // no r2 entry at all
			driver("Veteran", { r1: 10, r2: 8 }),
		];
		const constructors = group([constructorEntry("Backmarker", { r1: 16, r2: 8 })]);
		expect(buildDriverTeamMap(drivers, constructors)).toEqual({
			Rookie: "Backmarker",
			Veteran: "Backmarker",
		});
	});

	it("returns an empty map when the constructor group is missing or empty", () => {
		const drivers = [driver("Solo", { r1: 10 })];
		expect(buildDriverTeamMap(drivers, undefined)).toEqual({});
		expect(buildDriverTeamMap(drivers, null)).toEqual({});
		expect(buildDriverTeamMap(drivers, group([]))).toEqual({});
		expect(buildDriverTeamMap(drivers, { standings: {} })).toEqual({});
	});

	it("skips constructors without a team name", () => {
		const drivers = [
			driver("D1", { r1: 10 }),
			driver("D2", { r1: 5 }),
		];
		// The nameless constructor's points would match (D1, D2) — it must be skipped,
		// leaving the drivers unmapped rather than mapped to "".
		const constructors = group([constructorEntry(null, { r1: 15 })]);
		expect(buildDriverTeamMap(drivers, constructors)).toEqual({});
	});

	it("skips constructors with no per-race stats", () => {
		const drivers = [
			driver("D1", { r1: 10 }),
			driver("D2", { r1: 5 }),
		];
		const noRaces = { team: { displayName: "Ghost" }, stats: [{ name: "points", value: 15 }] };
		expect(buildDriverTeamMap(drivers, group([noRaces]))).toEqual({});
	});

	it("leaves drivers unmapped when no pair sums to the constructor's points", () => {
		const drivers = [
			driver("D1", { r1: 25 }),
			driver("D2", { r1: 18 }),
		];
		const constructors = group([constructorEntry("Mismatch", { r1: 100 })]);
		expect(buildDriverTeamMap(drivers, constructors)).toEqual({});
	});

	it("leaves the odd driver out when only one pair matches", () => {
		const drivers = [
			driver("Paired 1", { r1: 12 }),
			driver("Paired 2", { r1: 8 }),
			driver("Odd One", { r1: 3 }),
		];
		const constructors = group([constructorEntry("Team", { r1: 20 })]);
		const map = buildDriverTeamMap(drivers, constructors);
		expect(map).toEqual({ "Paired 1": "Team", "Paired 2": "Team" });
		expect(map["Odd One"]).toBeUndefined();
	});

	it("degrades greedily on ambiguous all-zero (pre-season) data", () => {
		// Before any race every pair sums to every constructor's 0 — the correlation
		// cannot distinguish teams. Documents current behavior: greedy first-match
		// assigns drivers in listing order (arbitrary but harmless pre-season).
		const drivers = [
			driver("D1", { r1: 0 }),
			driver("D2", { r1: 0 }),
			driver("D3", { r1: 0 }),
			driver("D4", { r1: 0 }),
		];
		const constructors = group([
			constructorEntry("Team X", { r1: 0 }),
			constructorEntry("Team Y", { r1: 0 }),
		]);
		expect(buildDriverTeamMap(drivers, constructors)).toEqual({
			D1: "Team X",
			D2: "Team X",
			D3: "Team Y",
			D4: "Team Y",
		});
	});
});
