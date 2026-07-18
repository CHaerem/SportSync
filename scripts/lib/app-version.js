// «Har jeg siste versjon?» — the published half of the iOS build-stamp
// contract. The pipeline publishes docs/data/app-version.json carrying the
// short hash of the last commit that touched ios/; the sideloaded app
// compares it against its own build-time Info.plist stamp (see
// ios/Zenji/BuildStamp.swift). Data commits (docs/data/) never touch ios/,
// so the hash only moves when the app's source actually changed.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// Reads {iosCommit, committedAt} from git, or null when git/history is
// unavailable (e.g. a tarball checkout) — the pipeline then simply skips the
// file and the app keeps showing its stamp without a verdict. `exec` is
// injectable for tests.
export function readIosCommit(repoRoot, exec = execFileSync) {
	try {
		const out = exec("git", ["-C", repoRoot, "log", "-1", "--format=%h %cI", "--", "ios/"], {
			encoding: "utf-8",
		}).trim();
		if (!out) return null;
		const [iosCommit, committedAt] = out.split(" ");
		if (!iosCommit) return null;
		return { iosCommit, committedAt: committedAt || null };
	} catch {
		return null;
	}
}

// Reads scripts/config/testflight.json — the record of the LAST UPLOADED
// TestFlight build (written by scripts/record-testflight.js right after an
// upload; lives OUTSIDE ios/ so recording it never moves the ios/-commit
// stamp it records). Returns null when absent/invalid: app-version.json then
// simply carries no testflight block and the app falls back to the pure
// commit comparison.
export function readTestflight(repoRoot, fsImpl = fs) {
	try {
		const raw = fsImpl.readFileSync(path.join(repoRoot, "scripts", "config", "testflight.json"), "utf-8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed.stamp !== "string" || !parsed.stamp) return null;
		return parsed;
	} catch {
		return null;
	}
}

// Deliberately NO generatedAt/run-timestamp: the file must be byte-identical
// between runs on unchanged input (manifest idempotence — and the hourly
// pipeline would otherwise commit + deploy churn every run). It changes when
// and only when the last ios/-touching commit changes — or a new TestFlight
// build is recorded.
export function buildAppVersion(commit, testflight = null) {
	if (!commit) return null;
	const out = {
		iosCommit: commit.iosCommit,
		committedAt: commit.committedAt,
	};
	if (testflight) {
		out.testflight = {
			stamp: testflight.stamp,
			build: testflight.build ?? null,
			version: testflight.version ?? null,
			uploadedAt: testflight.uploadedAt ?? null,
		};
	}
	return out;
}
