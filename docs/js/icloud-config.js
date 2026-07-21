// icloud-config.js — the CloudKit JS web token + container config.
//
// THE apiToken IS PUBLIC AND SAFE TO COMMIT. It is NOT a secret: a CloudKit JS
// web token grants nothing from an origin not on its Allowed-Origins list, and
// every user still authenticates with their OWN Apple ID (Sign in with Apple)
// and only ever sees their OWN private database. It is designed to ship in
// client JavaScript. Do NOT treat it as a leaked credential / rotate it in panic.
//
// TO ENABLE iCLOUD SYNC (owner, one-time — see docs/icloud-sync-setup.md):
//   1. CloudKit Console → container iCloud.app.sportivista.ios (paid team).
//   2. Define the ProfileSnapshot record type + a Queryable index on recordName.
//   3. Generate a web API token, Allowed Origins = https://sportivista.com
//      and https://chaerem.github.io. Paste it below.
//   4. Deploy the schema to Production; keep `environment` matching the app build.
// An EMPTY apiToken keeps sync OFF (the sign-in UI stays hidden) — nothing breaks.

window.SPORTIVISTA_ICLOUD = {
	containerIdentifier: 'iCloud.app.sportivista.ios',
	// Origin-restricted Development web token (sportivista.com + chaerem.github.io).
	// Public + origin-locked → safe to commit. Swap for a Production token (and set
	// environment:'production') once the schema is deployed to Production.
	apiToken: 'e6bf806bb7dd49e9c4519fca24e2714d747b0b102ed36aac61c20282a746c10d',
	environment: 'development', // matches where the schema currently lives
	zoneName: 'SportivistaProfile',
};
