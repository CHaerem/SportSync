//
//  NewsView.swift
//  Sportivista
//
//  WP-106 — the Nyheter side of the root segmented control («Uka | Nyheter»):
//  the four-section board from the Claude Design handoff (spec § Nyheter-v0,
//  DESIGN § Nyheter). It is ENDELIG — exactly four sections, no unread counters,
//  no engagement mechanics, no own refresh beyond the system's:
//
//    • «Det du følger ›» — a quiet link atop the board to WP-105's FollowedListView.
//    1. I DIN VERDEN I DAG — the editorial brief's headline (featured.json), one
//       quiet line, with a provenance ⓘ ("bygget på dine events og resultater").
//    2. NYTT — lens-matched RSS pointers (news.json); each row opens the source
//       in an IN-APP browser (WP-115: SFSafariViewController over the board, a
//       Reader-mode hint), keeping an «Åpne i Safari» escape in the row's context
//       menu and SFSafariVC's own menu — never inlining article text (DSM art. 15).
//    3. RESULTAT — followed teams' results, the score ALWAYS behind «Vis
//       resultat» when the spoiler shield applies (the same reveal the event
//       detail sheet uses).
//    4. FREMOVER — followed events beyond the near horizon (forvarsler).
//
//  Pure data (NewsBoard.build) is computed OFF the main actor by NewsModel and
//  cached there (WP-107) — this view is a thin renderer over `news.board`. The
//  model outlives the view (ContentView owns it), so a segment switch shows the
//  last board instantly and only rebuilds when the board is actually stale (a
//  profile change or a completed sync). No spinner ever (DESIGN § Bevegelse);
//  amber is the one accent.
//

import SwiftUI

struct NewsView: View {
	/// WP-107 — the shared, ContentView-owned board model. It survives root-segment
	/// switches, so `news.board` is already built when the user comes back to
	/// Nyheter (no per-switch disk-read/decode/compile on the main actor).
	var news: NewsModel
	/// WP-105 — the shared assistant view model, only so the «Det du følger»
	/// link can push FollowedListView (the same list Deg homes). The board reads
	/// its lens from the profile, never drives the assistant.
	var assistant: AssistantViewModel

	@State private var provenanceShown = false
	/// WP-115 — the URL currently shown in the in-app browser sheet. Item-keyed so
	/// each NYTT row presents its own SFSafariViewController; the board owns the
	/// single sheet, the rows just hand it a URL.
	@State private var browserTarget: BrowserTarget?
	/// WP-171 — the RESULTAT section's «Vis alle» disclosure. Collapsed by
	/// default: a capped section is the calm state, the full list is a choice.
	@State private var allResultsShown = false

	/// The board the model currently holds — a plain accessor so the section
	/// builders below read exactly as before.
	private var board: NewsBoard { news.board }

	var body: some View {
		List {
			followedLink
			briefSection
			nyttSection
			resultatSection
			fremoverSection
		}
		.listStyle(.insetGrouped)
		.scrollContentBackground(.hidden)
		.background(SportivistaTokens.background)
		.accessibilityIdentifier("news.board")
		// WP-115: a NYTT pointer opens IN-APP here (SFSafariViewController over the
		// board) rather than launching external Safari. Reader mode is hinted (news
		// pointers are article-like); SFSafariVC keeps its own «Åpne i Safari» menu.
		.sheet(item: $browserTarget) { target in
			SafariView(url: target.url, entersReaderIfAvailable: true, accessibilityId: "news.safari")
				.ignoresSafeArea()
		}
		// Only rebuilds when the board is stale (first appearance / after a
		// profile change or sync marked it). A plain switch onto an already-current
		// board is a no-op — the fix for the per-switch lag. Profile changes and
		// completed syncs are driven from ContentView (which owns the model), so
		// the board re-lenses even while Nyheter is off-screen.
		.task { news.rebuildIfStale() }
	}

	// MARK: - «Det du følger» link (quiet, atop the board)

