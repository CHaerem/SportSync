// WP-44 golden-test inputs — shared by the golden generator and the golden test.
// Dates are absolute and the tests freeze `Date.now()` to FIXED_NOW, so the merge
// retention cutoffs and validator future-date checks are fully deterministic.
//
// These fixtures capture the behaviour of the deduped fetch-results helpers
// (mergeResults, the favourites-first comparator, the date-sanity validator,
// containsName-based RSS matching, and the shared golf-competitor mapper). The
// golden output was generated from the PRE-refactor logic and committed as
// golden.json; the refactored code must reproduce it byte-for-byte.

export const FIXED_NOW = Date.parse("2026-07-15T12:00:00.000Z");

// --- Merge fixtures (football: retain 7d, tennis: 7d, f1: 30d) ---

export const footballExisting = [
	{ homeTeam: "Liverpool", awayTeam: "Arsenal", homeScore: 2, awayScore: 1, date: "2026-07-14T19:00:00.000Z", league: "Premier League", isFavorite: true, recapHeadline: null },
	{ homeTeam: "Chelsea", awayTeam: "Everton", homeScore: 0, awayScore: 0, date: "2026-07-10T15:00:00.000Z", league: "Premier League", isFavorite: false, recapHeadline: null },
	{ homeTeam: "OldTown", awayTeam: "Ancient", homeScore: 1, awayScore: 0, date: "2026-06-20T15:00:00.000Z", league: "Premier League", isFavorite: false, recapHeadline: null },
];

export const footballFresh = [
	{ homeTeam: "Liverpool", awayTeam: "Arsenal", homeScore: 3, awayScore: 1, date: "2026-07-14T19:00:00.000Z", league: "Premier League", isFavorite: true, recapHeadline: "Liverpool 3-1 Arsenal" },
	{ homeTeam: "Manchester City", awayTeam: "Brighton", homeScore: 4, awayScore: 0, date: "2026-07-13T19:00:00.000Z", league: "Premier League", isFavorite: false, recapHeadline: null },
];

export const tennisExisting = [
	{ winner: "Casper Ruud", loser: "Novak Djokovic", score: "6-4, 6-3", date: "2026-07-14T12:00:00.000Z", tour: "ATP", isFavorite: true },
	{ winner: "Iga Swiatek", loser: "Aryna Sabalenka", score: "7-5, 6-4", date: "2026-07-10T12:00:00.000Z", tour: "WTA", isFavorite: false },
	{ winner: "Old Player", loser: "Older Player", score: "6-0, 6-0", date: "2026-06-01T12:00:00.000Z", tour: "ATP", isFavorite: false },
];

export const tennisFresh = [
	{ winner: "Casper Ruud", loser: "Novak Djokovic", score: "6-4, 7-6", date: "2026-07-14T12:00:00.000Z", tour: "ATP", isFavorite: true },
	{ winner: "Carlos Alcaraz", loser: "Jannik Sinner", score: "6-3, 6-4", date: "2026-07-13T12:00:00.000Z", tour: "ATP", isFavorite: false },
];

export const f1Existing = [
	{ raceName: "British Grand Prix", type: "Race", date: "2026-07-06T14:00:00.000Z", circuit: "Silverstone", topDrivers: [{ position: 1, driver: "Verstappen", team: "Red Bull", status: null }], totalDrivers: 20 },
	{ raceName: "British Grand Prix", type: "Sprint", date: "2026-07-05T14:00:00.000Z", circuit: "Silverstone", topDrivers: [{ position: 1, driver: "Norris", team: "McLaren", status: null }], totalDrivers: 20 },
	{ raceName: "Ancient Grand Prix", type: "Race", date: "2026-05-01T14:00:00.000Z", circuit: "Nowhere", topDrivers: [{ position: 1, driver: "Someone", team: "Team", status: null }], totalDrivers: 20 },
];

export const f1Fresh = [
	{ raceName: "British Grand Prix", type: "Race", date: "2026-07-06T14:00:00.000Z", circuit: "Silverstone", topDrivers: [{ position: 1, driver: "Verstappen", team: "Red Bull Racing", status: null }], totalDrivers: 20 },
	{ raceName: "Austrian Grand Prix", type: "Race", date: "2026-06-29T14:00:00.000Z", circuit: "Red Bull Ring", topDrivers: [{ position: 1, driver: "Leclerc", team: "Ferrari", status: null }], totalDrivers: 20 },
];

// --- Comparator fixture (favourites first, then date desc) ---

export const comparatorInput = [
	{ label: "a", isFavorite: false, date: "2026-07-10T12:00:00.000Z" },
	{ label: "b", isFavorite: true, date: "2026-07-08T12:00:00.000Z" },
	{ label: "c", isFavorite: false, date: "2026-07-14T12:00:00.000Z" },
	{ label: "d", isFavorite: true, date: "2026-07-12T12:00:00.000Z" },
];

// --- Validator fixtures (future-date check relative to FIXED_NOW) ---

