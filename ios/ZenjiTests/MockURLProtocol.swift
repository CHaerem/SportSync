//
//  MockURLProtocol.swift
//  ZenjiTests
//
//  WP-12: a URLProtocol stub, injected via URLSessionConfiguration, that
//  SyncClientTests uses to fake the manifest.json / events.json / … HTTP
//  endpoints without any real network access. Routes purely on the request
//  URL's last path component (e.g. "manifest.json") — simplistic, but
//  sufficient for SyncClient's small, fixed set of endpoints.
//
//  Every request that reaches `startLoading()` is appended to
//  `recordedRequests` first, unconditionally — including ones with no
//  matching stub — so tests can assert exactly which files (if any) beyond
//  manifest.json were requested.
//

import Foundation

final class MockURLProtocol: URLProtocol {
    struct Stub {
        var statusCode: Int = 200
        var headers: [String: String] = [:]
        var body: Data = Data()
        var error: Error?
    }

    // Test code runs single-threaded through XCTest by default (this repo
    // doesn't opt into parallel test execution) and each test calls `reset()`
    // first — `nonisolated(unsafe)` mirrors the same reasoning ZenjiJSON.swift
    // uses for its formatter statics: this is deliberately shared, serially-
    // accessed state, not something the strict-concurrency checker needs to
    // referee.
    nonisolated(unsafe) static var stubs: [String: (URLRequest) -> Stub] = [:]
    nonisolated(unsafe) static var recordedRequests: [URLRequest] = []

    static func reset() {
        stubs = [:]
        recordedRequests = []
    }

    static func mockedSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        MockURLProtocol.recordedRequests.append(request)

        guard let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        guard let stubFactory = MockURLProtocol.stubs[url.lastPathComponent] else {
            client?.urlProtocol(self, didFailWithError: URLError(.fileDoesNotExist))
            return
        }

        let stub = stubFactory(request)
        if let error = stub.error {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        let response = HTTPURLResponse(
            url: url,
            statusCode: stub.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: stub.headers
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
