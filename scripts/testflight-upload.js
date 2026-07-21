// Release-lanens selv-helende arkiver→eksporter→last-opp-orkestrator (WP-151).
//
// Problemet: `next-testflight-build.js` henter byggnummer = ASC-maks+1 ved
// JOBB-START, men ASC registrerer en fersk opplasting med noen sekunders/minutters
// treghet (eventual consistency). Auto-CD (WP-137, hver iOS-merge) + manuelle
// dispatcher lager tette kjøringer; to tett etter hverandre henter samme nummer, og
// den andre feiler i EKSPORT/opplasting med:
//   error: exportArchive … The bundle version must be higher than the previously
//   uploaded version: 'N'.  (exit 70)
// Concurrency serialiserer kjøringene, men beskytter ikke mot ASCs treghet.
//
// Fiksen: fang den feilen, parse N, sett nytt byggnummer = N+1 og RE-ARKIVER
// (arkivet baker inn CFBundleVersion ved arkivering — `manageAppVersionAndBuildNumber:
// false` — så nummeret MÅ settes via CURRENT_PROJECT_VERSION ved arkivering; re-eksport
// alene holder ikke), så re-eksporter/last opp. Opptil `maxAttempts` forsøk med økende
// nummer. Ved suksess skrives det FAKTISK opplastede nummeret til `$GITHUB_OUTPUT`
// (`build=<N>`) slik at «Registrer opplastingen» registrerer riktig nummer.
//
// Feiler HØYLYTT (kaster / exit≠0) på: arkiverings-feil, en opplastings-feil som IKKE
// er en byggnummer-kollisjon, og oppbrukte forsøk — ekte problemer skal ikke svelges.
// macOS-runnere er gratis på det offentlige repoet, så re-arkivering er akseptabel.
//
// Den rene logikken (`parseBuildCollision`, `uploadWithRetry`) er eksportert og enhets-
// testet network-/xcodebuild-fritt (injiserte arkiver/opplast-funksjoner); CLI-inngangen
// under kobler dem til ekte xcodebuild-kall.
//
// Env (CLI): TF_BUILD (start-byggnummer), ASC_KEY_ID, ASC_ISSUER_ID. Nøkkelfila må
// allerede ligge i ~/.appstoreconnect/private_keys/ (release-lanen legger den der før
// dette steget). Valgfritt: TF_SCHEME, TF_ARCHIVE_PATH, TF_EXPORT_PLIST, TF_MAX_ATTEMPTS.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Pure: trekk ut ASCs «byggnummer allerede brukt»-kollisjon fra xcodebuild-outputen.
// Returnerer det ALLEREDE BRUKTE byggnummeret N (heltall) hvis kollisjonen finnes,
// ellers null (en annen feil, eller suksess). Tåler manglende/ikke-streng input og
// at nummeret står med eller uten omsluttende apostrofer ('N' eller N).
export function parseBuildCollision(output) {
	if (output == null) return null;
	const m = String(output).match(
		/bundle version must be higher than the previously uploaded version:\s*'?(\d+)'?/i,
	);
	return m ? Number(m[1]) : null;
}

// Pure orkestrering: arkiver→last-opp med byggnummer-bump ved ASC-kollisjon.
//   archive: async (byggnummer) => { ok: boolean, output: string }  — RE-ARKIVERER med
//            CURRENT_PROJECT_VERSION=byggnummer (arkivet baker inn nummeret)
//   upload:  async () => { ok: boolean, output: string }            — eksporter + last opp
// Returnerer { build: <faktisk opplastet nummer>, attempts } ved suksess.
// KASTER (feiler høyt) på: arkiverings-feil, ikke-kollisjons-opplastingsfeil, oppbrukte
// forsøk. Bumper til max(N+1, current+1) så nummeret alltid går strengt oppover.
export async function uploadWithRetry({ build, archive, upload, maxAttempts = 3, log = console } = {}) {
	if (!Number.isInteger(build) || build < 1) {
		throw new Error(`ugyldig start-byggnummer: ${build}`);
	}
	const attempts = Math.max(1, Math.floor(Number.isFinite(maxAttempts) ? maxAttempts : 3));
	let current = build;
	let lastCollision = null;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		const arch = await archive(current);
		if (!arch || !arch.ok) {
			// Arkiverings-feil er et ekte problem (ikke et race) — feil høyt.
			throw new Error(
				`arkivering feilet for byggnummer ${current} (forsøk ${attempt}/${attempts})` +
					tailOf(arch && arch.output),
			);
		}

		const up = await upload();
		if (up && up.ok) {
			return { build: current, attempts: attempt };
		}

		const collided = parseBuildCollision(up && up.output);
		if (collided == null) {
			// Opplastingen feilet av en ANNEN grunn enn byggnummer-kollisjon — feil høyt.
			throw new Error(
				`opplasting feilet (ikke en byggnummer-kollisjon) på forsøk ${attempt}/${attempts}` +
					tailOf(up && up.output),
			);
		}

		lastCollision = collided;
		const next = Math.max(collided + 1, current + 1);
		log.warn(
			`[testflight-upload] byggnummer ${current} kolliderte i ASC (allerede brukt: ${collided}) — ` +
				`re-arkiverer som ${next} (forsøk ${attempt}/${attempts}).`,
		);
		current = next;
	}

	throw new Error(
		`[testflight-upload] byggnummer-kollisjon vedvarte etter ${attempts} forsøk ` +
			`(sist ASC-brukt: ${lastCollision}) — sjekk ASC/opplastingen manuelt.`,
	);
}

