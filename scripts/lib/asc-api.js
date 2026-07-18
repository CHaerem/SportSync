// Minimal App Store Connect API-klient (WP-17 CI/CD): ES256-JWT fra team-
// nøkkelen + fetch. Brukes av release-lanen (neste byggnummer) og fremtidig
// TestFlight-automatikk (grupper/testere). Bevisst uten avhengigheter —
// node:crypto signerer ES256 direkte (dsaEncoding ieee-p1363 er JWT-formatet;
// DER-defaulten avvises av Apple).
import crypto from "crypto";

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

// Pure: bygger JWT-en fra nøkkelmaterialet. `now` injiseres i tester.
export function ascJwt({ keyId, issuerId, privateKey }, now = Math.floor(Date.now() / 1000)) {
	const unsigned =
		b64url({ alg: "ES256", kid: keyId, typ: "JWT" }) +
		"." +
		b64url({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
	const sig = crypto
		.sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" })
		.toString("base64url");
	return unsigned + "." + sig;
}

// GET/POST mot API-et. `fetchImpl` injiseres i tester. Kaster på HTTP-feil —
// callere i CI skal feile høyt, ikke fortsette med tomme svar.
export async function ascRequest({ keyId, issuerId, privateKey }, method, path, body, fetchImpl = fetch) {
	const res = await fetchImpl("https://api.appstoreconnect.apple.com" + path, {
		method,
		headers: {
			Authorization: "Bearer " + ascJwt({ keyId, issuerId, privateKey }),
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`ASC ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
	return text ? JSON.parse(text) : null;
}

// Pure: neste CFBundleVersion gitt byggene ASC allerede kjenner. Tåler at
// listen er tom (første opplasting) og at version-strengene ikke er tall.
export function nextBuildNumber(builds) {
	const nums = (builds || [])
		.map((b) => Number(b?.attributes?.version))
		.filter((n) => Number.isInteger(n) && n >= 0);
	return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}
