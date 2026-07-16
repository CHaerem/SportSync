// app-version.js — the published half of the iOS «har jeg siste versjon?»
// contract: last-ios/-commit from git, resilient to missing git/history.
import { describe, it, expect } from "vitest";
import { readIosCommit, buildAppVersion } from "../scripts/lib/app-version.js";

describe("readIosCommit", () => {
	it("parses short hash + commit timestamp from git output", () => {
		const exec = () => "a1b2c3d 2026-07-16T21:40:00+02:00\n";
		expect(readIosCommit("/repo", exec)).toEqual({
			iosCommit: "a1b2c3d",
			committedAt: "2026-07-16T21:40:00+02:00",
		});
	});

	it("returns null when git throws (no repo / no git)", () => {
		const exec = () => {
			throw new Error("not a git repository");
		};
		expect(readIosCommit("/repo", exec)).toBeNull();
	});

	it("returns null on empty output (no commit touches ios/)", () => {
		expect(readIosCommit("/repo", () => "\n")).toBeNull();
	});
});

describe("buildAppVersion", () => {
	it("is a pure function of the commit — no run timestamp (idempotence)", () => {
		expect(buildAppVersion({ iosCommit: "a1b2c3d", committedAt: "x" })).toEqual({
			iosCommit: "a1b2c3d",
			committedAt: "x",
		});
	});

	it("passes null through (pipeline skips the file)", () => {
		expect(buildAppVersion(null)).toBeNull();
	});
});
