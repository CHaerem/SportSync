#!/usr/bin/env node
/**
 * SportSync Code Complexity Analyzer
 *
 * Scans JS files in scripts/ and docs/js/, measures complexity metrics,
 * and outputs a report that pipeline-health.js can surface to the autopilot.
 *
 * This closes the "code complexity" feedback loop (Loop 14):
 *   detect complexity → surface in health report → autopilot creates refactoring task → ship extraction
 *
 * Runs as part of the monitor phase in the pipeline manifest.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname, basename } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// ── Thresholds ──────────────────────────────────────────────────────────────

const THRESHOLDS = {
	fileSizeWarning: 500,    // lines — "getting large"
	fileSizeHigh: 800,       // lines — "should consider splitting"
	fileSizeCritical: 1200,  // lines — "needs refactoring"
	functionSizeWarning: 80, // lines per function
	functionSizeHigh: 150,   // lines per function
	maxNestingWarning: 4,    // brace depth
	maxFunctions: 30,        // functions in one file
};

// ── File Discovery ──────────────────────────────────────────────────────────

function findJsFiles(dirs) {
	const files = [];
	for (const dir of dirs) {
		const fullDir = join(ROOT, dir);
		if (!existsSync(fullDir)) continue;
		walkDir(fullDir, files, dir);
	}
	return files;
}

function walkDir(dir, out, relBase) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', 'archive', '.git'].includes(entry.name)) continue;
			walkDir(full, out, relBase);
		} else if (extname(entry.name) === '.js') {
			out.push(relative(ROOT, full));
		}
	}
}

// ── Analysis ────────────────────────────────────────────────────────────────

function analyzeFile(filePath) {
	const content = readFileSync(join(ROOT, filePath), 'utf-8');
	const lines = content.split('\n');
	const totalLines = lines.length;

	// Count non-blank, non-comment lines
	let codeLines = 0;
	let inBlockComment = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (inBlockComment) {
			if (trimmed.includes('*/')) inBlockComment = false;
			continue;
		}
		if (trimmed.startsWith('/*')) {
			inBlockComment = !trimmed.includes('*/');
			continue;
		}
		if (trimmed.startsWith('//') || trimmed === '') continue;
		codeLines++;
	}

	// Count functions (named functions, arrow functions, methods)
	const funcPatterns = [
		/^\s*(async\s+)?function\s+\w+/,              // function declarations
		/^\s*(const|let|var)\s+\w+\s*=\s*(async\s+)?(\(|[a-z])/,  // arrow functions
		/^\s*(async\s+)?\w+\s*\([^)]*\)\s*\{/,        // class methods
		/^\s*(get|set)\s+\w+\s*\(/,                    // getters/setters
	];
	let functionCount = 0;
	const functionSizes = [];
	let inFunction = false;
	let funcStart = 0;
	let braceCount = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!inFunction && funcPatterns.some(p => p.test(line))) {
			inFunction = true;
			funcStart = i;
			braceCount = 0;
		}
		if (inFunction) {
			for (const ch of line) {
				if (ch === '{') braceCount++;
				if (ch === '}') braceCount--;
			}
			if (braceCount <= 0 && i > funcStart) {
				functionCount++;
				functionSizes.push(i - funcStart + 1);
				inFunction = false;
			}
		}
	}

	// Measure max nesting depth
	let maxNesting = 0;
	let currentNesting = 0;
	for (const line of lines) {
		for (const ch of line) {
			if (ch === '{') { currentNesting++; maxNesting = Math.max(maxNesting, currentNesting); }
			if (ch === '}') currentNesting--;
		}
	}

	// Count conditionals
	const conditionals = lines.filter(l => /\b(if|else\s+if|switch|case)\b/.test(l)).length;

	// Count imports/requires
	const imports = lines.filter(l => /^\s*(import|const\s+\{.*\}\s*=\s*require)/.test(l)).length;

	// Count exports
	const exports = lines.filter(l => /^\s*(export|module\.exports|window\.\w+\s*=)/.test(l)).length;

	const avgFunctionSize = functionCount > 0 ? Math.round(functionSizes.reduce((a, b) => a + b, 0) / functionCount) : 0;
	const maxFunctionSize = functionSizes.length > 0 ? Math.max(...functionSizes) : 0;

	// Determine severity
	let severity = 'ok';
	if (totalLines >= THRESHOLDS.fileSizeCritical) severity = 'critical';
	else if (totalLines >= THRESHOLDS.fileSizeHigh) severity = 'high';
	else if (totalLines >= THRESHOLDS.fileSizeWarning) severity = 'warning';

	return {
		file: filePath,
		totalLines,
		codeLines,
		functionCount,
		avgFunctionSize,
		maxFunctionSize,
		maxNesting,
		conditionals,
		imports,
		exports,
		severity,
	};
}

// ── Recommendations ─────────────────────────────────────────────────────────

