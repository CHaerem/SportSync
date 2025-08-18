import { rootDataPath, retainLastGood } from "../lib/helpers.js";
import { fetchFootballESPN } from "./football.js";
import { fetchGolfESPN } from "./golf.js";
import { fetchTennisESPN } from "./tennis.js";
import { fetchF1ESPN } from "./f1.js";
import { fetchChessOpen } from "./chess.js";
import { fetchEsports } from "./esports.js";
import path from "path";

async function main() {
	const out = rootDataPath();
	const tasks = await Promise.allSettled([
		fetchFootballESPN(),
		fetchGolfESPN(),
		fetchTennisESPN(),
		fetchF1ESPN(),
		fetchChessOpen(),
		fetchEsports(),
	]);
	const [football, golf, tennis, f1, chess, esports] = tasks.map(
		(t) => t.value || null
	);
	const mapping = [
		["football.json", football],
		["golf.json", golf],
		["tennis.json", tennis],
		["f1.json", f1],
		["chess.json", chess],
		["esports.json", esports],
	];
	for (const [file, data] of mapping) {
		if (!data) continue;
		const target = path.join(out, file);
		retainLastGood(target, data);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
