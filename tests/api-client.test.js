import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { APIClient } from "../scripts/lib/api-client.js";
import https from "https";
import { EventEmitter } from "events";

// Mock https.get
vi.mock("https", () => ({
	default: { get: vi.fn() },
}));

function mockResponse(statusCode, body, delay = 0) {
	const response = new EventEmitter();
	response.statusCode = statusCode;

	const request = new EventEmitter();
	request.setTimeout = vi.fn();
	request.destroy = vi.fn();

	https.get.mockImplementationOnce((_url, _opts, callback) => {
		setTimeout(() => {
			callback(response);
			setTimeout(() => {
				if (body !== null) {
					response.emit("data", typeof body === "string" ? body : JSON.stringify(body));
				}
				response.emit("end");
			}, delay);
		}, 0);
		return request;
	});

	return { request, response };
}

function mockNetworkError(errorMessage) {
	const request = new EventEmitter();
	request.setTimeout = vi.fn();
	request.destroy = vi.fn();

	https.get.mockImplementationOnce((_url, _opts, _callback) => {
		setTimeout(() => {
			request.emit("error", new Error(errorMessage));
		}, 0);
		return request;
	});

	return { request };
}

describe("APIClient", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("uses default options", () => {
			const client = new APIClient();
			expect(client.retries).toBe(2);
			expect(client.retryDelay).toBe(500);
			expect(client.timeout).toBe(10000);
			expect(client.cacheTimeout).toBe(60000);
			expect(client.defaultHeaders["User-Agent"]).toBe("SportSync/2.0");
		});

		it("accepts custom options", () => {
			const client = new APIClient({
				userAgent: "Test/1.0",
				retries: 5,
				retryDelay: 1000,
				timeout: 30000,
				cacheTimeout: 120000,
				headers: { "X-Custom": "value" },
			});
			expect(client.defaultHeaders["User-Agent"]).toBe("Test/1.0");
			expect(client.defaultHeaders["X-Custom"]).toBe("value");
			expect(client.retries).toBe(5);
			expect(client.retryDelay).toBe(1000);
			expect(client.timeout).toBe(30000);
			expect(client.cacheTimeout).toBe(120000);
		});

		it("merges custom headers with defaults", () => {
			const client = new APIClient({
				headers: { Authorization: "Bearer token" },
			});
			expect(client.defaultHeaders["User-Agent"]).toBe("SportSync/2.0");
			expect(client.defaultHeaders["Authorization"]).toBe("Bearer token");
		});
	});

	describe("buildURL()", () => {
		it("replaces template parameters", () => {
			const client = new APIClient();
			const url = client.buildURL("https://api.com/{sport}/{id}", {
				sport: "golf",
				id: "123",
			});
			expect(url).toBe("https://api.com/golf/123");
		});

		it("encodes URI components", () => {
			const client = new APIClient();
			const url = client.buildURL("https://api.com/{query}", {
				query: "hello world",
			});
			expect(url).toBe("https://api.com/hello%20world");
		});

		it("handles multiple replacements", () => {
			const client = new APIClient();
			const url = client.buildURL("https://api.com/{path}?q={query}", {
				path: "search",
				query: "test",
			});
			expect(url).toBe("https://api.com/search?q=test");
		});
	});

	describe("clearCache()", () => {
		it("clears all cached entries", () => {
			const client = new APIClient();
			client.cache.set("url1", { data: {}, timestamp: Date.now() });
			client.cache.set("url2", { data: {}, timestamp: Date.now() });
			expect(client.cache.size).toBe(2);
			client.clearCache();
			expect(client.cache.size).toBe(0);
		});
	});

	describe("delay()", () => {
		it("resolves after specified time", async () => {
			const client = new APIClient();
			const start = Date.now();
			await client.delay(50);
			const elapsed = Date.now() - start;
			expect(elapsed).toBeGreaterThanOrEqual(40);
		});
	});

	describe("fetchJSON()", () => {
		it("returns parsed JSON from successful response", async () => {
			const client = new APIClient({ retries: 0 });
			const data = { results: [1, 2, 3] };
			mockResponse(200, data);

			const result = await client.fetchJSON("https://api.example.com/data");
			expect(result).toEqual(data);
		});

		it("returns cached data on subsequent calls", async () => {
			const client = new APIClient({ retries: 0, cacheTimeout: 60000 });
			const data = { cached: true };
			mockResponse(200, data);

			const result1 = await client.fetchJSON("https://api.example.com/cached");
			const result2 = await client.fetchJSON("https://api.example.com/cached");

			expect(result1).toEqual(data);
			expect(result2).toEqual(data);
			// Second call should not make a network request
			expect(https.get).toHaveBeenCalledTimes(1);
		});

		it("returns stale cache on fetch error", async () => {
			const client = new APIClient({ retries: 0, cacheTimeout: 0 });
			const data = { stale: true };

			// First call populates cache
			mockResponse(200, data);
			await client.fetchJSON("https://api.example.com/stale");

			// Second call fails but returns stale cache
			mockNetworkError("Connection refused");
			const result = await client.fetchJSON("https://api.example.com/stale");
			expect(result).toEqual(data);
		});

		it("throws when no cache and fetch fails", async () => {
			const client = new APIClient({ retries: 0 });
			mockNetworkError("Connection refused");

			await expect(
				client.fetchJSON("https://api.example.com/fail")
			).rejects.toThrow("Connection refused");
		});

		it("passes merged headers to request", async () => {
			const client = new APIClient({
				retries: 0,
				headers: { "X-Base": "base" },
			});
			mockResponse(200, { ok: true });

			await client.fetchJSON("https://api.example.com/headers", {
				headers: { "X-Extra": "extra" },
			});

			const callArgs = https.get.mock.calls[0];
			const requestHeaders = callArgs[1].headers;
			expect(requestHeaders["X-Base"]).toBe("base");
			expect(requestHeaders["X-Extra"]).toBe("extra");
			expect(requestHeaders["User-Agent"]).toBe("SportSync/2.0");
		});
	});

	describe("makeRequest()", () => {
		it("rejects on HTTP 4xx errors", async () => {
			const client = new APIClient({ retries: 0 });
			mockResponse(404, "Not Found");

			await expect(
				client.makeRequest("https://api.example.com/404", {
					headers: {},
					retries: 0,
					retryDelay: 0,
				})
			).rejects.toThrow("HTTP 404");
		});

		it("rejects on invalid JSON", async () => {
			const client = new APIClient({ retries: 0 });
			mockResponse(200, "not json {{{");

			await expect(
				client.makeRequest("https://api.example.com/bad-json", {
					headers: {},
					retries: 0,
					retryDelay: 0,
				})
			).rejects.toThrow("Invalid JSON");
		});

		it("retries on 5xx errors", async () => {
			const client = new APIClient();

			// First call: 500, second call: 200
			mockResponse(500, "Server Error");
			mockResponse(200, { ok: true });

			const result = await client.makeRequest("https://api.example.com/retry", {
				headers: {},
				retries: 1,
				retryDelay: 10,
			});
			expect(result).toEqual({ ok: true });
			expect(https.get).toHaveBeenCalledTimes(2);
		});

		it("retries on network errors", async () => {
			const client = new APIClient();

			// First call: error, second call: success
			mockNetworkError("ECONNRESET");
			mockResponse(200, { recovered: true });

			const result = await client.makeRequest("https://api.example.com/retry-err", {
				headers: {},
				retries: 1,
				retryDelay: 10,
			});
			expect(result).toEqual({ recovered: true });
		});

		it("fails after exhausting retries on network errors", async () => {
			const client = new APIClient();

			mockNetworkError("ECONNRESET");
			mockNetworkError("ECONNRESET");

			await expect(
				client.makeRequest("https://api.example.com/exhaust", {
					headers: {},
					retries: 1,
					retryDelay: 10,
				})
			).rejects.toThrow("ECONNRESET");
		});

		it("sets request timeout", async () => {
			const client = new APIClient({ timeout: 5000 });
			const { request } = mockResponse(200, { ok: true });

			await client.fetchJSON("https://api.example.com/timeout");

			expect(request.setTimeout).toHaveBeenCalledWith(5000, expect.any(Function));
		});
	});

	describe("fetchWithDates()", () => {
		it("fetches data for each day in range", async () => {
			const client = new APIClient({ retries: 0 });

			// Mock 3 successful responses
			for (let i = 0; i < 3; i++) {
				mockResponse(200, { day: i });
			}

			const results = await client.fetchWithDates(
				"https://api.example.com/scores/{date}",
				3
			);

			expect(results).toHaveLength(3);
			expect(results[0]).toEqual({ day: 0 });
			expect(https.get).toHaveBeenCalledTimes(3);
		});

		it("uses default range of 7 days", async () => {
			const client = new APIClient({ retries: 0 });

			for (let i = 0; i < 7; i++) {
				mockResponse(200, { day: i });
			}

			const results = await client.fetchWithDates(
				"https://api.example.com/{date}"
			);

			expect(results).toHaveLength(7);
		});

		it("skips failed fetches and continues", async () => {
			const client = new APIClient({ retries: 0 });

			mockResponse(200, { day: 0 });
			mockNetworkError("fail");
			mockResponse(200, { day: 2 });

			const results = await client.fetchWithDates(
				"https://api.example.com/{date}",
				3
			);

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({ day: 0 });
			expect(results[1]).toEqual({ day: 2 });
		});
	});
});