function generateRecommendations(analysis) {
	const recs = [];
	if (analysis.totalLines >= THRESHOLDS.fileSizeCritical) {
		recs.push(`File is ${analysis.totalLines} lines — extract 2-3 focused modules to reduce below ${THRESHOLDS.fileSizeHigh} lines`);
	} else if (analysis.totalLines >= THRESHOLDS.fileSizeHigh) {
		recs.push(`File is ${analysis.totalLines} lines — consider extracting the largest functions into a helper module`);
	}
	if (analysis.maxFunctionSize >= THRESHOLDS.functionSizeHigh) {
		recs.push(`Largest function is ${analysis.maxFunctionSize} lines — break into smaller composable functions`);
	}
	if (analysis.maxNesting >= THRESHOLDS.maxNestingWarning) {
		recs.push(`Max nesting depth is ${analysis.maxNesting} — flatten with early returns or extract helper functions`);
	}
	if (analysis.functionCount >= THRESHOLDS.maxFunctions) {
		recs.push(`File has ${analysis.functionCount} functions — group related functions into separate modules`);
	}
	return recs;
}

// ── Trend Detection ─────────────────────────────────────────────────────────

function loadPreviousReport() {
	const reportPath = join(ROOT, 'docs/data/code-complexity-report.json');
	try {
		return JSON.parse(readFileSync(reportPath, 'utf-8'));
	} catch {
		return null;
	}
}

function detectTrends(current, previous) {
	if (!previous?.files) return [];
	const trends = [];
	for (const file of current) {
		const prev = previous.files[file.file];
		if (!prev) continue;
		const growth = file.totalLines - prev.totalLines;
		if (growth >= 100) {
			trends.push({
				file: file.file,
				growth,
				previousSize: prev.totalLines,
				currentSize: file.totalLines,
				direction: 'growing',
			});
		} else if (growth <= -50) {
			trends.push({
				file: file.file,
				growth,
				previousSize: prev.totalLines,
				currentSize: file.totalLines,
				direction: 'shrinking',
			});
		}
	}
	return trends;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
	const scanDirs = ['scripts', 'scripts/lib', 'scripts/fetch', 'scripts/agents', 'docs/js'];
	const files = findJsFiles(scanDirs);

	console.log(`Analyzing ${files.length} JS files...`);

	const analyses = files.map(f => {
		const analysis = analyzeFile(f);
		analysis.recommendations = generateRecommendations(analysis);
		return analysis;
	});

	// Sort by severity then line count
	const severityOrder = { critical: 0, high: 1, warning: 2, ok: 3 };
	analyses.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.totalLines - a.totalLines);

	// Load previous report for trend detection
	const previous = loadPreviousReport();
	const trends = detectTrends(analyses, previous);

	// Build summary
	const critical = analyses.filter(a => a.severity === 'critical');
	const high = analyses.filter(a => a.severity === 'high');
	const warning = analyses.filter(a => a.severity === 'warning');
	const totalCodeLines = analyses.reduce((s, a) => s + a.codeLines, 0);
	const avgFileSize = Math.round(totalCodeLines / analyses.length);

	const report = {
		generatedAt: new Date().toISOString(),
		summary: {
			totalFiles: analyses.length,
			totalCodeLines,
			avgFileSize,
			critical: critical.length,
			high: high.length,
			warning: warning.length,
			ok: analyses.length - critical.length - high.length - warning.length,
			largestFiles: analyses.slice(0, 10).map(a => ({
				file: a.file,
				lines: a.totalLines,
				functions: a.functionCount,
				severity: a.severity,
			})),
			trends: trends.length > 0 ? trends : undefined,
		},
		thresholds: THRESHOLDS,
		files: Object.fromEntries(analyses.map(a => [a.file, {
			totalLines: a.totalLines,
			codeLines: a.codeLines,
			functionCount: a.functionCount,
			avgFunctionSize: a.avgFunctionSize,
			maxFunctionSize: a.maxFunctionSize,
			maxNesting: a.maxNesting,
			conditionals: a.conditionals,
			imports: a.imports,
			exports: a.exports,
			severity: a.severity,
			recommendations: a.recommendations.length > 0 ? a.recommendations : undefined,
		}])),
	};

	const outPath = join(ROOT, 'docs/data/code-complexity-report.json');
	writeFileSync(outPath, JSON.stringify(report, null, 2));

	// Console summary
	console.log(`\nCode Complexity Report:`);
	console.log(`  Files: ${analyses.length} (${totalCodeLines} code lines)`);
	if (critical.length) console.log(`  🔴 Critical (>${THRESHOLDS.fileSizeCritical} lines): ${critical.map(a => basename(a.file)).join(', ')}`);
	if (high.length) console.log(`  🟠 High (>${THRESHOLDS.fileSizeHigh} lines): ${high.map(a => basename(a.file)).join(', ')}`);
	if (warning.length) console.log(`  🟡 Warning (>${THRESHOLDS.fileSizeWarning} lines): ${warning.map(a => basename(a.file)).join(', ')}`);
	if (trends.length) {
		for (const t of trends) {
			const dir = t.direction === 'growing' ? '📈' : '📉';
			console.log(`  ${dir} ${t.file}: ${t.previousSize} → ${t.currentSize} (${t.growth > 0 ? '+' : ''}${t.growth} lines)`);
		}
	}
	console.log(`  Report: ${outPath}`);
}

main();
