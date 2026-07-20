// Sportivista — shell chrome: the date stamp, the footer (freshness + staleness),
// the quiet AI-budget line, and the iOS install hint.
// Extends window.Dashboard.prototype (see js/dashboard.js). Loads AFTER dashboard.js.
Object.assign(window.Dashboard.prototype, {

	/** Quiet AI-budget line — the quota fuel gauge (from usage-state.json). */
	renderUsage() {
		const el = document.getElementById('footer-usage');
		if (!el) return;
		const u = this.usage;
		if (!u || !u.parsed) { el.hidden = true; return; }
		const wk = u.week?.percentUsed, se = u.session?.percentUsed;
		if (u.skipAll) {
			const until = u.session?.resetsAt ? new Date(u.session.resetsAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }) : '';
			el.textContent = `AI-oppdatering pauset — kvote brukt opp${until ? `, nullstiller ${until}` : ''}`;
		} else {
			const conserving = u.status !== 'green' ? ' · sparer kvote' : '';
			el.textContent = `AI-budsjett: uke ${wk ?? '?'}% · økt ${se ?? '?'}%${conserving}`;
		}
		el.className = `footer-usage ${u.status || ''}`;
		el.hidden = false;
	},

	renderDate() {
		const el = document.getElementById('hero-date');
		if (el) el.textContent = new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' });
	},

	renderFooter() {
		const el = document.getElementById('footer-updated');
		if (!el) return;
		const updated = this.meta?.lastUpdated;
		if (!updated) return;
		const mins = Math.round((Date.now() - new Date(updated).getTime()) / SS_CONSTANTS.MS_PER_MINUTE);
		el.textContent = mins < 90 ? `Oppdatert for ${mins} min siden` : `Oppdatert ${new Date(updated).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo' })}`;

		// Quiet staleness signal. The pipeline runs hourly 05–21 UTC, so during
		// those hours data should be well under an hour old; if it's hours stale
		// the pipeline likely stopped publishing. Surface it calmly rather than
		// silently showing old data. (Overnight the pipeline is idle by design,
		// so we only flag during active hours to avoid nightly false alarms.)
		const stale = document.getElementById('footer-stale');
		if (!stale) return;
		const utcHour = new Date().getUTCHours();
		const activeHours = utcHour >= 6 && utcHour <= 22;
		if (activeHours && mins > 180) {
			stale.textContent = `Dataene er ~${Math.round(mins / 60)} t gamle — oppdatering kan ha stoppet`;
			stale.hidden = false;
		} else {
			stale.hidden = true;
		}
	},

	/** On iOS Safari (not yet installed), a quiet, dismissible install hint —
	 *  installing unlocks calendar reminders + offline. Can't auto-prompt on iOS. */
	// The web is the SECONDARY, desktop-primary surface; the iPhone app is the
	// primary product (notifications, widget, on-device assistant). Point desktop
	// visitors to it — calmly, one quiet footer link, dismissible. Gated on a
	// configured URL so we never ship a dead link: set SS_APP_STORE_URL once the
	// app is public (App Store id URL) or to a public TestFlight beta link.
	renderAppPromo() {
		// TODO(owner): set to the live App Store URL when public, e.g.
		// 'https://apps.apple.com/no/app/id6792373768'. Empty = the promo stays hidden.
		const SS_APP_STORE_URL = '';
		const el = document.getElementById('app-promo-link');
		if (!el || !SS_APP_STORE_URL) return;
		let dismissed = false;
		try { dismissed = localStorage.getItem('ss-app-promo') === 'off'; } catch { /* ignore */ }
		if (dismissed) return;
		el.href = SS_APP_STORE_URL;
		el.hidden = false;
	},

	maybeShowInstallHint() {
		const el = document.getElementById('install-hint');
		if (!el || typeof navigator === 'undefined') return;
		const ua = navigator.userAgent || '';
		const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const installed = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
		let dismissed = false;
		try { dismissed = localStorage.getItem('ss-install-hint') === 'off'; } catch { /* ignore */ }
		if (!isIOS || installed || dismissed) return;
		el.innerHTML = 'Legg Sportivista på Hjem-skjermen for varsler + offline: trykk Del-knappen nederst i Safari → «Legg til på Hjem-skjerm». <button type="button" class="install-dismiss" aria-label="Skjul">Skjul</button>';
		el.hidden = false;
		el.querySelector('.install-dismiss')?.addEventListener('click', () => {
			el.hidden = true;
			try { localStorage.setItem('ss-install-hint', 'off'); } catch { /* ignore */ }
		});
	},

});
