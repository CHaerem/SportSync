const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function query(prompt, vars) {
	const model = process.env.OPENAI_MODEL || "o3";
	const res = await openai.chat.completions.create({
		model,
		messages: [{ role: "user", content: fill(prompt, vars) }],
	});
	const content = res.choices[0].message.content;
	try {
		return JSON.parse(content);
	} catch (e) {
		console.error("Failed to parse LLM response as JSON:\n", content);
		throw e;
	}
}

function fill(template, vars) {
	return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || "");
}

module.exports = { query };
