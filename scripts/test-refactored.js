import { fetchFootballESPN as fetchFootballRefactored } from "./fetch/football-refactored.js";
import { fetchFootballESPN as fetchFootballLegacy } from "./fetch/football.js";

async function testFootballFetchers() {
	console.log("🧪 Testing Football Fetchers Compatibility\n");
	
	try {
		// Test refactored fetcher
		console.log("Testing refactored fetcher...");
		const refactoredResult = await fetchFootballRefactored();
		
		console.log("✅ Refactored fetcher completed");
		console.log(`  - Tournaments: ${refactoredResult.tournaments?.length || 0}`);
		console.log(`  - Total events: ${refactoredResult.tournaments?.reduce((sum, t) => sum + (t.events?.length || 0), 0) || 0}`);
		
		// Validate structure
		validateStructure(refactoredResult, "Refactored");
		
		// Test legacy fetcher
		console.log("\nTesting legacy fetcher...");
		const legacyResult = await fetchFootballLegacy();
		
		console.log("✅ Legacy fetcher completed");
		console.log(`  - Tournaments: ${legacyResult.tournaments?.length || 0}`);
		console.log(`  - Total events: ${legacyResult.tournaments?.reduce((sum, t) => sum + (t.events?.length || 0), 0) || 0}`);
		
		// Validate structure
		validateStructure(legacyResult, "Legacy");
		
		// Compare results
		console.log("\n📊 Comparison:");
		compareResults(refactoredResult, legacyResult);
		
	} catch (error) {
		console.error("❌ Test failed:", error.message);
		process.exit(1);
	}
}

function validateStructure(result, name) {
	const errors = [];
	
	if (!result.lastUpdated) errors.push("Missing lastUpdated");
	if (!result.source) errors.push("Missing source");
	if (!Array.isArray(result.tournaments)) errors.push("tournaments is not an array");
	
	if (result.tournaments) {
		for (const tournament of result.tournaments) {
			if (!tournament.name) errors.push("Tournament missing name");
			if (!Array.isArray(tournament.events)) errors.push("Tournament events is not an array");
			
			if (tournament.events) {
				for (const event of tournament.events) {
					if (!event.title) errors.push("Event missing title");
					if (!event.time) errors.push("Event missing time");
					if (!event.sport) errors.push("Event missing sport");
				}
			}
		}
	}
	
	if (errors.length > 0) {
		console.warn(`⚠️  ${name} structure issues:`, errors.slice(0, 5));
	} else {
		console.log(`✅ ${name} structure validated`);
	}
}

function compareResults(refactored, legacy) {
	const refEvents = refactored.tournaments?.reduce((sum, t) => sum + (t.events?.length || 0), 0) || 0;
	const legEvents = legacy.tournaments?.reduce((sum, t) => sum + (t.events?.length || 0), 0) || 0;
	
	const diff = Math.abs(refEvents - legEvents);
	const percentDiff = legEvents > 0 ? (diff / legEvents * 100).toFixed(1) : 0;
	
	if (diff === 0) {
		console.log("✅ Event counts match perfectly");
	} else if (percentDiff < 10) {
		console.log(`✅ Event counts are similar (${percentDiff}% difference)`);
	} else {
		console.log(`⚠️  Event counts differ significantly (${percentDiff}% difference)`);
	}
	
	console.log(`   Refactored: ${refEvents} events`);
	console.log(`   Legacy: ${legEvents} events`);
}

testFootballFetchers().catch(console.error);