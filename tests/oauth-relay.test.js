import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import http from "http";

// We test the relay server by requiring it and making HTTP requests
let server;
let baseUrl;

// Mock https for the token exchange
vi.mock("https", () => {
	const actual = vi.importActual("https");
	return {
		...actual,
		default: {
			...actual.default,
			request: vi.fn(),
		},
		request: vi.fn(),
	};
});

// Set env vars before requiring server
process.env.GITHUB_CLIENT_ID = "test_client_id";
process.env.GITHUB_CLIENT_SECRET = "test_client_secret";
process.env.ALLOWED_ORIGIN = "https://chaerem.github.io";
process.env.PORT = "0"; // Use random port

// We need to dynamically import since it uses require
const { server: relayServer } = await import("../infra/oauth-relay/server.js");

function request(path, options = {}) {
	return new Promise((resolve, reject) => {
		const url = new URL(path, baseUrl);
		const req = http.request(url, { method: options.method || "GET" }, (res) => {
			let body = "";
			res.on("data", (chunk) => { body += chunk; });
			res.on("end", () => {
				resolve({
					status: res.statusCode,
					headers: res.headers,
					body,
					json: () => {
						try { return JSON.parse(body); }
						catch { return null; }
					},
				});
			});
		});
		req.on("error", reject);
		req.end();
	});
}

describe("OAuth Relay Server", () => {
	beforeAll(async () => {
		await new Promise((resolve) => {
			relayServer.listen(0, () => {
				const addr = relayServer.address();
				baseUrl = `http://localhost:${addr.port}`;
				resolve();
			});
		});
	});

	afterAll(async () => {
		await new Promise((resolve) => relayServer.close(resolve));
	});

	describe("GET /health", () => {
		it("returns 200 with ok: true", async () => {
			const res = await request("/health");
			expect(res.status).toBe(200);
			expect(res.json()).toEqual({ ok: true });
		});

		it("includes CORS headers", async () => {
			const res = await request("/health");
			expect(res.headers["access-control-allow-origin"]).toBe("https://chaerem.github.io");
		});
	});

	describe("GET /auth", () => {
		it("redirects to GitHub OAuth authorize page", async () => {
			// http.request follows redirects by default, but we can check the status
			const url = new URL("/auth", baseUrl);
			const res = await new Promise((resolve) => {
				const req = http.request(url, { method: "GET" }, (res) => {
					resolve({ status: res.statusCode, headers: res.headers });
					res.resume(); // drain
				});
				req.end();
			});
			expect(res.status).toBe(302);
			expect(res.headers.location).toContain("github.com/login/oauth/authorize");
			expect(res.headers.location).toContain("client_id=test_client_id");
			expect(res.headers.location).toContain("scope=public_repo");
		});
	});

	describe("GET /callback", () => {
		it("returns 400 when code is missing", async () => {
			const res = await request("/callback");
			expect(res.status).toBe(400);
			expect(res.json()).toEqual({ error: "Missing code parameter" });
		});
	});

	describe("GET /unknown", () => {
		it("returns 404 for unknown routes", async () => {
			const res = await request("/unknown");
			expect(res.status).toBe(404);
			expect(res.json()).toEqual({ error: "Not found" });
		});
	});

	describe("OPTIONS", () => {
		it("returns 204 with CORS headers", async () => {
			const url = new URL("/health", baseUrl);
			const res = await new Promise((resolve) => {
				const req = http.request(url, { method: "OPTIONS" }, (res) => {
					resolve({
						status: res.statusCode,
						headers: res.headers,
					});
					res.resume();
				});
				req.end();
			});
			expect(res.status).toBe(204);
			expect(res.headers["access-control-allow-origin"]).toBe("https://chaerem.github.io");
			expect(res.headers["access-control-allow-methods"]).toContain("GET");
		});
	});
});
