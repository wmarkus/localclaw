import type { OpenClawConfig } from "../config/config.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { DEFAULT_MODEL } from "./defaults.js";

type ModelsConfig = NonNullable<OpenClawConfig["models"]>;
export type ProviderConfig = NonNullable<ModelsConfig["providers"]>[string];

const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
const OLLAMA_API_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 128000;
const OLLAMA_DEFAULT_MAX_TOKENS = 8192;
const OLLAMA_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    family?: string;
    parameter_size?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

function isLoopbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

async function discoverOllamaModels(): Promise<ModelDefinitionConfig[]> {
  // Skip Ollama discovery in test environments.
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }
  try {
    const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`Failed to discover Ollama models: ${response.status}`);
      return [];
    }
    const data = (await response.json()) as OllamaTagsResponse;
    if (!data.models || data.models.length === 0) {
      console.warn("No Ollama models found on local instance");
      return [];
    }
    return data.models.map((model) => ({
      id: model.name,
      name: model.name,
      reasoning:
        model.name.toLowerCase().includes("r1") || model.name.toLowerCase().includes("reasoning"),
      input: ["text"],
      cost: OLLAMA_DEFAULT_COST,
      contextWindow: OLLAMA_DEFAULT_CONTEXT_WINDOW,
      maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
    }));
  } catch (error) {
    console.warn(`Failed to discover Ollama models: ${String(error)}`);
    return [];
  }
}

function buildFallbackOllamaModel(): ModelDefinitionConfig {
  return {
    id: DEFAULT_MODEL,
    name: "GPT OSS 120B",
    reasoning: false,
    input: ["text"],
    cost: OLLAMA_DEFAULT_COST,
    contextWindow: OLLAMA_DEFAULT_CONTEXT_WINDOW,
    maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
  };
}

function buildOllamaProvider(models: ModelDefinitionConfig[]): ProviderConfig {
  return {
    baseUrl: OLLAMA_BASE_URL,
    apiKey: "ollama",
    api: "openai-completions",
    models,
  };
}

export function normalizeProviders(params: {
  providers: ModelsConfig["providers"];
  agentDir: string;
}): ModelsConfig["providers"] {
  const { providers } = params;
  if (!providers) {
    return providers;
  }
  let mutated = false;
  const next: Record<string, ProviderConfig> = {};

  for (const [key, provider] of Object.entries(providers)) {
    const normalizedKey = key.trim();
    let normalizedProvider = provider;

    if (normalizedKey !== "ollama") {
      if (normalizedKey) {
        throw new Error(
          `Provider "${normalizedKey}" is disabled in local-only mode. Use "ollama".`,
        );
      }
      throw new Error('Provider "" is disabled in local-only mode. Use "ollama".');
    }

    if (normalizedKey === "ollama") {
      const baseUrl = normalizedProvider.baseUrl?.trim() || OLLAMA_BASE_URL;
      if (!isLoopbackUrl(baseUrl)) {
        normalizedProvider = { ...normalizedProvider, baseUrl: OLLAMA_BASE_URL };
        mutated = true;
      }
      if (!normalizedProvider.apiKey?.trim()) {
        normalizedProvider = { ...normalizedProvider, apiKey: "ollama" };
        mutated = true;
      }
    }

    next[normalizedKey] = normalizedProvider;
  }

  return mutated ? next : providers;
}

export async function resolveImplicitProviders(_params: {
  agentDir: string;
}): Promise<ModelsConfig["providers"]> {
  const models = await discoverOllamaModels();
  const fallback = models.length > 0 ? models : [buildFallbackOllamaModel()];
  return { ollama: buildOllamaProvider(fallback) };
}
