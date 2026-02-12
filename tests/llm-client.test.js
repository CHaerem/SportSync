import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to set env vars before importing LLMClient
const ORIG_ENV = { ...process.env };

describe("LLMClient usage tracking", () => {
	let LLMClient;

	beforeEach(async () => {
		// Reset env
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		// Fresh import each time
		vi.resetModules();
	});

	afterEach(() => {
		process.env = { ...ORIG_ENV };
		vi.restoreAllMocks();
	});

	it("getUsage() returns zeros initially", async () => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		const mod = await import("../scripts/lib/llm-client.js");
		LLMClient = mod.LLMClient;
		const llm = new LLMClient();
		const usage = llm.getUsage();
		expect(usage).toEqual({ input: 0, output: 0, calls: 0, total: 0 });
	});

	it("accumulates usage from Anthropic responses", async () => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		const mod = await import("../scripts/lib/llm-client.js");
		LLMClient = mod.LLMClient;
		const llm = new LLMClient();

		const mockResponse = {
			ok: true,
			json: async () => ({
				content: [{ text: "hello" }],
				usage: { input_tokens: 100, output_tokens: 50 },
			}),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		await llm.complete("system", "user");
		expect(llm.getUsage()).toEqual({ input: 100, output: 50, calls: 1, total: 150 });

		// Second call accumulates
		await llm.complete("system", "user2");
		expect(llm.getUsage()).toEqual({ input: 200, output: 100, calls: 2, total: 300 });
	});

	it("accumulates usage from OpenAI responses", async () => {
		process.env.OPENAI_API_KEY = "test-key";
		const mod = await import("../scripts/lib/llm-client.js");
		LLMClient = mod.LLMClient;
		const llm = new LLMClient();

		const mockResponse = {
			ok: true,
			json: async () => ({
				choices: [{ message: { content: "hi" } }],
				usage: { prompt_tokens: 200, completion_tokens: 80 },
			}),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		await llm.complete("system", "user");
		expect(llm.getUsage()).toEqual({ input: 200, output: 80, calls: 1, total: 280 });
	});

	it("resetUsage() clears counters", async () => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		const mod = await import("../scripts/lib/llm-client.js");
		LLMClient = mod.LLMClient;
		const llm = new LLMClient();

		const mockResponse = {
			ok: true,
			json: async () => ({
				content: [{ text: "hello" }],
				usage: { input_tokens: 100, output_tokens: 50 },
			}),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		await llm.complete("system", "user");
		expect(llm.getUsage().total).toBe(150);

		llm.resetUsage();
		expect(llm.getUsage()).toEqual({ input: 0, output: 0, calls: 0, total: 0 });
	});

	it("handles responses without usage data gracefully", async () => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		const mod = await import("../scripts/lib/llm-client.js");
		LLMClient = mod.LLMClient;
		const llm = new LLMClient();

		const mockResponse = {
			ok: true,
			json: async () => ({
				content: [{ text: "hello" }],
				// no usage field
			}),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		await llm.complete("system", "user");
		expect(llm.getUsage()).toEqual({ input: 0, output: 0, calls: 0, total: 0 });
	});

	it("getUsage() returns correct total field", async () => {
		process.env.ANTHROPIC_API_KEY = "test-key";
		const mod = await import("../scripts/lib/llm-client.js");
		LLMClient = mod.LLMClient;
		const llm = new LLMClient();

		// Manually set usage to test total calculation
		llm.usage = { input: 1500, output: 500, calls: 3 };
		const usage = llm.getUsage();
		expect(usage.total).toBe(2000);
		expect(usage.input).toBe(1500);
		expect(usage.output).toBe(500);
		expect(usage.calls).toBe(3);
	});
});
