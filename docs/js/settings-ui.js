/**
 * SettingsUI - Settings interface for SportSync preferences
 */
class SettingsUI {
	constructor(preferencesManager) {
		this.preferences = preferencesManager;
		this.isOpen = false;
		this.container = null;
	}

	init() {
		this.createSettingsButton();
		this.createSettingsPanel();
		this.attachEventListeners();
	}

	createSettingsButton() {
		const button = document.createElement('button');
		button.id = 'settings-button';
		button.className = 'settings-btn';
		button.innerHTML = '⚙️ Settings';
		button.setAttribute('aria-label', 'Open settings');
		
		// Find header or create one if doesn't exist
		let header = document.querySelector('header');
		if (!header) {
			header = document.querySelector('.header');
		}
		if (header) {
			header.appendChild(button);
		} else {
			document.body.insertBefore(button, document.body.firstChild);
		}
		
		button.addEventListener('click', () => this.toggle());
	}

	createSettingsPanel() {
		const panel = document.createElement('div');
		panel.id = 'settings-panel';
		panel.className = 'settings-panel';
		panel.style.display = 'none';
		
		panel.innerHTML = `
			<div class="settings-content">
				<div class="settings-header">
					<h2>⚙️ Settings</h2>
					<button class="close-btn" aria-label="Close settings">&times;</button>
				</div>
				
				<div class="settings-tabs">
					<button class="tab-btn active" data-tab="sports">Sports</button>
					<button class="tab-btn" data-tab="favorites">Favorites</button>
					<button class="tab-btn" data-tab="display">Display</button>
					<button class="tab-btn" data-tab="data">Import/Export</button>
				</div>
				
				<div class="settings-body">
					<!-- Sports Tab -->
					<div class="tab-content active" data-content="sports">
						<h3>Select Sports to Display</h3>
						<div class="sports-grid">
							${this.createSportsCheckboxes()}
						</div>
					</div>
					
					<!-- Favorites Tab -->
					<div class="tab-content" data-content="favorites">
						<h3>Favorite Teams & Players</h3>
						
						<div class="favorites-section">
							<h4>⚽ Football Teams</h4>
							<div class="input-group">
								<input type="text" id="football-team-input" placeholder="Enter team name">
								<button onclick="settingsUI.addTeam('football')">Add</button>
							</div>
							<div id="football-teams-list" class="chips-container"></div>
						</div>
						
						<div class="favorites-section">
							<h4>🎾 Tennis Players</h4>
							<div class="input-group">
								<input type="text" id="tennis-player-input" placeholder="Enter player name">
								<button onclick="settingsUI.addPlayer('tennis')">Add</button>
							</div>
							<div id="tennis-players-list" class="chips-container"></div>
						</div>
						
						<div class="favorites-section">
							<h4>🏌️ Golf Players</h4>
							<div class="input-group">
								<input type="text" id="golf-player-input" placeholder="Enter player name">
								<button onclick="settingsUI.addPlayer('golf')">Add</button>
							</div>
							<div id="golf-players-list" class="chips-container"></div>
						</div>
						
						<div class="favorites-section">
							<h4>♟️ Chess Players</h4>
							<div class="input-group">
								<input type="text" id="chess-player-input" placeholder="Enter player name">
								<button onclick="settingsUI.addPlayer('chess')">Add</button>
							</div>
							<div id="chess-players-list" class="chips-container"></div>
						</div>
						
						<div class="favorites-section">
							<h4>🎮 Esports Teams</h4>
							<div class="input-group">
								<input type="text" id="esports-team-input" placeholder="Enter team name">
								<button onclick="settingsUI.addTeam('esports')">Add</button>
							</div>
							<div id="esports-teams-list" class="chips-container"></div>
						</div>
					</div>
					
					<!-- Display Tab -->
					<div class="tab-content" data-content="display">
						<h3>Display Preferences</h3>
						
						<div class="setting-group">
							<label for="timezone-select">Timezone:</label>
							<select id="timezone-select">
								<option value="local">Browser Default</option>
								<option value="Europe/Oslo">Norway (Oslo)</option>
								<option value="Europe/London">UK (London)</option>
								<option value="America/New_York">US East (New York)</option>
								<option value="America/Los_Angeles">US West (Los Angeles)</option>
								<option value="Asia/Tokyo">Japan (Tokyo)</option>
							</select>
						</div>
						
						<div class="setting-group">
							<label for="theme-select">Theme:</label>
							<select id="theme-select">
								<option value="auto">Auto</option>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
							</select>
						</div>
						
						<div class="setting-group">
							<label for="max-events">Max events per sport:</label>
							<input type="number" id="max-events" min="1" max="50" value="10">
						</div>
						
						<div class="setting-group">
							<label>
								<input type="checkbox" id="compact-mode">
								Compact mode
							</label>
						</div>
						
						<div class="setting-group">
							<label>
								<input type="checkbox" id="show-past">
								Show past events
							</label>
						</div>
					</div>
					
					<!-- Import/Export Tab -->
					<div class="tab-content" data-content="data">
						<h3>Manage Your Settings</h3>
						
						<div class="templates-section">
							<h4>Quick Setup Templates</h4>
							<div class="template-buttons">
								<button onclick="settingsUI.applyTemplate('norwegian')" class="template-btn">
									🇳🇴 Norwegian Sports
								</button>
								<button onclick="settingsUI.applyTemplate('uk')" class="template-btn">
									🇬🇧 UK Sports
								</button>
								<button onclick="settingsUI.applyTemplate('us')" class="template-btn">
									🇺🇸 US Sports
								</button>
							</div>
						</div>
						
						<div class="data-section">
							<h4>Export Settings</h4>
							<p>Save your current settings to a file</p>
							<button onclick="settingsUI.exportSettings()" class="action-btn">
								📥 Download Settings
							</button>
						</div>
						
						<div class="data-section">
							<h4>Import Settings</h4>
							<p>Load settings from a file</p>
							<input type="file" id="import-file" accept=".json" style="display: none;">
							<button onclick="document.getElementById('import-file').click()" class="action-btn">
								📤 Upload Settings
							</button>
						</div>
						
						<div class="data-section danger">
							<h4>Reset</h4>
							<p>Reset all settings to defaults</p>
							<button onclick="settingsUI.resetSettings()" class="danger-btn">
								🗑️ Reset All Settings
							</button>
						</div>
					</div>
				</div>
			</div>
		`;
		
		document.body.appendChild(panel);
		this.container = panel;
		
		// Add styles
		this.injectStyles();
	}

