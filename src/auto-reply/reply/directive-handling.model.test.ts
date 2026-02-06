import { describe, expect, it, vi } from "vitest";
import type { ModelAliasIndex } from "../../agents/model-selection.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { handleDirectiveOnly } from "./directive-handling.impl.js";
import { parseInlineDirectives } from "./directive-handling.js";
import {
  maybeHandleModelDirectiveInfo,
  resolveModelSelectionFromDirective,
} from "./directive-handling.model.js";

// Mock dependencies for directive handling persistence.
vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentConfig: vi.fn(() => ({})),
  resolveAgentDir: vi.fn(() => "/tmp/agent"),
  resolveSessionAgentId: vi.fn(() => "main"),
}));

vi.mock("../../agents/sandbox.js", () => ({
  resolveSandboxRuntimeStatus: vi.fn(() => ({ sandboxed: false })),
}));

vi.mock("../../config/sessions.js", () => ({
  updateSessionStore: vi.fn(async () => {}),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: vi.fn(),
}));

function baseAliasIndex(): ModelAliasIndex {
  return { byAlias: new Map(), byKey: new Map() };
}

function baseConfig(): OpenClawConfig {
  return {
    commands: { text: true },
    agents: { defaults: {} },
  } as unknown as OpenClawConfig;
}

describe("/model chat UX", () => {
  it("shows summary for /model with no args", async () => {
    const directives = parseInlineDirectives("/model");
    const cfg = { commands: { text: true } } as unknown as OpenClawConfig;

    const reply = await maybeHandleModelDirectiveInfo({
      directives,
      cfg,
      agentDir: "/tmp/agent",
      activeAgentId: "main",
      provider: "ollama",
      model: "gpt-oss-120b",
      defaultProvider: "ollama",
      defaultModel: "gpt-oss-120b",
      aliasIndex: baseAliasIndex(),
      allowedModelCatalog: [],
      resetModelOverride: false,
    });

    expect(reply?.text).toContain("Current:");
    expect(reply?.text).toContain("Browse: /models");
    expect(reply?.text).toContain("Switch: /model <provider/model>");
  });

  it("auto-applies closest match for typos", () => {
    const directives = parseInlineDirectives("/model ollama/claud-opus-4-5");
    const cfg = { commands: { text: true } } as unknown as OpenClawConfig;

    const resolved = resolveModelSelectionFromDirective({
      directives,
      cfg,
      agentDir: "/tmp/agent",
      defaultProvider: "ollama",
      defaultModel: "gpt-oss-120b",
      aliasIndex: baseAliasIndex(),
      allowedModelKeys: new Set(["ollama/gpt-oss-120b"]),
      allowedModelCatalog: [{ provider: "ollama", id: "gpt-oss-120b" }],
      provider: "ollama",
    });

    expect(resolved.modelSelection).toEqual({
      provider: "ollama",
      model: "gpt-oss-120b",
      isDefault: true,
    });
    expect(resolved.errorText).toBeUndefined();
  });
});

describe("handleDirectiveOnly model persist behavior (fixes #1435)", () => {
  const allowedModelKeys = new Set(["ollama/gpt-oss-120b", "ollama/gpt-4o"]);
  const allowedModelCatalog = [
    { provider: "ollama", id: "gpt-oss-120b" },
    { provider: "ollama", id: "gpt-4o" },
  ];

  it("shows success message when session state is available", async () => {
    const directives = parseInlineDirectives("/model ollama/gpt-4o");
    const sessionEntry: SessionEntry = {
      sessionId: "s1",
      updatedAt: Date.now(),
    };
    const sessionStore = { "agent:main:dm:1": sessionEntry };

    const result = await handleDirectiveOnly({
      cfg: baseConfig(),
      directives,
      sessionEntry,
      sessionStore,
      sessionKey: "agent:main:dm:1",
      storePath: "/tmp/sessions.json",
      elevatedEnabled: false,
      elevatedAllowed: false,
      defaultProvider: "ollama",
      defaultModel: "gpt-oss-120b",
      aliasIndex: baseAliasIndex(),
      allowedModelKeys,
      allowedModelCatalog,
      resetModelOverride: false,
      provider: "ollama",
      model: "gpt-oss-120b",
      initialModelLabel: "ollama/gpt-oss-120b",
      formatModelSwitchEvent: (label) => `Switched to ${label}`,
    });

    expect(result?.text).toContain("Model set to");
    expect(result?.text).toContain("ollama/gpt-4o");
    expect(result?.text).not.toContain("failed");
  });

  it("shows no model message when no /model directive", async () => {
    const directives = parseInlineDirectives("hello world");
    const sessionEntry: SessionEntry = {
      sessionId: "s1",
      updatedAt: Date.now(),
    };
    const sessionStore = { "agent:main:dm:1": sessionEntry };

    const result = await handleDirectiveOnly({
      cfg: baseConfig(),
      directives,
      sessionEntry,
      sessionStore,
      sessionKey: "agent:main:dm:1",
      storePath: "/tmp/sessions.json",
      elevatedEnabled: false,
      elevatedAllowed: false,
      defaultProvider: "ollama",
      defaultModel: "gpt-oss-120b",
      aliasIndex: baseAliasIndex(),
      allowedModelKeys,
      allowedModelCatalog,
      resetModelOverride: false,
      provider: "ollama",
      model: "gpt-oss-120b",
      initialModelLabel: "ollama/gpt-oss-120b",
      formatModelSwitchEvent: (label) => `Switched to ${label}`,
    });

    expect(result?.text ?? "").not.toContain("Model set to");
    expect(result?.text ?? "").not.toContain("failed");
  });
});
