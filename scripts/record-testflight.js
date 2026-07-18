// Record a completed TestFlight upload — run RIGHT AFTER `xcodebuild
// -exportArchive` says "Upload succeeded":
//
//   node scripts/record-testflight.js <build-number> [version]
//
// Writes scripts/config/testflight.json with the CURRENT last-ios/-commit
// stamp (which is what the archive baked into SportivistaBuildStamp, provided
// the tree was clean — refused otherwise). build-events.js folds the file
// into app-version.json's `testflight` block, and the app treats a stamp
// matching EITHER the latest ios/-commit OR this recorded upload as SISTE —
// a TestFlight tester cannot be more current than the last upload, so newer
// unshipped commits must not nag them. The file lives OUTSIDE ios/ so
// recording an upload never moves the stamp it records.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readIosCommit } from "./lib/app-version.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const build = Number(process.argv[2]);
const version = process.argv[3] || null;
if (!Number.isInteger(build) || build < 1) {
	console.error("Bruk: node scripts/record-testflight.js <byggnummer> [versjon]");
	process.exit(1);
}

// The stamp is only honest if the archive came from a clean ios/ tree — a
// dirty archive bakes "<hash>-dirty", which will never match anything here.
try {
	execFileSync("git", ["-C", repoRoot, "diff", "--quiet", "--", "ios/"]);
} catch {
	console.error("ios/ har ucommittede endringer — arkivet ville vært -dirty. Commit først.");
	process.exit(1);
}

const commit = readIosCommit(repoRoot);
if (!commit) {
	console.error("Fant ingen ios/-commit (ikke et git-repo?).");
	process.exit(1);
}

const record = {
	stamp: commit.iosCommit,
	build,
	version,
	uploadedAt: new Date().toISOString(),
};
const target = path.join(repoRoot, "scripts", "config", "testflight.json");
fs.writeFileSync(target, JSON.stringify(record, null, 2) + "\n");
console.log(`Registrert TestFlight-opplasting: bygg ${build} @ ${record.stamp} → ${target}`);
