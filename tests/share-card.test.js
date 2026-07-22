// WP-182 · Delbare flater — the web delekort + the link-preview metadata.
//
// Two things are pinned here:
//   1. docs/js/share-card.js draws an HONEST card (the event's own time/title,
//      the board's faint "–" for an unknown channel) with NO network access.
//   2. Every shipped docs page carries og:/twitter: tags pointing at the
//      CHECKED-IN static card, and the service worker caches it. A crawler does
//      not run JS, so these must live in the HTML itself — the sign-in gate only
//      hides <body>, never <head>.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

const docs = path.resolve(process.cwd(), "docs");
const PAGES = ["index.html", "rediger.html", "activity.html", "styleguide.html"];
const OG_IMAGE = "https://sportivista.com/og/og-default.png";

/** A canvas 2D context stub that records every draw call. */
function fakeCanvas() {
	const calls = { text: [], rects: [], fonts: [], fills: [] };
	const ctx = {
		set fillStyle(v) { calls.fills.push(v); this._fill = v; },
		get fillStyle() { return this._fill; },
		set font(v) { calls.fonts.push(v); this._font = v; },
		get font() { return this._font; },
		textBaseline: "",
		letterSpacing: "0px",
		fillText: (t, x, y) => calls.text.push({ text: t, x, y, fill: ctx._fill, font: ctx._font }),
		fillRect: (x, y, w, h) => calls.rects.push({ x, y, w, h, fill: ctx._fill }),
		// A deterministic, monotone width model — enough for the wrap logic.
		measureText: (s) => ({ width: String(s).length * 20 }),
	};
	return {
		width: 0, height: 0, calls,
		getContext: () => ctx,
		toBlob: (cb) => cb({ type: "image/png", size: 1 }),
	};
}

function sandboxWithCanvas() {
	const sandbox = createClientSandbox();
	const canvas = fakeCanvas();
	sandbox.document.createElement = (tag) => (tag === "canvas" ? canvas : {});
	loadClientScript(sandbox, "share-card.js");
	return { sandbox, canvas };
}

describe("web delekort (share-card.js)", () => {
	it("draws a black card with the amber-colon lockup", () => {
		const { sandbox, canvas } = sandboxWithCanvas();
		sandbox.ssShareCardCanvas({ kind: "event", time: "18:00", title: "Lyn – Fredrikstad" });
		expect(canvas.width).toBe(1200);
		expect(canvas.height).toBe(630);
		// Background: the whole frame filled black before anything is drawn.
		expect(canvas.calls.rects[0]).toMatchObject({ x: 0, y: 0, w: 1200, h: 630, fill: "#000000" });
		const word = canvas.calls.text.find((t) => t.text === "SPORTIVISTA");
		const colon = canvas.calls.text.find((t) => t.text === ":");
		expect(word.fill).toBe("#FFFFFF"); // BRAND.md: wordmark in `label`…
		expect(colon.fill).toBe("#FFB000"); // …only the colon amber
		expect(colon.x).toBeGreaterThan(word.x); // zero-gap lockup, colon after the word
	});

	it("renders the event's own time, day, title and channel", () => {
		const { sandbox, canvas } = sandboxWithCanvas();
		sandbox.ssShareCardCanvas({
			kind: "event", time: "18:00", day: "lør 25. jul",
			title: "Lyn – Fredrikstad", channel: "NRK1",
		});
		const drawn = canvas.calls.text.map((t) => t.text);
		expect(drawn).toContain("18:00");
		expect(drawn).toContain("lør 25. jul");
		expect(drawn).toContain("Lyn – Fredrikstad");
		expect(drawn).toContain("NRK1");
		expect(drawn).toContain("sportivista.com");
	});

	it("shows the board's faint « – » for an unknown channel — never invents one", () => {
		const { sandbox, canvas } = sandboxWithCanvas();
		sandbox.ssShareCardCanvas({ kind: "event", time: "18:00", title: "Sjakk-NM" });
		const dash = canvas.calls.text.find((t) => t.text === "–");
		expect(dash).toBeTruthy();
		expect(dash.fill).toBe("rgba(255,255,255,0.3)"); // faint, like the row
	});

	it("brief cards carry no time and no channel", () => {
		const { sandbox, canvas } = sandboxWithCanvas();
		sandbox.ssShareCardCanvas({ kind: "brief", day: "lørdag 25. juli", title: "Rolig lørdag." });
		const drawn = canvas.calls.text.map((t) => t.text);
		expect(drawn).toContain("Rolig lørdag.");
		expect(drawn).not.toContain("–");
	});

	it("wraps and ellipsises a long title instead of overflowing", () => {
		const { sandbox } = sandboxWithCanvas();
		const ctx = { measureText: (s) => ({ width: String(s).length * 20 }) };
		const lines = sandbox.ssShareCardWrap(ctx, "en to tre fire fem seks sju atte ni ti", 200, 2);
		expect(lines.length).toBe(2);
		expect(lines[lines.length - 1].endsWith("…")).toBe(true);
		for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(200);
	});

	it("a short title needs no ellipsis", () => {
		const { sandbox } = sandboxWithCanvas();
		const ctx = { measureText: (s) => ({ width: String(s).length * 20 }) };
		expect(sandbox.ssShareCardWrap(ctx, "Lyn", 200, 2)).toEqual(["Lyn"]);
	});

	it("resolves a PNG blob without touching the network", async () => {
		const { sandbox } = sandboxWithCanvas();
		// The sandbox's fetch would resolve {ok:false}; the card must never call it.
		let fetched = false;
		sandbox.fetch = () => { fetched = true; return Promise.resolve({ ok: false }); };
		const blob = await sandbox.ssShareCardBlob({ kind: "event", time: "18:00", title: "x" });
		expect(blob).toBeTruthy();
		expect(fetched).toBe(false);
	});
});

