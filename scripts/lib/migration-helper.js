/**
 * Migration helper to ensure backwards compatibility during refactoring
 * This allows us to gradually migrate each sport while keeping the system working
 */

export class MigrationHelper {
	static async tryRefactoredFirst(refactoredFetcher, legacyFetcher, sportName) {
		try {
			console.log(`Attempting refactored ${sportName} fetcher...`);
			const result = await refactoredFetcher();
			
			if (this.validateResult(result)) {
				console.log(`✅ Using refactored ${sportName} fetcher`);
				return result;
			}
			
			console.warn(`Refactored ${sportName} fetcher returned invalid data, falling back to legacy`);
		} catch (error) {
			console.error(`Refactored ${sportName} fetcher failed:`, error.message);
		}
		
		try {
			console.log(`Using legacy ${sportName} fetcher...`);
			const result = await legacyFetcher();
			return result;
		} catch (error) {
			console.error(`Legacy ${sportName} fetcher also failed:`, error.message);
			return this.emptyResponse(sportName);
		}
	}
	
	static validateResult(result) {
		if (!result) return false;
		if (typeof result !== "object") return false;
		if (!result.lastUpdated) return false;
		if (!Array.isArray(result.tournaments)) return false;
		
		return true;
	}
	
	static emptyResponse(sportName) {
		return {
			lastUpdated: new Date().toISOString(),
			source: `${sportName} (error fallback)`,
			tournaments: []
		};
	}
	
	static async parallelFetch(fetchers) {
		const results = await Promise.allSettled(
			fetchers.map(async ({ refactored, legacy, name }) => {
				if (refactored) {
					return await this.tryRefactoredFirst(refactored, legacy, name);
				}
				return await legacy();
			})
		);
		
		return results.map((result, index) => {
			if (result.status === "fulfilled") {
				return result.value;
			}
			console.error(`${fetchers[index].name} fetch failed:`, result.reason);
			return this.emptyResponse(fetchers[index].name);
		});
	}
	
	static isRefactored(sportName) {
		const refactored = ["football"];
		return refactored.includes(sportName);
	}
}