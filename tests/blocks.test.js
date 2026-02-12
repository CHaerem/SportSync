import { describe, it, expect } from "vitest";
import { validateBlocksContent, validateFeaturedContent } from "../scripts/lib/ai-quality-gates.js";

describe("validateBlocksContent()", () => {
	it("accepts well-formed blocks", () => {
		const blocks = [
			{ type: "headline", text: "All eyes on the Bernabéu" },
			{ type: "event-line", text: "⚽ Real Madrid vs Liverpool, 21:00" },
			{ type: "narrative", text: "Holders Liverpool arrive three points clear." },
			{ type: "divider", text: "This Week" },
			{ type: "event-line", text: "⚽ Sat — PL fixtures" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.score).toBeGreaterThan(70);
		expect(result.normalized.blocks).toHaveLength(5);
	});

	it("rejects empty blocks array", () => {
		const result = validateBlocksContent([], { events: [] });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "blocks_empty")).toBe(true);
	});

	it("rejects too few valid blocks", () => {
		const blocks = [{ type: "divider", text: "This Week" }];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "blocks_too_few")).toBe(true);
	});

	it("requires at least one event block", () => {
		const blocks = [
			{ type: "headline", text: "Big day" },
			{ type: "narrative", text: "Something interesting." },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "no_event_blocks")).toBe(true);
	});

	it("warns on too many narratives", () => {
		const blocks = [
			{ type: "event-line", text: "⚽ Match, 21:00" },
			{ type: "narrative", text: "Context one." },
			{ type: "narrative", text: "Context two." },
			{ type: "narrative", text: "Context three." },
			{ type: "narrative", text: "Context four — too many." },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.issues.some((i) => i.code === "too_many_narratives")).toBe(true);
	});

	it("filters out unknown block types", () => {
		const blocks = [
			{ type: "headline", text: "Test" },
			{ type: "unknown-type", text: "Should be filtered" },
			{ type: "event-line", text: "⚽ Match, 21:00" },
			{ type: "event-line", text: "⛳ Golf, 14:00" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks).toHaveLength(3);
	});

	it("validates event-group blocks", () => {
		const blocks = [
			{ type: "event-line", text: "⚽ Match, 21:00" },
			{ type: "event-group", label: "🏅 Olympics today", items: ["Biathlon 10:00", "GS 10:00"] },
			{ type: "divider", text: "This Week" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks[1].items).toHaveLength(2);
	});

	it("filters event-group with empty items", () => {
		const blocks = [
			{ type: "event-line", text: "⚽ Match, 21:00" },
			{ type: "event-group", label: "Empty group", items: [] },
			{ type: "event-line", text: "⛳ Golf, 14:00" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.normalized.blocks).toHaveLength(2); // event-group filtered out
	});
});

describe("validateFeaturedContent() with blocks", () => {
	it("validates blocks from featured object", () => {
		const featured = {
			blocks: [
				{ type: "event-line", text: "⚽ Match, 21:00" },
				{ type: "event-line", text: "⛳ Golf, 14:00" },
				{ type: "divider", text: "This Week" },
				{ type: "event-line", text: "⚽ Fri fixture" },
			],
		};
		const result = validateFeaturedContent(featured, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks).toBeDefined();
	});

	it("rejects featured without blocks", () => {
		const result = validateFeaturedContent({}, { events: [] });
		expect(result.valid).toBe(false);
	});

	it("rejects featured with non-array blocks", () => {
		const result = validateFeaturedContent({ blocks: "not an array" }, { events: [] });
		expect(result.valid).toBe(false);
	});
});
