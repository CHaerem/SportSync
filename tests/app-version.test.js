// app-version.js — the published half of the iOS «har jeg siste versjon?»
// contract: last-ios/-commit from git, resilient to missing git/history.
import { describe, it, expect } from "vitest";
import { readIosCommit, buildAppVersion, readTestflight } from "../scripts/lib/app-version.js";

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

	it("folds a recorded TestFlight upload into a testflight block (WP-17)", () => {
		expect(
			buildAppVersion(
				{ iosCommit: "a1b2c3d", committedAt: "x" },
				{ stamp: "0ff1ce0", build: 3, version: "0.1.0", uploadedAt: "y" },
			),
		).toEqual({
			iosCommit: "a1b2c3d",
			committedAt: "x",
			testflight: { stamp: "0ff1ce0", build: 3, version: "0.1.0", uploadedAt: "y" },
		});
	});

	it("normalises missing optional testflight fields to null", () => {
		expect(buildAppVersion({ iosCommit: "a", committedAt: null }, { stamp: "b" }).testflight).toEqual({
			stamp: "b",
			build: null,
			version: null,
			uploadedAt: null,
		});
	});
});

describe("readTestflight", () => {
	const fsWith = (content) => ({ readFileSync: () => content });

	it("reads scripts/config/testflight.json", () => {
		const record = { stamp: "0ff1ce0", build: 3, version: "0.1.0", uploadedAt: "y" };
		expect(readTestflight("/repo", fsWith(JSON.stringify(record)))).toEqual(record);
	});

	it("returns null when the file is absent (pre-first-upload checkouts)", () => {
		const fsThrows = {
			readFileSync: () => {
				throw new Error("ENOENT");
			},
		};
		expect(readTestflight("/repo", fsThrows)).toBeNull();
	});

	it("returns null on invalid JSON or a record without a stamp", () => {
		expect(readTestflight("/repo", fsWith("ikke json"))).toBeNull();
		expect(readTestflight("/repo", fsWith('{"build":3}'))).toBeNull();
		expect(readTestflight("/repo", fsWith('{"stamp":""}'))).toBeNull();
	});
});
