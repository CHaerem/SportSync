import { describe, it, expect } from "vitest";
import {
	playerNameMatches,
	filterNorwegiansAgainstField,
	buildFeaturedGroups,
	buildGolfTournament,
	getNorwegianStreaming,
	fetchGolfPlayerStatuses,
} from "../scripts/fetch/golf.js";
import { golfParticipationStatus, isOutOfTournament, GOLF_OUT_LABELS } from "../scripts/lib/golf.js";

// --- playerNameMatches ---

describe("playerNameMatches", () => {
	it("matches on exact full name", () => {
		expect(playerNameMatches("Kristoffer Ventura", { name: "Kristoffer Ventura" })).toBe(true);
	});

	it("matches when ESPN name contains the configured full name", () => {
		expect(playerNameMatches("Kristoffer Ventura (a)", { name: "Kristoffer Ventura" })).toBe(true);
	});

	it("matches when all name parts appear, regardless of order/extra tokens", () => {
		expect(playerNameMatches("Ventura, Kristoffer", { name: "Kristoffer Ventura" })).toBe(true);
	});

	it("does not match a different player sharing one surname token", () => {
		expect(playerNameMatches("Jordan Spieth", { name: "Kristoffer Ventura" })).toBe(false);
	});
});

// --- filterNorwegiansAgainstField ---

describe("filterNorwegiansAgainstField", () => {
	const field = { players: [
		{ displayName: "Kristoffer Ventura" },
		{ displayName: "Rory McIlroy" },
	] };

	it("keeps only golfers present in the field", () => {
		const golfers = [{ name: "Kristoffer Ventura" }, { name: "Viktor Hovland" }];
		expect(filterNorwegiansAgainstField(golfers, field)).toEqual([{ name: "Kristoffer Ventura" }]);
	});

	it("returns empty when none are in the field", () => {
		expect(filterNorwegiansAgainstField([{ name: "Viktor Hovland" }], field)).toEqual([]);
	});
});

// --- buildFeaturedGroups ---

describe("buildFeaturedGroups", () => {
	it("uses tee-times group data when available", () => {
		const playerTeeTimes = new Map([
			["kristoffer ventura", { teeTime: "14:30", groupmates: ["Playing Partner"] }],
		]);
		const groups = buildFeaturedGroups(
			[{ name: "Kristoffer Ventura" }],
			null,
			{ playerTeeTimes },
		);
		expect(groups).toEqual([
			{ player: "Kristoffer Ventura", teeTime: "14:30", groupmates: [{ name: "Playing Partner", teeTime: "14:30" }] },
		]);
	});

	it("falls back to synthetic grouping from the leaderboard field", () => {
		const pgaField = { players: [
			{ displayName: "Kristoffer Ventura", teeTime: "14:30", startingHole: 1 },
			{ displayName: "Playing Partner", teeTime: "14:30", startingHole: 1 },
		] };
		const groups = buildFeaturedGroups([{ name: "Kristoffer Ventura", teeTime: "14:30" }], pgaField, null);
		expect(groups).toHaveLength(1);
		expect(groups[0].player).toBe("Kristoffer Ventura");
		expect(groups[0].groupmates).toEqual([{ name: "Playing Partner", teeTime: "14:30" }]);
	});

	it("returns empty when there is neither tee-times nor field data", () => {
		expect(buildFeaturedGroups([{ name: "X" }], null, null)).toEqual([]);
	});
});

// --- buildGolfTournament (byte-equality guard for the deduped push sites) ---

