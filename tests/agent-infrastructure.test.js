import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { parsePendingTasks, routeTask, routeDescription, routeAllTasks, generateTaskAssignments } from "../scripts/agents/task-router.js";

const FIXTURES_DIR = path.join(os.tmpdir(), "sportsync-agent-test-" + Date.now());

beforeEach(() => {
	fs.mkdirSync(FIXTURES_DIR, { recursive: true });
});

afterEach(() => {
	fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

function writeRoadmap(content) {
	const p = path.join(FIXTURES_DIR, "ROADMAP.md");
	fs.writeFileSync(p, content);
	return p;
}

// ─── Agent Definitions Validation ────────────────────────────────

describe("agent-definitions.json", () => {
	const defsPath = path.join(process.cwd(), "scripts/agents/agent-definitions.json");
	const defs = JSON.parse(fs.readFileSync(defsPath, "utf-8"));

	it("has all 5 agents defined", () => {
		const agents = Object.keys(defs.agents);
		expect(agents).toContain("data");
		expect(agents).toContain("content");
		expect(agents).toContain("code");
		expect(agents).toContain("ux");
		expect(agents).toContain("orchestrator");
		expect(agents.length).toBe(5);
	});

	it("each agent has required fields", () => {
		for (const [name, agent] of Object.entries(defs.agents)) {
			expect(agent.name, `${name} missing name`).toBeTruthy();
			expect(agent.mission, `${name} missing mission`).toBeTruthy();
			expect(Array.isArray(agent.responsibilities), `${name} responsibilities not array`).toBe(true);
			expect(agent.responsibilities.length, `${name} has no responsibilities`).toBeGreaterThan(0);
			expect(Array.isArray(agent.ownedPipelinePhases), `${name} ownedPipelinePhases not array`).toBe(true);
			expect(Array.isArray(agent.inputs), `${name} inputs not array`).toBe(true);
			expect(Array.isArray(agent.outputs), `${name} outputs not array`).toBe(true);
			expect(Array.isArray(agent.ownedFiles), `${name} ownedFiles not array`).toBe(true);
			expect(agent.memoryFile, `${name} missing memoryFile`).toBeTruthy();
			expect(Array.isArray(agent.scoutingHeuristics), `${name} scoutingHeuristics not array`).toBe(true);
			expect(Array.isArray(agent.qualityMetrics), `${name} qualityMetrics not array`).toBe(true);
			expect(agent.branchPrefix, `${name} missing branchPrefix`).toBeTruthy();
		}
	});

	it("branch prefixes are unique", () => {
		const prefixes = Object.values(defs.agents).map(a => a.branchPrefix);
		expect(new Set(prefixes).size).toBe(prefixes.length);
	});

	it("scouting heuristics don't overlap between agents", () => {
		const allHeuristics = [];
		for (const agent of Object.values(defs.agents)) {
			allHeuristics.push(...agent.scoutingHeuristics);
		}
		// B is shared between content and ux (content side / render side) — that's intentional
		const withoutB = allHeuristics.filter(h => h !== "B");
		expect(new Set(withoutB).size).toBe(withoutB.length);
	});

	it("contention rules have valid agent references", () => {
		const agentNames = Object.keys(defs.agents);
		for (const rule of defs.contention.rules) {
			for (const owner of rule.owner) {
				expect(agentNames).toContain(owner);
			}
		}
	});

	it("coordination execution order references valid agents", () => {
		const agentNames = Object.keys(defs.agents);
		for (const phase of defs.coordination.executionOrder) {
			if (phase.agent) {
				expect(agentNames).toContain(phase.agent);
			}
			if (phase.agents) {
				for (const a of phase.agents) {
					expect(agentNames).toContain(a);
				}
			}
		}
	});
});

// ─── Task Router: Parsing ─────────────────────────────────────────

describe("parsePendingTasks", () => {
	it("extracts PENDING tasks from roadmap", () => {
		const roadmap = writeRoadmap(`# Roadmap
## Priority Tasks
- [PENDING] Fix ESPN golf API empty competitor handling
- [DONE] (PR #42) Add tests for streaming
- [PENDING] [FEATURE] Add dark mode support
- [BLOCKED] waiting on upstream fix
`);
		const tasks = parsePendingTasks(roadmap);
		expect(tasks.length).toBe(2);
		expect(tasks[0].description).toBe("Fix ESPN golf API empty competitor handling");
		expect(tasks[0].tier).toBe("MAINTENANCE");
		expect(tasks[1].description).toBe("Add dark mode support");
		expect(tasks[1].tier).toBe("FEATURE");
	});

	it("handles EXPLORE tier", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] [EXPLORE] Investigate handball data sources
`);
		const tasks = parsePendingTasks(roadmap);
		expect(tasks.length).toBe(1);
		expect(tasks[0].tier).toBe("EXPLORE");
	});

	it("defaults to MAINTENANCE when no tier specified", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] Fix broken test
`);
		const tasks = parsePendingTasks(roadmap);
		expect(tasks[0].tier).toBe("MAINTENANCE");
	});

	it("returns empty array for roadmap with no pending tasks", () => {
		const roadmap = writeRoadmap(`## Tasks
- [DONE] Everything is done
`);
		const tasks = parsePendingTasks(roadmap);
		expect(tasks.length).toBe(0);
	});

	it("tracks section context", () => {
		const roadmap = writeRoadmap(`## Data Quality
- [PENDING] Fix stale football data
## UX Improvements
- [PENDING] Improve mobile layout
`);
		const tasks = parsePendingTasks(roadmap);
		expect(tasks[0].section).toBe("Data Quality");
		expect(tasks[1].section).toBe("UX Improvements");
	});

	it("handles asterisk bullet points", () => {
		const roadmap = writeRoadmap(`## Tasks
* [PENDING] Task with asterisk bullet
`);
		const tasks = parsePendingTasks(roadmap);
		expect(tasks.length).toBe(1);
		expect(tasks[0].description).toBe("Task with asterisk bullet");
	});
});

