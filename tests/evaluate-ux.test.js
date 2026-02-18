import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { updateHistory } from "../scripts/evaluate-ux.js";

let tmpDir;

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ux-eval-test-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("updateHistory()", () => {
	it("creates history file when it does not exist", () => {
		const historyPath = path.join(tmpDir, "ux-history.json");
		const report = {
			generatedAt: "2026-01-01T00:00:00Z",
			score: 85,
			tier: "dom",
			metrics: { loadCompleteness: { score: 100 }, emptySections: { score: 90 } },
			issues: [{ code: "test" }],
		};

		const result = updateHistory(report, historyPath);

		expect(result).toHaveLength(1);
		expect(result[0].score).toBe(85);
		expect(result[0].tier).toBe("dom");
		expect(result[0].issueCount).toBe(1);
		expect(result[0].metricScores.loadCompleteness).toBe(100);
	});

	it("appends to existing history", () => {
		const historyPath = path.join(tmpDir, "ux-history.json");
		writeJson(historyPath, [
			{ generatedAt: "2026-01-01T00:00:00Z", score: 80, tier: "dom", issueCount: 2, metricScores: {} },
		]);

		const report = {
			generatedAt: "2026-01-02T00:00:00Z",
			score: 85,
			tier: "dom",
			metrics: {},
			issues: [],
		};

		const result = updateHistory(report, historyPath);
		expect(result).toHaveLength(2);
		expect(result[1].score).toBe(85);
	});

	it("caps history at maxEntries", () => {
		const historyPath = path.join(tmpDir, "ux-history.json");
		const existing = Array.from({ length: 30 }, (_, i) => ({
			generatedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
			score: 70 + i,
			tier: "dom",
			issueCount: 0,
			metricScores: {},
		}));
		writeJson(historyPath, existing);

		const report = {
			generatedAt: "2026-02-01T00:00:00Z",
			score: 99,
			tier: "dom",
			metrics: {},
			issues: [],
		};

		const result = updateHistory(report, historyPath);
		expect(result).toHaveLength(30);
		expect(result[result.length - 1].score).toBe(99);
		// First entry should have been dropped
		expect(result[0].score).toBe(71);
	});

	it("respects custom maxEntries", () => {
		const historyPath = path.join(tmpDir, "ux-history.json");
		const report = {
			generatedAt: "2026-01-01T00:00:00Z",
			score: 85,
			tier: "dom",
			metrics: {},
			issues: [],
		};

		// Fill with 5 entries, cap at 3
		for (let i = 0; i < 5; i++) {
			updateHistory({ ...report, score: 60 + i }, historyPath, 3);
		}

		const result = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
		expect(result).toHaveLength(3);
		expect(result[result.length - 1].score).toBe(64);
	});
});

describe("report shape validation", () => {
	it("history entries have expected fields", () => {
		const historyPath = path.join(tmpDir, "ux-history.json");
		const report = {
			generatedAt: "2026-01-01T00:00:00Z",
			score: 82,
			tier: "dom",
			metrics: {
				emptySections: { score: 100 },
				brokenImages: { score: 100 },
				contentOverflow: { score: 90 },
			},
			issues: [{ code: "overflow" }, { code: "low_contrast" }],
		};

		const result = updateHistory(report, historyPath);
		const entry = result[0];

		expect(entry).toHaveProperty("generatedAt");
		expect(entry).toHaveProperty("score");
		expect(entry).toHaveProperty("tier");
		expect(entry).toHaveProperty("issueCount");
		expect(entry).toHaveProperty("metricScores");
		expect(entry.issueCount).toBe(2);
		expect(entry.metricScores.emptySections).toBe(100);
		expect(entry.metricScores.contentOverflow).toBe(90);
	});
});
