// logo-attribution.js — WP-186: «Merker og kilder», the attribution surface.
//
// Why this exists at all: a CC BY / CC BY-SA mark may only be shown WITH credit,
// so crediting is not a nicety here, it is the condition of use. And the marks we
// show on the editorial basis (the owner's 22.07 decision) need the opposite kind
// of honesty — a plain statement that they belong to their clubs and are shown to
// identify them, with no claim of affiliation, sponsorship or endorsement. That
// last claim is precisely what trademark law protects against, so we make sure we
// never make it.
//
// The list is loaded LAZILY from our own origin (`logos/ATTRIBUTION.json`, written
// beside the assets by scripts/seed-registry/logos.js) the first time the
// disclosure is opened. No external request — same rule as the assets themselves.

(function () {
	'use strict';

	/** Escaping is mandatory: attribution text is third-party prose from Commons. */
	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}

	/** Group the manifest by basis — the two grounds are explained differently. */
	function partition(logos) {
		const free = [];
		const editorial = [];
		for (const l of logos || []) {
			if (l && l.basis === 'free-license') free.push(l);
			else if (l && l.basis === 'editorial-use') editorial.push(l);
		}
		return { free, editorial };
	}

	function creditLine(l) {
		const who = l.attribution ? ` · ${esc(l.attribution)}` : '';
		const lic = l.licenseUrl
			? `<a href="${esc(l.licenseUrl)}" rel="noopener nofollow">${esc(l.license || '')}</a>`
			: esc(l.license || '');
		const src = l.sourceUrl ? ` · <a href="${esc(l.sourceUrl)}" rel="noopener nofollow">kilde</a>` : '';
		return `<li><strong>${esc(l.name)}</strong> — ${lic}${who}${src}</li>`;
	}

	function render(manifest) {
		const { free, editorial } = partition(manifest && manifest.logos);
		if (!free.length && !editorial.length) return '';
		let html = '';
		if (free.length) {
			html += `<div class="followed-layer"><p class="marks-lead">Fritt lisensierte merker (${free.length}) — brukt på lisensens vilkår, uendret.</p><ul class="marks-list">${free.map(creditLine).join('')}</ul></div>`;
		}
		if (editorial.length) {
			html +=
				`<div class="followed-layer"><p class="marks-lead">Klubbmerker (${editorial.length})</p>` +
				`<p class="marks-note">${esc(
					(manifest && manifest.notice) ||
						'Klubbmerker tilhører sine respektive klubber og vises utelukkende for å identifisere dem. Sportivista er ikke tilknyttet, sponset av eller godkjent av klubbene.'
				)}</p>` +
				`<p class="marks-note">Merkene vises uendret, i original form og farge.</p></div>`;
		}
		return html;
	}

	async function load() {
		const res = await fetch('logos/ATTRIBUTION.json', { cache: 'no-cache' });
		if (!res.ok) throw new Error(String(res.status));
		return res.json();
	}

	function init() {
		const details = document.getElementById('marks');
		const body = document.getElementById('marks-body');
		if (!details || !body) return;
		let loaded = false;
		details.addEventListener('toggle', async () => {
			if (!details.open || loaded) return;
			loaded = true;
			try {
				body.innerHTML = render(await load());
			} catch {
				// A missing manifest is not an error worth shouting about — it just
				// means no marks are shipped in this build.
				body.innerHTML = '';
			}
		});
		// The surface only appears once there is something to credit.
		load()
			.then((m) => {
				if (render(m)) details.hidden = false;
			})
			.catch(() => {});
	}

	if (typeof document !== 'undefined') {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
		else init();
	}

	if (typeof module !== 'undefined' && module.exports) module.exports = { partition, render };
	if (typeof window !== 'undefined') window.ssLogoAttribution = { partition, render };
})();
