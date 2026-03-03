// SportSync OAuth Relay — minimal GitHub OAuth token exchange
// Zero dependencies, runs alongside the self-hosted GitHub Actions runner on serverpi.

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3847;
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://chaerem.github.io';

function cors(res) {
	res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
	cors(res);
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function exchangeCode(code) {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify({
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			code,
		});
		const req = https.request({
			hostname: 'github.com',
			path: '/login/oauth/access_token',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'Content-Length': Buffer.byteLength(body),
			},
		}, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				try { resolve(JSON.parse(data)); }
				catch { reject(new Error('Invalid response from GitHub')); }
			});
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);

	if (req.method === 'OPTIONS') {
		cors(res);
		res.writeHead(204);
		return res.end();
	}

	if (url.pathname === '/health') {
		return json(res, 200, { ok: true });
	}

	if (url.pathname === '/auth') {
		if (!CLIENT_ID) return json(res, 500, { error: 'OAuth not configured' });
		const redirectUri = `${PUBLIC_URL}/callback`;
		const redirectTo = url.searchParams.get('redirect_to') || '';
		const state = redirectTo ? encodeURIComponent(redirectTo) : '';
		let authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=public_repo`;
		if (state) authUrl += `&state=${state}`;
		res.writeHead(302, { Location: authUrl });
		return res.end();
	}

	if (url.pathname === '/callback') {
		const code = url.searchParams.get('code');
		if (!code) return json(res, 400, { error: 'Missing code parameter' });

		try {
			const tokenData = await exchangeCode(code);
			if (tokenData.error) {
				return json(res, 400, { error: tokenData.error_description || tokenData.error });
			}
			const token = tokenData.access_token;

			// If state contains a redirect URL (PWA standalone flow), redirect back with token in hash
			const state = url.searchParams.get('state');
			if (state) {
				const redirectTo = decodeURIComponent(state);
				// Append token as hash fragment (never sent to server, stays client-side)
				const separator = redirectTo.includes('#') ? '&' : '#';
				const redirectUrl = `${redirectTo}${separator}sportsync-token=${token}`;
				res.writeHead(302, { Location: redirectUrl });
				return res.end();
			}

			// Popup flow: send token back to opener via postMessage
			const html = `<!DOCTYPE html>
<html><head><title>SportSync</title></head>
<body><p>Connecting...</p>
<script>
if (window.opener) {
  window.opener.postMessage({ type: 'sportsync-oauth', token: ${JSON.stringify(token)} }, '*');
}
setTimeout(function() { window.close(); }, 1000);
</script>
</body></html>`;
			res.writeHead(200, { 'Content-Type': 'text/html' });
			return res.end(html);
		} catch (err) {
			return json(res, 500, { error: 'Token exchange failed' });
		}
	}

	json(res, 404, { error: 'Not found' });
});

// Only start the server when run directly (not when required for tests)
if (require.main === module) {
	server.listen(PORT, () => {
		console.log(`OAuth relay listening on port ${PORT}`);
	});
}

module.exports = { server, exchangeCode };