	private var followedLink: some View {
		Section {
			// WP-147: a standard single-line inset NavigationLink row, matching
			// every other link (e.g. Deg › «Det du følger»). The earlier HStack +
			// Spacer + explicit `.frame(minHeight: 44)` forced this one-line row to
			// ~2× the normal height; the NavigationLink cell already gives a ≥44 pt
			// full-width tap target plus the chevron, so a plain Text label suffices.
			NavigationLink {
				FollowedListView(viewModel: assistant)
			} label: {
				Text("Det du følger")
					.font(.sportivista(.subheadline))
					.foregroundStyle(SportivistaTokens.label)
			}
			.accessibilityIdentifier("news.followedLink")
			.listRowBackground(SportivistaTokens.cell)
		}
	}

	// MARK: - 1 · I DIN VERDEN I DAG

	@ViewBuilder
	private var briefSection: some View {
		if let headline = board.headline {
			Section {
				VStack(alignment: .leading, spacing: 6) {
					HStack(alignment: .top, spacing: 8) {
						Text(headline)
							.font(.sportivista(.subheadline))
							.foregroundStyle(SportivistaTokens.label)
							.fixedSize(horizontal: false, vertical: true)
							.frame(maxWidth: .infinity, alignment: .leading)
						Button {
							provenanceShown.toggle()
						} label: {
							Image(systemName: "info.circle")
								.font(.sportivista(.footnote))
								.foregroundStyle(SportivistaTokens.secondaryLabel)
						}
						.buttonStyle(.plain)
						.accessibilityLabel("Hvorfor ser jeg dette?")
						.accessibilityIdentifier("news.brief.provenance")
					}
					if provenanceShown {
						Text("Bygget på dine events og resultater.")
							.font(.sportivista(.caption))
							.foregroundStyle(SportivistaTokens.secondaryLabel)
							.fixedSize(horizontal: false, vertical: true)
					}
				}
				.padding(.vertical, 2)
				.listRowBackground(SportivistaTokens.cell)
			} header: {
				sectionHeader("I DIN VERDEN I DAG", id: "news.section.brief")
			}
		}
	}

	// MARK: - 2 · NYTT

	private var nyttSection: some View {
		Section {
			if board.news.isEmpty {
				Text("Ingen nyheter om det du følger akkurat nå.")
					.font(.sportivista(.subheadline))
					.foregroundStyle(SportivistaTokens.secondaryLabel)
					.fixedSize(horizontal: false, vertical: true)
					.listRowBackground(SportivistaTokens.cell)
			} else {
				ForEach(board.news) { item in
					NewsPointerRow(item: item) { url in
						browserTarget = BrowserTarget(url: url)
					}
					.listRowBackground(SportivistaTokens.cell)
				}
			}
		} header: {
			sectionHeader("NYTT", id: "news.section.nytt")
		}
	}

	// MARK: - 3 · RESULTAT

	@ViewBuilder
	private var resultatSection: some View {
		if !board.results.isEmpty {
			// WP-171: capped (ro — the section must never become a result
			// stream), with the remainder behind ONE quiet «Vis alle» so nothing
			// is silently dropped. Same cap the web board uses (SS_RESULT_CAP).
			let shown = allResultsShown ? board.results : Array(board.results.prefix(NewsBoard.resultCap))
			let hidden = board.results.count - shown.count
			Section {
				ForEach(shown) { row in
					NewsResultRowView(row: row)
						.listRowBackground(SportivistaTokens.cell)
				}
				if hidden > 0 {
					Button {
						allResultsShown = true
					} label: {
						Text("Vis alle (\(board.results.count))")
							.font(.sportivista(.subheadline, weight: .semibold))
							.foregroundStyle(SportivistaTokens.accent)
							.frame(minHeight: 44, alignment: .leading)
							.contentShape(Rectangle())
					}
					.buttonStyle(.plain)
					.accessibilityIdentifier("news.results.showAll")
					.listRowBackground(SportivistaTokens.cell)
				}
			} header: {
				sectionHeader("RESULTAT", id: "news.section.resultat")
			}
		}
	}

	// MARK: - 4 · FREMOVER

	@ViewBuilder
	private var fremoverSection: some View {
		if !board.forward.isEmpty {
			Section {
				ForEach(board.forward) { row in
					NewsForwardRowView(row: row)
						.listRowBackground(SportivistaTokens.cell)
				}
			} header: {
				sectionHeader("FREMOVER", id: "news.section.fremover")
			}
		}
	}

	// MARK: - Shared header

