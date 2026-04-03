#!/usr/bin/env node
/**
 * Archive Roadmap — Context Compaction for Autopilot
 *
 * Inspired by Claude Code's autoDream consolidation pattern:
 * keep the working queue lean, archive completed work.
 *
 * Moves [DONE] tasks older than RETENTION_DAYS to AUTOPILOT_ARCHIVE.md,
 * keeping only PENDING, BLOCKED, and recent DONE in the active roadmap.
 * Preserves header, principles, scouting heuristics, and lessons sections.
 *
 * Closes the loop: pipeline-health.js monitors roadmap size.
 */

import fs from "fs";
import path from "path";

const RETENTION_DAYS = 30;
const RECENTLY_COMPLETED_MAX = 10;

const rootDir = process.cwd();
const roadmapPath = path.join(rootDir, "AUTOPILOT_ROADMAP.md");
const archivePath = path.join(rootDir, "AUTOPILOT_ARCHIVE.md");

/**
 * Extract a date from a DONE task line.
 * Looks for patterns like "Run 31", "PR #142", or date strings.
 * Falls back to matching run numbers against known run dates.
 */
export function extractTaskDate(line, runDateMap = {}) {
	// Try to find "Run N" and map to date
	const runMatch = line.match(/Run\s+(\d+)/i);
	if (runMatch && runDateMap[runMatch[1]]) {
		return new Date(runDateMap[runMatch[1]]);
	}

	// Try ISO date pattern
	const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
	if (dateMatch) return new Date(dateMatch[1]);

	// Try "YYYY-MM-DD" in parentheses or after dash
	const monthMatch = line.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}/i);
	if (monthMatch) {
		const parsed = new Date(monthMatch[0] + ", 2026");
		if (!isNaN(parsed.getTime())) return parsed;
	}

	return null;
}

/**
 * Parse the roadmap into structural sections.
 */
export function parseRoadmap(content) {
	const lines = content.split("\n");

	// Find key section boundaries
	let headerEnd = -1;
	let lessonsStart = -1;

	for (let i = 0; i < lines.length; i++) {
		// The header ends when task lines begin (first [DONE], [PENDING], or [BLOCKED])
		if (headerEnd === -1 && /^\s*-\s*\[(DONE|PENDING|BLOCKED)\]/i.test(lines[i])) {
			// Walk back to find the section header
			let j = i - 1;
			while (j >= 0 && lines[j].trim() === "") j--;
			if (j >= 0 && /^##\s/.test(lines[j])) {
				headerEnd = j;
			} else {
				headerEnd = i;
			}
		}

		if (/^## Lessons & Effectiveness/i.test(lines[i])) {
			lessonsStart = i;
		}
	}

	if (headerEnd === -1) headerEnd = 0;
	if (lessonsStart === -1) lessonsStart = lines.length;

	const header = lines.slice(0, headerEnd).join("\n");
	const taskSection = lines.slice(headerEnd, lessonsStart).join("\n");
	const lessons = lines.slice(lessonsStart).join("\n");

	return { header, taskSection, lessons };
}

/**
 * Extract individual task entries from the task section.
 * A task is a line starting with "- [STATUS]".
 * Multi-line tasks include continuation lines.
 */
export function extractTasks(taskSection) {
	const lines = taskSection.split("\n");
	const tasks = [];
	let currentTask = null;

	for (const line of lines) {
		const taskMatch = line.match(/^\s*-\s*\[(DONE|PENDING|BLOCKED)\]/i);
		if (taskMatch) {
			if (currentTask) tasks.push(currentTask);
			currentTask = {
				status: taskMatch[1].toUpperCase(),
				lines: [line],
				raw: line,
			};
		} else if (currentTask && line.trim() !== "" && !line.startsWith("#")) {
			// Continuation of current task (indented content)
			if (/^\s{2,}/.test(line)) {
				currentTask.lines.push(line);
			} else {
				// Non-task line (section header, separator, etc.)
				if (currentTask) tasks.push(currentTask);
				currentTask = null;
			}
		} else if (currentTask && line.trim() === "") {
			// Blank line might separate task groups
			tasks.push(currentTask);
			currentTask = null;
		}
	}
	if (currentTask) tasks.push(currentTask);

	return tasks;
}

/**
 * Build a one-line summary for a DONE task (for the "Recently Completed" section).
 */
