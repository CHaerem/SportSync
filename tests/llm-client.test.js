// llm-client.js: Anthropic-only client builds a valid request with cache breakpoints.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callLLM, detectProvider } from "../scripts/lib/llm-client.js";

let lastRequest;

beforeEach(() => {
	process.env.ANTHROPIC_API_KEY = "test-key";
	vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
		lastRequest = { url, opts, body: JSON.parse(opts.body) };
		return {
			ok: true,
			json: async () => ({
				content: [{ type: "text", text: "hello" }],
				usage: { input_tokens: 10, output_tokens: 5 },
				model: "claude-opus-4-8",
				stop_reason: "end_turn",
			}),
		};
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.ANTHROPIC_API_KEY;
});

describe("llm-client", () => {
	it("detects anthropic provider from env", () => {
		expect(detectProvider()).toBe("anthropic");
	});

	it("builds a valid Messages API request", async () => {
		const result = await callLLM("system prompt", "user prompt");
		expect(lastRequest.url).toBe("https://api.anthropic.com/v1/messages");
		expect(lastRequest.opts.headers["x-api-key"]).toBe("test-key");
		expect(lastRequest.body.model).toBe("claude-opus-4-8");
		expect(lastRequest.body.thinking).toEqual({ type: "adaptive" });
		// no removed sampling params
		expect(lastRequest.body.temperature).toBeUndefined();
		expect(lastRequest.body.top_p).toBeUndefined();
		// prompt cache breakpoint on the system prompt
		expect(lastRequest.body.system[0].cache_control).toEqual({ type: "ephemeral" });
		expect(result.text).toBe("hello");
		expect(result.usage).toEqual({ input: 10, output: 5 });
	});

	it("throws without an API key", async () => {
		delete process.env.ANTHROPIC_API_KEY;
		await expect(callLLM("s", "u")).rejects.toThrow(/ANTHROPIC_API_KEY/);
	});

	it("throws on refusal stop reason", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({
			ok: true,
			json: async () => ({ content: [], stop_reason: "refusal" }),
		})));
		await expect(callLLM("s", "u")).rejects.toThrow(/refused/);
	});
});
