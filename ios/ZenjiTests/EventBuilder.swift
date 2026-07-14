//
//  EventBuilder.swift
//  ZenjiTests
//
//  WP-14 test-only helper: `Event`'s hand-written `init(from decoder:)` (see
//  Event.swift's header on why — decode-with-defaults for fields the schema
//  doesn't strictly require) suppresses Swift's synthesized memberwise
//  initializer, so the only way to construct one is to decode it — exactly
//  as EventDecodingTests already does from a literal JSON string. This
//  builds the JSON dictionary programmatically instead, so
//  AgendaViewModelTests/WidgetTimelineBuilderTests can express many small,
//  focused event variations without a wall of hand-typed JSON literals.
//

import Foundation

enum EventBuilder {
    static func make(
        sport: String,
        title: String,
        time: String,
        endTime: String? = nil,
        homeTeam: String? = nil,
        awayTeam: String? = nil,
        tournament: String? = nil,
        streaming: [[String: Any]] = [],
        norwegian: Bool = false,
        norwegianPlayers: [[String: Any]] = [],
        isFavorite: Bool = false,
        importance: Int? = nil,
        source: String? = nil,
        confidence: String? = nil,
        evidence: [String] = [],
        venue: String? = nil,
        summary: String? = nil,
        id: String? = nil,
        result: String? = nil,
        homeTeamEntityId: String? = nil,
        awayTeamEntityId: String? = nil
    ) -> Event {
        var dict: [String: Any] = ["sport": sport, "title": title, "time": time, "norwegian": norwegian, "isFavorite": isFavorite]
        if let endTime { dict["endTime"] = endTime }
        if let homeTeam { dict["homeTeam"] = homeTeam }
        if let awayTeam { dict["awayTeam"] = awayTeam }
        if let tournament { dict["tournament"] = tournament }
        if !streaming.isEmpty { dict["streaming"] = streaming }
        if !norwegianPlayers.isEmpty { dict["norwegianPlayers"] = norwegianPlayers }
        if let importance { dict["importance"] = importance }
        if let source { dict["source"] = source }
        if let confidence { dict["confidence"] = confidence }
        if !evidence.isEmpty { dict["evidence"] = evidence }
        if let venue { dict["venue"] = venue }
        if let summary { dict["summary"] = summary }
        if let id { dict["id"] = id }
        if let result { dict["result"] = result }
        if let homeTeamEntityId { dict["homeTeamEntityId"] = homeTeamEntityId }
        if let awayTeamEntityId { dict["awayTeamEntityId"] = awayTeamEntityId }
        // swiftlint:disable:next force_try
        let data = try! JSONSerialization.data(withJSONObject: dict)
        // swiftlint:disable:next force_try
        return try! ZenjiJSON.decoder.decode(Event.self, from: data)
    }
}
