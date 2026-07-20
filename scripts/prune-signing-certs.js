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
// skal tilbakekalles — dvs. hvert «Created via API»-cert UNNTATT de nyeste `keepRecent`.
// Navngitte sertifikater (enhver annen displayName) returneres ALDRI. Tåler tom/manglende
// input og et ikke-heltalls/negativt `keepRecent`.
export function certsToRevoke(certs, { keepRecent = KEEP_RECENT } = {}) {
	const apiMinted = (certs || []).filter(
		(c) => c && c.attributes && c.attributes.displayName === API_DISPLAY_NAME,
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

	const toRevoke = certsToRevoke(certs, { keepRecent });
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

	log.log(
		`[prune-certs] fant ${summary.found} sertifikater (${summary.named} navngitte, ${summary.apiMinted} «${API_DISPLAY_NAME}»); ` +
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
	await pruneSigningCerts({ auth });
	process.exit(0);
}
