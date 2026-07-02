// lib/response-validator.js: guards against malformed ESPN responses.
import { describe, it, expect } from "vitest";
import { validateESPNScoreboard } from "../scripts/lib/response-validator.js";

describe("validateESPNScoreboard", () => {
	it("accepts a well-formed scoreboard", () => {
		const result = validateESPNScoreboard({ events: [{ id: "1", competitions: [{}] }] }, "test");
		expect(result.valid).toBe(true);
	});

	it("rejects null responses", () => {
		expect(validateESPNScoreboard(null, "test").valid).toBe(false);
	});

	it("rejects responses without an events array", () => {
		expect(validateESPNScoreboard({ foo: "bar" }, "test").valid).toBe(false);
	});
});
