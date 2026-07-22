// WP-180 — kolon-live-signalet på web (paritet med iOS' `MastheadColon`, WP-152).
//
// The masthead's amber «:» is the app's LIVE signature: it breathes when something
// you follow is on RIGHT NOW. This test pins the two things that make it correct
// rather than merely pretty:
//   (a) the STATE comes from the shared live definition (`ssLiveState` via
//       `directLiveEvents`) — the exact pass that builds the «Direkte nå» line, so
//       the colon and the line can never disagree;
//   (b) the a11y label mirrors iOS' `mastheadLabel` («Sportivista — sender nå, N direkte»).
// Plus the CSS contract the motion itself lives in: the ~1,6 s autoreversing breath,
// opacity/glow only (no layout shift), and the BINDING `prefers-reduced-motion`
// off-switch (DESIGN.md § Bevegelse — Reduce Motion ⇒ no motion, static glow).
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

const layoutCss = fs.readFileSync(path.resolve(process.cwd(), "docs", "css", "layout.css"), "utf-8");

/** A fake masthead lockup: the colon's class list + the lockup's aria-label. */
function fakeLockup() {
	const classes = new Set();
	const colon = {
		classList: {
			toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
			contains: (name) => classes.has(name),
		},
	};
	const attrs = {};
	return {
		querySelector: () => colon,
		setAttribute: (k, v) => (attrs[k] = v),
		get label() { return attrs["aria-label"]; },
		get isLive() { return classes.has("is-live"); },
	};
}

function boot({ search = "", withLockup = true } = {}) {
	const sandbox = createClientSandbox();
	sandbox.location = { search };
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "dashboard.js");
	loadClientScript(sandbox, "live.js");
	loadClientScript(sandbox, "chrome.js");
	const lockup = fakeLockup();
	sandbox.document.getElementById = (id) => (withLockup && id === "masthead-lockup" ? lockup : null);
	return { dash: sandbox.window.dashboard, lockup };
}

const NOW = Date.UTC(2026, 6, 22, 17, 0, 0);
const liveEvent = (title) => ({ id: title, sport: "football", title, time: new Date(NOW - 3600e3).toISOString(), endTime: new Date(NOW + 3600e3).toISOString(), status: "in" });
const laterEvent = { id: "later", sport: "football", title: "Senere", time: new Date(NOW + 6 * 3600e3).toISOString() };

describe("WP-180 — masthead colon live state (web parity with iOS MastheadColon)", () => {
	let ctx;
	beforeEach(() => { ctx = boot(); });

	it("rests as the plain amber colon when nothing followed is live", () => {
		ctx.dash.allEvents = [laterEvent];
		ctx.dash.renderMastheadLive(NOW);
		expect(ctx.lockup.isLive).toBe(false);
		expect(ctx.lockup.label).toBe("Sportivista");
	});

	it("goes live off the SAME source as «Direkte nå» (ssLiveState / directLiveEvents)", () => {
		ctx.dash.allEvents = [liveEvent("Lyn – Sogndal"), laterEvent];
		// The line's own source says one event is live…
		expect(ctx.dash.directLiveEvents(NOW)).toHaveLength(1);
		// …and the colon agrees, because it reads that very pass.
		ctx.dash.renderMastheadLive(NOW);
		expect(ctx.lockup.isLive).toBe(true);
		expect(ctx.lockup.label).toBe("Sportivista — sender nå");
	});

	it("counts in the label when more than one is on (iOS mastheadLabel parity)", () => {
		ctx.dash.allEvents = [liveEvent("Lyn – Sogndal"), liveEvent("Brann – Molde")];
		ctx.dash.renderMastheadLive(NOW);
		expect(ctx.lockup.label).toBe("Sportivista — sender nå, 2 direkte");
	});

	it("drops back to rest when the live event ends", () => {
		ctx.dash.allEvents = [liveEvent("Lyn – Sogndal")];
		ctx.dash.renderMastheadLive(NOW);
		expect(ctx.lockup.isLive).toBe(true);
		ctx.dash.allEvents = [laterEvent];
		ctx.dash.renderMastheadLive(NOW);
		expect(ctx.lockup.isLive).toBe(false);
		expect(ctx.lockup.label).toBe("Sportivista");
	});

	it("?demo=masthead-live / masthead-neutral force the state deterministically", () => {
		const live = boot({ search: "?demo=masthead-live" });
		live.dash.allEvents = []; // nothing live in the data at all
		live.dash.renderMastheadLive(NOW);
		expect(live.lockup.isLive).toBe(true);

		const neutral = boot({ search: "?demo=masthead-neutral" });
		neutral.dash.allEvents = [liveEvent("Lyn – Sogndal")]; // …and something IS live
		neutral.dash.renderMastheadLive(NOW);
		expect(neutral.lockup.isLive).toBe(false);
	});

	it("is a no-op on pages without the masthead lockup (rediger/activity)", () => {
		// Those pages render the wordmark lockup but carry no #masthead-lockup id,
		// so getElementById returns null — the colon signal simply stays out of the way.
		const noLockup = boot({ withLockup: false });
		noLockup.dash.allEvents = [liveEvent("Lyn – Sogndal")];
		expect(() => noLockup.dash.renderMastheadLive(NOW)).not.toThrow();
		expect(noLockup.lockup.isLive).toBe(false);
	});
});

describe("WP-180 — the motion contract lives in CSS (DESIGN.md § Bevegelse)", () => {
	it("breathes for ~1.6s, ease-in-out, autoreversing, forever — the iOS cadence", () => {
		const rule = layoutCss.match(/\.wordmark-colon\.is-live\s*\{[^}]*\}/)[0];
		expect(rule).toMatch(/animation:\s*kolon-pust\s+1\.6s\s+ease-in-out\s+infinite\s+alternate/);
	});

	it("animates ONLY opacity + glow — never geometry (no layout shift)", () => {
		const frames = layoutCss.match(/@keyframes kolon-pust\s*\{[\s\S]*?\n\}/)[0];
		const props = [...frames.matchAll(/^\s*(?:from|to)\s*\{([^}]*)\}/gm)]
			.flatMap((m) => m[1].split(";").map((d) => d.split(":")[0].trim()).filter(Boolean));
		expect(props.length).toBeGreaterThan(0);
		for (const p of props) expect(["opacity", "text-shadow"]).toContain(p);
	});

	it("Reduce Motion is BINDING: no animation, a static amber glow instead", () => {
		const block = layoutCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.wordmark-colon\.is-live\s*\{[^}]*\}/)[0];
		expect(block).toMatch(/animation:\s*none/);
		expect(block).toMatch(/opacity:\s*1/);
		expect(block).toMatch(/text-shadow:[^;]*var\(--accent\)/);
	});

	it("the glow is the ONE accent (amber token), never a new colour", () => {
		const scope = layoutCss.slice(layoutCss.indexOf(".wordmark-colon.is-live"));
		const shadows = [...scope.matchAll(/text-shadow:([^;]*);/g)].map((m) => m[1]);
		expect(shadows.length).toBeGreaterThanOrEqual(3);
		for (const s of shadows) expect(s).toMatch(/var\(--accent\)/);
	});
});
