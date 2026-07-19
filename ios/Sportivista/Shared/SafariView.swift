//
//  SafariView.swift
//  Sportivista
//
//  WP-115 — a thin SwiftUI wrapper around SFSafariViewController so an outbound
//  link opens IN-APP (a sheet over the current surface) instead of throwing the
//  user out to Safari. It lives in Shared/ because two surfaces open links: the
//  Nyheter board's NYTT pointers (this PR) and — deferred to WP-127 — the event
//  detail's AI-provenance evidence/source links, which reuse this same wrapper.
//
//  SFSafariViewController is deliberate (not a bare WKWebView): it brings Reader
//  mode, the reading list, AutoFill, content blockers, and — crucial for the DSM
//  art. 15 pointer contract — its OWN «Åpne i Safari» / share menu, so the user
//  always keeps a first-class escape to the real browser. It also never inlines
//  our own text: it loads the publisher's page, so a pointer stays a pointer.
//  Callers add a context-menu «Åpne i Safari» too, for discoverability before
//  opening.
//
//  Reader mode is HINTED (`entersReaderIfAvailable`) for article-like links so a
//  news story lands as clean text; it is best-effort, honoured only when Safari
//  detects an article and a no-op otherwise.
//

import SwiftUI
import SafariServices

struct SafariView: UIViewControllerRepresentable {
	let url: URL
	/// Hint Safari to enter Reader mode when it detects an article (best-effort).
	var entersReaderIfAvailable: Bool = false
	/// An additive accessibility identifier stamped on the presented controller's
	/// view, so an XCUITest can prove the IN-APP browser (not external Safari)
	/// opened.
	var accessibilityId: String? = nil

	func makeUIViewController(context: Context) -> SFSafariViewController {
		let controller = SFSafariViewController(
			url: url,
			configuration: Self.makeConfiguration(entersReaderIfAvailable: entersReaderIfAvailable)
		)
		// Amber is the one accent (DESIGN.md) — tint the chrome to match.
		controller.preferredControlTintColor = UIColor(SportivistaTokens.accent)
		controller.dismissButtonStyle = .close
		if let accessibilityId { controller.view.accessibilityIdentifier = accessibilityId }
		return controller
	}

	// SFSafariViewController's URL is fixed at init and each presentation makes a
	// fresh one (the sheet is item-keyed), so there is nothing to update in place.
	func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}

	/// The Reader-hint configuration, split out so it is unit-testable without
	/// instantiating the controller — whose `.view` would reach for the remote
	/// SafariViewService, which is undesirable in a hostless test bundle.
	/// `nonisolated` so the hostless test (a nonisolated context) can call it —
	/// the `UIViewControllerRepresentable` conformance otherwise makes every member
	/// `@MainActor`, and returning the non-`Sendable` `Configuration` across that
	/// boundary is rejected under Swift 6.
	nonisolated static func makeConfiguration(entersReaderIfAvailable: Bool) -> SFSafariViewController.Configuration {
		let config = SFSafariViewController.Configuration()
		config.entersReaderIfAvailable = entersReaderIfAvailable
		return config
	}
}
