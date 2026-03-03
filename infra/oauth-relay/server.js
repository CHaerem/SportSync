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

// In-memory token store for session-based OAuth (PWA standalone flow)
// Key: sessionId, Value: { token, ts }
const pendingTokens = new Map();

// Clean up expired sessions every 10 minutes
setInterval(() => {
	const now = Date.now();
	for (const [id, entry] of pendingTokens) {
		if (now - entry.ts > 10 * 60 * 1000) pendingTokens.delete(id);
	}
}, 10 * 60 * 1000);

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
		// session param = PWA polling flow, redirect_to = redirect flow
		const session = url.searchParams.get('session') || '';
		const redirectTo = url.searchParams.get('redirect_to') || '';
		let state = '';
		if (session) state = 'session:' + session;
		else if (redirectTo) state = encodeURIComponent(redirectTo);
		let authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=public_repo`;
		if (state) authUrl += `&state=${encodeURIComponent(state)}`;
		res.writeHead(302, { Location: authUrl });
		return res.end();
	}

	// Token retrieval endpoint for PWA session-polling flow
	if (url.pathname === '/token') {
		const session = url.searchParams.get('session');
		if (!session) return json(res, 400, { error: 'Missing session parameter' });
		const entry = pendingTokens.get(session);
		if (!entry) return json(res, 404, { pending: true });
		pendingTokens.delete(session); // one-time retrieval
		return json(res, 200, { token: entry.token });
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

			const state = url.searchParams.get('state');
			const decodedState = state ? decodeURIComponent(state) : '';

			// Session-based flow (PWA standalone): store token for polling, show "done" page
			if (decodedState.startsWith('session:')) {
				const sessionId = decodedState.slice(8);
				pendingTokens.set(sessionId, { token, ts: Date.now() });
				const html = `<!DOCTYPE html>
<html><head><title>SportSync</title><meta name="viewport" content="width=device-width"></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:80vh;text-align:center">
<div><p style="font-size:1.2em">Connected!</p><p style="color:#666">Return to SportSync — it will pick up your session automatically.</p></div>
</body></html>`;
				res.writeHead(200, { 'Content-Type': 'text/html' });
				return res.end(html);
			}

			// Redirect flow: redirect back with token in hash fragment
			if (decodedState) {
				const redirectTo = decodedState;
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
