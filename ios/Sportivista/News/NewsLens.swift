//
//  NewsLens.swift
//  Sportivista
//
//  WP-106 — the CLIENT-side lens for the Nyheter board (two-layer architecture:
//  the server publishes catalog-wide, the profile is on-device). A news pointer
//  is shown when it is ABOUT something the owner follows, decided two ways
//  (spec § Nyheter-v0):
//
//    1. entityIds ∩ followed entities ≠ ∅  — the server stamped the headline
//       with a WP-05 entity id the profile follows;
//    2. sport matches a followed WHOLE-sport rule — the profile follows that
//       sport/umbrella-category as such (not merely a single entity within it).
//
//  It reuses the profile's own rule semantics + SportVocabulary (the same
//  keyword→sport / category→sports maps the assistant grounds against); it
//  invents NO new fuzzy matching. Whole-sport follows are the profile rules
//  whose entity is a `sport`/`category` type (or, when the entity index hasn't
//  synced, whose id carries the build-entities `sport-`/`category-` prefix).
//  Athlete/team/tournament rules do NOT open their whole sport — only their own
//  entityId — so following Hovland admits golf headlines that name Hovland, not
//  every golf headline.
//
//  `matchesEvent` applies the SAME lens to a full `Event` (used by the FREMOVER
//  section), matching on the event's own entity ids, its sport, or a sport-scoped
//  name/alias hit — mirroring AgendaViewModel.ruleMatches, not a new predicate.
//

import Foundation

struct NewsLens: Equatable {
	/// Entity ids the profile follows (one per rule).
	let followedEntityIds: Set<String>
	/// Canonical sport tags the profile follows WHOLESALE (sport/category rules).
	let followedSports: Set<String>

	init(followedEntityIds: Set<String> = [], followedSports: Set<String> = []) {
		self.followedEntityIds = followedEntityIds
		self.followedSports = followedSports
	}

	/// Derive the lens from the on-device profile, resolving each rule against
	/// the entity index to classify whole-sport / category follows.
	init(profile: InterestProfile, index: EntityIndex) {
		var ids = Set<String>()
		var sports = Set<String>()
		for rule in profile.rules {
			ids.insert(rule.entityId)
			let entity = index.entity(id: rule.entityId)
			switch entity?.type {
			case "sport":
				sports.insert(Self.canonicalSport(entity?.sport ?? rule.sport))
			case "category":
				for s in Self.categorySports(entityId: rule.entityId) { sports.insert(s) }
			case nil:
				// Index not synced (or the entity dropped out): fall back to the
				// build-entities id convention so a whole-sport follow still counts.
				if rule.entityId.hasPrefix("sport-") {
					sports.insert(Self.canonicalSport(String(rule.entityId.dropFirst("sport-".count))))
				} else if rule.entityId.hasPrefix("category-") {
					for s in Self.categorySports(entityId: rule.entityId) { sports.insert(s) }
				}
			default:
				break // athlete / team / tournament / league → entity-scoped only
			}
		}
		self.followedEntityIds = ids
		self.followedSports = sports
	}

	var isEmpty: Bool { followedEntityIds.isEmpty && followedSports.isEmpty }

	// MARK: - Matching

	/// Whether a news pointer is in the lens: an entityId hit OR a followed
	/// whole-sport hit (the item's sport tag, normalised through SportVocabulary
	/// so "formula1" ≡ "f1").
	func matches(_ item: NewsItem) -> Bool {
		if !item.entityIds.isEmpty, !followedEntityIds.isDisjoint(with: Set(item.entityIds)) { return true }
		return followedSports.contains(Self.canonicalSport(item.sport))
	}

	/// The SAME lens over a full event (FREMOVER). A whole-sport follow, an
	/// entity id the event carries (home/away team + Norwegian players), or a
	/// sport-scoped name/alias hit against the event's server haystack — the
	/// last mirroring AgendaViewModel.ruleMatches so a followed entity with no
	/// stamped id still matches its own events.
	func matchesEvent(_ event: Event, index: EntityIndex) -> Bool {
		if followedSports.contains(Self.canonicalSport(event.sport)) { return true }
		if !followedEntityIds.isDisjoint(with: SpoilerShield.entityIds(of: event)) { return true }
		let hay = FeedCompiler.serverHaystack(FeedEvent(from: event))
		for id in followedEntityIds {
			guard let e = index.entity(id: id) else { continue }
			if !e.sport.isEmpty, TextMatch.normalize(e.sport) != TextMatch.normalize(event.sport) { continue }
			if ([e.name] + e.aliases).contains(where: { !$0.isEmpty && TextMatch.containsName(hay, $0) }) { return true }
		}
		return false
	}

	// MARK: - Sport vocabulary bridges

	/// Normalise a raw sport tag to the canonical entity tag ("formula1" → "f1"),
	/// falling back to the lowercased raw when it isn't a known keyword.
	static func canonicalSport(_ raw: String) -> String {
		let lower = raw.lowercased()
		return SportVocabulary.keywordToSport[lower] ?? lower
	}

	/// The member sports of an umbrella-category rule (e.g. `category-winter-sports`
	/// → biathlon/cross-country/…), via SportVocabulary.categoryToSports.
	static func categorySports(entityId: String) -> [String] {
		let key = entityId.hasPrefix("category-") ? String(entityId.dropFirst("category-".count)) : entityId
		return SportVocabulary.categoryToSports[key] ?? []
	}
}
