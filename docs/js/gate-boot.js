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
			+ '<p class="auth-gate-lead">Logg inn med Apple for å fortsette.</p>'
			+ '<div id="apple-sign-in-button" class="auth-signin"></div>'
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