	private func sectionHeader(_ text: String, id: String) -> some View {
		Text(text)
			.font(.sportivista(.footnote, weight: .semibold))
			.foregroundStyle(SportivistaTokens.secondaryLabel)
			.accessibilityIdentifier(id)
	}
}

// MARK: - In-app browser target

/// The URL currently shown in the in-app browser sheet — item-keyed so each NYTT
/// row presents its own SFSafariViewController.
private struct BrowserTarget: Identifiable {
	let url: URL
	var id: String { url.absoluteString }
}

// MARK: - NYTT row (opens the source IN-APP)

/// One news pointer. Whole row is a `Button` that opens the source in the IN-APP
/// browser (WP-115: SFSafariViewController over the board — the board owns the
/// sheet, this row just hands it the URL). Still a pointer, not an inline article
/// (DSM art. 15): the in-app browser loads the publisher's own page. A context
/// menu keeps the «Åpne i Safari» escape to the real browser. Rad-DNA = agendaens:
/// the type-tag slot is DELIBERATELY omitted in v0 (classification missing) but
/// the layout is ready for it; title on one line, then a quiet line of
/// sport · source ↗ · relative time.
private struct NewsPointerRow: View {
	let item: NewsItem
	/// Open the source IN-APP (the board presents the SFSafariViewController sheet).
	let onOpen: (URL) -> Void
	@Environment(\.openURL) private var openURL

	private var url: URL? { URL(string: item.link) }

	var body: some View {
		Button {
			if let url { onOpen(url) }
		} label: {
			content
		}
		.buttonStyle(.plain)
		.disabled(url == nil)
		.accessibilityIdentifier("news.item")
		.accessibilityAddTraits(.isLink)
		.contextMenu {
			if let url {
				Button {
					// The escape to the REAL browser — opens externally in Safari.
					openURL(url)
				} label: {
					Label("Åpne i Safari", systemImage: "safari")
				}
			}
		}
	}

	private var content: some View {
		VStack(alignment: .leading, spacing: 3) {
			Text(item.title)
				.font(.sportivista(.body))
				.foregroundStyle(SportivistaTokens.label)
				.lineLimit(1)
				.truncationMode(.tail)
				.frame(maxWidth: .infinity, alignment: .leading)
			HStack(spacing: 6) {
				// WP-108: the same canonical sport→symbol mark the agenda rows
				// use (DESIGN § Radens anatomi) — quiet tertiaryLabel, decorative
				// (the sport word beside it carries it for VoiceOver). Minimal: the
				// symbol only, the existing sport · source · time line is unchanged.
				Image(systemName: SportSymbol.name(for: NewsLens.canonicalSport(item.sport)))
					.foregroundStyle(SportivistaTokens.tertiaryLabel)
					.accessibilityHidden(true)
				Text(sportLabel)
					.foregroundStyle(SportivistaTokens.secondaryLabel)
				dot
				Text("\(item.source) ↗")
					.foregroundStyle(SportivistaTokens.accent)
					.lineLimit(1)
				if let rel = relativeTime {
					dot
					Text(rel)
						.foregroundStyle(SportivistaTokens.secondaryLabel)
						.lineLimit(1)
				}
				Spacer(minLength: 0)
			}
			.font(.sportivista(.caption))
		}
		.frame(minHeight: 44, alignment: .leading)
		.contentShape(Rectangle())
	}

	private var dot: some View {
		Text("·")
			.font(.sportivista(.caption))
			.foregroundStyle(SportivistaTokens.secondaryLabel.opacity(0.6))
	}

	private var sportLabel: String {
		SportVocabulary.display(for: NewsLens.canonicalSport(item.sport))
	}

	private var relativeTime: String? {
		guard let published = item.publishedAt else { return nil }
		return Self.relativeFormatter.localizedString(for: published, relativeTo: Date())
	}

	private static let relativeFormatter: RelativeDateTimeFormatter = {
		let f = RelativeDateTimeFormatter()
		f.locale = Locale(identifier: "nb_NO")
		f.unitsStyle = .abbreviated
		return f
	}()
}

// MARK: - RESULTAT row (spoiler-masked)

/// One recent result about something the user follows — any sport (WP-171).
/// When the spoiler shield applies, the outcome AND the detail lines (goal
/// scorers, podium, leaderboard — every one of them reveals the outcome) stay
/// behind a calm «Vis resultat» (eye.slash) until tapped — the exact same
/// reveal mechanism the event detail sheet uses (WP-30), so a glance never
/// spoils a game watched on delay. Only the outcome-neutral title + meta ever
/// show unmasked.
private struct NewsResultRowView: View {
	let row: NewsResultRow
	@State private var revealed = false

