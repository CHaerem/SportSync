/**
 * Task Router — maps roadmap tasks to agents based on file paths and keywords.
 *
 * Usage:
 *   node scripts/agents/task-router.js [--roadmap path] [--json]
 *
 * Reads AUTOPILOT_ROADMAP.md, classifies each [PENDING] task by agent,
 * and outputs the routing. Used by the Orchestrator Agent to assign work.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');

// Load agent definitions
const definitions = JSON.parse(
  readFileSync(join(ROOT, 'scripts/agents/agent-definitions.json'), 'utf-8')
);

/**
 * Keyword patterns for each agent. Order matters — first match wins for
 * ambiguous tasks. More specific patterns should come first.
 */
const ROUTING_RULES = [
  {
    agent: 'data',
    keywords: [
      /\bfetch(?:er|ing)?\b/i,
      /\bAPI\b/,
      /\bESPN\b/i,
      /\bdata.?freshness\b/i,
      /\bconfig.?sync\b/i,
      /\bdiscovery?\b/i,
      /\bstreaming\b/i,
      /\btvkampen\b/i,
      /\bverif(?:y|ication)\b/i,
      /\bcoverage.?gap/i,
      /\bRSS\b/i,
      /\bstandings\b/i,
      /\bcurated.?config/i,
      /\bscraper?\b/i,
      /\bnormaliz/i,
      /\bfotball\.no\b/i,
      /\bPGA\b/i
    ],
    filePaths: [
      /scripts\/fetch\//,
      /scripts\/fetch-/,
      /scripts\/sync-configs/,
      /scripts\/discover-events/,
      /scripts\/build-events/,
      /scripts\/enrich-streaming/,
      /scripts\/verify-schedules/,
      /scripts\/merge-open-data/,
      /scripts\/detect-coverage-gaps/,
      /scripts\/config\//,
      /scripts\/lib\/tvkampen/,
      /scripts\/lib\/streaming-matcher/,
      /scripts\/lib\/schedule-verifier/,
      /scripts\/lib\/base-fetcher/,
      /scripts\/lib\/api-client/,
      /scripts\/lib\/response-validator/,
      /scripts\/lib\/event-normalizer/,
      /scripts\/lib\/broadcaster-urls/
    ]
  },
  {
    agent: 'content',
    keywords: [
      /\beditorial\b/i,
      /\bfeatured\b/i,
      /\benrich(?:ment|ing)?\b/i,
      /\bwatch.?plan\b/i,
      /\bfact.?check/i,
      /\bquality.?gate/i,
      /\bquality.?history/i,
      /\bprompt\b/i,
      /\bLLM\b/i,
      /\bimportance\b/i,
      /\bnarrative\b/i,
      /\bbriefing\b/i,
      /\bcomponent.?block/i,
      /\bmulti.?day\b/i
    ],
    filePaths: [
      /scripts\/enrich-events/,
      /scripts\/generate-featured/,
      /scripts\/generate-multi-day/,
      /scripts\/generate-insights/,
      /scripts\/check-quality-regression/,
      /scripts\/lib\/enrichment-prompts/,
      /scripts\/lib\/ai-quality-gates/,
      /scripts\/lib\/llm-client/
    ]
  },
  {
    agent: 'ux',
    keywords: [
      /\bdashboard\b/i,
      /\bCSS\b/i,
      /\brender(?:ing|er)?\b/i,
      /\bvisual\b/i,
      /\bUX\b/i,
      /\bUI\b/i,
      /\blayout\b/i,
      /\bdesign\b/i,
      /\baccessib/i,
      /\bscreenshot\b/i,
      /\bdark.?mode\b/i,
      /\bservice.?worker\b/i,
      /\blogo/i,
      /\basset.?map/i,
      /\bpreferences?.?manager/i,
      /\bsport.?config\b/i,
      /\bpolling\b/i
    ],
    filePaths: [
      /docs\/index\.html/,
      /docs\/js\//,
      /docs\/css\//,
      /docs\/sw\.js/,
      /scripts\/screenshot/,
      /scripts\/evaluate-ux/
    ]
  },
  {
    agent: 'code',
    keywords: [
      /\btest(?:s|ing)?\b/i,
      /\brefactor/i,
      /\bbug.?fix\b/i,
      /\bdead.?code\b/i,
      /\bpipeline.?step/i,
      /\bpipeline.?manifest/i,
      /\bhealth.?check/i,
      /\bpattern.?report/i,
      /\bcode.?quality/i,
      /\bTODO\b/,
      /\bFIXME\b/,
      /\btype.?error/i,
      /\bregression\b/i,
      /\bvitest\b/i,
      /\bcoverage\b/i
    ],
    filePaths: [
      /tests\//,
      /scripts\/lib\/helpers/,
      /scripts\/lib\/filters/,
      /scripts\/validate-events/,
      /scripts\/build-ics/,
      /scripts\/pipeline-health/,
      /scripts\/autonomy-scorecard/,
      /scripts\/analyze-patterns/,
      /scripts\/ai-sanity-check/,
      /scripts\/run-pipeline/,
      /scripts\/generate-capabilities/,
      /scripts\/pre-commit-gate/,
      /scripts\/pipeline-manifest/,
      /scripts\/autopilot-strategy/
    ]
  },
  {
    agent: 'orchestrator',
    keywords: [
      /\bautopilot\b/i,
      /\borchestrat/i,
      /\bscorecard\b/i,
      /\bautonomy\b/i,
      /\bpillar\b/i,
      /\bpreference.?evolution/i,
      /\bengagement\b/i,
      /\bfeedback.?loop/i,
      /\bquota\b/i,
      /\bstrateg(?:y|ic)/i,
      /\broadmap\b/i
    ],
    filePaths: [
      /scripts\/evolve-preferences/,
      /scripts\/track-usage/,
      /scripts\/resolve-autopilot-config/,
      /scripts\/agents\//,
      /AUTOPILOT_ROADMAP/
    ]
  }
];

