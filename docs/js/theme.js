// Sportivista Theme — the ONE theme implementation, shared by all pages (WP-46).
// A single quantized glyph cycles system → dark → light → system (DESIGN.md,
// BINDING). 'system' clears data-theme so prefers-color-scheme decides; the
// glyph shows the current quantized state: ◐ system · ● dark · ○ light.
// Persisted in localStorage under 'ss-theme'. Each page also has a tiny
// pre-paint <head> snippet that sets data-theme before first paint (no flash);
// this module owns the glyph and the toggle.
(function () {
	const KEY = 'ss-theme';
	const MODES = ['system', 'dark', 'light'];
	const GLYPH = { system: '◐', dark: '●', light: '○' };
	const LABEL = { system: 'system', dark: 'mørk', light: 'lys' };

	function storedMode() {
		// Migrate: an earlier 2-state toggle stored only 'dark' | 'light'.
		let mode = null;
		try { mode = localStorage.getItem(KEY); } catch { /* private mode */ }
		return MODES.includes(mode) ? mode : 'system';
	}

	function applyTheme(mode) {
		const root = document.documentElement;
		if (mode === 'system') delete root.dataset.theme;
		else root.dataset.theme = mode;
		const btn = document.getElementById('theme-toggle');
		if (btn) {
			btn.textContent = GLYPH[mode] || '◐';
			btn.setAttribute('aria-label', `Tema: ${LABEL[mode] || 'system'} (trykk for å bytte)`);
		}
	}

	function initTheme() {
		applyTheme(storedMode());
		document.getElementById('theme-toggle')?.addEventListener('click', () => {
			const cur = storedMode();
			const next = cur === 'system' ? 'dark' : cur === 'dark' ? 'light' : 'system';
			try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
			applyTheme(next);
		});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTheme);
	else initTheme();
})();