// ─── Task Router: Routing ─────────────────────────────────────────

describe("routeTask", () => {
	it("routes fetcher tasks to data agent", () => {
		const result = routeTask({ description: "Fix ESPN golf API empty competitor handling", section: "" });
		expect(result.agent).toBe("data");
		expect(result.score).toBeGreaterThan(0);
	});

	it("routes editorial tasks to content agent", () => {
		const result = routeTask({ description: "Improve featured content quality", section: "" });
		expect(result.agent).toBe("content");
	});

	it("routes test tasks to code agent", () => {
		const result = routeTask({ description: "Add tests for pipeline health module", section: "" });
		expect(result.agent).toBe("code");
	});

	it("routes dashboard tasks to ux agent", () => {
		const result = routeTask({ description: "Improve dashboard layout for mobile", section: "" });
		expect(result.agent).toBe("ux");
	});

	it("routes CSS tasks to ux agent", () => {
		const result = routeTask({ description: "Fix CSS alignment in event cards", section: "" });
		expect(result.agent).toBe("ux");
	});

	it("routes enrichment tasks to content agent", () => {
		const result = routeTask({ description: "Improve enrichment importance scoring", section: "" });
		expect(result.agent).toBe("content");
	});

	it("routes streaming tasks to data agent", () => {
		const result = routeTask({ description: "Fix tvkampen streaming matcher", section: "" });
		expect(result.agent).toBe("data");
	});

	it("routes refactoring tasks to code agent", () => {
		const result = routeTask({ description: "Refactor helpers.js time utilities", section: "" });
		expect(result.agent).toBe("code");
	});

	it("routes preference evolution to orchestrator", () => {
		const result = routeTask({ description: "Fix preference evolution weight calculation", section: "" });
		expect(result.agent).toBe("orchestrator");
	});

	it("uses section context for better routing", () => {
		const result = routeTask({ description: "Fix bug in processing", section: "Dashboard UX" });
		expect(result.agent).toBe("ux");
	});

	it("defaults to code agent for ambiguous tasks", () => {
		const result = routeTask({ description: "Something vague", section: "" });
		expect(result.agent).toBe("code"); // fallback
		expect(result.confidence).toBe("default");
	});

	it("reports high confidence for clear matches", () => {
		const result = routeTask({ description: "Fix ESPN football fetcher API parsing", section: "" });
		expect(result.confidence).not.toBe("default");
	});
});