/**
 * Parse AUTOPILOT_ROADMAP.md and extract [PENDING] tasks.
 * Returns array of { raw, description, tier, section }.
 */
export function parsePendingTasks(roadmapPath) {
  const content = readFileSync(roadmapPath, 'utf-8');
  const lines = content.split('\n');
  const tasks = [];
  let currentSection = '';

  for (const line of lines) {
    // Track section headers
    if (line.startsWith('## ') || line.startsWith('### ')) {
      currentSection = line.replace(/^#+\s*/, '').trim();
      continue;
    }

    // Match [PENDING] task lines
    const match = line.match(/^[-*]\s*\[PENDING\]\s*(?:\[(MAINTENANCE|FEATURE|EXPLORE)\])?\s*(.*)/i);
    if (match) {
      const tier = (match[1] || 'MAINTENANCE').toUpperCase();
      const description = match[2].trim();
      tasks.push({
        raw: line.trim(),
        description,
        tier,
        section: currentSection
      });
    }
  }

  return tasks;
}

/**
 * Score a task against an agent's routing rules.
 * Returns a score >= 0. Higher = better match.
 */
function scoreTaskForAgent(task, rule) {
  let score = 0;
  const text = task.description + ' ' + task.section;

  // Check keyword matches
  for (const pattern of rule.keywords) {
    if (pattern.test(text)) {
      score += 2;
    }
  }

  // Check file path mentions in the task description
  for (const pattern of rule.filePaths) {
    if (pattern.test(text)) {
      score += 3; // File path matches are stronger signals
    }
  }

  return score;
}

/**
 * Route a single task to the best-matching agent.
 * Returns { agent, score, confidence }.
 */
export function routeTask(task) {
  let bestAgent = 'code'; // default fallback
  let bestScore = 0;
  let secondScore = 0;

  for (const rule of ROUTING_RULES) {
    const score = scoreTaskForAgent(task, rule);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestAgent = rule.agent;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // Confidence: high if clear winner, low if close to second
  const gap = bestScore - secondScore;
  let confidence;
  if (bestScore === 0) confidence = 'default';
  else if (gap >= 3) confidence = 'high';
  else if (gap >= 1) confidence = 'medium';
  else confidence = 'low';

  return { agent: bestAgent, score: bestScore, confidence };
}

/**
 * Route all pending tasks from the roadmap.
 * Returns { tasks: [{ description, tier, agent, score, confidence }] }.
 */
export function routeAllTasks(roadmapPath) {
  const tasks = parsePendingTasks(roadmapPath);

  return {
    routedAt: new Date().toISOString(),
    taskCount: tasks.length,
    tasks: tasks.map(task => {
      const routing = routeTask(task);
      return {
        description: task.description,
        tier: task.tier,
        section: task.section,
        ...routing
      };
    })
  };
}

/**
 * Route a task description string (not from roadmap) to an agent.
 * Useful for ad-hoc task classification.
 */
export function routeDescription(description) {
  return routeTask({ description, section: '' });
}

/**
 * Generate per-agent task assignment files.
 * Writes docs/data/.agent-tasks-{agent}.json for each agent.
 */
export function generateTaskAssignments(roadmapPath, options = {}) {
  const { runId = `${new Date().toISOString().slice(0, 10)}-001`, maxTasksPerAgent = 5, scouting = true } = options;
  const routed = routeAllTasks(roadmapPath);

  const tierBudgets = {
    MAINTENANCE: { maxFiles: 8, maxLines: 300 },
    FEATURE: { maxFiles: 12, maxLines: 500 },
    EXPLORE: { maxFiles: 0, maxLines: 0 }
  };

  const assignments = {};
  for (const agentName of Object.keys(definitions.agents)) {
    if (agentName === 'orchestrator') continue; // Orchestrator doesn't get assigned tasks this way

    const agentTasks = routed.tasks
      .filter(t => t.agent === agentName)
      .slice(0, maxTasksPerAgent)
      .map((t, i) => ({
        id: `task-${agentName}-${i + 1}`,
        description: t.description,
        tier: t.tier,
        priority: i + 1,
        confidence: t.confidence,
        maxTurns: t.tier === 'FEATURE' ? 15 : t.tier === 'EXPLORE' ? 8 : 6
      }));

    assignments[agentName] = {
      runId,
      agent: agentName,
      tasks: agentTasks,
      budgets: tierBudgets[agentTasks[0]?.tier || 'MAINTENANCE'],
      scouting
    };
  }

  return assignments;
}

/**
 * Write task assignment files to disk.
 */
export function writeTaskAssignments(assignments) {
  for (const [agentName, assignment] of Object.entries(assignments)) {
    const outPath = join(ROOT, `docs/data/.agent-tasks-${agentName}.json`);
    writeFileSync(outPath, JSON.stringify(assignment, null, 2));
  }
}

// CLI entrypoint
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ''))) {
  const roadmapPath = process.argv.includes('--roadmap')
    ? process.argv[process.argv.indexOf('--roadmap') + 1]
    : join(ROOT, 'AUTOPILOT_ROADMAP.md');

  const jsonMode = process.argv.includes('--json');
  const writeMode = process.argv.includes('--write');

  if (writeMode) {
    const assignments = generateTaskAssignments(roadmapPath);
    writeTaskAssignments(assignments);
    console.log(`Wrote task assignments for ${Object.keys(assignments).length} agents`);
  } else {
    const result = routeAllTasks(roadmapPath);

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Routed ${result.taskCount} pending tasks:\n`);
      const byAgent = {};
      for (const task of result.tasks) {
        if (!byAgent[task.agent]) byAgent[task.agent] = [];
        byAgent[task.agent].push(task);
      }
      for (const [agent, tasks] of Object.entries(byAgent)) {
        console.log(`  ${definitions.agents[agent].name} (${tasks.length} tasks):`);
        for (const t of tasks) {
          console.log(`    [${t.tier}] ${t.description.slice(0, 80)} (${t.confidence})`);
        }
        console.log();
      }
    }
  }
}
