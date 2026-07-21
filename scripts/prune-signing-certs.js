// Release-lanens selv-opprydning av signeringssertifikater (WP-145).
//
// Problemet: release-lanen arkiverer DeviceDev-schemaet med `-allowProvisioningUpdates`
// + cloud-signering. En fersk CI-runner har INGEN signeringsidentitet i nøkkelringen,
// så ASC-API-et minter et NYTT «Apple Development»-sertifikat ved HVER arkiveringskjøring.
// Med auto-CD (WP-137, hver iOS-merge) hoper disse seg opp — «Created via API»-sertifikater
// hvis privatnøkler døde med engangs-nøkkelringene sine — til Apples sertifikat-tak treffes
// og arkiveringen feiler med «Your account has reached the maximum number of certificates».
//
// Fiksen: dette steget kjører FØR arkiveringen og tilbakekaller de døde API-mintede
// dev-sertifikatene, men BEHOLDER eierens navngitte sertifikat(er) + de nyeste
// KEEP_RECENT API-mintede (så en pågående/nylig kjørings cert aldri rives bort under den).
// FAIL-SOFT: en list-feil eller en enkelt DELETE-feil LOGGES og svelges (exit 0) — prune
// skal ALDRI felle en ellers gyldig bygg-kjøring; poenget er å HINDRE cap-en, ikke å blokkere.
//
// WP-153: lanen importerer nå en FAST CI-signeringsidentitet (secret SIGNING_CERT_P12) i
// nøkkelringen FØR arkivering, så `-allowProvisioningUpdates` skal gjenbruke den i stedet
// for å minte et nytt cert per kjøring — det stopper churn-en (og «Certificate Has Been
// Revoked»-mailene tilbakekallingene utløste). Prune blir da et SIKKERHETSNETT snarere enn
// et navn: den beskytter CI-identiteten via KEEP_CERT_IDS (den bærer også displayName
// «Created via API» og ville ellers blitt tilbakekalt av sin egen prune) og rydder kun
// evt. gjenværende/stale churn. Når verifisert at mintingen har stoppet, kan steget fjernes.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (innholdet i .p8-filen) — samme
// mønster som scripts/next-testflight-build.js.
import { pathToFileURL } from "url";
import { ascRequest } from "./lib/asc-api.js";

// displayName-en ASC stempler på et sertifikat den minter for en
// `-allowProvisioningUpdates`-cloud-signeringskjøring. Eierens håndlagde sertifikater
// bærer sitt ekte navn i stedet (f.eks. «christopher hærem»), og BEHOLDES alltid.
export const API_DISPLAY_NAME = "Created via API";

// Hvor mange av de nyeste API-mintede dev-sertifikatene som skånes, slik at en
// samtidig/nettopp-fullført kjørings ferske cert aldri tilbakekalles under den.
export const KEEP_RECENT = 2;

// Rekkefølge-nøkkel: sertifikater eksponerer ikke createdDate, men hvert dev-cert har
// samme 1-års levetid, så seneste expirationDate == sist mintet. Faller tilbake til
// createdDate hvis et framtidig API skulle eksponere det. Uparsbar → -Infinity (eldst).
function recency(cert) {
	const a = (cert && cert.attributes) || {};
	const t = Date.parse(a.expirationDate || a.createdDate || "");
	return Number.isNaN(t) ? -Infinity : t;
}

