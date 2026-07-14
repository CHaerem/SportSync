import https from "https";
import zlib from "zlib";

/** Decompress a response body Buffer per its Content-Encoding (identity → unchanged). */
function decodeBody(buffer, contentEncoding) {
	const enc = (contentEncoding || "").toLowerCase();
	try {
		if (enc === "gzip") return zlib.gunzipSync(buffer);
		if (enc === "deflate") return zlib.inflateSync(buffer);
		if (enc === "br") return zlib.brotliDecompressSync(buffer);
	} catch {
		// Fall back to the raw bytes if decompression fails.
	}
	return buffer;
}

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
			// Advertise gzip so APIs that require it (e.g. Liquipedia returns 406
			// otherwise) work; caller headers can still override.
			const headers = { "Accept-Encoding": "gzip, deflate, br", ...options.headers };
			const request = https.get(url, { headers }, (response) => {
				const chunks = [];

				response.on("data", chunk => chunks.push(chunk));

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

					// Collect as bytes and decompress — string concat corrupts both
					// gzipped bodies and multibyte UTF-8 split across chunk boundaries.
					const body = decodeBody(Buffer.concat(chunks), response.headers["content-encoding"]).toString("utf8");

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
}