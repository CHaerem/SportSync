// Simple Settings UI for SportSync
class SettingsUI {
	constructor(preferencesManager) {
		this.preferences = preferencesManager;
		this.isOpen = false;
	}

	init() {
		this.createSettingsButton();
		this.createSettingsModal();
		
		// Handle window resize
		let resizeTimeout;
		window.addEventListener('resize', () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				// Recreate modal with proper styles on resize
				if (this.isOpen) {
					this.closeSettings();
				}
				const modal = document.getElementById('settingsModal');
				if (modal) {
					modal.remove();
				}
				this.createSettingsModal();
			}, 250);
		});
	}

	createSettingsButton() {
		const button = document.createElement('button');
		button.id = 'settingsButton';
		button.innerHTML = '⚙️';
		button.style.cssText = `
			position: fixed;
			bottom: 20px;
			right: 20px;
			width: 48px;
			height: 48px;
			border-radius: 50%;
			background: var(--card-bg);
			border: 2px solid var(--border);
			font-size: 20px;
			cursor: pointer;
			z-index: 100;
			transition: all 0.3s;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		`;
		
		button.addEventListener('click', () => this.toggleSettings());
		button.addEventListener('mouseover', () => {
			button.style.transform = 'scale(1.1)';
		});
		button.addEventListener('mouseout', () => {
			button.style.transform = 'scale(1)';
		});
		
		document.body.appendChild(button);
	}

	createSettingsModal() {
		const modal = document.createElement('div');
		modal.id = 'settingsModal';
		
		// Check if mobile
		const isMobile = window.innerWidth <= 768;
		
		modal.style.cssText = isMobile ? `
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			width: 100%;
			max-height: 70vh;
			background: var(--card-bg);
			border: 2px solid var(--border);
			border-radius: 20px 20px 0 0;
			padding: 20px;
			z-index: 101;
			display: none;
			overflow-y: auto;
			box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.15);
			transform: translateY(100%);
			transition: transform 0.3s ease;
		` : `
			position: fixed;
			bottom: 80px;
			right: 20px;
			width: 320px;
			max-height: 500px;
			background: var(--card-bg);
			border: 2px solid var(--border);
			border-radius: 16px;
			padding: 20px;
			z-index: 101;
			display: none;
			overflow-y: auto;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
		`;

		modal.innerHTML = `
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
				<h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Personalization</h3>
				<button id="closeSettings" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--muted);">×</button>
			</div>
			
			<div id="settingsContent">
				<!-- Favorite Sports -->
				<div style="margin-bottom: 24px;">
					<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">Favorite Sports</h4>
					<div id="sportToggles" style="display: flex; flex-wrap: wrap; gap: 8px;">
						${this.createSportToggles()}
					</div>
				</div>

				<!-- Favorite Teams -->
				<div style="margin-bottom: 24px;">
					<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">Favorite Teams</h4>
					<div style="margin-bottom: 12px;">
						<label style="font-size: 0.8rem; color: var(--muted);">Football Teams</label>
						<div id="footballTeams" style="margin-top: 8px;">
							${this.createTeamList('football')}
						</div>
						<input type="text" id="addFootballTeam" placeholder="Add team (e.g., Barcelona)" style="
							width: 100%;
							padding: 6px 10px;
							margin-top: 8px;
							border: 1px solid var(--border);
							border-radius: 8px;
							background: var(--bg);
							color: var(--text);
							font-size: 0.85rem;
						">
					</div>
				</div>

				<!-- Favorite Players -->
				<div style="margin-bottom: 24px;">
					<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">Favorite Players</h4>
					<div style="margin-bottom: 12px;">
						<label style="font-size: 0.8rem; color: var(--muted);">Golfers</label>
						<div id="golfPlayers" style="margin-top: 8px;">
							${this.createPlayerList('golf')}
						</div>
						<input type="text" id="addGolfPlayer" placeholder="Add player (e.g., Viktor Hovland)" style="
							width: 100%;
							padding: 6px 10px;
							margin-top: 8px;
							border: 1px solid var(--border);
							border-radius: 8px;
							background: var(--bg);
							color: var(--text);
							font-size: 0.85rem;
						">
					</div>
				</div>

				<!-- View Mode -->
				<div style="margin-bottom: 24px;">
					<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">View Mode</h4>
					<div style="display: flex; gap: 8px;">
						<button class="view-mode-btn" data-mode="list" style="
							flex: 1;
							padding: 8px;
							background: var(--accent);
							border: 1px solid var(--accent);
							border-radius: 8px;
							color: white;
							font-size: 0.85rem;
							cursor: pointer;
							transition: all 0.2s;
						">List View</button>
						<button class="view-mode-btn" data-mode="timeline" style="
							flex: 1;
							padding: 8px;
							background: transparent;
							border: 1px solid var(--border);
							border-radius: 8px;
							color: var(--muted);
							font-size: 0.85rem;
							cursor: pointer;
							transition: all 0.2s;
						">Timeline View</button>
					</div>
				</div>

				<!-- Links -->
				<div style="margin-bottom: 24px;">
					<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; color: var(--text-secondary);">Resources</h4>
					<div style="display: flex; flex-direction: column; gap: 10px;">
						<a href="data/events.ics" download style="
							display: flex;
							align-items: center;
							gap: 8px;
							padding: 8px 12px;
							background: transparent;
							border: 1px solid var(--border);
							border-radius: 8px;
							color: var(--text);
							text-decoration: none;
							font-size: 0.85rem;
							transition: all 0.2s;
						" onmouseover="this.style.borderColor='var(--text-secondary)'; this.style.background='var(--hover-bg)';" 
						   onmouseout="this.style.borderColor='var(--border)'; this.style.background='transparent';">
							<span>📅</span>
							<span>Download Calendar (.ics)</span>
						</a>
						<a href="api-info.html" target="_blank" style="
							display: flex;
							align-items: center;
							gap: 8px;
							padding: 8px 12px;
							background: transparent;
							border: 1px solid var(--border);
							border-radius: 8px;
							color: var(--text);
							text-decoration: none;
							font-size: 0.85rem;
							transition: all 0.2s;
						" onmouseover="this.style.borderColor='var(--text-secondary)'; this.style.background='var(--hover-bg)';" 
						   onmouseout="this.style.borderColor='var(--border)'; this.style.background='transparent';">
							<span>ℹ️</span>
							<span>API Information</span>
						</a>
					</div>
				</div>

				<!-- Reset Button -->
				<button id="resetPreferences" style="
					width: 100%;
					padding: 10px;
					background: transparent;
					border: 1px solid var(--border);
					border-radius: 8px;
					color: var(--muted);
					font-size: 0.85rem;
					cursor: pointer;
					transition: all 0.2s;
				" onmouseover="this.style.borderColor='var(--text-secondary)'; this.style.color='var(--text-secondary)';" 
				   onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--muted)';">
					Reset All Preferences
				</button>
			</div>
		`;

		document.body.appendChild(modal);
		this.attachEventListeners();
	}

	createSportToggles() {
		const sports = [
			{ id: 'golf', emoji: '⛳', name: 'Golf', color: '#f59e0b' },
			{ id: 'football', emoji: '⚽', name: 'Football', color: '#22c55e' },
			{ id: 'tennis', emoji: '🎾', name: 'Tennis', color: '#3b82f6' },
			{ id: 'formula1', emoji: '🏎️', name: 'F1', color: '#ef4444' },
			{ id: 'chess', emoji: '♟️', name: 'Chess', color: '#6b7280' },
			{ id: 'esports', emoji: '🎮', name: 'Esports', color: '#8b5cf6' }
		];

		return sports.map(sport => {
			const isActive = this.preferences.isFavoriteSport(sport.id);
			return `
				<button class="sport-toggle" data-sport="${sport.id}" data-color="${sport.color}" style="
					padding: 8px 12px;
					background: ${isActive ? sport.color : 'transparent'};
					border: 1px solid ${isActive ? sport.color : `${sport.color}33`};
					border-radius: 12px;
					color: ${isActive ? 'white' : 'var(--text)'};
					font-size: 0.85rem;
					cursor: pointer;
					transition: all 0.2s;
				">
					<span style="margin-right: 4px;">${sport.emoji}</span>
					${sport.name}
				</button>
			`;
		}).join('');
	}

	createTeamList(sport) {
		const teams = this.preferences.getFavoriteTeams(sport);
		if (teams.length === 0) {
			return '<div style="color: var(--muted); font-size: 0.8rem;">No favorite teams yet</div>';
		}
		return teams.map(team => `
			<div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
				<span style="font-size: 0.85rem;">${team}</span>
				<button class="remove-team" data-sport="${sport}" data-team="${team}" style="
					background: none;
					border: none;
					color: var(--muted);
					cursor: pointer;
					font-size: 16px;
				">×</button>
			</div>
		`).join('');
	}

	createPlayerList(sport) {
		const players = this.preferences.getFavoritePlayers(sport);
		if (players.length === 0) {
			return '<div style="color: var(--muted); font-size: 0.8rem;">No favorite players yet</div>';
		}
		return players.map(player => `
			<div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
				<span style="font-size: 0.85rem;">${player}</span>
				<button class="remove-player" data-sport="${sport}" data-player="${player}" style="
					background: none;
					border: none;
					color: var(--muted);
					cursor: pointer;
					font-size: 16px;
				">×</button>
			</div>
		`).join('');
	}

	attachEventListeners() {
		// Close button
		document.getElementById('closeSettings').addEventListener('click', () => {
			this.closeSettings();
		});

		// Sport toggles
		document.querySelectorAll('.sport-toggle').forEach(button => {
			button.addEventListener('click', (e) => {
				const sport = e.currentTarget.dataset.sport;
				const color = e.currentTarget.dataset.color;
				const isActive = this.preferences.toggleFavoriteSport(sport);
				
				// Update button style with sport-specific color
				e.currentTarget.style.background = isActive ? color : 'transparent';
				e.currentTarget.style.borderColor = isActive ? color : `${color}33`;
				e.currentTarget.style.color = isActive ? 'white' : 'var(--text)';
				
				// Trigger dashboard refresh
				if (window.simpleDashboard) {
					window.simpleDashboard.renderFilteredEvents();
				}
			});
		});

		// Add team
		document.getElementById('addFootballTeam').addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && e.target.value.trim()) {
				this.preferences.addFavoriteTeam('football', e.target.value.trim());
				document.getElementById('footballTeams').innerHTML = this.createTeamList('football');
				e.target.value = '';
				this.attachTeamListeners();
				
				// Trigger dashboard refresh
				if (window.simpleDashboard) {
					window.simpleDashboard.renderFilteredEvents();
				}
			}
		});

		// Add player
		document.getElementById('addGolfPlayer').addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && e.target.value.trim()) {
				this.preferences.addFavoritePlayer('golf', e.target.value.trim());
				document.getElementById('golfPlayers').innerHTML = this.createPlayerList('golf');
				e.target.value = '';
				this.attachPlayerListeners();
				
				// Trigger dashboard refresh
				if (window.simpleDashboard) {
					window.simpleDashboard.renderFilteredEvents();
				}
			}
		});

		// View mode buttons
		document.querySelectorAll('.view-mode-btn').forEach(button => {
			button.addEventListener('click', (e) => {
				const mode = e.currentTarget.dataset.mode;
				
				// Update button styles
				document.querySelectorAll('.view-mode-btn').forEach(btn => {
					if (btn.dataset.mode === mode) {
						btn.style.background = 'var(--accent)';
						btn.style.borderColor = 'var(--accent)';
						btn.style.color = 'white';
					} else {
						btn.style.background = 'transparent';
						btn.style.borderColor = 'var(--border)';
						btn.style.color = 'var(--muted)';
					}
				});
				
				// Set the view mode
				if (window.simpleDashboard) {
					window.simpleDashboard.setViewMode(mode);
					this.preferences.setDefaultView(mode);
				}
			});
		});

		// Set initial view mode button state
		const currentView = this.preferences.getDefaultView() || 'list';
		document.querySelectorAll('.view-mode-btn').forEach(btn => {
			if (btn.dataset.mode === currentView) {
				btn.style.background = 'var(--accent)';
				btn.style.borderColor = 'var(--accent)';
				btn.style.color = 'white';
			}
		});

		// Reset button
		document.getElementById('resetPreferences').addEventListener('click', () => {
			if (confirm('Are you sure you want to reset all preferences?')) {
				this.preferences.reset();
				this.closeSettings();
				location.reload();
			}
		});

		// Attach listeners for remove buttons
		this.attachTeamListeners();
		this.attachPlayerListeners();
	}

	attachTeamListeners() {
		document.querySelectorAll('.remove-team').forEach(button => {
			button.addEventListener('click', (e) => {
				const sport = e.target.dataset.sport;
				const team = e.target.dataset.team;
				this.preferences.removeFavoriteTeam(sport, team);
				document.getElementById('footballTeams').innerHTML = this.createTeamList('football');
				this.attachTeamListeners();
				
				// Trigger dashboard refresh
				if (window.simpleDashboard) {
					window.simpleDashboard.renderFilteredEvents();
				}
			});
		});
	}

	attachPlayerListeners() {
		document.querySelectorAll('.remove-player').forEach(button => {
			button.addEventListener('click', (e) => {
				const sport = e.target.dataset.sport;
				const player = e.target.dataset.player;
				this.preferences.removeFavoritePlayer(sport, player);
				document.getElementById('golfPlayers').innerHTML = this.createPlayerList('golf');
				this.attachPlayerListeners();
				
				// Trigger dashboard refresh
				if (window.simpleDashboard) {
					window.simpleDashboard.renderFilteredEvents();
				}
			});
		});
	}

	toggleSettings() {
		this.isOpen = !this.isOpen;
		const modal = document.getElementById('settingsModal');
		
		if (this.isOpen) {
			// Create backdrop for mobile
			if (window.innerWidth <= 768) {
				const backdrop = document.createElement('div');
				backdrop.id = 'settingsBackdrop';
				backdrop.style.cssText = `
					position: fixed;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background: rgba(0, 0, 0, 0.5);
					z-index: 100;
				`;
				backdrop.addEventListener('click', () => this.closeSettings());
				document.body.appendChild(backdrop);
			}
			modal.style.display = 'block';
			// Animate slide up on mobile
			if (window.innerWidth <= 768) {
				setTimeout(() => {
					modal.style.transform = 'translateY(0)';
				}, 10);
			}
		} else {
			this.closeSettings();
		}
	}

	closeSettings() {
		this.isOpen = false;
		const modal = document.getElementById('settingsModal');
		const backdrop = document.getElementById('settingsBackdrop');
		
		if (window.innerWidth <= 768) {
			modal.style.transform = 'translateY(100%)';
			setTimeout(() => {
				modal.style.display = 'none';
				if (backdrop) backdrop.remove();
			}, 300);
		} else {
			modal.style.display = 'none';
		}
	}
}

// Export for use
window.SettingsUI = SettingsUI;