// Kort hale av en kommando-output til feilmeldinger (unngår megabyte-logger i kastet).
function tailOf(output) {
	if (!output) return "";
	const trimmed = String(output).trim();
	if (!trimmed) return "";
	return ": …" + trimmed.slice(-800);
}

// --- CLI-inngang (kun ved direkte kjøring, ikke når testene importerer) ---------------

// Kjør xcodebuild live-strømmet: akkumuler HELE outputen (for kollisjons-parsing) men
// echo kun de interessante linjene til CI-loggen (som det gamle grep-steget), så en
// 10-minutters arkivering fortsatt viser fremdrift uten å drukne loggen.
const INTEREST = /ARCHIVE (SUCCEEDED|FAILED)|EXPORT (SUCCEEDED|FAILED)|Upload succeeded|error/i;
function runXcodebuild(args, cwd) {
	return new Promise((resolve) => {
		const child = spawn("xcodebuild", args, { cwd });
		let output = "";
		let pending = "";
		const onData = (buf) => {
			const s = buf.toString();
			output += s;
			pending += s;
			const lines = pending.split("\n");
			pending = lines.pop();
			for (const line of lines) if (INTEREST.test(line)) process.stdout.write(line + "\n");
		};
		child.stdout.on("data", onData);
		child.stderr.on("data", onData);
		child.on("error", (err) => resolve({ ok: false, output: output + "\n" + err.message }));
		child.on("close", (code) => {
			if (pending && INTEREST.test(pending)) process.stdout.write(pending + "\n");
			resolve({ ok: code === 0, output });
		});
	});
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	const build = Number(process.env.TF_BUILD || process.argv[2]);
	const { ASC_KEY_ID, ASC_ISSUER_ID } = process.env;
	if (!Number.isInteger(build) || build < 1) {
		console.error("[testflight-upload] mangler/ugyldig TF_BUILD (start-byggnummer).");
		process.exit(1);
	}
	if (!ASC_KEY_ID || !ASC_ISSUER_ID) {
		console.error("[testflight-upload] mangler ASC_KEY_ID / ASC_ISSUER_ID i env.");
		process.exit(1);
	}

	const repoRoot = fileURLToPath(new URL("..", import.meta.url));
	const iosDir = path.join(repoRoot, "ios");
	const scheme = process.env.TF_SCHEME || "SportivistaDeviceDev";
	const archivePath = process.env.TF_ARCHIVE_PATH || "build/Sportivista.xcarchive";
	const plistPath = process.env.TF_EXPORT_PLIST || "export-options.plist";
	const keyPath =
		process.env.TF_AUTH_KEY_PATH ||
		path.join(os.homedir(), ".appstoreconnect", "private_keys", `AuthKey_${ASC_KEY_ID}.p8`);
	const maxAttempts = Number(process.env.TF_MAX_ATTEMPTS) || 3;

	const authArgs = [
		"-allowProvisioningUpdates",
		"-authenticationKeyPath", keyPath,
		"-authenticationKeyID", ASC_KEY_ID,
		"-authenticationKeyIssuerID", ASC_ISSUER_ID,
	];

	const archive = async (n) => {
		const r = await runXcodebuild(
			[
				"-project", "Sportivista.xcodeproj",
				"-scheme", scheme,
				"-destination", "generic/platform=iOS",
				"-archivePath", archivePath,
				...authArgs,
				`CURRENT_PROJECT_VERSION=${n}`,
				"archive",
			],
			iosDir,
		);
		// Arkivet MÅ finnes på disk — samme sjekk som det gamle `test -d`-steget.
		const built = fs.existsSync(path.join(iosDir, archivePath));
		return { ok: r.ok && built, output: r.output };
	};

	const upload = async () =>
		runXcodebuild(
			[
				"-exportArchive",
				"-archivePath", archivePath,
				"-exportOptionsPlist", plistPath,
				...authArgs,
			],
			iosDir,
		);

	try {
		const result = await uploadWithRetry({ build, archive, upload, maxAttempts });
		console.log(`[testflight-upload] opplastet byggnummer ${result.build} (etter ${result.attempts} forsøk).`);
		if (process.env.GITHUB_OUTPUT) {
			fs.appendFileSync(process.env.GITHUB_OUTPUT, `build=${result.build}\n`);
		}
		process.exit(0);
	} catch (err) {
		console.error(`::error::${err.message}`);
		process.exit(1);
	}
}
