// sport-icons.js — inline SVG sport glyphs for the agenda rows (web twin of the
// iOS SportSymbol registry, WP-108). SF Symbols don't exist on web, so these are
// simple line icons keyed by the SAME canonical sport tags the pipeline emits.
// Quiet (tertiaryLabel, --fg-3), NEVER coloured (the amber must-see dot stays the
// row's only accent), decorative (aria-hidden — the title/meta carries the sport
// for assistive tech). One glyph per sport so "which sport" reads at a glance.
//
// Deliberate web divergences from the SF Symbol table (documented, not accidental):
//   • the winter sports (cross-country/alpine/ski jumping/nordic) share one
//     snowflake glyph — SF distinguishes downhill/crosscountry figures, but a
//     hand-drawn figure per discipline is illegible at 16px. biathlon keeps its
//     own target (the rifle half that defines it), matching SF's `target` choice.
//   • fallback is a calendar, mirroring SportSymbol.fallback.

// Canonical/alias sport tag → glyph key.
const SS_SPORT_ICON_ALIAS = {
	football: 'football', soccer: 'football',
	golf: 'golf', tennis: 'tennis', cycling: 'cycling', athletics: 'athletics',
	f1: 'f1', formula1: 'f1', motorsport: 'f1',
	esports: 'esports', chess: 'chess',
	biathlon: 'biathlon',
	'cross-country': 'snow', alpine: 'snow', 'ski jumping': 'snow', nordic: 'snow',
};

// glyph key → inner SVG markup (each carries its own fill/stroke; the wrapper only
// provides the 24×24 viewBox + class). Kept minimal and recognisable at 16px.
const SS_SPORT_ICON_PATHS = {
	football: '<circle cx="12" cy="12" r="8.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7.6l3.4 2.5-1.3 4h-4.2L8.6 10.1z" fill="currentColor"/>',
	golf: '<path d="M7.6 21V3.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7.6 4.4l8.2 2.5-8.2 2.5z" fill="currentColor"/>',
	tennis: '<circle cx="12" cy="12" r="8.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 6.4c3.1 2.9 3.1 8.5 0 11.4M18 6.4c-3.1 2.9-3.1 8.5 0 11.4" fill="none" stroke="currentColor" stroke-width="1.3"/>',
	cycling: '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="16.4" r="3.3"/><circle cx="18" cy="16.4" r="3.3"/><path d="M6 16.4l4.2-7h4.3l3.5 7M9.6 9.4h4.4"/></g>',
	athletics: '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="14.6" cy="5" r="1.8" fill="currentColor" stroke="none"/><path d="M14 8.6l-2.6 3.6 3 2 1 4.8M11.4 12.2l-3.4-1M15 9.7l3 1.2 2-1.9M12 15.2l-2.6 4.4"/></g>',
	f1: '<path d="M6 21V4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6 5h4v3h4V5h4v3h-4v3h4v3h-4v-3h-4v3H6v-3h4V8H6z" fill="currentColor"/>',
	esports: '<path d="M8.2 9h7.6a4.8 4.8 0 0 1 4.8 4.9 2.8 2.8 0 0 1-5 1.7L14.2 14H9.8l-1.4 1.6a2.8 2.8 0 0 1-5-1.7A4.8 4.8 0 0 1 8.2 9z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.6 12h2.2M7.7 10.9v2.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="15.6" cy="12" r="0.95" fill="currentColor"/>',
	chess: '<path d="M5 9.2l2.6 2L12 6l4.4 5.2 2.6-2-1.5 8H6.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
	snow: '<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 6.6l2-2M12 6.6l-2-2M12 17.4l2 2M12 17.4l-2 2"/></g>',
	biathlon: '<circle cx="12" cy="12" r="8.3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
	fallback: '<rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 9.5h16M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
};

/** Glyph key for a sport tag (canonical or alias), else 'fallback'. */
function ssSportIconKey(sport) {
	const s = String(sport || '').trim().toLowerCase();
	return SS_SPORT_ICON_ALIAS[s] || 'fallback';
}

/** The inline SVG for a sport tag — a quiet, decorative row glyph. */
function ssSportIcon(sport) {
	const inner = SS_SPORT_ICON_PATHS[ssSportIconKey(sport)] || SS_SPORT_ICON_PATHS.fallback;
	return `<svg class="ev-sport" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

if (typeof window !== 'undefined') { window.ssSportIcon = ssSportIcon; window.ssSportIconKey = ssSportIconKey; }
if (typeof module !== 'undefined' && module.exports) module.exports = { ssSportIcon, ssSportIconKey };
