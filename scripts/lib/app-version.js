// «Har jeg siste versjon?» — the published half of the iOS build-stamp
// contract. The pipeline publishes docs/data/app-version.json carrying the
// short hash of the last commit that touched ios/; the sideloaded app
// compares it against its own build-time Info.plist stamp (see
// ios/Zenji/BuildStamp.swift). Data commits (docs/data/) never touch ios/,
// so the hash only moves when the app's source actually changed.
import { execFileSync } from "child_process";

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

// Deliberately NO generatedAt/run-timestamp: the file must be byte-identical
// between runs on unchanged input (manifest idempotence — and the hourly
// pipeline would otherwise commit + deploy churn every run). It changes when
// and only when the last ios/-touching commit changes.
export function buildAppVersion(commit) {
	if (!commit) return null;
	return {
		iosCommit: commit.iosCommit,
		committedAt: commit.committedAt,
	};
}