describe("routeDescription", () => {
	it("routes plain string descriptions", () => {
		expect(routeDescription("Fix broken fetcher").agent).toBe("data");
		expect(routeDescription("Fix dashboard visual layout").agent).toBe("ux");
		expect(routeDescription("Improve watch plan scoring").agent).toBe("content");
	});
});

// ─── Task Router: Full Routing ─────────────────────────────────────

describe("routeAllTasks", () => {
	it("routes all pending tasks with metadata", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] Fix ESPN golf API empty competitor handling
- [PENDING] [FEATURE] Improve dashboard card layout
- [PENDING] Add tests for streaming matcher
- [PENDING] Improve editorial brief quality
`);
		const result = routeAllTasks(roadmap);
		expect(result.taskCount).toBe(4);
		expect(result.tasks.length).toBe(4);
		expect(result.routedAt).toBeTruthy();

		// Check agents are assigned
		const agents = result.tasks.map(t => t.agent);
		expect(agents).toContain("data");
		expect(agents).toContain("ux");
	});

	it("preserves tier information", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] [FEATURE] Big new feature
- [PENDING] Small maintenance fix
`);
		const result = routeAllTasks(roadmap);
		expect(result.tasks[0].tier).toBe("FEATURE");
		expect(result.tasks[1].tier).toBe("MAINTENANCE");
	});
});

// ─── Task Assignments ─────────────────────────────────────────────

describe("generateTaskAssignments", () => {
	it("generates per-agent assignment files", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] Fix ESPN API parsing
- [PENDING] Improve featured quality
- [PENDING] Add missing tests
- [PENDING] Fix dashboard layout
`);
		const assignments = generateTaskAssignments(roadmap);

		expect(assignments).toHaveProperty("data");
		expect(assignments).toHaveProperty("content");
		expect(assignments).toHaveProperty("code");
		expect(assignments).toHaveProperty("ux");
		// Orchestrator doesn't get regular task assignments
		expect(assignments).not.toHaveProperty("orchestrator");
	});

	it("includes runId and budget in assignments", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] Fix broken fetcher
`);
		const assignments = generateTaskAssignments(roadmap, { runId: "test-001" });
		const dataAssignment = assignments.data;

		expect(dataAssignment.runId).toBe("test-001");
		expect(dataAssignment.agent).toBe("data");
		expect(dataAssignment.budgets).toBeTruthy();
		expect(dataAssignment.scouting).toBe(true);
	});

	it("respects maxTasksPerAgent limit", () => {
		const tasks = Array.from({ length: 10 }, (_, i) =>
			`- [PENDING] Fix fetcher issue ${i + 1}`
		).join("\n");
		const roadmap = writeRoadmap(`## Tasks\n${tasks}`);

		const assignments = generateTaskAssignments(roadmap, { maxTasksPerAgent: 3 });
		for (const agent of Object.values(assignments)) {
			expect(agent.tasks.length).toBeLessThanOrEqual(3);
		}
	});

	it("assigns priority order to tasks", () => {
		const roadmap = writeRoadmap(`## Tasks
- [PENDING] Fix ESPN API first
- [PENDING] Fix RSS fetcher second
- [PENDING] Fix standings third
`);
		const assignments = generateTaskAssignments(roadmap);
		const dataTasks = assignments.data.tasks;

		if (dataTasks.length > 1) {
			expect(dataTasks[0].priority).toBe(1);
			expect(dataTasks[1].priority).toBe(2);
		}
	});
});

// ─── Subagent Files (.claude/agents/) ────────────────────────────

