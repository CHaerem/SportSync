import { rootDataPath, retainLastGood } from "../lib/helpers.js";

import { fetchFootballESPN } from "./football.js";
import { fetchGolfESPN } from "./golf.js";
import { fetchTennis } from "./tennis.js";
import { fetchF1ESPN } from "./f1.js";
import { fetchChessOpen } from "./chess.js";
import { fetchEsports } from "./esports.js";

import path from "path";

async function main() {
	const out = rootDataPath();

	const fetchers = [
		{ name: "football", fn: fetchFootballESPN },
		{ name: "golf", fn: fetchGolfESPN },
		{ name: "tennis", fn: fetchTennis },
		{ name: "f1", fn: fetchF1ESPN },
		{ name: "chess", fn: fetchChessOpen },
		{ name: "esports", fn: fetchEsports }
	];

	const results = await Promise.allSettled(
		fetchers.map(({ fn }) => fn())
	);

	const mapping = [
		"football.json",
		"golf.json",
		"tennis.json",
		"f1.json",
		"chess.json",
		"esports.json",
	];

	for (let i = 0; i < mapping.length; i++) {
		const file = mapping[i];
		const result = results[i];

		if (result.status !== "fulfilled" || !result.value) {
			console.warn(`No data for ${file}, skipping...`);
			continue;
		}

		const target = path.join(out, file);
		const retained = retainLastGood(target, result.value);
		if (retained.kept) {
			console.log(`Retained last good data for ${file}`);
		}
	}

	console.log("\n✅ Data fetch complete!");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
