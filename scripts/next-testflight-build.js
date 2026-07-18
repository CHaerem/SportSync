// Release-lanens byggnummer-kilde (WP-17 CI/CD): spør App Store Connect om
// høyeste kjente CFBundleVersion og skriver neste til stdout (og $GITHUB_OUTPUT
// som `build=` når den finnes). ASC er fasit — lokale opplastinger og CI deler
// dermed samme monotone rekke, og project.yml-verdien er kun fallback for
// lokale dev-bygg.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (innholdet i .p8-filen).
import fs from "fs";
import { ascRequest, nextBuildNumber } from "./lib/asc-api.js";

const APP_ID = "6792373768"; // Sportivista (app.sportivista.ios)

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY) {
	console.error("Mangler ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY i env.");
	process.exit(1);
}

const auth = { keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, privateKey: ASC_PRIVATE_KEY };
const res = await ascRequest(
	auth,
	"GET",
	`/v1/builds?filter[app]=${APP_ID}&limit=10&sort=-uploadedDate&fields[builds]=version`,
);
const next = nextBuildNumber(res?.data);
console.log(String(next));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `build=${next}\n`);
