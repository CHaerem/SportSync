//
//  NewsItem.swift
//  Sportivista
//
//  WP-103 server / WP-106 client — mirrors ONE element of docs/data/news.json
//  (`{ items: [ { id, title, link, source, sport, entityIds, publishedAt } ] }`),
//  the entity-stamped RSS pointers the Nyheter board lens-filters client-side.
//  Same forward-compatibility shape as the other Models/ types: unknown keys are
//  ignored by Codable, and the fields the pipeline always writes but that a
//  malformed payload could drop are defaulted via a hand-written `init(from:)`
//  (Swift's synthesised Decodable applies no stored-property default for a
//  missing non-Optional key). `publishedAt` is Optional so a pointer with a
//  missing/garbled timestamp still decodes (it simply sorts last).
//

import Foundation

struct NewsItem: Codable, Equatable, Identifiable {
	/// sha1-of-link (server) — the dedupe/stable id.
	var id: String
	var title: String
	var link: String
	/// RSS feed slug, e.g. "nrk-sport", "bbc-f1".
	var source: String
	/// Sport tag, e.g. "formula1", "cycling", "general".
	var sport: String
	/// WP-05 stable entity ids the server matched the headline against (may be
	/// empty — many headlines match no tracked entity).
	var entityIds: [String]
	var publishedAt: Date?

	private enum CodingKeys: String, CodingKey {
		case id, title, link, source, sport, entityIds, publishedAt
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		id = try c.decode(String.self, forKey: .id)
		title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
		link = try c.decodeIfPresent(String.self, forKey: .link) ?? ""
		source = try c.decodeIfPresent(String.self, forKey: .source) ?? ""
		sport = try c.decodeIfPresent(String.self, forKey: .sport) ?? ""
		entityIds = try c.decodeIfPresent([String].self, forKey: .entityIds) ?? []
		publishedAt = try c.decodeIfPresent(Date.self, forKey: .publishedAt)
	}

	init(id: String, title: String, link: String, source: String, sport: String, entityIds: [String] = [], publishedAt: Date? = nil) {
		self.id = id
		self.title = title
		self.link = link
		self.source = source
		self.sport = sport
		self.entityIds = entityIds
		self.publishedAt = publishedAt
	}
}

/// The top-level `docs/data/news.json` object: `{ items: [...] }`. A missing or
/// non-array `items` decodes to an empty list rather than throwing (an empty
/// NYTT section, never a crash).
struct NewsFeed: Codable, Equatable {
	var items: [NewsItem]

	init(items: [NewsItem] = []) { self.items = items }

	private enum CodingKeys: String, CodingKey { case items }

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		items = try c.decodeIfPresent([NewsItem].self, forKey: .items) ?? []
	}
}
