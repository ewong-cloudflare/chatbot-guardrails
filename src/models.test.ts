import { describe, it, expect } from "vitest";
import { ALL_MODELS, DEFAULT_MODEL, TEXT_GENERATION_MODELS } from "./models";

describe("TEXT_GENERATION_MODELS", () => {
  it("is a subset of ALL_MODELS", () => {
    for (const id of TEXT_GENERATION_MODELS) {
      expect(ALL_MODELS).toContain(id);
    }
  });

  it("excludes the content-safety classifier and the dynamic-routing demo", () => {
    expect(TEXT_GENERATION_MODELS).not.toContain("@cf/meta/llama-guard-3-8b");
    expect(TEXT_GENERATION_MODELS).not.toContain(
      "dynamic/dynamic_routing_demo"
    );
  });

  it("still lists those excluded entries in ALL_MODELS (selectable, just not default)", () => {
    expect(ALL_MODELS).toContain("@cf/meta/llama-guard-3-8b");
    expect(ALL_MODELS).toContain("dynamic/dynamic_routing_demo");
  });

  it("includes the default model", () => {
    expect(TEXT_GENERATION_MODELS).toContain(DEFAULT_MODEL);
  });
});
