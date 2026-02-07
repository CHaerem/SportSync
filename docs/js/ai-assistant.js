/**
 * AI Assistant — generates context-rich prompts for Claude/ChatGPT
 * based on the user's sports events and preferences.
 */
class AIAssistant {
	constructor(dashboard) {
		this.dashboard = dashboard;
		this.isOpen = false;
		this.init();
	}

	init() {
		this.createUI();
		this.attachListeners();
	}

	createUI() {
		// Floating button
		const btn = document.createElement("button");
		btn.id = "ai-assistant-btn";
		btn.innerHTML = "AI";
		btn.title = "Ask AI about your sports";
		btn.style.cssText = `
			position: fixed; bottom: 24px; right: 24px; width: 48px; height: 48px;
			border-radius: 50%; border: 2px solid var(--border); background: var(--card-bg);
			color: var(--text); font-size: 0.8rem; font-weight: 700; cursor: pointer;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000;
			transition: all 0.2s; display: flex; align-items: center; justify-content: center;
		`;
		document.body.appendChild(btn);

		// Panel
		const panel = document.createElement("div");
		panel.id = "ai-assistant-panel";
		panel.style.cssText = `
			position: fixed; bottom: 84px; right: 24px; width: 360px; max-height: 500px;
			background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px;
			box-shadow: 0 8px 30px rgba(0,0,0,0.15); z-index: 1000; display: none;
			flex-direction: column; overflow: hidden;
		`;
		panel.innerHTML = `
			<div style="padding: 16px 20px; border-bottom: 1px solid var(--border);">
				<div style="font-weight: 600; font-size: 0.95rem; color: var(--text);">AI Sports Assistant</div>
				<div style="font-size: 0.75rem; color: var(--muted); margin-top: 2px;">Generate a prompt, copy it to Claude or ChatGPT</div>
			</div>
			<div style="padding: 12px 16px; overflow-y: auto; flex: 1;">
				<div id="ai-prompt-options" style="display: flex; flex-direction: column; gap: 8px;"></div>
				<div style="margin-top: 12px;">
					<input id="ai-custom-query" type="text" placeholder="Or type a custom question..."
						style="width: 100%; padding: 10px 12px; border: 1px solid var(--border);
						border-radius: 10px; background: var(--bg); color: var(--text);
						font-size: 0.85rem; outline: none; box-sizing: border-box;">
				</div>
			</div>
			<div id="ai-result-area" style="display: none; padding: 12px 16px; border-top: 1px solid var(--border);">
				<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
					<span style="font-size: 0.75rem; font-weight: 600; color: var(--muted); text-transform: uppercase;">Generated Prompt</span>
					<button id="ai-copy-btn" style="padding: 4px 12px; border: 1px solid var(--border);
						border-radius: 8px; background: var(--text); color: var(--bg);
						font-size: 0.75rem; cursor: pointer; font-weight: 500;">Copy</button>
				</div>
				<div id="ai-prompt-preview" style="font-size: 0.8rem; color: var(--text-secondary);
					max-height: 150px; overflow-y: auto; line-height: 1.5; white-space: pre-wrap;
					padding: 8px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border);"></div>
			</div>
		`;
		document.body.appendChild(panel);
	}

	attachListeners() {
		const btn = document.getElementById("ai-assistant-btn");
		const panel = document.getElementById("ai-assistant-panel");

		btn.addEventListener("click", () => {
			this.isOpen = !this.isOpen;
			panel.style.display = this.isOpen ? "flex" : "none";
			if (this.isOpen) this.populateOptions();
		});

		// Close on outside click
		document.addEventListener("click", (e) => {
			if (this.isOpen && !panel.contains(e.target) && e.target !== btn) {
				this.isOpen = false;
				panel.style.display = "none";
			}
		});

		// Custom query
		const input = document.getElementById("ai-custom-query");
		input.addEventListener("keypress", (e) => {
			if (e.key === "Enter" && input.value.trim()) {
				this.generatePrompt("custom", input.value.trim());
			}
		});

		// Copy button
		document.getElementById("ai-copy-btn").addEventListener("click", () => {
			const text = document.getElementById("ai-prompt-preview").textContent;
			navigator.clipboard.writeText(text).then(() => {
				const copyBtn = document.getElementById("ai-copy-btn");
				copyBtn.textContent = "Copied!";
				setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
			});
		});
	}

