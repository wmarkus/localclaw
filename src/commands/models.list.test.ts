import { describe, expect, it, vi } from "vitest";

const loadConfig = vi.fn();
const ensureOpenClawModelsJson = vi.fn().mockResolvedValue(undefined);
const resolveOpenClawAgentDir = vi.fn().mockReturnValue("/tmp/openclaw-agent");
const ensureAuthProfileStore = vi.fn().mockReturnValue({ version: 1, profiles: {} });
const listProfilesForProvider = vi.fn().mockReturnValue([]);
const resolveAuthProfileDisplayLabel = vi.fn(({ profileId }: { profileId: string }) => profileId);
const resolveAuthStorePathForDisplay = vi
  .fn()
  .mockReturnValue("/tmp/openclaw-agent/auth-profiles.json");
const resolveProfileUnusableUntilForDisplay = vi.fn().mockReturnValue(null);
const resolveEnvApiKey = vi.fn().mockReturnValue(undefined);
const getCustomProviderApiKey = vi.fn().mockReturnValue(undefined);
const modelRegistryState = {
  models: [] as Array<Record<string, unknown>>,
  available: [] as Array<Record<string, unknown>>,
};

vi.mock("../config/config.js", () => ({
  CONFIG_PATH: "/tmp/openclaw.json",
  STATE_DIR: "/tmp/openclaw-state",
  loadConfig,
}));

vi.mock("../agents/models-config.js", () => ({
  ensureOpenClawModelsJson,
}));

vi.mock("../agents/agent-paths.js", () => ({
  resolveOpenClawAgentDir,
}));

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveAuthProfileDisplayLabel,
  resolveAuthStorePathForDisplay,
  resolveProfileUnusableUntilForDisplay,
}));

vi.mock("../agents/model-auth.js", () => ({
  resolveEnvApiKey,
  getCustomProviderApiKey,
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  AuthStorage: class {},
  ModelRegistry: class {
    getAll() {
      return modelRegistryState.models;
    }
    getAvailable() {
      return modelRegistryState.available;
    }
  },
}));

function makeRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  };
}

describe("models list/status", () => {
  it("models status reports the configured default model", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "ollama/gpt-oss-120b" } },
    });
    const runtime = makeRuntime();

    const { modelsStatusCommand } = await import("./models/list.js");
    await modelsStatusCommand({ json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.resolvedDefault).toBe("ollama/gpt-oss-120b");
  });

  it("models list outputs available local models", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "ollama/gpt-oss-120b" } },
    });
    const runtime = makeRuntime();

    const model = {
      provider: "ollama",
      id: "gpt-oss-120b",
      name: "GPT OSS 120B",
      input: ["text"],
      baseUrl: "http://127.0.0.1:11434/v1",
      contextWindow: 128000,
    };

    modelRegistryState.models = [model];
    modelRegistryState.available = [model];

    const { modelsListCommand } = await import("./models/list.js");
    await modelsListCommand({ json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.models[0]?.key).toBe("ollama/gpt-oss-120b");
  });
});
