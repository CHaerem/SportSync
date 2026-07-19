// Sportivista — progressive disclosure: the extra context shown when a row is tapped
// (calm — hidden by default). The agenda's row toggle (bindAgendaExpand) lives in
// dashboard.js and calls eventDetail() from here.
// Extends window.Dashboard.prototype (see js/dashboard.js). Loads AFTER dashboard.js.
Object.assign(window.Dashboard.prototype, {

	/** Golf detail: each Norwegian in the field on its own line — tee time (Oslo)
	 *  + who they're out with (the marquee/featured group), plus the field size. */
	addGolfField(e, add) {
		const players = e.norwegianPlayers || [];
		const groups = e.featuredGroups || [];
		const groupFor = (name) => groups.find((g) => String(g.player || '').toLowerCase() === String(name || '').toLowerCase());
		let listed = false;
		for (const p of players) {
			const name = p.name || p;
			// WP-95: a player out of the tournament (cut/WD) shows their calm status
			// verbatim — never a tee time or "i feltet" as if still playing.
			if (p.status) {
				add(escapeHtml(name), escapeHtml(p.status));
				listed = true;
				continue;
			}
			const g = groupFor(name);
			const tee = p.teeTime || g?.teeTime;
			const mates = (g?.groupmates || []).map((m) => escapeHtml(m.name || m)).join(', ');
			const parts = [];
			if (tee) parts.push(`<span class="tbd">${escapeHtml(tee)}</span>`);
			if (mates) parts.push(`med ${mates}`);
			add(escapeHtml(name), parts.length ? parts.join(' · ') : 'i feltet');
			listed = true;
		}
		// A featured group whose Norwegian isn't in norwegianPlayers (defensive).
		for (const g of groups) {
			if (players.some((p) => String(p.name || p).toLowerCase() === String(g.player || '').toLowerCase())) continue;
			const mates = (g.groupmates || []).map((m) => escapeHtml(m.name || m)).join(', ');
			const parts = [];
			if (g.teeTime) parts.push(`<span class="tbd">${escapeHtml(g.teeTime)}</span>`);
			if (mates) parts.push(`med ${mates}`);
			if (parts.length) { add(escapeHtml(g.player), parts.join(' · ')); listed = true; }
		}
		if (!listed && players.length) add('Norske', escapeHtml(players.map((p) => p.name || p).join(', ')));
		if (e.totalPlayers) add('Felt', `${e.totalPlayers} i feltet`);
	},

	/** F1 detail: the championship top + the last race's podium — context we
	 *  already fetch (standings.f1 + recent-results.f1) but never surfaced. */
	addF1Context(add) {
		const drivers = this.standings?.f1?.drivers;
		if (Array.isArray(drivers) && drivers.length) {
			add('VM-stilling', drivers.slice(0, 5).map((d) => `${d.position}. ${escapeHtml(ssShortName(d.driver))} <span class="tbd">${d.points}</span>`).join(' · '));
		}
		const last = this.recentResults?.f1?.[0];
		if (last && Array.isArray(last.topDrivers) && last.topDrivers.length) {
			const podium = last.topDrivers.slice(0, 3).map((d) => `${d.position}. ${escapeHtml(ssShortName(d.driver))}`).join(' · ');
			add('Forrige løp', `${escapeHtml(ssShortName(last.raceName || ''))} — ${podium}`);
		}
	},

	/** True only when there's genuinely more to show — flat rows stay non-interactive. */
	hasDetail(e) {
		if (e.isSeries) return true;
		return !!(
			this.footballStanding(e) ||
			this.finishedResult(e) ||
			this.golfContext(e) ||
			(e.sport === 'f1' && (this.standings?.f1?.drivers?.length || this.recentResults?.f1?.length)) ||
			(e.venue && e.venue !== 'TBD') ||
			e.summary ||
			e.norwegianPlayers?.length ||
			e.featuredGroups?.length ||
			(Array.isArray(e.streaming) && e.streaming.length > 1) ||
			(e.source === 'ai-research' && e.evidence?.length)
		);
	},

	/** Split a summary into calm, escaped paragraphs so the "Om" section isn't one
	 *  wall of text. Explicit blank lines (\n\n) split first; otherwise a block of
	 *  more than two sentences is grouped into runs of two. Sentence boundaries are
	 *  only period/!/? followed by whitespace + a capital — so "kl. 21.00", "UCI
	 *  2.Pro" and "29. juli" stay intact. */
	aboutParagraphs(text) {
		const raw = String(text || '').trim();
		if (!raw) return [];
		const blocks = raw.split(/\n\s*\n/).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
		const out = [];
		for (const block of blocks) {
			const sentences = block
				.split(/(?<=[.!?…][»")'”’]?)\s+(?=[A-ZÆØÅ])/)
				.map((s) => s.trim())
				.filter(Boolean);
			if (sentences.length <= 2) { out.push(block); continue; }
			for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '));
		}
		return out.map((p) => escapeHtml(p));
	},

	eventDetail(e) {
		if (e.isSeries) return this.seriesDetail(e);
		const rows = [];
		const add = (k, v) => { if (v) rows.push(`<div class="d-row"><span class="d-k">${k}</span><span class="d-v">${v}</span></div>`); };

		add('Hvorfor', this.whyShown(e));
		const result = this.finishedResult(e);
		if (result) add('Resultat', result);
		add('Tabell', this.footballStanding(e));
		add('Ledende', this.golfContext(e));
		if (e.sport === 'f1') this.addF1Context(add);
		if (e.venue && e.venue !== 'TBD') add('Arena', escapeHtml(e.venue));
		// Key facts as their own quiet lines where the fields exist (never a wall).
		if (e.round) add('Runde', escapeHtml(e.round));
		if (e.surface) add('Underlag', escapeHtml(e.surface));
		if (e.format) add('Format', escapeHtml(e.format));
		if (e.sport === 'golf' && (e.norwegianPlayers?.length || e.featuredGroups?.length)) {
			this.addGolfField(e, add);
		} else if (e.norwegianPlayers?.length) {
			add('Norske', escapeHtml(e.norwegianPlayers.map((p) => p.name || p).join(', ')));
		}
		// "Om" — the summary, structured into calm paragraphs instead of one wall.
		// First paragraph carries the "Om" label; the rest continue under a blank key.
		this.aboutParagraphs(e.summary).forEach((p, i) => add(i === 0 ? 'Om' : '', p));

		const streams = Array.isArray(e.streaming) ? e.streaming : [];
		if (streams.length) {
			const chans = streams.map((s) => {
				const p = escapeHtml(String(s.platform || s));
				const label = s.tentative ? `${p} <span class="tbd">(bekreftes)</span>` : p;
				return this.streamLink(s) ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${p}</a>` : label;
			}).join(' · ');
			add('Se på', chans);
		}
		if (e.source === 'ai-research' && e.evidence?.length) {
			const links = e.evidence.map((u, i) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">kilde ${i + 1}</a>`).join(' · ');
			add('Funnet av AI', `${links} · sikkerhet: ${escapeHtml(e.confidence || 'ukjent')}`);
		}
		let html = rows.join('');
		const acts = [];
		if (typeof navigator !== 'undefined' && navigator.share) acts.push(`<button type="button" class="ev-act ev-share" data-event-id="${escapeHtml(e.id)}">Del</button>`);
		acts.push(`<button type="button" class="ev-act ev-report" data-event-id="${escapeHtml(e.id)}">Meld feil</button>`);
		html += `<div class="d-actions">${acts.join('')}</div>`;
		return html;
	},

	/** Why this event is on the board — the deterministic coverage reason.
	 *  WP-96: the web board is catalog-wide, so this explains what Sportivista
	 *  COVERS (this.covers), not one person's follows. */
	whyShown(e) {
		const at = this.covers?.alwaysTrack || {};
		const hay = [e.title, e.tournament, e.homeTeam, e.awayTeam,
			...(e.norwegianPlayers || []).map((p) => p.name || p), ...(e.participants || []).map((p) => p.name || p)].filter(Boolean).join(' ');
		// Sport-scoped so e.g. FC Barcelona doesn't match a Tour stage in the city Barcelona.
		const firstHit = (entries) => {
			for (const x of entries || []) {
				const sport = (x && typeof x === 'object') ? x.sport : null;
				if (sport && e.sport && sport !== e.sport) continue;
				if (trackedTerms([x]).some((t) => ssContainsTerm(hay, t))) return ssEntityName(x);
			}
			return null;
		};
		const athlete = firstHit(at.athletes);
		const team = firstHit(at.teams);
		const tourn = firstHit(at.tournaments);
		const SPORT = { football: 'fotball', golf: 'golf', f1: 'Formel 1', cycling: 'sykkel', tennis: 'tennis', chess: 'sjakk', esports: 'esport', athletics: 'friidrett', biathlon: 'skiskyting', 'cross-country': 'langrenn', alpine: 'alpint' };
		// "spiller" for ball/racket/board sports; "er med" for endurance sports.
		const plays = ['cycling', 'athletics', 'biathlon', 'cross-country', 'alpine', 'nordic', 'ski jumping'].includes(e.sport) ? 'er med' : 'spiller';
		let why;
		if (athlete) why = `Fordi <strong>${escapeHtml(athlete)}</strong> ${plays}`;
		else if (team) why = `Fordi <strong>${escapeHtml(team)}</strong> ${plays}`;
		else if (tourn) why = `Del av <strong>${escapeHtml(tourn)}</strong>, som vi dekker`;
		else if (e.source === 'ai-research') {
			const r = this.trackedReasonFor(e);
			why = r ? `AI valgte dette: ${escapeHtml(ssShortReason(r, 95))}` : 'AI-research fant dette';
		}
		else if (e.norwegian) why = 'Norsk deltakelse';
		else if (SPORT[e.sport]) why = `Vi dekker ${escapeHtml(SPORT[e.sport])}`;
		else why = 'Del av det vi dekker';
		if (e.mustWatch) why += ` · varsel ${this.notifyLead()} min før`;
		return why;
	},

	/** The research agent's reason for tracking the thing this ai-research event belongs to. */
	trackedReasonFor(e) {
		const t = this.tracked;
		if (!t) return null;
		const hay = `${e.title || ''} ${e.tournament || ''} ${(e.norwegianPlayers || []).map((p) => p.name || p).join(' ')}`;
		for (const entry of [...(t.tournaments || []), ...(t.leagues || []), ...(t.athletes || [])]) {
			if (!entry?.name || !entry.reason) continue;
			const core = entry.name.replace(/\s*\d{4}(?:\/\d{2})?/g, '').replace(/\s*\(.*?\)/g, '').trim();
			if (core.length >= 3 && ssContainsTerm(hay, core)) return entry.reason;
		}
		return null;
	},

	/** Native share sheet for an event (when · what · where). */
	shareEvent(e) {
		if (!e || typeof navigator === 'undefined' || !navigator.share) return;
		const d = new Date(e.time);
		const day = d.toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
		const chan = (Array.isArray(e.streaming) && e.streaming[0] && e.streaming[0].platform) || '';
		const text = [e.title, `${day} ${this.osloTime(d)}`, chan].filter(Boolean).join(' · ');
		navigator.share({ title: e.title, text, url: location.href }).catch(() => {});
	},

	/** Report a problem with an event → a prefilled GitHub feedback issue. */
	reportEvent(e) {
		if (!e) return;
		const d = new Date(e.time);
		const local = d.toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' });
		const chan = (Array.isArray(e.streaming) ? e.streaming.map((s) => s.platform || s).join(', ') : '') || '–';
		const body = [
			'### Hva er galt?', '<!-- feil tid, feil kanal, skal ikke være her, noe mangler … -->', '',
			'### Event',
			`- Sport: ${e.sport}`, `- Tittel: ${e.title}`, `- Tid: ${local}`,
			`- Kanal: ${chan}`, `- Kilde: ${e.source || 'statisk'}${e.confidence ? ` (${e.confidence})` : ''}`,
		].join('\n');
		const p = new URLSearchParams({ labels: 'event-feedback', title: `[feil] ${e.title}`, body });
		window.open(`https://github.com/${SS_REPO}/issues/new?${p.toString()}`, '_blank', 'noopener');
	},

	footballStanding(e) {
		if (e.sport !== 'football' || !e.homeTeam || !e.awayTeam) return '';
		const tables = this.standings?.football;
		if (!tables) return '';
		const tour = (e.tournament || '').toLowerCase();
		const table = tour.includes('la liga') || tour.includes('copa') ? tables.laLiga : tables.premierLeague;
		if (!Array.isArray(table) || table.length === 0) return '';
		const look = (name) => {
			const n = name.toLowerCase();
			const row = table.find((t) => t.team.toLowerCase().includes(n) || n.includes(t.team.toLowerCase()));
			return row ? `${escapeHtml(ssShortName(row.team))} ${row.position}. (${row.points})` : null;
		};
		const h = look(e.homeTeam), a = look(e.awayTeam);
		return h && a ? `${h} · ${a}` : '';
	},

	finishedResult(e) {
		if (!e.homeTeam || !e.awayTeam) return '';
		const fb = this.recentResults?.football;
		if (!Array.isArray(fb)) return '';
		const hn = e.homeTeam.toLowerCase(), an = e.awayTeam.toLowerCase();
		const m = fb.find((r) => {
			const rh = (r.homeTeam || '').toLowerCase(), ra = (r.awayTeam || '').toLowerCase();
			return (rh.includes(hn) || hn.includes(rh)) && (ra.includes(an) || an.includes(ra)) && r.homeScore != null;
		});
		return m ? `${escapeHtml(ssShortName(m.homeTeam))} ${m.homeScore}–${m.awayScore} ${escapeHtml(ssShortName(m.awayTeam))}` : '';
	},

	golfContext(e) {
		if (e.sport !== 'golf') return '';
		const tour = this.standings?.golf?.pga || this.standings?.golf?.dpWorld;
		const leader = tour?.leaderboard?.[0];
		return leader ? `${escapeHtml(leader.player)} (${escapeHtml(leader.score)})` : '';
	},

});
