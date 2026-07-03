/**
 * Thin Anthropic LLM client (native fetch, Node 18+).
 * Not used by the scheduled agent workflows (they run Claude Code directly) —
 * kept as the Node-SDK fallback path described in the vendor swap recipe.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export function detectProvider() {
	return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
}

/**
 * Call Claude with a system + user prompt, return the text response.
 * The system prompt gets a cache_control breakpoint so repeated calls
 * within a run hit the prompt cache.
 */
export async function callLLM(systemPrompt, userPrompt, { model = DEFAULT_MODEL, maxTokens = 4096 } = {}) {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error("No ANTHROPIC_API_KEY set");

	const res = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			thinking: { type: "adaptive" },
			system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
			messages: [{ role: "user", content: userPrompt }],
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
	}
	const data = await res.json();
	if (data.stop_reason === "refusal") {
		throw new Error("Anthropic API refused the request");
	}
	const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
	return {
		text,
		usage: data.usage
			? { input: data.usage.input_tokens, output: data.usage.output_tokens }
			: null,
		model: data.model,
	};
}
