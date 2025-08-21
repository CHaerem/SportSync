// Simple Settings UI for SportSync
class SettingsUI {
	constructor(preferencesManager) {
		this.preferences = preferencesManager;
		this.isOpen = false;
	}

	init() {
		this.createSettingsButton();
		this.createSettingsModal();
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
		modal.style.cssText = `
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
			{ id: 'golf', emoji: '⛳', name: 'Golf' },
			{ id: 'football', emoji: '⚽', name: 'Football' },
			{ id: 'tennis', emoji: '🎾', name: 'Tennis' },
			{ id: 'formula1', emoji: '🏎️', name: 'F1' },
			{ id: 'chess', emoji: '♟️', name: 'Chess' },
			{ id: 'esports', emoji: '🎮', name: 'Esports' }
		];

		return sports.map(sport => {
			const isActive = this.preferences.isFavoriteSport(sport.id);
			return `
				<button class="sport-toggle" data-sport="${sport.id}" style="
					padding: 8px 12px;
					background: ${isActive ? 'var(--accent)' : 'transparent'};
					border: 1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};
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
				const isActive = this.preferences.toggleFavoriteSport(sport);
				
				// Update button style
				e.currentTarget.style.background = isActive ? 'var(--accent)' : 'transparent';
				e.currentTarget.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
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
		modal.style.display = this.isOpen ? 'block' : 'none';
	}

	closeSettings() {
		this.isOpen = false;
		document.getElementById('settingsModal').style.display = 'none';
	}
}

// Export for use
window.SettingsUI = SettingsUI;