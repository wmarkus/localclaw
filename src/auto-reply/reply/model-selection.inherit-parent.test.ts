import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { createModelSelectionState } from "./model-selection.js";

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(async () => [
    { provider: "ollama", id: "local-small", name: "Local Small" },
    { provider: "ollama", id: "local-medium", name: "Local Medium" },
    { provider: "ollama", id: "gpt-oss-120b", name: "GPT OSS 120B" },
  ]),
}));

const defaultProvider = "ollama";
const defaultModel = "local-small";

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "session-id",
  updatedAt: Date.now(),
  ...overrides,
});

async function resolveState(params: {
  cfg: OpenClawConfig;
  sessionEntry: ReturnType<typeof makeEntry>;
  sessionStore: Record<string, ReturnType<typeof makeEntry>>;
  sessionKey: string;
  parentSessionKey?: string;
}) {
  return createModelSelectionState({
    cfg: params.cfg,
    agentCfg: params.cfg.agents?.defaults,
    sessionEntry: params.sessionEntry,
    sessionStore: params.sessionStore,
    sessionKey: params.sessionKey,
    parentSessionKey: params.parentSessionKey,
    defaultProvider,
    defaultModel,
    provider: defaultProvider,
    model: defaultModel,
    hasModelDirective: false,
  });
}

describe("createModelSelectionState parent inheritance", () => {
  it("inherits parent override from explicit parentSessionKey", async () => {
    const cfg = {} as OpenClawConfig;
    const parentKey = "agent:main:discord:channel:c1";
    const sessionKey = "agent:main:discord:channel:c1:thread:123";
    const parentEntry = makeEntry({
      providerOverride: "ollama",
      modelOverride: "local-medium",
    });
    const sessionEntry = makeEntry();
    const sessionStore = {
      [parentKey]: parentEntry,
      [sessionKey]: sessionEntry,
    };

    const state = await resolveState({
      cfg,
      sessionEntry,
      sessionStore,
      sessionKey,
      parentSessionKey: parentKey,
    });

    expect(state.provider).toBe("ollama");
    expect(state.model).toBe("local-medium");
  });

  it("derives parent key from topic session suffix", async () => {
    const cfg = {} as OpenClawConfig;
    const parentKey = "agent:main:telegram:group:123";
    const sessionKey = "agent:main:telegram:group:123:topic:99";
    const parentEntry = makeEntry({
      providerOverride: "ollama",
      modelOverride: "local-medium",
    });
    const sessionEntry = makeEntry();
    const sessionStore = {
      [parentKey]: parentEntry,
      [sessionKey]: sessionEntry,
    };

    const state = await resolveState({
      cfg,
      sessionEntry,
      sessionStore,
      sessionKey,
    });

    expect(state.provider).toBe("ollama");
    expect(state.model).toBe("local-medium");
  });

  it("prefers child override over parent", async () => {
    const cfg = {} as OpenClawConfig;
    const parentKey = "agent:main:telegram:group:123";
    const sessionKey = "agent:main:telegram:group:123:topic:99";
    const parentEntry = makeEntry({
      providerOverride: "ollama",
      modelOverride: "gpt-4o",
    });
    const sessionEntry = makeEntry({
      providerOverride: "ollama",
      modelOverride: "gpt-oss-120b",
    });
    const sessionStore = {
      [parentKey]: parentEntry,
      [sessionKey]: sessionEntry,
    };

    const state = await resolveState({
      cfg,
      sessionEntry,
      sessionStore,
      sessionKey,
    });

    expect(state.provider).toBe("ollama");
    expect(state.model).toBe("gpt-oss-120b");
  });

  it("ignores parent override when disallowed", async () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "ollama/gpt-4o-mini": {},
          },
        },
      },
    } as OpenClawConfig;
    const parentKey = "agent:main:slack:channel:c1";
    const sessionKey = "agent:main:slack:channel:c1:thread:123";
    const parentEntry = makeEntry({
      providerOverride: "ollama",
      modelOverride: "gpt-oss-120b",
    });
    const sessionEntry = makeEntry();
    const sessionStore = {
      [parentKey]: parentEntry,
      [sessionKey]: sessionEntry,
    };

    const state = await resolveState({
      cfg,
      sessionEntry,
      sessionStore,
      sessionKey,
    });

    expect(state.provider).toBe(defaultProvider);
    expect(state.model).toBe(defaultModel);
  });
});
