import { describe, it, expect } from "vitest";
import {
  describeGatewayError,
  isGatewayBlockMessage,
  isRefusalMessage
} from "./errors";

describe("describeGatewayError", () => {
  it("maps 2016 to a prompt guardrail message", () => {
    expect(describeGatewayError(new Error("error 2016: blocked"))).toBe(
      "Your prompt was blocked by a content guardrail."
    );
  });

  it("maps 2017 to a response guardrail message", () => {
    expect(describeGatewayError(new Error("code 2017"))).toBe(
      "The response was blocked by a content guardrail."
    );
  });

  it("maps 2029 to a DLP request message", () => {
    expect(describeGatewayError(new Error("2029 violation"))).toBe(
      "Your message was blocked by a Data Loss Prevention (DLP) policy."
    );
  });

  it("maps 2030 to a DLP response message", () => {
    expect(describeGatewayError(new Error("2030 violation"))).toBe(
      "The response was blocked by a Data Loss Prevention (DLP) policy."
    );
  });

  it("appends best-effort DLP profile detail when present", () => {
    const err = new Error(
      'blocked 2029 {"findings":[{"profile":{"profile_id":"Credit Card"}}],"action":"BLOCK"}'
    );
    expect(describeGatewayError(err)).toBe(
      "Your message was blocked by a Data Loss Prevention (DLP) policy: Credit Card."
    );
  });

  it("returns a generic message for unknown errors", () => {
    expect(describeGatewayError(new Error("network down"))).toBe(
      "Something went wrong while generating a response. Please try again."
    );
  });

  it("handles non-Error values without throwing", () => {
    expect(describeGatewayError("2016")).toBe(
      "Your prompt was blocked by a content guardrail."
    );
    expect(describeGatewayError(undefined)).toBe(
      "Something went wrong while generating a response. Please try again."
    );
  });

  it("reads the code from a structured AiGatewayError object", () => {
    const err = {
      message: "Request content blocked due to DLP policy violations",
      internalCode: 2030,
      httpCode: 424,
      name: "AiGatewayError",
      error: [
        {
          code: 2030,
          message: "Request content blocked due to DLP policy violations"
        }
      ],
      success: false
    };
    expect(describeGatewayError(err)).toBe(
      "The response was blocked by a Data Loss Prevention (DLP) policy."
    );
  });

  it("reads the code from a nested error array when message has no number", () => {
    const err = new Error("Prompt blocked due to security configurations");
    // attach a structured payload like the AI SDK / provider does
    (err as unknown as { error: unknown }).error = [{ code: 2016 }];
    expect(describeGatewayError(err)).toBe(
      "Your prompt was blocked by a content guardrail."
    );
  });

  it("never leaks raw JSON for an unmapped AiGatewayError", () => {
    const err = { name: "AiGatewayError", internalCode: 9999, foo: "bar" };
    expect(describeGatewayError(err)).toBe(
      "Something went wrong while generating a response. Please try again."
    );
  });
});

describe("isGatewayBlockMessage", () => {
  it("recognizes guardrail and DLP block messages", () => {
    expect(
      isGatewayBlockMessage("Your prompt was blocked by a content guardrail.")
    ).toBe(true);
    expect(
      isGatewayBlockMessage(
        "Your message was blocked by a Data Loss Prevention (DLP) policy."
      )
    ).toBe(true);
  });

  it("recognizes DLP messages that carry a profile suffix", () => {
    expect(
      isGatewayBlockMessage(
        "The response was blocked by a Data Loss Prevention (DLP) policy: Credit Card."
      )
    ).toBe(true);
  });

  it("returns false for generic or empty messages", () => {
    expect(
      isGatewayBlockMessage(
        "Something went wrong while generating a response. Please try again."
      )
    ).toBe(false);
    expect(isGatewayBlockMessage(undefined)).toBe(false);
  });
});

describe("isRefusalMessage", () => {
  it("detects explicit safety refusals", () => {
    expect(
      isRefusalMessage(
        "I can't help with that. If you need parenting strategies, I can discuss those."
      )
    ).toBe(true);
    expect(
      isRefusalMessage(
        "I can't provide instructions on how to physically harm children."
      )
    ).toBe(true);
    expect(isRefusalMessage("I won't provide assistance with that.")).toBe(
      true
    );
    expect(isRefusalMessage("I'm unable to help with this request.")).toBe(
      true
    );
  });

  it("does not flag capability limitations or normal replies", () => {
    expect(
      isRefusalMessage(
        "I don't have access to current sports data. Is there something else I can help you with?"
      )
    ).toBe(false);
    expect(
      isRefusalMessage("Hello. I can analyze images and check weather.")
    ).toBe(false);
    expect(isRefusalMessage("Singapore: 19°C, rainy.")).toBe(false);
    expect(isRefusalMessage(undefined)).toBe(false);
  });
});
