//
//  AssistantCommand.swift
//  Zenji
//
//  WP-66 — the assistant's THIRD intent arm. WP-16 gave the command line a
//  MUTATION arm (change what you follow) and WP-16.4 an ANSWER arm (ask about
//  the agenda); this adds a COMMAND arm so the assistant can perform everything
//  the app's chrome can — switch theme, reset, re-onboard, share the profile,
//  open the memory page (+ forget), toggle the notification lead time, and open
//  an event's detail sheet. "Alt kan gjøres via assistenten."
//
//  Like the rest of the assistant core, this is plain, FoundationModels-FREE
//  Swift (Equatable/Sendable): the real model (FoundationModelsInterestAssistant)
//  and the deterministic mock (MockCommandParser) both produce one of these, and
//  AssistantViewModel validates + routes it identically — so the whole command
//  catalogue is unit-testable in CI without Apple Intelligence.
//
//  GROUNDING PRINCIPLE (unchanged from WP-16): a command is validated
//  DETERMINISTICALLY before it does anything. Harmless view/toggle actions run
//  directly with a calm receipt; the one DESTRUCTIVE action (reset) reuses the
//  WP-32 confirmation before it touches anything (`needsConfirmation`).
//

import Foundation

/// One app-level command the assistant can carry out. Its associated values are
/// already the resolved intent (a concrete `ThemeOverride`/`ResetLevel`, an
/// on/off flag, or the raw phrase for the free-text arms); AssistantViewModel
/// does the final validation (an `openEvent` phrase must resolve to a real
/// agenda row, a `forgetMemory` phrase to a remembered item) before acting.
enum AssistantCommand: Equatable, Sendable {
    /// Set the manual theme override (system / mørk / lys) — mirrors the header
    /// glyph's 3-step cycle, but addressable directly ("bytt til mørkt tema").
    case setTheme(ThemeOverride)
    /// Reuse the WP-32 reset flow. DESTRUCTIVE ⇒ `needsConfirmation`.
    case resetProfile(ResetLevel)
    /// Re-run the first-run onboarding ("sett opp det du følger på nytt").
    case rerunOnboarding
    /// Open the "Del / Importer profil" surface (QR + share link).
    case shareProfile
    /// Open the "Hva jeg vet om deg" memory page ("hva vet du om meg").
    case showMemory
    /// Forget personal memory. An empty / "alt" query forgets everything;
    /// otherwise the phrase targets the matching remembered item(s).
    case forgetMemory(query: String)
    /// Turn the notification lead time on (fire ahead of the event) or off
    /// (fire at start) — the NotificationPlanner's first control surface.
    case setNotificationLeadTime(enabled: Bool)
    /// Open an event's detail sheet by name ("vis Brann-kampen").
    case openEvent(query: String)

    /// Whether carrying this out requires an explicit confirmation. Only the
    /// destructive reset does (it reuses the WP-32 confirm ark); every other
    /// command is a harmless view/toggle action performed directly.
    var needsConfirmation: Bool {
        if case .resetProfile = self { return true }
        return false
    }

    /// The exact, honest one-sentence consequence shown in the confirm ark for a
    /// command that `needsConfirmation` (nil for the direct-execute commands).
    /// Mirrors AssistantPanel's WP-32 reset copy.
    var confirmationPrompt: String? {
        switch self {
        case .resetProfile(.followedOnly):
            return "Dette sletter det du følger på denne enheten og starter onboarding på nytt. Det jeg vet om deg beholdes. Kan ikke angres."
        case .resetProfile(.everything):
            return "Dette sletter det du følger og alt Sportivista vet om deg, fra denne enheten. Kan ikke angres."
        default:
            return nil
        }
    }

    /// A stable, deterministic token the eval scorer pins a golden expectation
    /// against — never shown to the user. Enum-argument commands encode the full
    /// `arm:value` (the value is part of the contract); free-text commands
    /// (`open`, `forget`) encode `arm:slug`, and the scorer matches those on the
    /// ARM alone (a free-generating model can't be held to an exact phrase).
    var evalToken: String {
        switch self {
        case let .setTheme(theme): return "theme:\(theme.rawValue)"
        case let .resetProfile(level): return "reset:\(level == .everything ? "everything" : "followed")"
        case .rerunOnboarding: return "onboarding"
        case .shareProfile: return "share"
        case .showMemory: return "memory"
        case let .forgetMemory(query): return "forget:\(AssistantCommand.slug(query))"
        case let .setNotificationLeadTime(enabled): return "notify:\(enabled ? "on" : "off")"
        case let .openEvent(query): return "open:\(AssistantCommand.slug(query))"
        }
    }

    /// A normalised slug for a free-text argument ("*" for empty), so the token
    /// is deterministic across the mock and the real model's phrasing.
    static func slug(_ query: String) -> String {
        let n = TextMatch.normalize(query).trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? "*" : n
    }
}
