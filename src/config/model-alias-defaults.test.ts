import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "./types.js";
import { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.js";
import { applyModelDefaults } from "./defaults.js";

describe("applyModelDefaults", () => {
  it("adds default aliases when models are present", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-oss-120b": {},
          },
        },
      },
    } satisfies OpenClawConfig;
    const next = applyModelDefaults(cfg);

    expect(next.agents?.defaults?.models?.["ollama/gpt-oss-120b"]?.alias).toBe("oss");
  });

  it("does not override existing aliases", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-oss-120b": { alias: "OSS" },
          },
        },
      },
    } satisfies OpenClawConfig;

    const next = applyModelDefaults(cfg);

    expect(next.agents?.defaults?.models?.["ollama/gpt-oss-120b"]?.alias).toBe("OSS");
  });

  it("respects explicit empty alias disables", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-oss-120b": { alias: "" },
            "ollama/oss-lite": {},
          },
        },
      },
    } satisfies OpenClawConfig;

    const next = applyModelDefaults(cfg);

    expect(next.agents?.defaults?.models?.["ollama/gpt-oss-120b"]?.alias).toBe("");
    expect(next.agents?.defaults?.models?.["ollama/oss-lite"]?.alias).toBeUndefined();
  });

  it("fills missing model provider defaults", () => {
    const cfg = {
      models: {
        providers: {
          ollama: {
            baseUrl: "http://127.0.0.1:11434/v1",
            apiKey: "ollama",
            api: "openai-completions",
            models: [{ id: "gpt-oss-120b", name: "GPT OSS 120B" }],
          },
        },
      },
    } satisfies OpenClawConfig;

    const next = applyModelDefaults(cfg);
    const model = next.models?.providers?.ollama?.models?.[0];

    expect(model?.reasoning).toBe(false);
    expect(model?.input).toEqual(["text"]);
    expect(model?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(model?.contextWindow).toBe(DEFAULT_CONTEXT_TOKENS);
    expect(model?.maxTokens).toBe(8192);
  });
});
