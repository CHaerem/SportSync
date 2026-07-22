// share-card.js — the web delekort (WP-182 · Delbare flater).
//
// Draws a Sportivista-branded share image on a <canvas> for ONE event or for the
// day's brief, so a share out of the web board carries the identity instead of a
// bare line of text. Pure client-side: no network, no CDN — the display face
// (WP-183) is a self-hosted subset served from docs/fonts/, same origin as the
// page, so the null-infrastructure constraint holds (the CSP would block
// anything else anyway).
//
// MARKETING SURFACE, not product chrome. DESIGN.md regulates the app's own
// surfaces; a share card is an ad. So amber is used more boldly here than the
// board allows (the time is amber; on the board it is `--fg`). The freedom is
// contained: this file draws to a canvas that is never part of the page's own
// rendering, and it imports no product CSS, so the licence cannot leak back.
//
// HONESTY: the card renders only what the event actually carries. An unknown
// channel shows the same faint «–» the board shows — never an invented channel,
// never a guessed time.
//
// API (window globals, no build step — the docs/js convention):
//   ssShareCardCanvas(spec)      → HTMLCanvasElement (1200×630)
//   ssShareCardBlob(spec)        → Promise<Blob|null>  (image/png)
//   ssShareCardFontsReady()      → Promise<void>       (display face loaded)
// spec = { kind: 'event'|'brief', time, day, title, channel, footer }

