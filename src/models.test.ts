import { describe, it, expect } from "vitest";
import { ALL_MODELS, DEFAULT_MODEL, REASONING_MODELS } from "./models";

describe("REASONING_MODELS", () => {
  it("is a subset of ALL_MODELS, plus the dynamic-routing demo", () => {
    for (const id of REASONING_MODELS) {
      if (id === "dynamic/dynamic_routing_demo") continue;
      expect(ALL_MODELS).toContain(id);
    }
  });

  it("keeps the dynamic-routing demo selected by default", () => {
    expect(REASONING_MODELS).toContain("dynamic/dynamic_routing_demo");
  });

  it("excludes non-reasoning and deprecated models", () => {
    expect(REASONING_MODELS).not.toContain("@cf/meta/llama-guard-3-8b");
    expect(REASONING_MODELS).not.toContain(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    );
    // Deprecated in the Workers AI catalog, despite being tagged Reasoning.
    expect(ALL_MODELS).not.toContain("@cf/moonshotai/kimi-k2.5");
    expect(REASONING_MODELS).not.toContain("@cf/moonshotai/kimi-k2.5");
  });

  it("still lists non-default entries in ALL_MODELS (selectable, just not default)", () => {
    expect(ALL_MODELS).toContain("@cf/meta/llama-guard-3-8b");
    expect(ALL_MODELS).toContain("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });

  it("includes the default model", () => {
    expect(REASONING_MODELS).toContain(DEFAULT_MODEL);
    expect(DEFAULT_MODEL).toBe("@cf/moonshotai/kimi-k2.7-code");
  });

  it("drops deprecated / nonexistent model ids entirely", () => {
    for (const id of [
      "@cf/mistral/mistral-7b-instruct-v0.1",
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/meta/llama-3.1-8b-instruct-awq",
      "@cf/meta/llama-3-8b-instruct",
      "@cf/meta/llama-3-8b-instruct-awq",
      "@cf/meta/llama-2-7b-chat-fp16",
      "@cf/google/gemma-3-12b-it",
      "@cf/meta/llama-3.1-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.1-8b-instruct-fp8-fast"
    ]) {
      expect(ALL_MODELS).not.toContain(id);
    }
  });
});
