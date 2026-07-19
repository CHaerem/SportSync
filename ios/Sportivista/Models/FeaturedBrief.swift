//
//  FeaturedBrief.swift
//  Sportivista
//
//  WP-106 — mirrors docs/data/featured.json, the editorial agent's brief:
//  `{ generatedAt, mode: "morning"|"evening", blocks: [ { type, text } ] }`.
//  The Nyheter board's «I DIN VERDEN I DAG» section shows the single `headline`
//  block as one quiet line (spec § Nyheter-v0: "editorial-briefens headline …
//  én stille blokk"). Only the headline is consumed today; the full block list
//  is decoded (forward-compatible) so a future block type needs no model change.
//

import Foundation

struct FeaturedBrief: Codable, Equatable {
	struct Block: Codable, Equatable {
		var type: String
		var text: String?

		private enum CodingKeys: String, CodingKey { case type, text }

		init(type: String, text: String?) {
			self.type = type
			self.text = text
		}

		init(from decoder: Decoder) throws {
			let c = try decoder.container(keyedBy: CodingKeys.self)
			type = try c.decodeIfPresent(String.self, forKey: .type) ?? ""
			text = try c.decodeIfPresent(String.self, forKey: .text)
		}
	}

	var generatedAt: Date?
	var mode: String?
	var blocks: [Block]

	private enum CodingKeys: String, CodingKey { case generatedAt, mode, blocks }

	init(generatedAt: Date? = nil, mode: String? = nil, blocks: [Block] = []) {
		self.generatedAt = generatedAt
		self.mode = mode
		self.blocks = blocks
	}

	init(from decoder: Decoder) throws {
		let c = try decoder.container(keyedBy: CodingKeys.self)
		generatedAt = try c.decodeIfPresent(Date.self, forKey: .generatedAt)
		mode = try c.decodeIfPresent(String.self, forKey: .mode)
		blocks = try c.decodeIfPresent([Block].self, forKey: .blocks) ?? []
	}

	/// The editorial headline — the first `headline` block's text, non-empty.
	/// `nil` when the brief carries none (the section is then hidden).
	var headline: String? {
		guard let text = blocks.first(where: { $0.type == "headline" })?.text, !text.isEmpty else { return nil }
		return text
	}
}
