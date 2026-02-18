/**
 * DOM-based UX heuristic checks for dashboard evaluation.
 * Runs inside Playwright's page.evaluate() — all functions must be serializable.
 *
 * Each heuristic returns { score: 0-100, details: string, issues: [] }
 * Overall score = weighted average of all heuristics.
 */

/**
 * Returns serializable heuristic functions to run inside page.evaluate().
 * Called from evaluate-ux.js with the Playwright page object.
 */
export async function runUxHeuristics(page) {
	const results = await page.evaluate(() => {
		const issues = [];

		// Helper: get computed style properties
		function getStyle(el, prop) {
			return window.getComputedStyle(el).getPropertyValue(prop);
		}

		// Helper: parse color string to RGB
		function parseColor(colorStr) {
			const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
			if (!m) return null;
			return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
		}

		// Helper: relative luminance (WCAG)
		function luminance({ r, g, b }) {
			const [rs, gs, bs] = [r, g, b].map((c) => {
				c = c / 255;
				return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
			});
			return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
		}

		// Helper: contrast ratio between two colors
		function contrastRatio(c1, c2) {
			const l1 = luminance(c1);
			const l2 = luminance(c2);
			const lighter = Math.max(l1, l2);
			const darker = Math.min(l1, l2);
			return (lighter + 0.05) / (darker + 0.05);
		}

		// 1. Empty sections — key containers with no visible children
		function checkEmptySections() {
			const selectors = ["#the-brief", "#events", ".featured-section", ".sport-group"];
			let empty = 0;
			const sectionIssues = [];
			for (const sel of selectors) {
				const els = document.querySelectorAll(sel);
				for (const el of els) {
					const visible = el.offsetHeight > 0 && el.offsetWidth > 0;
					if (!visible) continue;
					const hasContent = el.textContent.trim().length > 0 || el.querySelectorAll("img, svg, canvas").length > 0;
					if (!hasContent) {
						empty++;
						sectionIssues.push({
							severity: "warning",
							code: "empty_section",
							selector: sel,
							message: `Empty visible section: ${sel}`,
						});
					}
				}
			}
			const score = Math.max(0, 100 - empty * 25);
			return { score, details: `${empty} empty section(s)`, issues: sectionIssues };
		}

		// 2. Broken images
		function checkBrokenImages() {
			const imgs = document.querySelectorAll("img");
			let broken = 0;
			const imgIssues = [];
			for (const img of imgs) {
				if (img.naturalWidth === 0 && img.complete) {
					broken++;
					imgIssues.push({
						severity: "warning",
						code: "broken_image",
						selector: img.src || img.className,
						message: `Broken image: ${img.src?.slice(0, 80) || "unknown src"}`,
					});
				}
			}
			const score = Math.max(0, 100 - broken * 20);
			return { score, details: `${broken} broken image(s)`, issues: imgIssues };
		}

		// 3. Content overflow — elements wider than their container
		function checkContentOverflow() {
			const wrap = document.querySelector(".wrap");
			if (!wrap) return { score: 100, details: "No .wrap container found", issues: [] };
			const wrapWidth = wrap.clientWidth;
			const children = wrap.querySelectorAll("*");
			let overflows = 0;
			const overflowIssues = [];
			for (const el of children) {
				if (el.scrollWidth > wrapWidth + 2) {
					overflows++;
					if (overflows <= 5) {
						overflowIssues.push({
							severity: "warning",
							code: "overflow",
							selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""),
							message: `Content overflows container (${el.scrollWidth}px > ${wrapWidth}px)`,
						});
					}
				}
			}
			const score = Math.max(0, 100 - overflows * 15);
			return { score, details: `${overflows} overflowing element(s)`, issues: overflowIssues };
		}

		// 4. Contrast ratio — sample visible text elements
		function checkContrastRatio() {
			const textEls = document.querySelectorAll("h1, h2, h3, p, span, a, div, li, td, th, button, label");
			let lowContrast = 0;
			const contrastIssues = [];
			const sampled = Array.from(textEls).filter((el) => {
				return el.offsetHeight > 0 && el.textContent.trim().length > 0 && el.children.length === 0;
			}).slice(0, 100); // sample at most 100 leaf text nodes

			for (const el of sampled) {
				const fg = parseColor(getStyle(el, "color"));
				const bg = parseColor(getStyle(el, "background-color"));
				if (!fg || !bg) continue;
				// Skip transparent backgrounds (alpha = 0)
				const bgAlpha = getStyle(el, "background-color").match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
				if (bgAlpha && parseFloat(bgAlpha[1]) < 0.1) continue;
				const ratio = contrastRatio(fg, bg);
				if (ratio < 4.5) {
					lowContrast++;
					if (lowContrast <= 3) {
						contrastIssues.push({
							severity: "info",
							code: "low_contrast",
							selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""),
							message: `Low contrast ratio ${ratio.toFixed(1)}:1 (WCAG AA requires 4.5:1)`,
						});
					}
				}
			}
			const score = Math.max(0, 100 - lowContrast * 10);
			return { score, details: `${lowContrast} low-contrast element(s)`, issues: contrastIssues };
		}

		// 5. Touch targets — clickable elements should be >= 44px
		function checkTouchTargets() {
			const clickable = document.querySelectorAll("a, button, [role='button'], input, select, [onclick]");
			let small = 0;
			const touchIssues = [];
			for (const el of clickable) {
				if (el.offsetHeight === 0 || el.offsetWidth === 0) continue; // hidden
				const rect = el.getBoundingClientRect();
				if (rect.width < 44 || rect.height < 44) {
					// Exclude very small decorative elements
					if (rect.width < 10 && rect.height < 10) continue;
					small++;
					if (small <= 3) {
						touchIssues.push({
							severity: "info",
							code: "small_touch_target",
							selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""),
							message: `Touch target too small: ${Math.round(rect.width)}x${Math.round(rect.height)}px (min 44x44)`,
						});
					}
				}
			}
			const score = Math.max(0, 100 - small * 10);
			return { score, details: `${small} small touch target(s)`, issues: touchIssues };
		}

		// 6. Load completeness — expected sections present
		function checkLoadCompleteness() {
			const expected = [
				{ selector: "#the-brief", name: "Editorial brief" },
				{ selector: "#events", name: "Events section" },
				{ selector: "#day-nav", name: "Day navigator" },
			];
			let missing = 0;
			const loadIssues = [];
			for (const { selector, name } of expected) {
				const el = document.querySelector(selector);
				if (!el || el.offsetHeight === 0) {
					missing++;
					loadIssues.push({
						severity: "warning",
						code: "missing_section",
						selector,
						message: `Expected section missing or hidden: ${name}`,
					});
				}
			}
			const score = Math.max(0, 100 - missing * 30);
			return { score, details: `${missing} missing section(s)`, issues: loadIssues };
		}

		// 7. Text readability — lines exceeding 60 chars at narrow width
		function checkTextReadability() {
			const textEls = document.querySelectorAll("p, .brief-line, .event-line, span, li");
			let longLines = 0;
			const readIssues = [];
			for (const el of textEls) {
				if (el.offsetHeight === 0) continue;
				const text = el.textContent.trim();
				if (text.length > 80 && el.children.length === 0) {
					longLines++;
					if (longLines <= 3) {
						readIssues.push({
							severity: "info",
							code: "long_text_line",
							selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""),
							message: `Text line has ${text.length} chars (may be dense at 480px)`,
						});
					}
				}
			}
			const capped = Math.min(longLines * 5, 20);
			const score = Math.max(0, 100 - capped);
			return { score, details: `${longLines} long text line(s)`, issues: readIssues };
		}

		// Run all heuristics
		const metrics = {
			emptySections: checkEmptySections(),
			brokenImages: checkBrokenImages(),
			contentOverflow: checkContentOverflow(),
			contrastRatio: checkContrastRatio(),
			touchTargets: checkTouchTargets(),
			loadCompleteness: checkLoadCompleteness(),
			textReadability: checkTextReadability(),
		};

		// Weighted average
		const weights = {
			loadCompleteness: 0.25,
			emptySections: 0.20,
			brokenImages: 0.15,
			contentOverflow: 0.15,
			contrastRatio: 0.10,
			touchTargets: 0.10,
			textReadability: 0.05,
		};

		let weightedSum = 0;
		const allIssues = [];
		for (const [key, metric] of Object.entries(metrics)) {
			weightedSum += metric.score * (weights[key] || 0);
			allIssues.push(...metric.issues);
		}
		const score = Math.round(weightedSum);

		return { score, metrics, issues: allIssues };
	});

	return results;
}

/**
 * Compute trend from history entries.
 * @param {Array} history - Array of { score, generatedAt } entries
 * @returns {"improving"|"declining"|"stable"|"insufficient"}
 */
export function computeTrend(history) {
	if (!Array.isArray(history) || history.length < 3) return "insufficient";
	const recent = history.slice(-3);
	const scores = recent.map((e) => e.score);
	const allRising = scores.every((s, i) => i === 0 || s > scores[i - 1]);
	const allFalling = scores.every((s, i) => i === 0 || s < scores[i - 1]);
	if (allRising) return "improving";
	if (allFalling) return "declining";
	return "stable";
}