	/// The outcome-revealing content is visible only when the shield doesn't
	/// apply or the user asked for it. ONE gate for score + details, so a new
	/// detail line can never leak past the shield.
	private var outcomeVisible: Bool { !row.spoilerSensitive || revealed }

	var body: some View {
		VStack(alignment: .leading, spacing: 3) {
			Text(row.title.isEmpty ? "Kamp" : row.title)
				.font(.sportivista(.body))
				.foregroundStyle(SportivistaTokens.label)
				.fixedSize(horizontal: false, vertical: true)
				.frame(maxWidth: .infinity, alignment: .leading)
			scoreLine
			if let meta = row.meta, !meta.isEmpty {
				Text(meta)
					.font(.sportivista(.caption))
					.foregroundStyle(SportivistaTokens.secondaryLabel)
					.lineLimit(1)
			}
			if outcomeVisible {
				ForEach(Array(row.details.enumerated()), id: \.offset) { _, line in
					Text(line)
						.font(.sportivista(.caption))
						.foregroundStyle(SportivistaTokens.secondaryLabel)
						.fixedSize(horizontal: false, vertical: true)
						.frame(maxWidth: .infinity, alignment: .leading)
				}
			}
		}
		.padding(.vertical, 2)
	}

	@ViewBuilder
	private var scoreLine: some View {
		// The reveal must also appear for a row whose outcome lives ONLY in the
		// detail lines (e.g. a golf leaderboard with no single "score"), or the
		// shield would hide them with no way back.
		if row.score != nil || !row.details.isEmpty {
			if outcomeVisible {
				if let score = row.score {
					Text(score)
						.font(.sportivistaTabular(.subheadline, weight: .semibold))
						.foregroundStyle(SportivistaTokens.label)
				}
			} else {
				Button {
					revealed = true
				} label: {
					HStack(spacing: 6) {
						Image(systemName: "eye.slash")
							.font(.sportivista(.caption))
						Text("Vis resultat")
							.font(.sportivista(.subheadline, weight: .semibold))
					}
					.foregroundStyle(SportivistaTokens.accent)
					.frame(minHeight: 44, alignment: .leading)
					.contentShape(Rectangle())
				}
				.buttonStyle(.plain)
				.accessibilityIdentifier("news.result.reveal")
			}
		}
	}
}

// MARK: - FREMOVER row

/// One forvarsel: a calm date · what · where line. Non-interactive (the board's
/// outgoing traffic is NYTT's job); an `info.circle` marks an AI-research find.
private struct NewsForwardRowView: View {
	let row: NewsForwardRow

	var body: some View {
		HStack(alignment: .top, spacing: 10) {
			Text(row.dateLabel)
				.font(.sportivistaTabular(.footnote, weight: .medium))
				.foregroundStyle(SportivistaTokens.label)
				.lineLimit(1)
				.fixedSize(horizontal: true, vertical: false)
				.frame(minWidth: 72, alignment: .leading)
			VStack(alignment: .leading, spacing: 3) {
				Text(row.title)
					.font(.sportivista(.body))
					.foregroundStyle(SportivistaTokens.label)
					.fixedSize(horizontal: false, vertical: true)
					.frame(maxWidth: .infinity, alignment: .leading)
				HStack(spacing: 6) {
					if let meta = row.meta, !meta.isEmpty {
						Text(meta)
							.font(.sportivista(.caption))
							.foregroundStyle(SportivistaTokens.secondaryLabel)
							.lineLimit(1)
					}
					Text(row.channel)
						.font(.sportivista(.caption))
						.foregroundStyle(row.channel == "–" ? SportivistaTokens.secondaryLabel.opacity(0.5) : SportivistaTokens.secondaryLabel)
						.lineLimit(1)
				}
			}
			if row.isAIResearch {
				Image(systemName: "info.circle")
					.font(.sportivista(.footnote))
					.foregroundStyle(SportivistaTokens.secondaryLabel)
					.accessibilityLabel("Funnet av AI")
			}
		}
		.padding(.vertical, 2)
	}
}