// Pure seleksjon: gitt hele sertifikatlisten, returner de API-mintede sertifikatene som
// skal tilbakekalles — dvs. hvert «Created via API»-cert UNNTATT de nyeste `keepRecent`
// OG unntatt enhver id i `keepIds`. Navngitte sertifikater (enhver annen displayName)
// returneres ALDRI. `keepIds` (WP-153) beskytter den FASTE CI-signeringsidentiteten som
// nå importeres i nøkkelringen før arkivering: den bærer også displayName «Created via
// API» (ASC stempler alle API-opprettede certer likt), men er IKKE churn — den skal
// overleve for alltid, ellers ryker signeringen. Tåler tom/manglende input og et
// ikke-heltalls/negativt `keepRecent`.
export function certsToRevoke(certs, { keepRecent = KEEP_RECENT, keepIds = [] } = {}) {
	const protectedIds = new Set((keepIds || []).filter(Boolean));
	const apiMinted = (certs || []).filter(
		(c) =>
			c &&
			c.attributes &&
			c.attributes.displayName === API_DISPLAY_NAME &&
			!protectedIds.has(c.id), // beskyttede id-er (CI-identiteten) er aldri kandidat
	);
	const keep = Math.max(0, Math.floor(Number.isFinite(keepRecent) ? keepRecent : KEEP_RECENT));
	return apiMinted
		.slice()
		.sort((a, b) => recency(b) - recency(a)) // nyeste først
		.slice(keep); // skån de nyeste `keep`, tilbakekall resten
}

// Lister sertifikatene, tilbakekaller de døde API-mintede og logger et kort sammendrag.
// FAIL-SOFT hele veien: en list-feil eller en per-cert DELETE-feil logges og svelges, så
// prune aldri feller kjøringen. `request` injiseres i tester. Returnerer et sammendrag.
export async function pruneSigningCerts({
	auth,
	request = ascRequest,
	keepRecent = KEEP_RECENT,
	keepIds = [],
	log = console,
} = {}) {
	const summary = { found: 0, named: 0, apiMinted: 0, kept: 0, revoked: 0, failed: 0 };

	let list;
	try {
		list = await request(auth, "GET", "/v1/certificates?limit=200");
	} catch (err) {
		log.error(`[prune-certs] kunne ikke liste sertifikater: ${err.message} — hopper over (fail-soft).`);
		return summary;
	}

	const certs = (list && list.data) || [];
	summary.found = certs.length;
	summary.apiMinted = certs.filter(
		(c) => c && c.attributes && c.attributes.displayName === API_DISPLAY_NAME,
	).length;
	summary.named = summary.found - summary.apiMinted;

	const toRevoke = certsToRevoke(certs, { keepRecent, keepIds });
	summary.kept = summary.found - toRevoke.length;

	for (const cert of toRevoke) {
		try {
			await request(auth, "DELETE", `/v1/certificates/${cert.id}`);
			summary.revoked++;
		} catch (err) {
			summary.failed++;
			log.error(`[prune-certs] klarte ikke å tilbakekalle ${cert.id}: ${err.message} — fortsetter (fail-soft).`);
		}
	}

	const protectedCount = new Set((keepIds || []).filter(Boolean)).size
		? certs.filter((c) => c && new Set((keepIds || []).filter(Boolean)).has(c.id)).length
		: 0;
	log.log(
		`[prune-certs] fant ${summary.found} sertifikater (${summary.named} navngitte, ${summary.apiMinted} «${API_DISPLAY_NAME}»` +
			`${protectedCount ? `, ${protectedCount} beskyttet (CI-identitet)` : ""}); ` +
			`beholdt ${summary.kept}, tilbakekalte ${summary.revoked}${summary.failed ? `, ${summary.failed} feilet` : ""}.`,
	);
	return summary;
}

// CLI-inngang — kun når skriptet kjøres direkte (ikke når testene importerer det).
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY } = process.env;
	if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY) {
		// Uten creds kan vi ikke rydde — men prune skal ALDRI felle bygget (arkiveringen
		// feiler uansett høyt hvis disse virkelig mangler). Logg og gå videre.
		console.error("[prune-certs] mangler ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY — hopper over (fail-soft).");
		process.exit(0);
	}
	const auth = { keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, privateKey: ASC_PRIVATE_KEY };
	// KEEP_CERT_IDS (kommaseparert) beskytter den faste CI-signeringsidentiteten (WP-153)
	// mot å bli tilbakekalt av sin egen prune — den bærer displayName «Created via API».
	const keepIds = (process.env.KEEP_CERT_IDS || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	await pruneSigningCerts({ auth, keepIds });
	process.exit(0);
}