describe("link-preview metadata (og: / twitter:)", () => {
	const html = Object.fromEntries(PAGES.map((p) => [p, fs.readFileSync(path.join(docs, p), "utf-8")]));

	it.each(PAGES)("%s declares a large-image card pointing at the static asset", (page) => {
		const src = html[page];
		expect(src).toMatch(/<meta property="og:type" content="website">/);
		expect(src).toMatch(/<meta property="og:title" content="[^"]+">/);
		expect(src).toMatch(/<meta property="og:description" content="[^"]+">/);
		expect(src).toMatch(/<meta property="og:url" content="https:\/\/sportivista\.com\/[^"]*">/);
		expect(src).toContain(`<meta property="og:image" content="${OG_IMAGE}">`);
		expect(src).toContain(`<meta name="twitter:image" content="${OG_IMAGE}">`);
		expect(src).toMatch(/<meta name="twitter:card" content="summary_large_image">/);
		// Alt text: the preview must be describable, not a mystery box.
		expect(src).toMatch(/<meta property="og:image:alt" content="[^"]+">/);
	});

	it.each(PAGES)("%s puts the tags in <head>, where a (JS-less) crawler sees them", (page) => {
		const src = html[page];
		const headEnd = src.indexOf("</head>");
		expect(headEnd).toBeGreaterThan(0);
		expect(src.indexOf('property="og:image"')).toBeLessThan(headEnd);
	});

	it("the referenced image is a checked-in local asset of the declared size", () => {
		const file = path.join(docs, "og", "og-default.png");
		expect(fs.existsSync(file)).toBe(true);
		const buf = fs.readFileSync(file);
		expect(buf.subarray(1, 4).toString()).toBe("PNG");
		// PNG IHDR: width/height are big-endian uint32 at bytes 16 and 20.
		expect(buf.readUInt32BE(16)).toBe(1200);
		expect(buf.readUInt32BE(20)).toBe(630);
		for (const page of PAGES) {
			expect(html[page]).toContain('<meta property="og:image:width" content="1200">');
			expect(html[page]).toContain('<meta property="og:image:height" content="630">');
		}
	});

	it("the service worker caches the card and the renderer", () => {
		const sw = fs.readFileSync(path.join(docs, "sw.js"), "utf-8");
		expect(sw).toContain("'/og/og-default.png'");
		expect(sw).toContain("'/js/share-card.js'");
	});

	it("share-card.js makes no external request of any kind", () => {
		const src = fs.readFileSync(path.join(docs, "js", "share-card.js"), "utf-8");
		const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
		expect(code).not.toMatch(/https?:\/\//);
		expect(code).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|importScripts/);
	});
});
