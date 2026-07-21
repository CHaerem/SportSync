// demand.js — WP-165: aggregate the OPEN, PUBLIC `coverage-request` GitHub issues
// into a demand signal the research agent can prioritise.
//
// The framing (BRUKERDATA § B.1): a soft-follow of something OUTSIDE the catalog
// must not be «fulgt men dødt for alltid» — the server should FIND OUT the demand
// exists. The client offers one calm optional tap that opens a PRE-FILLED, public
// GitHub issue (label `coverage-request`); the user sends it themselves (no
// auto-post — privacy-honest). This module reads those issues back and folds them
// into `docs/data/coverage-gaps.json` as a `demand[]` array.
//
// Privacy: a coverage-request issue carries ONLY the entity name + (optional) sport
// — never a profile, follow-list, device or account. So the aggregate is a pure,
// anonymous "what do people want covered" count. Nothing personal is transported.
//
// Fail-soft by design: the aggregation runs inside the static pipeline, whose
// GITHUB_TOKEN is scoped narrowly. If `gh` is unavailable, unauthenticated, or the
// listing errors for any reason, `collectDemand` returns null and the caller simply
// OMITS the `demand` field — it never fails the pipeline over a missing signal.
//
// The gh call is injectable (the `runner` arg) exactly like escalate-research.js, so
// the whole module is unit-testable network-free.

import { spawnSync } from "child_process";

/** The label that marks a public coverage-request issue (matches coverage-request.yml). */
export const COVERAGE_REQUEST_LABEL = "coverage-request";

/** The issue-body section headings the client composes AND the issue-form renders.
 *  These MUST equal the field `label:`s in .github/ISSUE_TEMPLATE/coverage-request.yml
 *  (a coherence test pins this) so BOTH entry paths — a client-composed body and a
 *  human filling the form — parse identically. */
export const ENTITY_HEADING = "Entitet";
export const SPORT_HEADING = "Sport";

/** Issue title prefix used by the clients + the template. */
export const TITLE_PREFIX = "[dekning]";

/** Placeholder a client writes / the form renders when no sport was chosen. */
export const SPORT_UNSET = "(ikke satt)";

/** Default gh runner: a synchronous shell-out mirroring escalate-research.js. */
const defaultRunner = (args) => spawnSync("gh", args, { encoding: "utf-8" });

/** Pull the value under a `### <heading>` section out of an issue body. GitHub issue
 *  forms render `### <label>\n\n<value>` and use `_No response_` for an empty optional
 *  field; a client-composed body uses the same shape. Returns the trimmed value, or
 *  null when the section is absent / empty / an unfilled optional. */