	populateOptions() {
		const container = document.getElementById("ai-prompt-options");
		const options = [
			{
				id: "watch-tonight",
				label: "What should I watch today?",
				icon: "📺",
			},
			{
				id: "week-briefing",
				label: "Weekly sports briefing",
				icon: "📋",
			},
			{
				id: "norwegian",
				label: "Norwegian athletes this week",
				icon: "🇳🇴",
			},
			{
				id: "conflicts",
				label: "Help me pick between conflicts",
				icon: "⚡",
			},
		];

		container.innerHTML = options
			.map(
				(opt) => `
			<button class="ai-option-btn" data-prompt="${opt.id}"
				style="display: flex; align-items: center; gap: 10px; padding: 10px 14px;
				border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
				color: var(--text); cursor: pointer; text-align: left; font-size: 0.85rem;
				transition: all 0.15s; width: 100%;">
				<span style="font-size: 1.1rem;">${opt.icon}</span>
				<span>${opt.label}</span>
			</button>
		`
			)
			.join("");

		container.querySelectorAll(".ai-option-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				this.generatePrompt(btn.dataset.prompt);
			});
		});
	}

	generatePrompt(type, customQuery) {
		const events = this.dashboard.allEvents || [];
		const prefs = this.dashboard.preferences;

		// Build context
		const context = this.buildContext(events, prefs);
		let prompt;

		switch (type) {
			case "watch-tonight":
				prompt = this.watchTonightPrompt(context);
				break;
			case "week-briefing":
				prompt = this.weekBriefingPrompt(context);
				break;
			case "norwegian":
				prompt = this.norwegianPrompt(context);
				break;
			case "conflicts":
				prompt = this.conflictsPrompt(context);
				break;
			case "custom":
				prompt = this.customPrompt(context, customQuery);
				break;
			default:
				prompt = this.watchTonightPrompt(context);
		}

		this.showResult(prompt);
	}

	buildContext(events, prefs) {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const weekEnd = new Date(today);
		weekEnd.setDate(weekEnd.getDate() + 7);

		const todayEvents = events.filter((e) => {
			const d = new Date(e.time);
			return d >= today && d < tomorrow;
		});

		const weekEvents = events.filter((e) => {
			const d = new Date(e.time);
			return d >= today && d < weekEnd;
		});

		const norwegianEvents = events.filter((e) => e.norwegian);

		// Get favorites info
		let favorites = { teams: [], players: [], sports: [] };
		if (prefs) {
			const p = prefs.getPreferences();
			favorites.teams = [
				...(p.favoriteTeams?.football || []),
				...(p.favoriteTeams?.esports || []),
			];
			favorites.players = [
				...(p.favoritePlayers?.golf || []),
				...(p.favoritePlayers?.tennis || []),
			];
			favorites.sports = p.favoriteSports || [];
		}

		return { todayEvents, weekEvents, norwegianEvents, favorites, all: events };
	}

	formatEventsForPrompt(events) {
		return events
			.slice(0, 15)
			.map((e) => {
				let line = `- ${e.title} (${e.sport})`;
				line += ` | ${new Date(e.time).toLocaleString("en-NO", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Oslo" })}`;
				if (e.homeTeam && e.awayTeam) line += ` | ${e.homeTeam} vs ${e.awayTeam}`;
				if (e.importance) line += ` | Importance: ${e.importance}/5`;
				if (e.summary) line += ` | ${e.summary}`;
				if (e.norwegian) line += " | Norwegian";
				return line;
			})
			.join("\n");
	}

	watchTonightPrompt(ctx) {
		const events = ctx.todayEvents.length > 0 ? ctx.todayEvents : ctx.weekEvents.slice(0, 10);
		const timeframe = ctx.todayEvents.length > 0 ? "today" : "this week (nothing on today)";

		return `I'm a sports fan in Norway. Here are the upcoming events ${timeframe}:

${this.formatEventsForPrompt(events)}

My favorite teams: ${ctx.favorites.teams.join(", ") || "not specified"}
My favorite players: ${ctx.favorites.players.join(", ") || "not specified"}

What should I watch? Rank them and explain why. Consider:
- How important/exciting each event is
- Any Norwegian connections
- If there are time conflicts, which one wins
- Brief context on what's at stake`;
	}

	weekBriefingPrompt(ctx) {
		return `I'm a sports fan in Norway. Give me a briefing for this week's sports events:

${this.formatEventsForPrompt(ctx.weekEvents)}

My favorites: Teams: ${ctx.favorites.teams.join(", ") || "none"} | Players: ${ctx.favorites.players.join(", ") || "none"}

Give me:
1. Must-watch events (top 3)
2. Quick summary by sport
3. Any notable storylines or stakes
4. Schedule recommendations (what to prioritize if time is limited)`;
	}

	norwegianPrompt(ctx) {
		const events = ctx.norwegianEvents.length > 0 ? ctx.norwegianEvents : ctx.weekEvents;
		return `Here are upcoming sports events with Norwegian relevance:

${this.formatEventsForPrompt(events)}

Tell me about Norwegian athletes competing this week:
- Who is playing and in what events?
- What are their chances?
- Which events are most important for Norwegian sports fans?
- Any storylines I should know about?`;
	}

	conflictsPrompt(ctx) {
		return `I have these upcoming sports events and limited time:

${this.formatEventsForPrompt(ctx.weekEvents)}

My favorites: Teams: ${ctx.favorites.teams.join(", ") || "none"} | Players: ${ctx.favorites.players.join(", ") || "none"}

Help me resolve viewing conflicts:
1. Which events overlap in time?
2. For each conflict, which one should I prioritize and why?
3. Which events can I safely skip or catch highlights of later?
4. Suggest an optimal viewing schedule for the week`;
	}

	customPrompt(ctx, query) {
		return `I'm a sports fan in Norway with access to these upcoming events:

${this.formatEventsForPrompt(ctx.weekEvents)}

My favorites: Teams: ${ctx.favorites.teams.join(", ") || "none"} | Players: ${ctx.favorites.players.join(", ") || "none"}

My question: ${query}`;
	}

	showResult(prompt) {
		const resultArea = document.getElementById("ai-result-area");
		const preview = document.getElementById("ai-prompt-preview");
		resultArea.style.display = "block";
		preview.textContent = prompt;
	}
}

// Initialize after dashboard loads
// The dashboard is created by simple-dashboard.js which runs before this script.
// We poll briefly for the dashboard instance to have loaded its events.
(function initAI() {
	function tryInit() {
		// Look for the dashboard's allEvents to be populated
		const containers = document.querySelectorAll('.event-card');
		if (containers.length > 0 || document.getElementById('eventsContainer')) {
			// Find the dashboard instance — it's the only SimpleSportsDashboard
			// We access it indirectly via a small shim
			window.aiAssistant = new AIAssistant({
				allEvents: window._sportsSyncEvents || [],
				preferences: window._sportsSyncPreferences || null,
			});
		}
	}
	// Try immediately and after events load
	if (document.readyState === 'complete') {
		setTimeout(tryInit, 500);
	} else {
		window.addEventListener('load', () => setTimeout(tryInit, 500));
	}
})();
