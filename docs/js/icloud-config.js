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
	// Origin-restricted PRODUCTION web token (sportivista.com + chaerem.github.io).
	// Public + origin-locked → safe to commit. Production is where the TestFlight
	// app writes, so this is the real daily channel. (The Development token was
	// e6bf806… — swapped out once the schema was deployed to Production.)
	apiToken: '90eb2fbc1ca28146c3c1a2d93d465f169e079fb0630acc87d818b529d7762965',
	environment: 'production', // matches the deployed schema + the TestFlight app
	zoneName: 'SportivistaProfile',
};
