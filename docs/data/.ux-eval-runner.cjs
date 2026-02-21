
const { chromium } = require('playwright');

(async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({
		viewport: { width: 480, height: 900 },
		deviceScaleFactor: 2,
	});
	await page.goto("http://127.0.0.1:42989/", { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(3000);

	// Run DOM heuristics inline (page.evaluate needs serializable code)
	const results = await page.evaluate(() => {
		const issues = [];
		function getStyle(el, prop) { return window.getComputedStyle(el).getPropertyValue(prop); }
		function parseColor(s) { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? { r: +m[1], g: +m[2], b: +m[3] } : null; }
		function luminance({ r, g, b }) {
			const [rs, gs, bs] = [r, g, b].map(c => { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
			return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
		}
		function contrastRatio(c1, c2) { const l1 = luminance(c1); const l2 = luminance(c2); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

		function checkEmptySections() {
			const selectors = ["#the-brief", "#events", ".featured-section", ".sport-group"];
			let empty = 0; const si = [];
			for (const sel of selectors) {
				for (const el of document.querySelectorAll(sel)) {
					if (el.offsetHeight <= 0 || el.offsetWidth <= 0) continue;
					if (el.textContent.trim().length === 0 && el.querySelectorAll("img, svg, canvas").length === 0) {
						empty++; si.push({ severity: "warning", code: "empty_section", selector: sel, message: "Empty visible section: " + sel });
					}
				}
			}
			return { score: Math.max(0, 100 - empty * 25), details: empty + " empty section(s)", issues: si };
		}

		function checkBrokenImages() {
			let broken = 0; const bi = [];
			for (const img of document.querySelectorAll("img")) {
				if (img.naturalWidth === 0 && img.complete) {
					broken++; bi.push({ severity: "warning", code: "broken_image", selector: (img.src || "").slice(0, 80), message: "Broken image: " + (img.src || "").slice(0, 80) });
				}
			}
			return { score: Math.max(0, 100 - broken * 20), details: broken + " broken image(s)", issues: bi };
		}

		function checkContentOverflow() {
			const wrap = document.querySelector(".wrap");
			if (!wrap) return { score: 100, details: "No .wrap container", issues: [] };
			const ww = wrap.clientWidth; let ov = 0; const oi = [];
			for (const el of wrap.querySelectorAll("*")) {
				if (el.scrollWidth > ww + 2) {
					ov++;
					if (ov <= 5) oi.push({ severity: "warning", code: "overflow", selector: el.tagName.toLowerCase(), message: "Overflows container (" + el.scrollWidth + "px > " + ww + "px)" });
				}
			}
			return { score: Math.max(0, 100 - ov * 15), details: ov + " overflowing element(s)", issues: oi };
		}

		function checkContrastRatio() {
			const textEls = Array.from(document.querySelectorAll("h1,h2,h3,p,span,a,div,li,td,th,button,label"))
				.filter(el => el.offsetHeight > 0 && el.textContent.trim().length > 0 && el.children.length === 0).slice(0, 100);
			let lc = 0; const ci = [];
			for (const el of textEls) {
				const fg = parseColor(getStyle(el, "color")); const bg = parseColor(getStyle(el, "background-color"));
				if (!fg || !bg) continue;
				const bgA = getStyle(el, "background-color").match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
				if (bgA && parseFloat(bgA[1]) < 0.1) continue;
				if (contrastRatio(fg, bg) < 4.5) { lc++; if (lc <= 3) ci.push({ severity: "info", code: "low_contrast", selector: el.tagName.toLowerCase(), message: "Low contrast ratio" }); }
			}
			return { score: Math.max(0, 100 - lc * 10), details: lc + " low-contrast element(s)", issues: ci };
		}

		function checkTouchTargets() {
			let small = 0; const ti = [];
			for (const el of document.querySelectorAll("a,button,[role='button'],input,select,[onclick]")) {
				if (el.offsetHeight === 0 || el.offsetWidth === 0) continue;
				const r = el.getBoundingClientRect();
				if (r.width < 10 && r.height < 10) continue;
				if (r.width < 44 || r.height < 44) {
					small++; if (small <= 3) ti.push({ severity: "info", code: "small_touch_target", selector: el.tagName.toLowerCase(), message: Math.round(r.width) + "x" + Math.round(r.height) + "px" });
				}
			}
			return { score: Math.max(0, 100 - small * 10), details: small + " small touch target(s)", issues: ti };
		}

		function checkLoadCompleteness() {
			const expected = [
				{ selector: "#the-brief", name: "Editorial brief" },
				{ selector: "#events", name: "Events section" },
				{ selector: "#day-nav", name: "Day navigator" },
			];
			let missing = 0; const li = [];
			for (const { selector, name } of expected) {
				const el = document.querySelector(selector);
				if (!el || el.offsetHeight === 0) { missing++; li.push({ severity: "warning", code: "missing_section", selector, message: "Missing: " + name }); }
			}
			return { score: Math.max(0, 100 - missing * 30), details: missing + " missing section(s)", issues: li };
		}

		function checkTextReadability() {
			let long = 0; const ri = [];
			for (const el of document.querySelectorAll("p,.brief-line,.event-line,span,li")) {
				if (el.offsetHeight === 0 || el.children.length > 0) continue;
				if (el.textContent.trim().length > 80) {
					long++; if (long <= 3) ri.push({ severity: "info", code: "long_text_line", selector: el.tagName.toLowerCase(), message: el.textContent.trim().length + " chars" });
				}
			}
			return { score: Math.max(0, 100 - Math.min(long * 5, 20)), details: long + " long text line(s)", issues: ri };
		}

		const metrics = {
			emptySections: checkEmptySections(), brokenImages: checkBrokenImages(),
			contentOverflow: checkContentOverflow(), contrastRatio: checkContrastRatio(),
			touchTargets: checkTouchTargets(), loadCompleteness: checkLoadCompleteness(),
			textReadability: checkTextReadability(),
		};
		const weights = { loadCompleteness: 0.25, emptySections: 0.20, brokenImages: 0.15, contentOverflow: 0.15, contrastRatio: 0.10, touchTargets: 0.10, textReadability: 0.05 };
		let ws = 0; const allIssues = [];
		for (const [k, m] of Object.entries(metrics)) { ws += m.score * (weights[k] || 0); allIssues.push(...m.issues); }
		return { score: Math.round(ws), metrics, issues: allIssues };
	});

	

	await browser.close();
	console.log(JSON.stringify(results));
})();