export function summarizeTask(task) {
	const line = task.raw;
	// Extract the bold title
	const titleMatch = line.match(/\*\*([^*]+)\*\*/);
	const title = titleMatch ? titleMatch[1] : line.slice(0, 80);

	// Extract PR number if present
	const prMatch = line.match(/PR\s*#(\d+)/);
	const pr = prMatch ? ` (PR #${prMatch[1]})` : "";

	// Extract run number
	const runMatch = line.match(/Run\s+(\d+)/i);
	const run = runMatch ? ` — Run ${runMatch[1]}` : "";

	return `- ${title}${pr}${run}`;
}

/**
 * Archive old DONE tasks, keeping the roadmap lean.
 */
export function archiveRoadmap(content, now = new Date(), existingArchive = "") {
	const { header, taskSection, lessons } = parseRoadmap(content);
	const tasks = extractTasks(taskSection);

	const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

	const keep = [];
	const archive = [];

	for (const task of tasks) {
		if (task.status !== "DONE") {
			keep.push(task);
			continue;
		}

		const date = extractTaskDate(task.raw);
		if (date && date < cutoff) {
			archive.push(task);
		} else {
			// No date or recent — keep
			keep.push(task);
		}
	}

	if (archive.length === 0) {
		return { roadmap: content, archive: existingArchive, archived: 0 };
	}

	// Build new roadmap
	const recentlyCompleted = archive
		.slice(-RECENTLY_COMPLETED_MAX)
		.map(summarizeTask);

	let newRoadmap = header + "\n";
	newRoadmap += "## Pending Tasks\n\n";

	// Add PENDING and BLOCKED first
	const pending = keep.filter(t => t.status === "PENDING" || t.status === "BLOCKED");
	const recentDone = keep.filter(t => t.status === "DONE");

	for (const task of pending) {
		newRoadmap += task.lines.join("\n") + "\n";
	}

	if (recentDone.length > 0) {
		newRoadmap += "\n### Recently Completed\n\n";
		for (const task of recentDone) {
			newRoadmap += task.lines.join("\n") + "\n";
		}
	}

	if (recentlyCompleted.length > 0) {
		newRoadmap += "\n### Archived (last " + recentlyCompleted.length + " of " + archive.length + " total)\n\n";
		for (const summary of recentlyCompleted) {
			newRoadmap += summary + "\n";
		}
	}

	newRoadmap += "\n---\n\n";
	newRoadmap += lessons;

	// Build archive file
	let archiveContent = existingArchive;
	if (!archiveContent) {
		archiveContent = "# Autopilot Archive\n\n";
		archiveContent += "Completed tasks archived from AUTOPILOT_ROADMAP.md for historical reference.\n";
		archiveContent += "This file is never loaded by the autopilot — it exists only for human review.\n\n";
	}

	const dateStr = now.toISOString().split("T")[0];
	archiveContent += `\n## Archived ${dateStr} (${archive.length} tasks)\n\n`;
	for (const task of archive) {
		archiveContent += task.lines.join("\n") + "\n";
	}

	return {
		roadmap: newRoadmap,
		archive: archiveContent,
		archived: archive.length,
	};
}

// --- Main ---
async function main() {
	if (!fs.existsSync(roadmapPath)) {
		console.log("No roadmap found at", roadmapPath);
		process.exit(0);
	}

	const content = fs.readFileSync(roadmapPath, "utf-8");
	const existingArchive = fs.existsSync(archivePath)
		? fs.readFileSync(archivePath, "utf-8")
		: "";

	const { roadmap, archive, archived } = archiveRoadmap(content, new Date(), existingArchive);

	if (archived === 0) {
		console.log("No tasks to archive (all within retention window).");
		return;
	}

	fs.writeFileSync(roadmapPath, roadmap, "utf-8");
	fs.writeFileSync(archivePath, archive, "utf-8");

	const oldSize = Buffer.byteLength(content);
	const newSize = Buffer.byteLength(roadmap);
	const savings = Math.round((1 - newSize / oldSize) * 100);

	console.log(`Archived ${archived} DONE tasks.`);
	console.log(`Roadmap: ${oldSize} → ${newSize} bytes (${savings}% reduction)`);
	console.log(`Archive: ${archivePath}`);
}

main().catch(console.error);
