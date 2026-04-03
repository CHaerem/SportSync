import { describe, it, expect } from "vitest";
import { parseRoadmap, extractTasks, summarizeTask, archiveRoadmap, extractTaskDate } from "../scripts/archive-roadmap.js";

describe("extractTaskDate", () => {
	it("extracts ISO date from task line", () => {
		const date = extractTaskDate("- [DONE] Fix something — 2026-03-15");
		expect(date).toBeInstanceOf(Date);
		expect(date.toISOString()).toContain("2026-03-15");
	});

	it("returns null for lines with no date", () => {
		expect(extractTaskDate("- [PENDING] Do something")).toBeNull();
	});
});

describe("parseRoadmap", () => {
	it("separates header, tasks, and lessons", () => {
		const content = `# Autopilot Roadmap

Some intro text.

## Pending Tasks

- [DONE] Task 1 — 2026-01-15
- [PENDING] Task 2

---

## Lessons & Effectiveness

Some lessons here.`;

		const { header, taskSection, lessons } = parseRoadmap(content);
		expect(header).toContain("Some intro text");
		expect(taskSection).toContain("[DONE] Task 1");
		expect(taskSection).toContain("[PENDING] Task 2");
		expect(lessons).toContain("Some lessons here");
	});
});

describe("extractTasks", () => {
	it("extracts DONE, PENDING, and BLOCKED tasks", () => {
		const section = `## Pending Tasks

- [DONE] Task A — 2026-01-15
- [PENDING] Task B
- [BLOCKED] Task C — waiting for API`;

		const tasks = extractTasks(section);
		expect(tasks).toHaveLength(3);
		expect(tasks[0].status).toBe("DONE");
		expect(tasks[1].status).toBe("PENDING");
		expect(tasks[2].status).toBe("BLOCKED");
	});
});

describe("summarizeTask", () => {
	it("extracts bold title and PR number", () => {
		const task = {
			status: "DONE",
			raw: "- [DONE] [MAINTENANCE] **Fix the bug** — Something something. PR #142. Run 31.",
			lines: ["- [DONE] [MAINTENANCE] **Fix the bug** — Something something. PR #142. Run 31."],
		};
		const summary = summarizeTask(task);
		expect(summary).toContain("Fix the bug");
		expect(summary).toContain("PR #142");
		expect(summary).toContain("Run 31");
	});
});

describe("archiveRoadmap", () => {
	it("archives DONE tasks older than retention period", () => {
		const now = new Date("2026-04-03T12:00:00Z");
		const content = `# Autopilot Roadmap

## Pending Tasks

- [DONE] **Old task** — 2026-02-01
- [DONE] **Recent task** — 2026-03-25
- [PENDING] **Future task**

---

## Lessons & Effectiveness

Some lessons.`;

		const { roadmap, archive, archived } = archiveRoadmap(content, now);
		expect(archived).toBe(1);
		expect(roadmap).toContain("[PENDING] **Future task**");
		expect(roadmap).toContain("Recent task");
		expect(roadmap).not.toContain("[DONE] **Old task** — 2026-02-01");
		expect(archive).toContain("Old task");
		expect(roadmap).toContain("Lessons & Effectiveness");
	});

	it("preserves all PENDING and BLOCKED tasks", () => {
		const now = new Date("2026-04-03T12:00:00Z");
		const content = `# Roadmap

## Tasks

- [PENDING] Task A
- [BLOCKED] Task B — reason
- [DONE] **Old done** — 2026-01-01

---

## Lessons & Effectiveness

X`;

		const { roadmap, archived } = archiveRoadmap(content, now);
		expect(archived).toBe(1);
		expect(roadmap).toContain("[PENDING] Task A");
		expect(roadmap).toContain("[BLOCKED] Task B");
	});

	it("returns unchanged when nothing to archive", () => {
		const now = new Date("2026-04-03T12:00:00Z");
		const content = `# Roadmap

## Tasks

- [DONE] **Recent** — 2026-03-25
- [PENDING] Task A

---

## Lessons & Effectiveness

X`;

		const { roadmap, archived } = archiveRoadmap(content, now);
		expect(archived).toBe(0);
		expect(roadmap).toBe(content);
	});
});
