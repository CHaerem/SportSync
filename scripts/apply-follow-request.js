#!/usr/bin/env node
// Turn a "follow-request" Issue Form submission into an edit of interests.json.
// Runs in the follow-request workflow: parse the issue body → apply the change →
// validate against interests.schema.json → write the file. The workflow then opens
// a PR the user reviews and merges (nothing lands until they do). Deterministic
// transcription of the user's own form — not AI — and it only ever reaches a PR.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { validateAgainstSchema } from "./lib/validate-schema.js";

const LABELS = {
	action: "Handling",
	kind: "Type",
	name: "Navn",
	aliases: "Aliaser (komma-separert, valgfritt)",
	sport: "Sport (valgfritt, men hjelper matchingen)",
	notify: "Kalendervarsel?",
};
const KIND_ARRAY = { Lag: "teams", "Utøver": "athletes", Turnering: "tournaments" };

/** Split a GitHub Issue Form body ("### Label\n\nvalue") into { label: value }. */
export function parseIssueForm(body) {
	const out = {};
	for (const block of (body || "").split(/^### /m).slice(1)) {
		const nl = block.indexOf("\n");
		const label = (nl === -1 ? block : block.slice(0, nl)).trim();
		const value = (nl === -1 ? "" : block.slice(nl + 1)).trim();
		out[label] = value;
	}
	return out;
}

/** Extract the fields we care about, blanking GitHub's empty/placeholder markers. */
export function fieldsFromForm(body) {
	const s = parseIssueForm(body);
	const clean = (v) => (!v || v === "_No response_" || v === "(ikke satt)" ? "" : v);
	return {
		action: clean(s[LABELS.action]),
		kind: clean(s[LABELS.kind]),
		name: clean(s[LABELS.name]),
		aliases: clean(s[LABELS.aliases]),
		sport: clean(s[LABELS.sport]),
		notify: clean(s[LABELS.notify]) || "Standard",
	};
}

/** Apply one add/remove/notify change to interests. Throws on invalid requests. */
export function applyChange(interests, f) {
	if (!f.name) throw new Error("Navn mangler");

	// "Sport" → the free-text interests[] brief (what the research agent explores),
	// not alwaysTrack — that's how the AI starts covering a whole new sport.
	if (f.kind === "Sport") {
		const c = JSON.parse(JSON.stringify(interests));
		c.interests = c.interests || [];
		const norm = (s) => String(s).trim().toLowerCase();
		const idx = c.interests.findIndex((s) => norm(s).includes(norm(f.name)));
		if (f.action === "Legg til") {
			if (idx !== -1) throw new Error(`«${f.name}» dekkes allerede av en interesse`);
			c.interests.push(f.name);
			return { interests: c, summary: `Legg til interesse: ${f.name}` };
		}
		if (f.action === "Fjern") {
			if (idx === -1) throw new Error(`Fant ikke interessen «${f.name}»`);
			c.interests.splice(idx, 1);
			return { interests: c, summary: `Fjern interesse: ${f.name}` };
		}
		throw new Error("«Endre varsel» gjelder ikke en sport/interesse");
	}

	const arrKey = KIND_ARRAY[f.kind];
	if (!arrKey) throw new Error(`Ukjent type: "${f.kind}"`);

	const clone = JSON.parse(JSON.stringify(interests));
	clone.alwaysTrack = clone.alwaysTrack || {};
	const list = (clone.alwaysTrack[arrKey] = clone.alwaysTrack[arrKey] || []);
	const nameOf = (e) => (typeof e === "string" ? e : e?.name) || "";
	const idx = list.findIndex((e) => nameOf(e).toLowerCase() === f.name.toLowerCase());
	const defaultNotify = arrKey !== "tournaments"; // teams/athletes on, tournaments off
	const resolveNotify = () => (f.notify === "Ja" ? true : f.notify === "Nei" ? false : defaultNotify);

	if (f.action === "Legg til") {
		if (idx !== -1) throw new Error(`"${f.name}" finnes allerede i ${arrKey}`);
		const entity = { name: f.name };
		const aliases = f.aliases.split(",").map((a) => a.trim()).filter(Boolean);
		if (aliases.length) entity.aliases = aliases;
		if (f.sport) entity.sport = f.sport;
		const notify = resolveNotify();
		if (notify !== defaultNotify) entity.notify = notify; // only store when it deviates
		list.push(entity);
		return { interests: clone, summary: `Legg til ${f.name} i ${arrKey}${notify ? " (med varsel)" : ""}` };
	}
	if (f.action === "Fjern") {
		if (idx === -1) throw new Error(`Fant ikke "${f.name}" i ${arrKey}`);
		list.splice(idx, 1);
		return { interests: clone, summary: `Fjern ${f.name} fra ${arrKey}` };
	}
	if (f.action === "Endre varsel") {
		if (idx === -1) throw new Error(`Fant ikke "${f.name}" i ${arrKey}`);
		const e = typeof list[idx] === "string" ? { name: list[idx] } : list[idx];
		e.notify = resolveNotify();
		list[idx] = e;
		return { interests: clone, summary: `Sett varsel=${e.notify} for ${f.name}` };
	}
	throw new Error(`Ukjent handling: "${f.action}"`);
}

function main() {
	const fields = fieldsFromForm(process.env.ISSUE_BODY || "");
	const configDir = path.resolve(process.cwd(), "scripts", "config");
	const interestsPath = path.join(configDir, "interests.json");
	const interests = JSON.parse(fs.readFileSync(interestsPath, "utf-8"));
	const schema = JSON.parse(fs.readFileSync(path.join(configDir, "interests.schema.json"), "utf-8"));

	const { interests: updated, summary } = applyChange(interests, fields);

	const errors = validateAgainstSchema(updated, schema, schema);
	if (errors.length) throw new Error(`Resultatet bryter skjemaet:\n${errors.join("\n")}`);

	fs.writeFileSync(interestsPath, JSON.stringify(updated, null, 2) + "\n");
	if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${summary}\n`);
	fs.writeFileSync(
		"pr-body.md",
		`Automatisk fra #${process.env.ISSUE_NUMBER || "?"}: **${summary}**\n\n` +
			"Se over diffen i `scripts/config/interests.json` og merge når du er fornøyd. " +
			"Ingenting endres før du merger.\n"
	);
	console.log(summary);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	try {
		main();
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
}
