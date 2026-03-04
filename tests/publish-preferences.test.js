import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
	publishPreferences,
	normalizeToClient,
	normalizeFromClient,
} from "../scripts/publish-preferences.js";

describe("publish-preferences", () => {
	let tmpDir;
	let inputPath;
	let outputPath;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-prefs-"));
		inputPath = path.join(tmpDir, "user-context.json");
		outputPath = path.join(tmpDir, "user-preferences.json");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function writeInput(data) {
		fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
	}

	describe("normalizeToClient()", () => {
		it("converts f1 to formula1", () => {
			expect(normalizeToClient("f1")).toBe("formula1");
		});

		it("passes through canonical IDs unchanged", () => {
			expect(normalizeToClient("football")).toBe("football");
			expect(normalizeToClient("golf")).toBe("golf");
			expect(normalizeToClient("tennis")).toBe("tennis");
		});

		it("passes through unknown IDs unchanged", () => {
			expect(normalizeToClient("handball")).toBe("handball");
		});
	});

	describe("normalizeFromClient()", () => {
		it("converts formula1 to f1", () => {
			expect(normalizeFromClient("formula1")).toBe("f1");
		});

		it("passes through pipeline IDs unchanged", () => {
			expect(normalizeFromClient("football")).toBe("football");
			expect(normalizeFromClient("golf")).toBe("golf");
		});

		it("passes through unknown IDs unchanged", () => {
			expect(normalizeFromClient("handball")).toBe("handball");
		});
	});

	describe("publishPreferences()", () => {
		it("produces correct output shape with all fields", async () => {
			writeInput({
				favoriteTeams: ["Barcelona", "Liverpool"],
				favoriteTeamsBySport: { football: ["Barcelona", "Liverpool"] },
				favoritePlayers: ["Viktor Hovland", "Casper Ruud"],
				favoritePlayersBySport: {
					golf: ["Viktor Hovland"],
					tennis: ["Casper Ruud"],
				},
				favoriteEsportsOrgs: ["100 Thieves"],
				sportPreferences: {
					football: "high",
					f1: "medium",
					tennis: "low",
				},
				location: "Norway",
				dynamicAthletes: { golf: { norwegian: true } },
				notes: "Test notes",
			});

			const result = await publishPreferences(inputPath, outputPath);
			expect(result).not.toBeNull();
			expect(result._publishedAt).toBeTruthy();
			expect(result.favoriteTeams).toEqual(["Barcelona", "Liverpool"]);
			expect(result.favoriteTeamsBySport).toEqual({
				football: ["Barcelona", "Liverpool"],
			});
			expect(result.favoritePlayers).toEqual([
				"Viktor Hovland",
				"Casper Ruud",
			]);
			expect(result.favoritePlayersBySport).toEqual({
				golf: ["Viktor Hovland"],
				tennis: ["Casper Ruud"],
			});
			expect(result.favoriteEsportsOrgs).toEqual(["100 Thieves"]);
			expect(result.location).toBe("Norway");
		});

		it("normalizes f1 to formula1 in sportPreferences", async () => {
			writeInput({
				sportPreferences: { football: "high", f1: "medium" },
			});

			const result = await publishPreferences(inputPath, outputPath);
			expect(result.sportPreferences.formula1).toBe("medium");
			expect(result.sportPreferences.f1).toBeUndefined();
			expect(result.sportPreferences.football).toBe("high");
		});

		it("writes valid JSON to output path", async () => {
			writeInput({
				favoriteTeams: ["Lyn"],
				sportPreferences: { football: "high" },
			});

			await publishPreferences(inputPath, outputPath);
			const written = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
			expect(written.favoriteTeams).toEqual(["Lyn"]);
			expect(written._publishedAt).toBeTruthy();
		});

		it("returns null for missing input file", async () => {
			const result = await publishPreferences(
				path.join(tmpDir, "nonexistent.json"),
				outputPath
			);
			expect(result).toBeNull();
		});

		it("excludes pipeline-only fields (dynamicAthletes, notes)", async () => {
			writeInput({
				favoriteTeams: [],
				dynamicAthletes: { golf: { norwegian: true } },
				notes: "Pipeline notes",
				norwegianFocus: true,
			});

			const result = await publishPreferences(inputPath, outputPath);
			expect(result.dynamicAthletes).toBeUndefined();
			expect(result.notes).toBeUndefined();
			expect(result.norwegianFocus).toBeUndefined();
		});

		it("handles empty user context gracefully", async () => {
			writeInput({});
			const result = await publishPreferences(inputPath, outputPath);
			expect(result.favoriteTeams).toEqual([]);
			expect(result.favoritePlayers).toEqual([]);
			expect(result.sportPreferences).toEqual({});
			expect(result.location).toBe("Norway");
		});

		it("normalizes nested sport keys in favoriteTeamsBySport", async () => {
			writeInput({
				favoriteTeamsBySport: { f1: ["Red Bull Racing"] },
			});

			const result = await publishPreferences(inputPath, outputPath);
			expect(result.favoriteTeamsBySport.formula1).toEqual([
				"Red Bull Racing",
			]);
			expect(result.favoriteTeamsBySport.f1).toBeUndefined();
		});
	});
});
