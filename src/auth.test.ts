import { describe, it, expect } from "vitest";
import { extractAccessToken, toSessionName } from "./auth";

function req(headers: Record<string, string>): Request {
  return new Request("https://example.com/agents/chat-agent/x", { headers });
}

describe("extractAccessToken", () => {
  it("reads the Cf-Access-Jwt-Assertion header", () => {
    expect(extractAccessToken(req({ "Cf-Access-Jwt-Assertion": "tok123" }))).toBe(
      "tok123"
    );
  });

  it("falls back to the CF_Authorization cookie", () => {
    expect(
      extractAccessToken(req({ Cookie: "foo=bar; CF_Authorization=tok456" }))
    ).toBe("tok456");
  });

  it("returns null when no token is present", () => {
    expect(extractAccessToken(req({}))).toBeNull();
  });
});

describe("toSessionName", () => {
  it("produces a safe, deterministic name from an email", () => {
    expect(toSessionName("John@Acme.com")).toBe("u_john_acme_com");
  });

  it("collapses runs of unsafe characters", () => {
    expect(toSessionName("a..b@@c")).toBe("u_a_b_c");
  });
});
