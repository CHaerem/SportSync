//
//  SafariViewTests.swift
//  SportivistaTests
//
//  WP-115 — the in-app-browser wrapper's one unit-testable seam. SafariView is a
//  UIViewControllerRepresentable whose `Context` isn't publicly constructible and
//  whose SFSafariViewController reaches for the remote SafariViewService on `.view`
//  access — neither is friendly to a hostless bundle. The Reader-mode hint,
//  however, is a plain `SFSafariViewController.Configuration` flag, so that (the
//  behaviour the WP actually adds) is asserted here directly. The full "row → in-app
//  browser" flow is proved by the XCUITest smoke (NewsBoardUITests).
//

import XCTest
import SafariServices

final class SafariViewTests: XCTestCase {

	func testReaderHintOnConfiguration() {
		XCTAssertTrue(
			SafariView.makeConfiguration(entersReaderIfAvailable: true).entersReaderIfAvailable,
			"an article-like link should hint Reader mode"
		)
	}

	func testReaderHintOffByDefault() {
		XCTAssertFalse(
			SafariView.makeConfiguration(entersReaderIfAvailable: false).entersReaderIfAvailable,
			"a non-article link should not hint Reader mode"
		)
	}
}