(function (global) {
	'use strict';

	var W = 1200;
	var H = 630;
	// The web's system stack (docs/css/base.css `--font`) — body copy on the card.
	var STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
	// The display font (docs/css/base.css `--display`, WP-183). The card is one of
	// its exactly three surfaces (wordmark · time column · share cards). Canvas has
	// no `font-variant-numeric`, but the subset bakes `tnum` into the cmap, so the
	// big time is genuinely tabular here without any opt-in. The system stack stays
	// as the fallback so a card still renders if the face never loaded.
	var DISPLAY_STACK = '"Space Grotesk Subset", ' + STACK;
	var DISPLAY_FAMILY = '"Space Grotesk Subset"';
	var AMBER = '#FFB000';
	var BG = '#000000';
	var FG = '#FFFFFF';
	var FG2 = 'rgba(255,255,255,0.6)';
	var FG3 = 'rgba(255,255,255,0.3)';

	function font(size, weight) {
		return String(weight || 400) + ' ' + size + 'px ' + STACK;
	}

	/** The display-font variant of `font()` — used for the wordmark and the big
	 *  time only (WP-183). Everything else on the card stays on the system stack. */
	function displayFont(size, weight) {
		return String(weight || 600) + ' ' + size + 'px ' + DISPLAY_STACK;
	}

	/** Resolves once the display font is usable on canvas (or immediately when the
	 *  Font Loading API is absent). `ssShareCardCanvas` is synchronous and will
	 *  simply fall back to the system stack if called before this settles;
	 *  `ssShareCardBlob` awaits it, so a SHARED card always carries the face. */
	function ssShareCardFontsReady() {
		var fonts = global.document && global.document.fonts;
		if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();
		return Promise.all([
			fonts.load('600 96px ' + DISPLAY_FAMILY),
			fonts.load('700 96px ' + DISPLAY_FAMILY)
		]).catch(function () { /* fallback stack renders the card */ });
	}

	/** Greedy word-wrap to at most `maxLines` lines of `maxWidth`, ellipsising the
	 *  last line when the text does not fit. Returns an array of strings. */
	function wrap(ctx, text, maxWidth, maxLines) {
		var words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
		var lines = [];
		var line = '';
		for (var i = 0; i < words.length; i++) {
			var candidate = line ? line + ' ' + words[i] : words[i];
			if (ctx.measureText(candidate).width <= maxWidth || !line) {
				line = candidate;
			} else {
				lines.push(line);
				line = words[i];
				if (lines.length === maxLines) break;
			}
		}
		if (lines.length < maxLines && line) lines.push(line);
		if (lines.length === maxLines && words.length) {
			// Did anything not fit? Ellipsise the last line if so.
			var joined = lines.join(' ');
			if (joined.split(/\s+/).length < words.length) {
				var last = lines[maxLines - 1];
				while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
				lines[maxLines - 1] = last + '…';
			}
		}
		return lines;
	}

	/** The brand lockup, drawn at (x, y) with `y` as the TOP of the text.
	 *  BRAND.md: zero gap, the colon one weight step heavier, wordmark in `label`
	 *  and only the colon amber. Returns the drawn width. */
	function lockup(ctx, x, y, size) {
		ctx.textBaseline = 'top';
		ctx.font = displayFont(size, 600);
		var word = 'SPORTIVISTA';
		ctx.fillStyle = FG;
		if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(size * 0.06) + 'px';
		ctx.fillText(word, x, y);
		var w = ctx.measureText(word).width;
		if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
		ctx.font = displayFont(size, 700);
		ctx.fillStyle = AMBER;
		ctx.fillText(':', x + w, y);
		return w + ctx.measureText(':').width;
	}

	/** Draws the card and returns the canvas. Never throws on missing fields —
	 *  an absent channel/day is simply omitted (or, for the channel, the honest «–»). */
	function ssShareCardCanvas(spec) {
		spec = spec || {};
		var canvas = (global.document && global.document.createElement)
			? global.document.createElement('canvas') : null;
		if (!canvas) return null;
		canvas.width = W;
		canvas.height = H;
		var ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = BG;
		ctx.fillRect(0, 0, W, H);
		ctx.textBaseline = 'top';

		var padX = 84;
		lockup(ctx, padX, 74, 34);

		var y = 168;
		var maxW = W - padX * 2;

		if (spec.kind === 'brief') {
			if (spec.day) {
				ctx.font = font(28, 400);
				ctx.fillStyle = FG2;
				ctx.fillText(String(spec.day), padX, y);
				y += 52;
			}
			ctx.fillStyle = FG;
			ctx.font = font(50, 600);
			wrap(ctx, spec.title, maxW, 5).forEach(function (line) {
				ctx.fillText(line, padX, y);
				y += 66;
			});
		} else {
			// Event: the fixed time column the product is built around, blown up.
			if (spec.time) {
				ctx.font = displayFont(96, 700);
				ctx.fillStyle = AMBER;
				ctx.fillText(String(spec.time), padX, y);
				y += 118;
			}
			if (spec.day) {
				ctx.font = font(28, 400);
				ctx.fillStyle = FG2;
				ctx.fillText(String(spec.day), padX, y);
				y += 50;
			}
			ctx.fillStyle = FG;
			ctx.font = font(56, 600);
			wrap(ctx, spec.title, maxW, 2).forEach(function (line) {
				ctx.fillText(line, padX, y);
				y += 70;
			});
			// The channel — the third of «når · hva · hvor». Unknown stays honest.
			var channel = spec.channel ? String(spec.channel) : '';
			ctx.font = font(30, 400);
			ctx.fillStyle = channel ? FG2 : FG3;
			ctx.fillText(channel || '–', padX, y + 8);
		}

		ctx.font = font(24, 400);
		ctx.fillStyle = FG3;
		ctx.fillText(String(spec.footer || 'sportivista.com'), padX, H - 74);
		return canvas;
	}

	/** PNG blob of the card, or null when canvas/toBlob is unavailable. */
	function ssShareCardBlob(spec) {
		// Wait for the display face before rastering (WP-183) — a shared PNG is
		// permanent, so it must never be the fallback-stack version of the card.
		return ssShareCardFontsReady().then(function () {
			return new Promise(function (resolve) {
				var canvas = ssShareCardCanvas(spec);
				if (!canvas || typeof canvas.toBlob !== 'function') { resolve(null); return; }
				try {
					canvas.toBlob(function (blob) { resolve(blob || null); }, 'image/png');
				} catch (e) {
					resolve(null);
				}
			});
		});
	}

	global.ssShareCardCanvas = ssShareCardCanvas;
	global.ssShareCardBlob = ssShareCardBlob;
	global.ssShareCardFontsReady = ssShareCardFontsReady;
	// Exported for the tests (pure, DOM-free).
	global.ssShareCardWrap = wrap;
})(typeof window !== 'undefined' ? window : globalThis);
