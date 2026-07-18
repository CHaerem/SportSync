//
//  EventFixtureBuilder.swift
//  SportivistaTests
//
//  WP-15: builds a minimal, valid `Event` for NotificationPlanner tests
//  without a hand-typed JSON literal per case. `Event` has no memberwise
//  initializer of its own (its hand-written `init(from:)` suppresses the
//  compiler-synthesized one — see Event.swift's header), so this round-trips
//  through JSON via the SAME `SportivistaJSON.decoder` real data decodes through —
//  only setting the handful of fields NotificationPlanner's tests exercise.
//

import Foundation

enum EventFixtureBuilder {
    private struct Seed: Encodable {
        var id: String?
        var sport: String
        var title: String
        var time: Date
        var homeTeam: String?
        var awayTeam: String?
        var isFavorite: Bool?
        var importance: Int?
        var source: String?
        var confidence: String?
        var verificationStatus: String?
        var streaming: [StreamingChannel]?
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    static func make(
        id: String,
        sport: String = "football",
        title: String = "Kamp",
        time: Date,
        homeTeam: String? = nil,
        awayTeam: String? = nil,
        isFavorite: Bool = false,
        importance: Int? = nil,
        source: String? = nil,
        confidence: String? = nil,
        verificationStatus: String? = nil,
        streaming: [StreamingChannel] = []
    ) -> Event {
        let seed = Seed(
            id: id, sport: sport, title: title, time: time,
            homeTeam: homeTeam, awayTeam: awayTeam,
            isFavorite: isFavorite, importance: importance,
            source: source, confidence: confidence, verificationStatus: verificationStatus,
            streaming: streaming.isEmpty ? nil : streaming
        )
        do {
            let data = try encoder.encode(seed)
            return try SportivistaJSON.decoder.decode(Event.self, from: data)
        } catch {
            fatalError("EventFixtureBuilder failed to round-trip a seed event: \(error)")
        }
    }
}
