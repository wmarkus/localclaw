import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    resolveOpenClawAgentDir: vi.fn().mockReturnValue("/tmp/openclaw-agent"),
    resolveAgentDir: vi.fn().mockReturnValue("/tmp/openclaw-agent"),
    resolveAgentModelPrimary: vi.fn().mockReturnValue(undefined),
    resolveAgentModelFallbacksOverride: vi.fn().mockReturnValue(undefined),
    listAgentIds: vi.fn().mockReturnValue(["main", "helper"]),
    resolveConfiguredModelRef: vi
      .fn()
      .mockReturnValue({ provider: "ollama", model: "gpt-oss-120b" }),
    resolveDefaultModelForAgent: vi
      .fn()
      .mockReturnValue({ provider: "ollama", model: "gpt-oss-120b" }),
    getShellEnvAppliedKeys: vi.fn().mockReturnValue([]),
    shouldEnableShellEnvFallback: vi.fn().mockReturnValue(false),
    loadConfig: vi.fn().mockReturnValue({
      agents: {
        defaults: {
          model: { primary: "ollama/gpt-oss-120b", fallbacks: [] },
          models: { "ollama/gpt-oss-120b": { alias: "oss" } },
        },
      },
      models: { providers: {} },
      env: { shellEnv: { enabled: false } },
    }),
  };
});

vi.mock("../../agents/agent-paths.js", () => ({
  resolveOpenClawAgentDir: mocks.resolveOpenClawAgentDir,
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentDir: mocks.resolveAgentDir,
  resolveAgentModelPrimary: mocks.resolveAgentModelPrimary,
  resolveAgentModelFallbacksOverride: mocks.resolveAgentModelFallbacksOverride,
  listAgentIds: mocks.listAgentIds,
}));

vi.mock("../../infra/shell-env.js", () => ({
  getShellEnvAppliedKeys: mocks.getShellEnvAppliedKeys,
  shouldEnableShellEnvFallback: mocks.shouldEnableShellEnvFallback,
}));

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...actual,
    loadConfig: mocks.loadConfig,
  };
});

vi.mock("../../agents/model-selection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../agents/model-selection.js")>();
  return {
    ...actual,
    resolveConfiguredModelRef: mocks.resolveConfiguredModelRef,
    resolveDefaultModelForAgent: mocks.resolveDefaultModelForAgent,
  };
});

import { modelsStatusCommand } from "./list.status-command.js";

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

describe("modelsStatusCommand", () => {
  it("reports the configured default model", async () => {
    await modelsStatusCommand({ json: true }, runtime as never);
    const payload = JSON.parse(String((runtime.log as vi.Mock).mock.calls[0][0]));

    expect(mocks.resolveOpenClawAgentDir).toHaveBeenCalled();
    expect(payload.defaultModel).toBe("ollama/gpt-oss-120b");
  });

  it("uses agent overrides when provided", async () => {
    const localRuntime = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };
    const originalPrimary = mocks.resolveAgentModelPrimary.getMockImplementation();
    const originalFallbacks = mocks.resolveAgentModelFallbacksOverride.getMockImplementation();
    const originalAgentDir = mocks.resolveAgentDir.getMockImplementation();
    const originalDefaultModel = mocks.resolveDefaultModelForAgent.getMockImplementation();

    mocks.resolveAgentModelPrimary.mockReturnValue("ollama/gpt-oss-20b");
    mocks.resolveAgentModelFallbacksOverride.mockReturnValue(["ollama/gpt-oss-7b"]);
    mocks.resolveAgentDir.mockReturnValue("/tmp/openclaw-agent-custom");
    mocks.resolveDefaultModelForAgent.mockReturnValue({
      provider: "ollama",
      model: "gpt-oss-20b",
    });

    try {
      await modelsStatusCommand({ json: true, agent: "helper" }, localRuntime as never);
      const payload = JSON.parse(String((localRuntime.log as vi.Mock).mock.calls[0][0]));
      expect(payload.agentId).toBe("helper");
      expect(payload.agentDir).toBe("/tmp/openclaw-agent-custom");
      expect(payload.defaultModel).toBe("ollama/gpt-oss-20b");
      expect(payload.fallbacks).toEqual(["ollama/gpt-oss-7b"]);
    } finally {
      mocks.resolveAgentModelPrimary.mockImplementation(originalPrimary);
      mocks.resolveAgentModelFallbacksOverride.mockImplementation(originalFallbacks);
      mocks.resolveAgentDir.mockImplementation(originalAgentDir);
      mocks.resolveDefaultModelForAgent.mockImplementation(originalDefaultModel);
    }
  });
});
