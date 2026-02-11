import { rootDataPath, retainLastGood } from "../lib/helpers.js";
import { MigrationHelper } from "../lib/migration-helper.js";

// Legacy fetchers (to be gradually replaced)
import { fetchFootballESPN as fetchFootballLegacy } from "./football.js";
import { fetchGolfESPN } from "./golf.js";
import { fetchTennis } from "./tennis.js";
import { fetchF1ESPN } from "./f1.js";
import { fetchChessOpen } from "./chess.js";
import { fetchEsports } from "./esports.js";

// Refactored fetchers (new architecture)
import { fetchFootballESPN as fetchFootballRefactored } from "./football-refactored.js";
import { fetchTennis as fetchTennisRefactored } from "./tennis-refactored.js";
import { fetchGolfESPN as fetchGolfRefactored } from "./golf-refactored.js";
import { fetchF1ESPN as fetchF1Refactored } from "./f1-refactored.js";
import { fetchChessOpen as fetchChessRefactored } from "./chess-refactored.js";
import { fetchEsports as fetchEsportsRefactored } from "./esports-refactored.js";

import path from "path";

async function main() {
	const out = rootDataPath();
	
	// Use migration helper to gradually switch to refactored fetchers
	const fetchers = [
		{ 
			name: "football", 
			refactored: fetchFootballRefactored,
			legacy: fetchFootballLegacy 
		},
		{
			name: "golf",
			refactored: null,           // golf-refactored.js lacks PGA Tour tee times
			legacy: fetchGolfESPN
		},
		{ 
			name: "tennis", 
			refactored: fetchTennisRefactored,
			legacy: fetchTennis 
		},
		{ 
			name: "f1", 
			refactored: fetchF1Refactored,
			legacy: fetchF1ESPN 
		},
		{ 
			name: "chess", 
			refactored: fetchChessRefactored,
			legacy: fetchChessOpen 
		},
		{ 
			name: "esports", 
			refactored: fetchEsportsRefactored,
			legacy: fetchEsports 
		}
	];
	
	const results = await MigrationHelper.parallelFetch(fetchers);
	const [football, golf, tennis, f1, chess, esports] = results;
	
	const mapping = [
		["football.json", football],
		["golf.json", golf],
		["tennis.json", tennis],
		["f1.json", f1],
		["chess.json", chess],
		["esports.json", esports],
	];
	
	for (const [file, data] of mapping) {
		if (!data) {
			console.warn(`No data for ${file}, skipping...`);
			continue;
		}
		const target = path.join(out, file);
		const result = retainLastGood(target, data);
		if (result.kept) {
			console.log(`Retained last good data for ${file}`);
		}
	}
	
	console.log("\n✅ Data fetch complete!");
	console.log(`Refactored fetchers: ${fetchers.filter(f => f.refactored).map(f => f.name).join(", ")}`);
	console.log(`Legacy fetchers: ${fetchers.filter(f => !f.refactored).map(f => f.name).join(", ")}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
