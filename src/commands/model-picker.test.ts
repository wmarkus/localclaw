import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  applyModelAllowlist,
  applyModelFallbacksFromSelection,
  promptDefaultModel,
  promptModelAllowlist,
} from "./model-picker.js";
import { makePrompter } from "./onboarding/__tests__/test-utils.js";

const loadModelCatalog = vi.hoisted(() => vi.fn());
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog,
}));

describe("promptDefaultModel", () => {
  it("returns the selected local model", async () => {
    loadModelCatalog.mockResolvedValue([
      { provider: "ollama", id: "gpt-oss-120b", name: "GPT OSS 120B" },
      { provider: "ollama", id: "gpt-oss-20b", name: "GPT OSS 20B" },
    ]);

    const select = vi.fn(async (params) => {
      const first = params.options[0];
      return first?.value ?? "";
    });
    const prompter = makePrompter({ select });
    const config = { agents: { defaults: {} } } as OpenClawConfig;

    const result = await promptDefaultModel({
      config,
      prompter,
      allowKeep: false,
      includeManual: false,
      ignoreAllowlist: true,
    });

    expect(result.model).toBe("ollama/gpt-oss-120b");
  });
});

describe("promptModelAllowlist", () => {
  it("filters to allowed keys when provided", async () => {
    loadModelCatalog.mockResolvedValue([
      { provider: "ollama", id: "gpt-oss-120b", name: "GPT OSS 120B" },
      { provider: "ollama", id: "gpt-oss-20b", name: "GPT OSS 20B" },
    ]);

    const multiselect = vi.fn(async (params) =>
      params.options.map((option: { value: string }) => option.value),
    );
    const prompter = makePrompter({ multiselect });
    const config = { agents: { defaults: {} } } as OpenClawConfig;

    await promptModelAllowlist({
      config,
      prompter,
      allowedKeys: ["ollama/gpt-oss-120b"],
    });

    const options = multiselect.mock.calls[0]?.[0]?.options ?? [];
    expect(options.map((opt: { value: string }) => opt.value)).toEqual(["ollama/gpt-oss-120b"]);
  });
});

describe("applyModelAllowlist", () => {
  it("preserves existing entries for selected models", () => {
    const config = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-oss-120b": { alias: "oss" },
            "ollama/gpt-oss-20b": { alias: "oss-small" },
          },
        },
      },
    } as OpenClawConfig;

    const next = applyModelAllowlist(config, ["ollama/gpt-oss-120b"]);
    expect(next.agents?.defaults?.models).toEqual({
      "ollama/gpt-oss-120b": { alias: "oss" },
    });
  });

  it("clears the allowlist when no models remain", () => {
    const config = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-oss-120b": { alias: "oss" },
          },
        },
      },
    } as OpenClawConfig;

    const next = applyModelAllowlist(config, []);
    expect(next.agents?.defaults?.models).toBeUndefined();
  });
});

describe("applyModelFallbacksFromSelection", () => {
  it("sets fallbacks from selection when the primary is included", () => {
    const config = {
      agents: {
        defaults: {
          model: { primary: "ollama/gpt-oss-120b" },
        },
      },
    } as OpenClawConfig;

    const next = applyModelFallbacksFromSelection(config, [
      "ollama/gpt-oss-120b",
      "ollama/gpt-oss-20b",
    ]);
    expect(next.agents?.defaults?.model).toEqual({
      primary: "ollama/gpt-oss-120b",
      fallbacks: ["ollama/gpt-oss-20b"],
    });
  });

  it("keeps existing fallbacks when the primary is not selected", () => {
    const config = {
      agents: {
        defaults: {
          model: { primary: "ollama/gpt-oss-120b", fallbacks: ["ollama/gpt-oss-20b"] },
        },
      },
    } as OpenClawConfig;

    const next = applyModelFallbacksFromSelection(config, ["ollama/gpt-oss-20b"]);
    expect(next.agents?.defaults?.model).toEqual({
      primary: "ollama/gpt-oss-120b",
      fallbacks: ["ollama/gpt-oss-20b"],
    });
  });
});
