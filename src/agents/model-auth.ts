import type { Api, Model } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.js";
import type { AuthProfileStore } from "./auth-profiles.js";
import { normalizeProviderId } from "./model-selection.js";

export { ensureAuthProfileStore, resolveAuthProfileOrder } from "./auth-profiles.js";

function resolveProviderConfig(
  cfg: OpenClawConfig | undefined,
  provider: string,
): ModelProviderConfig | undefined {
  const providers = cfg?.models?.providers ?? {};
  const direct = providers[provider] as ModelProviderConfig | undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeProviderId(provider);
  if (normalized === provider) {
    const matched = Object.entries(providers).find(
      ([key]) => normalizeProviderId(key) === normalized,
    );
    return matched?.[1];
  }
  return (
    (providers[normalized] as ModelProviderConfig | undefined) ??
    Object.entries(providers).find(([key]) => normalizeProviderId(key) === normalized)?.[1]
  );
}

export function getCustomProviderApiKey(
  cfg: OpenClawConfig | undefined,
  provider: string,
): string | undefined {
  const entry = resolveProviderConfig(cfg, provider);
  const key = entry?.apiKey?.trim();
  return key || undefined;
}

export type ResolvedProviderAuth = {
  apiKey?: string;
  profileId?: string;
  source: string;
  mode: "api-key";
};

export async function resolveApiKeyForProvider(params: {
  provider: string;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  const { provider, cfg } = params;
  const normalized = normalizeProviderId(provider);
  if (normalized !== "ollama") {
    throw new Error(`Provider "${provider}" is disabled in local-only mode.`);
  }

  const customKey = getCustomProviderApiKey(cfg, provider);
  const apiKey = customKey?.trim() || "ollama";
  return {
    apiKey,
    source: customKey ? "models.json" : "local",
    mode: "api-key",
  };
}

export type EnvApiKeyResult = { apiKey: string; source: string };
export type ModelAuthMode = "api-key" | "unknown";

export function resolveEnvApiKey(_provider: string): EnvApiKeyResult | null {
  return null;
}

export function resolveModelAuthMode(
  provider?: string,
  _cfg?: OpenClawConfig,
  _store?: AuthProfileStore,
): ModelAuthMode | undefined {
  const resolved = provider?.trim();
  if (!resolved) {
    return undefined;
  }
  return normalizeProviderId(resolved) === "ollama" ? "api-key" : "unknown";
}

export async function getApiKeyForModel(params: {
  model: Model<Api>;
  cfg?: OpenClawConfig;
  profileId?: string;
  preferredProfile?: string;
  store?: AuthProfileStore;
  agentDir?: string;
}): Promise<ResolvedProviderAuth> {
  return resolveApiKeyForProvider({
    provider: params.model.provider,
    cfg: params.cfg,
    profileId: params.profileId,
    preferredProfile: params.preferredProfile,
    store: params.store,
    agentDir: params.agentDir,
  });
}

export function requireApiKey(auth: ResolvedProviderAuth, provider: string): string {
  const key = auth.apiKey?.trim();
  if (key) {
    return key;
  }
  throw new Error(`No API key resolved for provider "${provider}" (auth mode: ${auth.mode}).`);
}
