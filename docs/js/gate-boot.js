// gate-boot.js — the shared whole-web-behind-login gate for the SECONDARY pages
// (rediger.html, activity.html). index.html has its own inline wiring (it must
// also defer the board's heavy init until after auth). Here the page's own init
// runs normally and populates content that `body.gated` keeps hidden until Sign
// in with Apple reveals it.
//
// Each page includes: icloud-config.js + cloudkit.js + icloud-sync.js + this.
// No token configured → no-op (the page stays open, e.g. local dev / stripped).

(function () {
	var cfg = window.SPORTIVISTA_ICLOUD;
	if (!cfg || !cfg.apiToken || !window.ssICloud || typeof window.ssICloud.gate !== 'function') return;

	if (document.body) document.body.classList.add('gated');

	// Inject a default overlay if the page didn't declare its own #auth-gate.
	function ensureOverlay() {
		if (document.getElementById('auth-gate')) return;
		var g = document.createElement('div');
		g.id = 'auth-gate';
		g.className = 'auth-gate';
		g.innerHTML = '<div class="auth-gate-inner">'
			+ '<span class="wordmark-lockup"><span class="wordmark">Sportivista</span><span class="wordmark-colon" aria-hidden="true">:</span></span>'
			+ '<p class="auth-gate-lead">Logg på med Apple for å fortsette.</p>'
			+ '<button type="button" id="signin-apple" class="signin-apple">'
			+ '<svg class="apple-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>'
			+ '<span>Logg på med Apple</span></button>'
			+ '<div id="apple-sign-in-button"></div>'
			+ '<p class="auth-error" id="auth-error" hidden></p></div>';
		document.body.appendChild(g);
	}

	function start() {
		if (document.body) document.body.classList.add('gated');
		ensureOverlay();
		var tries = 0;
		var t = setInterval(function () {
			if (typeof CloudKit !== 'undefined' || ++tries > 40) {
				clearInterval(t);
				window.ssICloud.gate({ onAuthed: function () { /* page init already ran; gate reveals the content */ } });
			}
		}, 250);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
})();