export function sectionValue(body, heading) {
	if (!body) return null;
	const lines = String(body).split(/\r?\n/);
	const want = `### ${heading}`.toLowerCase();
	let i = lines.findIndex((l) => l.trim().toLowerCase() === want);
	if (i < 0) return null;
	// Collect the lines after the heading up to the next `### ` heading.
	const collected = [];
	for (let j = i + 1; j < lines.length; j++) {
		if (/^###\s/.test(lines[j].trim())) break;
		collected.push(lines[j]);
	}
	const value = collected.join("\n").trim();
	if (!value) return null;
	if (value.toLowerCase() === "_no response_") return null;
	return value;
}

/** Normalise a sport value: drop the "(ikke satt)" placeholder / empties to null. */
function normalizeSport(raw) {
	if (!raw) return null;
	const s = raw.trim();
	if (!s || s.toLowerCase() === SPORT_UNSET.toLowerCase()) return null;
	return s;
}

/** Parse one issue ({ number, title, body, createdAt, url }) into a demand request
 *  { number, entity, sport|null, createdAt, url }, or null if no entity can be read.
 *  Entity is taken from the `### Entitet` section, falling back to the title with the
 *  `[dekning]` prefix stripped (so an issue opened without the structured body still
 *  contributes its subject). */
export function parseCoverageRequest(issue) {
	if (!issue || typeof issue !== "object") return null;
	let entity = sectionValue(issue.body, ENTITY_HEADING);
	if (!entity && issue.title) {
		const t = String(issue.title).trim();
		const stripped = t.startsWith(TITLE_PREFIX) ? t.slice(TITLE_PREFIX.length).trim() : t;
		// A bare "[dekning] " title (no subject) yields nothing usable.
		entity = stripped || null;
	}
	if (!entity) return null;
	return {
		number: typeof issue.number === "number" ? issue.number : null,
		entity: entity.trim(),
		sport: normalizeSport(sectionValue(issue.body, SPORT_HEADING)),
		createdAt: issue.createdAt || null,
		url: issue.url || null,
	};
}

/** A stable key for grouping requests for the "same" entity — case/space folded. */
function demandKey(entity) {
	return entity.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Aggregate raw issues into a demand array, one entry per distinct entity, sorted by
 *  request count (desc) then name. Each entry:
 *    { entity, sport, count, issues: [numbers], firstRequestedAt, lastRequestedAt }
 *  - `entity` uses the most recent request's spelling.
 *  - `sport` is the first non-null sport seen (null when nobody set one).
 *  Pure + network-free. */
export function aggregateDemand(issues, now = Date.now()) {
	const byKey = new Map();
	for (const issue of issues || []) {
		const req = parseCoverageRequest(issue);
		if (!req) continue;
		const key = demandKey(req.entity);
		if (!key) continue;
		const created = req.createdAt ? Date.parse(req.createdAt) : NaN;
		const createdMs = Number.isNaN(created) ? null : created;
		let entry = byKey.get(key);
		if (!entry) {
			entry = { entity: req.entity, sport: req.sport, count: 0, issues: [], _first: Infinity, _last: -Infinity };
			byKey.set(key, entry);
		}
		entry.count += 1;
		if (req.number != null && !entry.issues.includes(req.number)) entry.issues.push(req.number);
		if (!entry.sport && req.sport) entry.sport = req.sport;
		if (createdMs != null) {
			if (createdMs < entry._first) entry._first = createdMs;
			// The most RECENT request owns the display spelling.
			if (createdMs > entry._last) { entry._last = createdMs; entry.entity = req.entity; }
		}
	}
	const out = [...byKey.values()].map((e) => ({
		entity: e.entity,
		sport: e.sport || null,
		count: e.count,
		issues: e.issues.sort((a, b) => a - b),
		firstRequestedAt: Number.isFinite(e._first) ? new Date(e._first).toISOString() : null,
		lastRequestedAt: Number.isFinite(e._last) ? new Date(e._last).toISOString() : null,
	}));
	out.sort((a, b) => b.count - a.count || a.entity.localeCompare(b.entity, "nb", { sensitivity: "accent" }));
	return out;
}

/** Fetch the OPEN coverage-request issues via `gh` (injectable runner). Returns the
 *  parsed issue array on success, or null on ANY failure (gh missing, non-zero exit,
 *  unparseable JSON) — the fail-soft contract. Never throws. */
export function fetchCoverageRequestIssues(runner = defaultRunner) {
	let res;
	try {
		res = runner([
			"issue", "list",
			"--label", COVERAGE_REQUEST_LABEL,
			"--state", "open",
			"--json", "number,title,body,createdAt,url",
			"--limit", "200",
		]);
	} catch {
		return null; // gh not installed / spawn failed
	}
	if (!res || res.status !== 0) return null;
	try {
		const parsed = JSON.parse(res.stdout || "[]");
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null; // unexpected non-JSON output
	}
}

/** The public entry point: fetch + aggregate the coverage-request demand. Returns the
 *  demand array (possibly empty) on success, or null when the fetch fails — the caller
 *  omits the `demand` field on null so the pipeline degrades gracefully. */
export function collectDemand({ runner = defaultRunner, now = Date.now() } = {}) {
	const issues = fetchCoverageRequestIssues(runner);
	if (issues == null) return null;
	return aggregateDemand(issues, now);
}