describe("buildGolfTournament", () => {
	const ev = { name: "The Test Open", date: "2026-07-16T11:00:00Z" };

	it("produces the exact event shape + field order for a confirmed tournament", () => {
		const out = buildGolfTournament("PGA Tour", ev, "Test National", {
			norwegian: true,
			norwegianPlayers: [{ name: "Kristoffer Ventura", teeTime: null, teeTimeUTC: null, status: null }],
			featuredGroups: [],
			totalPlayers: 78,
		});
		expect(JSON.stringify(out)).toBe(JSON.stringify({
			name: "PGA Tour",
			events: [{
				title: "The Test Open",
				meta: "PGA Tour",
				tournament: "PGA Tour",
				time: "2026-07-16T11:00:00.000Z",
				endTime: "2026-07-19T20:00:00.000Z",
				venue: "Test National",
				sport: "golf",
				streaming: [
					{ platform: "HBO Max (Sport)", url: "https://www.hbomax.com/no/no/sports/pga-tour", type: "streaming" },
					{ platform: "Eurosport Norge", url: "https://www.hbomax.com/no/no/sports/pga-tour", type: "streaming" },
				],
				norwegian: true,
				norwegianPlayers: [{ name: "Kristoffer Ventura", teeTime: null, teeTimeUTC: null, status: null }],
				featuredGroups: [],
				totalPlayers: 78,
			}],
		}));
	});

	it("appends fieldPending last only when the field is pending", () => {
		const out = buildGolfTournament("DP World Tour", ev, "TBD", {
			norwegian: false,
			norwegianPlayers: [],
			featuredGroups: [],
			totalPlayers: 0,
			fieldPending: true,
		});
		const keys = Object.keys(out.events[0]);
		expect(keys[keys.length - 1]).toBe("fieldPending");
		expect(out.events[0].fieldPending).toBe(true);
	});

	it("uses the Masters streaming map for Masters events", () => {
		const out = buildGolfTournament("Masters Tournament", ev, "Augusta", {
			norwegian: true, norwegianPlayers: [], featuredGroups: [], totalPlayers: 90,
		});
		expect(out.events[0].streaming).toEqual([
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" },
		]);
	});
});

// --- Participation freshness (WP-95): cut/WD/DQ detection ---

describe("golfParticipationStatus", () => {
	// The eier-funn shape: The Open R3, Hovland's core-API competitor status.
	it("maps STATUS_CUT / displayValue CUT to «røk cutten» (the Hovland case)", () => {
		expect(golfParticipationStatus({
			type: { name: "STATUS_CUT", description: "Missed Cut", shortDetail: "CUT" },
			displayValue: "CUT",
		})).toBe("røk cutten");
	});

	it("catches the cut from the short code alone, if the machine name drifts", () => {
		expect(golfParticipationStatus({ type: { name: "STATUS_OTHER" }, displayValue: "CUT" })).toBe("røk cutten");
		expect(golfParticipationStatus({ type: { shortDetail: "MC" } })).toBe("røk cutten");
	});

	it("maps withdrawals and disqualifications", () => {
		expect(golfParticipationStatus({ type: { name: "STATUS_WITHDRAWN" } })).toBe("trakk seg");
		expect(golfParticipationStatus({ displayValue: "WD" })).toBe("trakk seg");
		expect(golfParticipationStatus({ type: { name: "STATUS_DISQUALIFIED" } })).toBe("diskvalifisert");
		expect(golfParticipationStatus({ displayValue: "DQ" })).toBe("diskvalifisert");
	});

	it("returns null for an active player (scheduled/in-progress) — the Reitan case", () => {
		// A scheduled player's displayValue is a tee-time ISO string, not a short code.
		expect(golfParticipationStatus({ type: { name: "STATUS_SCHEDULED" }, displayValue: "2026-07-18T14:50:00Z" })).toBeNull();
		expect(golfParticipationStatus({ type: { name: "STATUS_IN_PROGRESS" } })).toBeNull();
		expect(golfParticipationStatus(null)).toBeNull();
		expect(golfParticipationStatus({})).toBeNull();
	});
});

describe("isOutOfTournament", () => {
	it("is true for every out-label and false otherwise", () => {
		for (const label of Object.values(GOLF_OUT_LABELS)) expect(isOutOfTournament(label)).toBe(true);
		expect(isOutOfTournament(null)).toBe(false);
		expect(isOutOfTournament("Confirmed")).toBe(false);
		expect(isOutOfTournament("i feltet")).toBe(false);
	});
});