	createSportsCheckboxes() {
		const sports = [
			{ id: 'football', label: '⚽ Football', name: 'football' },
			{ id: 'tennis', label: '🎾 Tennis', name: 'tennis' },
			{ id: 'golf', label: '🏌️ Golf', name: 'golf' },
			{ id: 'formula1', label: '🏎️ Formula 1', name: 'formula1' },
			{ id: 'chess', label: '♟️ Chess', name: 'chess' },
			{ id: 'esports', label: '🎮 Esports', name: 'esports' }
		];
		
		const prefs = this.preferences.get();
		
		return sports.map(sport => `
			<label class="sport-checkbox">
				<input type="checkbox" 
					   id="sport-${sport.id}" 
					   data-sport="${sport.name}"
					   ${prefs.sports[sport.name] ? 'checked' : ''}>
				<span>${sport.label}</span>
			</label>
		`).join('');
	}

	attachEventListeners() {
		// Close button
		this.container.querySelector('.close-btn').addEventListener('click', () => {
			this.close();
		});
		
		// Tab switching
		this.container.querySelectorAll('.tab-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				this.switchTab(e.target.dataset.tab);
			});
		});
		
		// Sport checkboxes
		this.container.querySelectorAll('[data-sport]').forEach(checkbox => {
			checkbox.addEventListener('change', (e) => {
				this.preferences.toggleSport(e.target.dataset.sport);
				this.refreshDashboard();
			});
		});
		
		// Display settings
		this.container.querySelector('#timezone-select').addEventListener('change', (e) => {
			this.preferences.set('display.timezone', e.target.value === 'local' ? 
				Intl.DateTimeFormat().resolvedOptions().timeZone : e.target.value);
			this.refreshDashboard();
		});
		
		this.container.querySelector('#theme-select').addEventListener('change', (e) => {
			this.preferences.set('display.theme', e.target.value);
			this.applyTheme(e.target.value);
		});
		
		this.container.querySelector('#max-events').addEventListener('change', (e) => {
			this.preferences.set('display.maxEventsPerSport', parseInt(e.target.value));
			this.refreshDashboard();
		});
		
		this.container.querySelector('#compact-mode').addEventListener('change', (e) => {
			this.preferences.set('display.compactMode', e.target.checked);
			document.body.classList.toggle('compact-mode', e.target.checked);
			this.refreshDashboard();
		});
		
		this.container.querySelector('#show-past').addEventListener('change', (e) => {
			this.preferences.set('display.showPastEvents', e.target.checked);
			this.refreshDashboard();
		});
		
		// Import file
		document.getElementById('import-file').addEventListener('change', (e) => {
			this.importSettings(e.target.files[0]);
		});
		
		// Load current favorites
		this.loadFavorites();
	}

	switchTab(tabName) {
		// Update tab buttons
		this.container.querySelectorAll('.tab-btn').forEach(btn => {
			btn.classList.toggle('active', btn.dataset.tab === tabName);
		});
		
		// Update tab content
		this.container.querySelectorAll('.tab-content').forEach(content => {
			content.classList.toggle('active', content.dataset.content === tabName);
		});
	}

	addTeam(sport) {
		const input = document.getElementById(`${sport}-team-input`);
		const team = input.value.trim();
		
		if (team) {
			this.preferences.addTeam(sport, team);
			input.value = '';
			this.loadFavorites();
			this.refreshDashboard();
		}
	}

	addPlayer(sport) {
		const input = document.getElementById(`${sport}-player-input`);
		const player = input.value.trim();
		
		if (player) {
			this.preferences.addPlayer(sport, player);
			input.value = '';
			this.loadFavorites();
			this.refreshDashboard();
		}
	}

	loadFavorites() {
		const prefs = this.preferences.get();
		
		// Load teams
		['football', 'esports'].forEach(sport => {
			const container = document.getElementById(`${sport}-teams-list`);
			if (container && prefs.teams[sport]) {
				container.innerHTML = prefs.teams[sport].map(team => `
					<span class="chip">
						${team}
						<button onclick="settingsUI.removeTeam('${sport}', '${team}')">&times;</button>
					</span>
				`).join('');
			}
		});
		
		// Load players
		['tennis', 'golf', 'chess'].forEach(sport => {
			const container = document.getElementById(`${sport}-players-list`);
			if (container && prefs.players[sport]) {
				container.innerHTML = prefs.players[sport].map(player => `
					<span class="chip">
						${player}
						<button onclick="settingsUI.removePlayer('${sport}', '${player}')">&times;</button>
					</span>
				`).join('');
			}
		});
	}

	removeTeam(sport, team) {
		this.preferences.removeTeam(sport, team);
		this.loadFavorites();
		this.refreshDashboard();
	}

	removePlayer(sport, player) {
		this.preferences.removePlayer(sport, player);
		this.loadFavorites();
		this.refreshDashboard();
	}

	applyTemplate(templateName) {
		if (confirm(`Apply ${templateName} sports template? This will replace your current settings.`)) {
			this.preferences.applyTemplate(templateName);
			this.loadSettings();
			this.loadFavorites();
			this.refreshDashboard();
			alert(`${templateName} template applied!`);
		}
	}

	exportSettings() {
		const data = this.preferences.export();
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sportsync-settings-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	importSettings(file) {
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				this.preferences.import(e.target.result);
				this.loadSettings();
				this.loadFavorites();
				this.refreshDashboard();
				alert('Settings imported successfully!');
			} catch (error) {
				alert('Failed to import settings. Please check the file format.');
			}
		};
		reader.readAsText(file);
	}

	resetSettings() {
		if (confirm('Are you sure you want to reset all settings to defaults?')) {
			this.preferences.reset();
			this.loadSettings();
			this.loadFavorites();
			this.refreshDashboard();
			alert('Settings reset to defaults!');
		}
	}

	loadSettings() {
		const prefs = this.preferences.get();
		
		// Update sport checkboxes
		Object.entries(prefs.sports).forEach(([sport, enabled]) => {
			const checkbox = document.getElementById(`sport-${sport}`);
			if (checkbox) checkbox.checked = enabled;
		});
		
		// Update display settings
		const timezoneSelect = document.getElementById('timezone-select');
		if (timezoneSelect) {
			const currentTz = prefs.display.timezone;
			const option = Array.from(timezoneSelect.options).find(opt => opt.value === currentTz);
			if (option) {
				timezoneSelect.value = currentTz;
			} else {
				timezoneSelect.value = 'local';
			}
		}
		
		document.getElementById('theme-select').value = prefs.display.theme;
		document.getElementById('max-events').value = prefs.display.maxEventsPerSport;
		document.getElementById('compact-mode').checked = prefs.display.compactMode;
		document.getElementById('show-past').checked = prefs.display.showPastEvents;
	}

	applyTheme(theme) {
		if (theme === 'auto') {
			const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.body.classList.toggle('dark', isDark);
		} else {
			document.body.classList.toggle('dark', theme === 'dark');
		}
	}

	refreshDashboard() {
		// Trigger dashboard refresh
		window.dispatchEvent(new CustomEvent('preferencesChanged'));
	}

	toggle() {
		this.isOpen ? this.close() : this.open();
	}

	open() {
		this.container.style.display = 'block';
		this.isOpen = true;
		this.loadSettings();
		this.loadFavorites();
	}

	close() {
		this.container.style.display = 'none';
		this.isOpen = false;
	}

	injectStyles() {
		const style = document.createElement('style');
		style.textContent = `
			.settings-btn {
				position: fixed;
				top: 20px;
				right: 20px;
				padding: 10px 20px;
				background: #4CAF50;
				color: white;
				border: none;
				border-radius: 8px;
				cursor: pointer;
				font-size: 16px;
				z-index: 999;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			}
			
			.settings-btn:hover {
				background: #45a049;
			}
			
			.settings-panel {
				position: fixed;
				top: 0;
				right: 0;
				width: 500px;
				max-width: 100%;
				height: 100%;
				background: var(--card-bg, white);
				box-shadow: -2px 0 10px rgba(0,0,0,0.1);
				z-index: 1000;
				overflow-y: auto;
			}
			
			.settings-content {
				padding: 20px;
			}
			
			.settings-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 20px;
				padding-bottom: 10px;
				border-bottom: 2px solid var(--border, #e0e0e0);
			}
			
			.settings-header h2 {
				margin: 0;
				color: var(--text, #333);
			}
			
			.close-btn {
				background: none;
				border: none;
				font-size: 28px;
				cursor: pointer;
				color: var(--text, #333);
				padding: 0;
				width: 30px;
				height: 30px;
			}
			
			.settings-tabs {
				display: flex;
				gap: 10px;
				margin-bottom: 20px;
				border-bottom: 1px solid var(--border, #e0e0e0);
			}
			
			.tab-btn {
				padding: 10px 20px;
				background: none;
				border: none;
				cursor: pointer;
				color: var(--muted, #666);
				font-size: 14px;
				border-bottom: 2px solid transparent;
				transition: all 0.3s;
			}
			
			.tab-btn.active {
				color: var(--text, #333);
				border-bottom-color: #4CAF50;
			}
			
			.tab-content {
				display: none;
			}
			
			.tab-content.active {
				display: block;
			}
			
			.sports-grid {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 15px;
				margin-top: 15px;
			}
			
			.sport-checkbox {
				display: flex;
				align-items: center;
				padding: 10px;
				border: 1px solid var(--border, #e0e0e0);
				border-radius: 8px;
				cursor: pointer;
				transition: background 0.2s;
			}
			
			.sport-checkbox:hover {
				background: var(--bg, #f5f5f5);
			}
			
			.sport-checkbox input {
				margin-right: 10px;
			}
			
			.favorites-section {
				margin-bottom: 25px;
			}
			
			.favorites-section h4 {
				margin-bottom: 10px;
				color: var(--text, #333);
			}
			
			.input-group {
				display: flex;
				gap: 10px;
				margin-bottom: 10px;
			}
			
			.input-group input {
				flex: 1;
				padding: 8px;
				border: 1px solid var(--border, #e0e0e0);
				border-radius: 4px;
				background: var(--bg, white);
				color: var(--text, #333);
			}
			
			.input-group button {
				padding: 8px 20px;
				background: #4CAF50;
				color: white;
				border: none;
				border-radius: 4px;
				cursor: pointer;
			}
			
			.chips-container {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
			}
			
			.chip {
				display: inline-flex;
				align-items: center;
				padding: 5px 10px;
				background: var(--bg, #f0f0f0);
				border: 1px solid var(--border, #e0e0e0);
				border-radius: 20px;
				font-size: 14px;
				color: var(--text, #333);
			}
			
			.chip button {
				margin-left: 8px;
				background: none;
				border: none;
				color: var(--muted, #666);
				cursor: pointer;
				font-size: 18px;
				padding: 0;
			}
			
			.setting-group {
				margin-bottom: 20px;
			}
			
			.setting-group label {
				display: block;
				margin-bottom: 5px;
				color: var(--text, #333);
			}
			
			.setting-group select,
			.setting-group input[type="number"] {
				width: 100%;
				padding: 8px;
				border: 1px solid var(--border, #e0e0e0);
				border-radius: 4px;
				background: var(--bg, white);
				color: var(--text, #333);
			}
			
			.template-buttons {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 10px;
				margin-top: 15px;
			}
			
			.template-btn {
				padding: 15px;
				background: var(--bg, #f5f5f5);
				border: 1px solid var(--border, #e0e0e0);
				border-radius: 8px;
				cursor: pointer;
				text-align: center;
				transition: all 0.2s;
			}
			
			.template-btn:hover {
				background: #4CAF50;
				color: white;
			}
			
			.data-section {
				margin-top: 30px;
				padding: 20px;
				background: var(--bg, #f9f9f9);
				border-radius: 8px;
			}
			
			.data-section h4 {
				margin-top: 0;
				color: var(--text, #333);
			}
			
			.data-section p {
				color: var(--muted, #666);
				margin: 10px 0;
			}
			
			.action-btn {
				padding: 10px 20px;
				background: #4CAF50;
				color: white;
				border: none;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
			}
			
			.danger-btn {
				padding: 10px 20px;
				background: #f44336;
				color: white;
				border: none;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
			}
			
			.data-section.danger {
				background: #ffebee;
			}
			
			@media (max-width: 600px) {
				.settings-panel {
					width: 100%;
				}
				
				.sports-grid {
					grid-template-columns: 1fr;
				}
				
				.template-buttons {
					grid-template-columns: 1fr;
				}
			}
		`;
		document.head.appendChild(style);
	}
}

// Make it globally available
window.SettingsUI = SettingsUI;