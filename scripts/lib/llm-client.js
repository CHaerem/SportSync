/**
 * Multi-provider LLM client for event enrichment.
 * Supports OpenAI and Anthropic APIs via native fetch (Node 18+).
 * Auto-detects available API key from environment.
 */

const PROVIDERS = {
	anthropic: {
		url: "https://api.anthropic.com/v1/messages",
		model: process.env.ANTHROPIC_MODEL || "claude-opus-4-6",
		envKey: "ANTHROPIC_API_KEY",
		buildRequest(apiKey, systemPrompt, userPrompt) {
			return {
				url: this.url,
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: {
					model: this.model,
					max_tokens: 4096,
					system: systemPrompt,
					messages: [{ role: "user", content: userPrompt }],
					temperature: 0.3,
				},
			};
		},
		extractContent(response) {
			return response.content?.[0]?.text;
		},
		extractUsage(response) {
			return response.usage
				? { input: response.usage.input_tokens, output: response.usage.output_tokens }
				: null;
		},
	},
	openai: {
		url: "https://api.openai.com/v1/chat/completions",
		model: process.env.OPENAI_MODEL || "gpt-4o-mini",
		envKey: "OPENAI_API_KEY",
		buildRequest(apiKey, systemPrompt, userPrompt) {
			return {
				url: this.url,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: {
					model: this.model,
					response_format: { type: "json_object" },
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userPrompt },
					],
					temperature: 0.3,
				},
			};
		},
		extractContent(response) {
			return response.choices?.[0]?.message?.content;
		},
		extractUsage(response) {
			return response.usage
				? { input: response.usage.prompt_tokens, output: response.usage.completion_tokens }
				: null;
		},
	},
};

export class LLMClient {
	constructor() {
		this.provider = null;
		this.apiKey = null;
		this.usage = { input: 0, output: 0, calls: 0 };

		for (const [name, config] of Object.entries(PROVIDERS)) {
			const key = process.env[config.envKey];
			if (key) {
				this.provider = name;
				this.apiKey = key;
				this.config = config;
				break;
			}
		}
	}

	getUsage() {
		return { ...this.usage, total: this.usage.input + this.usage.output };
	}

	resetUsage() {
		this.usage = { input: 0, output: 0, calls: 0 };
	}

	isAvailable() {
		return this.provider !== null;
	}

	getProviderName() {
		return this.provider;
	}

	async complete(systemPrompt, userPrompt, { maxRetries = 2 } = {}) {
		if (!this.isAvailable()) {
			throw new Error(
				"No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY."
			);
		}

		const req = this.config.buildRequest(
			this.apiKey,
			systemPrompt,
			userPrompt
		);

		let lastError;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const response = await fetch(req.url, {
					method: "POST",
					headers: req.headers,
					body: JSON.stringify(req.body),
				});

				if (!response.ok) {
					const errorBody = await response.text();
					throw new Error(
						`${this.provider} API error ${response.status}: ${errorBody}`
					);
				}

				const data = await response.json();
				const usage = this.config.extractUsage(data);
				if (usage) {
					this.usage.input += usage.input;
					this.usage.output += usage.output;
					this.usage.calls++;
				}

				const content = this.config.extractContent(data);

				if (!content) {
					throw new Error("Empty response from LLM");
				}

				return content;
			} catch (err) {
				lastError = err;
				if (attempt < maxRetries) {
					const delay = Math.pow(2, attempt) * 1000;
					console.warn(
						`LLM request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
						err.message
					);
					await new Promise((r) => setTimeout(r, delay));
				}
			}
		}

		throw lastError;
	}

	async completeJSON(systemPrompt, userPrompt, options = {}) {
		const content = await this.complete(systemPrompt, userPrompt, options);

		// Try direct parse first
		try {
			return JSON.parse(content);
		} catch {
			// Try extracting JSON from markdown code blocks
			const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (match) {
				return JSON.parse(match[1].trim());
			}
			throw new Error(
				`Failed to parse LLM response as JSON: ${content.substring(0, 200)}`
			);
		}
	}
}