describe("fetchGolfPlayerStatuses", () => {
	it("labels only the out players, keyed by competitor id (cut ⇒ present, active ⇒ omitted)", async () => {
		const byId = {
			"4364873": { type: { name: "STATUS_CUT" }, displayValue: "CUT" }, // Hovland — cut
			"4348470": { type: { name: "STATUS_IN_PROGRESS" } },              // Reitan — active
		};
		const fetcher = async (url) => {
			const id = url.match(/competitors\/(\d+)\/status/)[1];
			return byId[id];
		};
		const statuses = await fetchGolfPlayerStatuses("pga", "401811957",
			[{ id: "4364873" }, { id: "4348470" }], fetcher);
		expect(statuses.get("4364873")).toBe("røk cutten");
		expect(statuses.has("4348470")).toBe(false); // active players are omitted
	});

	it("is fail-soft: a fetch error leaves that player unlabelled", async () => {
		const fetcher = async () => { throw new Error("network"); };
		const statuses = await fetchGolfPlayerStatuses("pga", "1", [{ id: "999" }], fetcher);
		expect(statuses.size).toBe(0);
	});
});

describe("cut player earns no tee time / featured group (WP-95 reproduction)", () => {
	// Mirrors fetchGolfESPN's assembly: an out player is excluded from the active
	// list that feeds buildFeaturedGroups, and never carries a tee time.
	it("drops the cut player from featured groups; the active player is unaffected", () => {
		const players = [
			{ name: "Viktor Hovland", teeTime: null, teeTimeUTC: null, status: "røk cutten" },
			{ name: "Kristoffer Reitan", teeTime: "15:50", teeTimeUTC: "2026-07-18T13:50:00Z", status: null },
		];
		const active = players.filter((p) => !isOutOfTournament(p.status));
		expect(active.map((p) => p.name)).toEqual(["Kristoffer Reitan"]);

		const pgaField = { players: [
			{ displayName: "Kristoffer Reitan", teeTime: "15:50", startingHole: 1 },
			{ displayName: "Playing Partner", teeTime: "15:50", startingHole: 1 },
			{ displayName: "Viktor Hovland", teeTime: "15:50", startingHole: 1 },
		] };
		const groups = buildFeaturedGroups(active, pgaField, null);
		// Only Reitan gets a featured group; the cut Hovland never does.
		expect(groups.map((g) => g.player)).toEqual(["Kristoffer Reitan"]);
		// The cut player carries the status label and no tee time.
		const cut = players[0];
		expect(cut.status).toBe("røk cutten");
		expect(cut.teeTime).toBeNull();
	});
});

// --- getNorwegianStreaming (2026 tiered golf rights) ---

describe("getNorwegianStreaming (golf, 2026 tiers)", () => {
	const platforms = (name, tour = "PGA Tour") =>
		getNorwegianStreaming("golf", tour, name).map((s) => s.platform);

	it("routes ordinary PGA Tour events (incl. Corales) to HBO Max / Eurosport, NOT Viaplay", () => {
		// This is the Corales revert-war class: the flat Viaplay default was wrong.
		expect(platforms("Corales Puntacana Championship")).toEqual(["HBO Max (Sport)", "Eurosport Norge"]);
		expect(platforms("3M Open")).toEqual(["HBO Max (Sport)", "Eurosport Norge"]);
		expect(platforms("Rocket Classic")).toEqual(["HBO Max (Sport)", "Eurosport Norge"]);
	});

	it("keeps The Open Championship + US Open on Viaplay", () => {
		expect(platforms("The Open")).toEqual(["Viaplay"]);
		expect(platforms("The Open Championship")).toEqual(["Viaplay"]);
		expect(platforms("U.S. Open")).toEqual(["Viaplay"]);
	});

	it("does not mistake a regular 'Open' event for a major", () => {
		expect(platforms("Genesis Scottish Open")).toEqual(["HBO Max (Sport)", "Eurosport Norge"]);
		expect(platforms("RBC Canadian Open")).toEqual(["HBO Max (Sport)", "Eurosport Norge"]);
	});

	it("routes DP World Tour to Viaplay", () => {
		expect(platforms("BMW International Open", "DP World Tour")).toEqual(["Viaplay"]);
	});

	it("routes The Masters + PGA Championship to Warner Bros. Discovery", () => {
		expect(platforms("The Masters")).toEqual(["Discovery+"]);
		expect(platforms("PGA Championship")).toEqual(["Discovery+"]);
	});
});
