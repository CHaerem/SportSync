import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIG_ENV = { ...process.env };

describe("LLMClient", () => {
	let LLMClient;

	beforeEach(async () => {
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		vi.resetModules();
	});

	afterEach(() => {
		process.env = { ...ORIG_ENV };
		vi.restoreAllMocks();
	});

	describe("provider detection", () => {
		it("selects Anthropic when ANTHROPIC_API_KEY is set", async () => {
			process.env.ANTHROPIC_API_KEY = "sk-ant-test";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();
			expect(llm.isAvailable()).toBe(true);
			expect(llm.getProviderName()).toBe("anthropic");
		});

		it("selects OpenAI when only OPENAI_API_KEY is set", async () => {
			process.env.OPENAI_API_KEY = "sk-test";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();
			expect(llm.isAvailable()).toBe(true);
			expect(llm.getProviderName()).toBe("openai");
		});

		it("prefers Anthropic over OpenAI when both are set", async () => {
			process.env.ANTHROPIC_API_KEY = "sk-ant-test";
			process.env.OPENAI_API_KEY = "sk-test";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();
			expect(llm.getProviderName()).toBe("anthropic");
		});

		it("reports unavailable when no keys set", async () => {
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();
			expect(llm.isAvailable()).toBe(false);
			expect(llm.getProviderName()).toBeNull();
		});
	});

	describe("complete()", () => {
		it("throws when no API key available", async () => {
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();
			await expect(llm.complete("system", "user")).rejects.toThrow("No LLM API key found");
		});

		it("throws on non-ok response after retries", async () => {
			process.env.ANTHROPIC_API_KEY = "test-key";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			const mockResponse = {
				ok: false,
				status: 429,
				text: async () => "rate limited",
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(llm.complete("sys", "user", { maxRetries: 0 })).rejects.toThrow("API error 429");
		});

		it("retries on failure up to maxRetries", async () => {
			process.env.ANTHROPIC_API_KEY = "test-key";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			const failResponse = { ok: false, status: 500, text: async () => "error" };
			const successResponse = {
				ok: true,
				json: async () => ({ content: [{ text: "result" }], usage: { input_tokens: 10, output_tokens: 5 } }),
			};

			const fetchMock = vi.fn()
				.mockResolvedValueOnce(failResponse)
				.mockResolvedValueOnce(successResponse);
			vi.stubGlobal("fetch", fetchMock);

			// maxRetries=1 means 2 attempts total
			const result = await llm.complete("sys", "user", { maxRetries: 1 });
			expect(result).toBe("result");
			expect(fetchMock).toHaveBeenCalledTimes(2);
		}, 10000);

		it("throws on empty response content", async () => {
			process.env.ANTHROPIC_API_KEY = "test-key";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ content: [{ text: "" }] }),
			}));

			await expect(llm.complete("sys", "user", { maxRetries: 0 })).rejects.toThrow("Empty response");
		});

		it("sends correct Anthropic request format", async () => {
			process.env.ANTHROPIC_API_KEY = "sk-ant-test";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ content: [{ text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }),
			});
			vi.stubGlobal("fetch", fetchMock);

			await llm.complete("You are helpful", "Hello");

			const call = fetchMock.mock.calls[0];
			expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
			const body = JSON.parse(call[1].body);
			expect(body.system).toBe("You are helpful");
			expect(body.messages[0].content).toBe("Hello");
			expect(call[1].headers["x-api-key"]).toBe("sk-ant-test");
		});

		it("sends correct OpenAI request format", async () => {
			process.env.OPENAI_API_KEY = "sk-test";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
			});
			vi.stubGlobal("fetch", fetchMock);

			await llm.complete("You are helpful", "Hello");

			const call = fetchMock.mock.calls[0];
			expect(call[0]).toBe("https://api.openai.com/v1/chat/completions");
			const body = JSON.parse(call[1].body);
			expect(body.messages[0].role).toBe("system");
			expect(body.messages[0].content).toBe("You are helpful");
			expect(body.messages[1].content).toBe("Hello");
			expect(call[1].headers["Authorization"]).toBe("Bearer sk-test");
		});
	});

	describe("completeJSON()", () => {
		it("parses direct JSON response", async () => {
			process.env.ANTHROPIC_API_KEY = "test-key";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					content: [{ text: '{"importance": 4, "summary": "Big match"}' }],
					usage: { input_tokens: 10, output_tokens: 20 },
				}),
			}));

			const result = await llm.completeJSON("sys", "user");
			expect(result).toEqual({ importance: 4, summary: "Big match" });
		});

		it("extracts JSON from markdown code blocks", async () => {
			process.env.ANTHROPIC_API_KEY = "test-key";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					content: [{ text: 'Here is the result:\n```json\n{"score": 5}\n```\nDone.' }],
					usage: { input_tokens: 10, output_tokens: 20 },
				}),
			}));

			const result = await llm.completeJSON("sys", "user");
			expect(result).toEqual({ score: 5 });
		});

		it("throws on non-JSON response", async () => {
			process.env.ANTHROPIC_API_KEY = "test-key";
			const mod = await import("../scripts/lib/llm-client.js");
			const llm = new mod.LLMClient();

			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					content: [{ text: "I cannot produce JSON for this request." }],
					usage: { input_tokens: 10, output_tokens: 20 },
				}),
			}));

			await expect(llm.completeJSON("sys", "user", { maxRetries: 0 })).rejects.toThrow("Failed to parse LLM response as JSON");
		});
	});
});