describe("subagent files", () => {
	const agentsDir = path.join(process.cwd(), ".claude/agents");
	const subagents = ["data-agent", "content-agent", "code-agent", "ux-agent"];

	it("agents directory exists", () => {
		expect(fs.existsSync(agentsDir)).toBe(true);
	});

	for (const agent of subagents) {
		const filePath = path.join(agentsDir, `${agent}.md`);

		it(`${agent}.md exists`, () => {
			expect(fs.existsSync(filePath)).toBe(true);
		});

		it(`${agent}.md has YAML frontmatter`, () => {
			const content = fs.readFileSync(filePath, "utf-8");
			expect(content.startsWith("---\n")).toBe(true);
			const endIdx = content.indexOf("\n---\n", 4);
			expect(endIdx).toBeGreaterThan(0);
		});

		it(`${agent}.md frontmatter has required fields`, () => {
			const content = fs.readFileSync(filePath, "utf-8");
			const endIdx = content.indexOf("\n---\n", 4);
			const frontmatter = content.substring(4, endIdx);

			expect(frontmatter).toContain("name:");
			expect(frontmatter).toContain("description:");
			expect(frontmatter).toContain("tools:");
			expect(frontmatter).toContain("model:");
			expect(frontmatter).toContain("memory: project");
		});

		it(`${agent}.md has name matching filename`, () => {
			const content = fs.readFileSync(filePath, "utf-8");
			const endIdx = content.indexOf("\n---\n", 4);
			const frontmatter = content.substring(4, endIdx);
			const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
			expect(nameMatch).toBeTruthy();
			expect(nameMatch[1].trim()).toBe(agent);
		});

		it(`${agent}.md has substantial content after frontmatter`, () => {
			const content = fs.readFileSync(filePath, "utf-8");
			const endIdx = content.indexOf("\n---\n", 4);
			const body = content.substring(endIdx + 5);
			expect(body.length).toBeGreaterThan(500);
		});

		it(`${agent}.md contains safety section`, () => {
			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toContain("## Safety");
			expect(content).toContain("npm test");
		});

		it(`${agent}.md references CLAUDE.md`, () => {
			const content = fs.readFileSync(filePath, "utf-8");
			expect(content).toContain("CLAUDE.md");
		});
	}
});

// ─── Orchestrator Prompt ─────────────────────────────────────────

describe("orchestrator prompt", () => {
	const promptPath = path.join(process.cwd(), "scripts/agents/orchestrator-prompt.md");

	it("exists and has content", () => {
		expect(fs.existsSync(promptPath)).toBe(true);
		const content = fs.readFileSync(promptPath, "utf-8");
		expect(content.length).toBeGreaterThan(500);
	});

	it("references subagents", () => {
		const content = fs.readFileSync(promptPath, "utf-8");
		expect(content).toContain("data-agent");
		expect(content).toContain("content-agent");
		expect(content).toContain("code-agent");
		expect(content).toContain("ux-agent");
	});

	it("contains safety section", () => {
		const content = fs.readFileSync(promptPath, "utf-8");
		expect(content).toContain("Safety");
		expect(content).toContain("npm test");
	});

	it("references CLAUDE.md", () => {
		const content = fs.readFileSync(promptPath, "utf-8");
		expect(content).toContain("CLAUDE.md");
	});

	it("includes task routing", () => {
		const content = fs.readFileSync(promptPath, "utf-8");
		expect(content).toContain("task-router");
	});

	it("includes quality gates", () => {
		const content = fs.readFileSync(promptPath, "utf-8");
		expect(content).toContain("pipeline-health");
		expect(content).toContain("quality");
	});
});

// ─── Contention Detection ─────────────────────────────────────────

describe("contention detection", () => {
	const defs = JSON.parse(
		fs.readFileSync(path.join(process.cwd(), "scripts/agents/agent-definitions.json"), "utf-8")
	);

	it("events.json contention is documented", () => {
		const eventsRule = defs.contention.rules.find(r => r.file === "docs/data/events.json");
		expect(eventsRule).toBeTruthy();
		expect(eventsRule.owner).toContain("data");
		expect(eventsRule.owner).toContain("content");
		expect(eventsRule.resolution).toContain("Sequential");
	});

	it("user-context.json has single owner", () => {
		const ucRule = defs.contention.rules.find(r => r.file === "scripts/config/user-context.json");
		expect(ucRule).toBeTruthy();
		expect(ucRule.owner.length).toBe(1);
		expect(ucRule.owner[0]).toBe("orchestrator");
	});

	it("all contention files have resolution strategies", () => {
		for (const rule of defs.contention.rules) {
			expect(rule.resolution, `${rule.file} missing resolution`).toBeTruthy();
			expect(rule.resolution.length).toBeGreaterThan(5);
		}
	});
});
