import https from "https";

export class APIClient {
	constructor(options = {}) {
		this.defaultHeaders = {
			"User-Agent": options.userAgent || "SportSync/2.0",
			...options.headers
		};
		this.retries = options.retries ?? 2;
		this.retryDelay = options.retryDelay ?? 500;
		this.timeout = options.timeout ?? 10000;
		this.cache = new Map();
		this.cacheTimeout = options.cacheTimeout ?? 60000;
	}

	async fetchJSON(url, options = {}) {
		const cacheKey = url;
		const cached = this.cache.get(cacheKey);
		
		if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
			return cached.data;
		}

		const headers = { ...this.defaultHeaders, ...options.headers };
		const retries = options.retries ?? this.retries;
		const retryDelay = options.retryDelay ?? this.retryDelay;

		try {
			const data = await this.makeRequest(url, { headers, retries, retryDelay });
			this.cache.set(cacheKey, { data, timestamp: Date.now() });
			return data;
		} catch (error) {
			if (cached) {
				console.warn(`Using stale cache for ${url} due to error:`, error.message);
				return cached.data;
			}
			throw error;
		}
	}

	makeRequest(url, options) {
		return new Promise((resolve, reject) => {
			const request = https.get(url, { headers: options.headers }, (response) => {
				let body = "";
				
				response.on("data", chunk => body += chunk);
				
				response.on("end", async () => {
					if (response.statusCode >= 500 && options.retries > 0) {
						await this.delay(options.retryDelay);
						try {
							const result = await this.makeRequest(url, {
								...options,
								retries: options.retries - 1,
								retryDelay: options.retryDelay * 2
							});
							resolve(result);
						} catch (error) {
							reject(error);
						}
						return;
					}

					if (response.statusCode >= 400) {
						reject(new Error(`HTTP ${response.statusCode}: ${body.substring(0, 100)}`));
						return;
					}

					try {
						resolve(JSON.parse(body));
					} catch (error) {
						reject(new Error(`Invalid JSON response from ${url}`));
					}
				});
			});

			request.on("error", async (error) => {
				if (options.retries > 0) {
					await this.delay(options.retryDelay);
					try {
						const result = await this.makeRequest(url, {
							...options,
							retries: options.retries - 1,
							retryDelay: options.retryDelay * 2
						});
						resolve(result);
					} catch (retryError) {
						reject(retryError);
					}
				} else {
					reject(error);
				}
			});

			request.setTimeout(this.timeout, () => {
				request.destroy();
				reject(new Error(`Request timeout after ${this.timeout}ms`));
			});
		});
	}

	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	clearCache() {
		this.cache.clear();
	}

	buildURL(template, params) {
		let url = template;
		for (const [key, value] of Object.entries(params)) {
			url = url.replace(`{${key}}`, encodeURIComponent(value));
		}
		return url;
	}

	async fetchWithDates(urlTemplate, dateRange = 7) {
		const results = [];
		const now = new Date();
		
		for (let i = 0; i < dateRange; i++) {
			const date = new Date(now.getTime() + i * 86400000);
			const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
			const url = urlTemplate.replace("{date}", dateStr);
			
			try {
				const data = await this.fetchJSON(url);
				if (data) results.push(data);
				await this.delay(150);
			} catch (error) {
				console.warn(`Failed to fetch data for date ${dateStr}:`, error.message);
			}
		}
		
		return results;
	}
}