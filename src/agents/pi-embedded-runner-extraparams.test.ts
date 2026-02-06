import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { AssistantMessageEventStream } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { applyExtraParamsToAgent, resolveExtraParams } from "./pi-embedded-runner.js";

describe("resolveExtraParams", () => {
  it("returns undefined with no model config", () => {
    const result = resolveExtraParams({
      cfg: undefined,
      provider: "ollama",
      modelId: "gpt-oss-120b",
    });

    expect(result).toBeUndefined();
  });

  it("returns params for exact provider/model key", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "ollama/gpt-oss-120b": {
                params: {
                  temperature: 0.7,
                  maxTokens: 2048,
                },
              },
            },
          },
        },
      },
      provider: "ollama",
      modelId: "gpt-oss-120b",
    });

    expect(result).toEqual({
      temperature: 0.7,
      maxTokens: 2048,
    });
  });

  it("ignores unrelated model entries", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "ollama/gpt-oss-120b": {
                params: {
                  temperature: 0.7,
                },
              },
            },
          },
        },
      },
      provider: "ollama",
      modelId: "gpt-oss-20b",
    });

    expect(result).toBeUndefined();
  });
});

describe("applyExtraParamsToAgent", () => {
  it("applies extra params to stream options", () => {
    const calls: Array<SimpleStreamOptions | undefined> = [];
    const baseStreamFn: StreamFn = (_model, _context, options) => {
      calls.push(options);
      return new AssistantMessageEventStream();
    };
    const agent = { streamFn: baseStreamFn };

    const cfg = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-oss-120b": {
              params: {
                temperature: 0.2,
                maxTokens: 128,
              },
            },
          },
        },
      },
    };

    applyExtraParamsToAgent(agent, cfg, "ollama", "gpt-oss-120b");

    const model = {
      api: "openai-completions",
      provider: "ollama",
      id: "gpt-oss-120b",
    } as Model<"openai-completions">;
    const context: Context = { messages: [] };

    void agent.streamFn?.(model, context, { maxTokens: 256 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.temperature).toBe(0.2);
    expect(calls[0]?.maxTokens).toBe(256);
  });
});