export const footballValidatorCases = [
	{ homeTeam: "Liverpool", awayTeam: "Arsenal", homeScore: 2, awayScore: 1, date: "2026-07-14T19:00:00.000Z" },
	{ homeTeam: "A", awayTeam: "B", date: "2026-07-14T19:00:00.000Z" },
	{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0, date: "2026-07-20T19:00:00.000Z" },
	{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0, date: "not-a-date" },
	{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0 },
	{ homeTeam: "A", awayTeam: "A", homeScore: 1, awayScore: 0, date: "2026-07-14T19:00:00.000Z" },
];

export const tennisValidatorCases = [
	{ winner: "Ruud", loser: "Sinner", score: "6-4, 6-3", date: "2026-07-14T12:00:00.000Z" },
	{ winner: "Ruud", loser: "Sinner", date: "2026-07-14T12:00:00.000Z" },
	{ winner: "Ruud", loser: "Sinner", score: "6-4", date: "2026-07-20T12:00:00.000Z" },
	{ winner: "Ruud", loser: "Sinner", score: "6-4", date: "nope" },
	{ winner: "Ruud", loser: "Sinner", score: "6-4" },
	{ winner: "Ruud", loser: "Ruud", score: "6-4", date: "2026-07-14T12:00:00.000Z" },
];

export const f1ValidatorCases = [
	{ raceName: "British GP", topDrivers: [{ position: 1, driver: "Verstappen" }], date: "2026-07-06T14:00:00.000Z" },
	{ raceName: "British GP", date: "2026-07-06T14:00:00.000Z" },
	{ raceName: "British GP", topDrivers: [{ position: 1, driver: "V" }], date: "2026-07-20T14:00:00.000Z" },
	{ raceName: "British GP", topDrivers: [{ position: 1, driver: "V" }], date: "bad" },
	{ raceName: "British GP", topDrivers: [{ position: 1, driver: "V" }] },
];

export const golfValidatorCases = [
	null,
	{ tournamentName: "The Open", status: "final", completedRound: 4, topPlayers: [{ position: 1 }, { position: 2 }] },
	{ tournamentName: "The Open", status: "final", completedRound: 2, topPlayers: [] },
	{ tournamentName: "  ", status: "in_progress", completedRound: 2, topPlayers: [{ position: 3 }, { position: 1 }] },
	{ status: "in_progress", completedRound: 1, topPlayers: [{ position: 1 }, { position: 2 }] },
];

export const validateResultsInput = {
	football: footballValidatorCases,
	golf: { pga: golfValidatorCases[1], dpWorld: golfValidatorCases[2], missing: null },
	tennis: tennisValidatorCases,
	f1: f1ValidatorCases,
};

// --- matchRssHeadline fixtures ---

export const rssMatchCases = [
	{
		name: "full-name match",
		homeTeam: "Liverpool", awayTeam: "Arsenal",
		rssItems: [{ title: "Liverpool beat Arsenal 2-1 in thriller", sport: "football" }],
		options: {},
	},
	{
		name: "fc-stripped match",
		homeTeam: "Barcelona FC", awayTeam: "Sevilla FC",
		rssItems: [{ title: "Barcelona edge Sevilla in Copa clash", sport: "football" }],
		options: {},
	},
	{
		name: "alias short-form match (city/united)",
		homeTeam: "Manchester City", awayTeam: "Manchester United",
		rssItems: [{ title: "City dominate United in Manchester derby", sport: "football" }],
		options: {},
	},
	{
		name: "single-team tier within time window",
		homeTeam: "Newcastle United", awayTeam: "Fulham",
		rssItems: [{ title: "Newcastle secure late winner", sport: "general", pubDate: "2026-07-14T20:00:00.000Z" }],
		options: { matchDate: "2026-07-14T19:00:00.000Z" },
	},
	{
		name: "single-team tier outside time window (no match)",
		homeTeam: "Newcastle United", awayTeam: "Fulham",
		rssItems: [{ title: "Newcastle secure late winner", sport: "general", pubDate: "2026-07-01T20:00:00.000Z" }],
		options: { matchDate: "2026-07-14T19:00:00.000Z" },
	},
	{
		name: "no match at all",
		homeTeam: "Bodo/Glimt", awayTeam: "Molde",
		rssItems: [{ title: "Weather forecast looks sunny this weekend", sport: "general" }],
		options: {},
	},
];

// --- Golf competitor mapper fixtures (shared with fetch-standings) ---

export const golfCompetitorFixtures = [
	{
		id: "1234",
		order: 1,
		athlete: { displayName: "Viktor Hovland", fullName: "Viktor Hovland" },
		score: { displayValue: "-12" },
		linescores: [{ displayValue: "68" }, { displayValue: "66" }],
		status: { position: { displayName: "1" }, thru: 18 },
	},
	{
		id: "5678",
		order: 0,
		athlete: { fullName: "Rory McIlroy" },
		score: -8,
		linescores: [{ displayValue: "70" }],
		status: { position: { displayName: "T2" }, thru: 12 },
	},
	{
		athlete: {},
		status: {},
	},
];
