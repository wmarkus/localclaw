import type { OpenClawConfig } from "./types.js";
import type { ModelDefinitionConfig } from "./types.models.js";
import { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.js";
import { DEFAULT_AGENT_MAX_CONCURRENT, DEFAULT_SUBAGENT_MAX_CONCURRENT } from "./agent-limits.js";
import { resolveTalkApiKey } from "./talk.js";

type WarnState = { warned: boolean };

let defaultWarnState: WarnState = { warned: false };

const DEFAULT_MODEL_ALIASES: Readonly<Record<string, string>> = {
  oss: "ollama/gpt-oss-120b",
  "gpt-oss": "ollama/gpt-oss-120b",
  "gpt-oss-120b": "ollama/gpt-oss-120b",
};

const DEFAULT_MODEL_COST: ModelDefinitionConfig["cost"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};
const DEFAULT_MODEL_INPUT: ModelDefinitionConfig["input"] = ["text"];
const DEFAULT_MODEL_MAX_TOKENS = 8192;

type ModelDefinitionLike = Partial<ModelDefinitionConfig> &
  Pick<ModelDefinitionConfig, "id" | "name">;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveModelCost(
  raw?: Partial<ModelDefinitionConfig["cost"]>,
): ModelDefinitionConfig["cost"] {
  return {
    input: typeof raw?.input === "number" ? raw.input : DEFAULT_MODEL_COST.input,
    output: typeof raw?.output === "number" ? raw.output : DEFAULT_MODEL_COST.output,
    cacheRead: typeof raw?.cacheRead === "number" ? raw.cacheRead : DEFAULT_MODEL_COST.cacheRead,
    cacheWrite:
      typeof raw?.cacheWrite === "number" ? raw.cacheWrite : DEFAULT_MODEL_COST.cacheWrite,
  };
}

export type SessionDefaultsOptions = {
  warn?: (message: string) => void;
  warnState?: WarnState;
};

export function applyMessageDefaults(cfg: OpenClawConfig): OpenClawConfig {
  const messages = cfg.messages;
  const hasAckScope = messages?.ackReactionScope !== undefined;
  if (hasAckScope) {
    return cfg;
  }

  const nextMessages = messages ? { ...messages } : {};
  nextMessages.ackReactionScope = "group-mentions";
  return {
    ...cfg,
    messages: nextMessages,
  };
}

export function applySessionDefaults(
  cfg: OpenClawConfig,
  options: SessionDefaultsOptions = {},
): OpenClawConfig {
  const session = cfg.session;
  if (!session || session.mainKey === undefined) {
    return cfg;
  }

  const trimmed = session.mainKey.trim();
  const warn = options.warn ?? console.warn;
  const warnState = options.warnState ?? defaultWarnState;

  const next: OpenClawConfig = {
    ...cfg,
    session: { ...session, mainKey: "main" },
  };

  if (trimmed && trimmed !== "main" && !warnState.warned) {
    warnState.warned = true;
    warn('session.mainKey is ignored; main session is always "main".');
  }

  return next;
}

export function applyTalkApiKey(config: OpenClawConfig): OpenClawConfig {
  const resolved = resolveTalkApiKey();
  if (!resolved) {
    return config;
  }
  const existing = config.talk?.apiKey?.trim();
  if (existing) {
    return config;
  }
  return {
    ...config,
    talk: {
      ...config.talk,
      apiKey: resolved,
    },
  };
}

export function applyModelDefaults(cfg: OpenClawConfig): OpenClawConfig {
  let mutated = false;
  let nextCfg = cfg;

  const providerConfig = nextCfg.models?.providers;
  if (providerConfig) {
    const nextProviders = { ...providerConfig };
    for (const [providerId, provider] of Object.entries(providerConfig)) {
      const models = provider.models;
      if (!Array.isArray(models) || models.length === 0) {
        continue;
      }
      let providerMutated = false;
      const nextModels = models.map((model) => {
        const raw = model as ModelDefinitionLike;
        let modelMutated = false;

        const reasoning = typeof raw.reasoning === "boolean" ? raw.reasoning : false;
        if (raw.reasoning !== reasoning) {
          modelMutated = true;
        }

        const input = raw.input ?? [...DEFAULT_MODEL_INPUT];
        if (raw.input === undefined) {
          modelMutated = true;
        }

        const cost = resolveModelCost(raw.cost);
        const costMutated =
          !raw.cost ||
          raw.cost.input !== cost.input ||
          raw.cost.output !== cost.output ||
          raw.cost.cacheRead !== cost.cacheRead ||
          raw.cost.cacheWrite !== cost.cacheWrite;
        if (costMutated) {
          modelMutated = true;
        }

        const contextWindow = isPositiveNumber(raw.contextWindow)
          ? raw.contextWindow
          : DEFAULT_CONTEXT_TOKENS;
        if (raw.contextWindow !== contextWindow) {
          modelMutated = true;
        }

        const defaultMaxTokens = Math.min(DEFAULT_MODEL_MAX_TOKENS, contextWindow);
        const maxTokens = isPositiveNumber(raw.maxTokens) ? raw.maxTokens : defaultMaxTokens;
        if (raw.maxTokens !== maxTokens) {
          modelMutated = true;
        }

        if (!modelMutated) {
          return model;
        }
        providerMutated = true;
        return {
          ...raw,
          reasoning,
          input,
          cost,
          contextWindow,
          maxTokens,
        } as ModelDefinitionConfig;
      });

      if (!providerMutated) {
        continue;
      }
      nextProviders[providerId] = { ...provider, models: nextModels };
      mutated = true;
    }

    if (mutated) {
      nextCfg = {
        ...nextCfg,
        models: {
          ...nextCfg.models,
          providers: nextProviders,
        },
      };
    }
  }

  const existingAgent = nextCfg.agents?.defaults;
  if (!existingAgent) {
    return mutated ? nextCfg : cfg;
  }
  const existingModels = existingAgent.models ?? {};
  if (Object.keys(existingModels).length === 0) {
    return mutated ? nextCfg : cfg;
  }

  const nextModels: Record<string, { alias?: string }> = {
    ...existingModels,
  };

  for (const [alias, target] of Object.entries(DEFAULT_MODEL_ALIASES)) {
    const entry = nextModels[target];
    if (!entry) {
      continue;
    }
    if (entry.alias !== undefined) {
      continue;
    }
    nextModels[target] = { ...entry, alias };
    mutated = true;
  }

  if (!mutated) {
    return cfg;
  }

  return {
    ...nextCfg,
    agents: {
      ...nextCfg.agents,
      defaults: { ...existingAgent, models: nextModels },
    },
  };
}

export function applyAgentDefaults(cfg: OpenClawConfig): OpenClawConfig {
  const agents = cfg.agents;
  const defaults = agents?.defaults;
  const hasMax =
    typeof defaults?.maxConcurrent === "number" && Number.isFinite(defaults.maxConcurrent);
  const hasSubMax =
    typeof defaults?.subagents?.maxConcurrent === "number" &&
    Number.isFinite(defaults.subagents.maxConcurrent);
  if (hasMax && hasSubMax) {
    return cfg;
  }

  let mutated = false;
  const nextDefaults = defaults ? { ...defaults } : {};
  if (!hasMax) {
    nextDefaults.maxConcurrent = DEFAULT_AGENT_MAX_CONCURRENT;
    mutated = true;
  }

  const nextSubagents = defaults?.subagents ? { ...defaults.subagents } : {};
  if (!hasSubMax) {
    nextSubagents.maxConcurrent = DEFAULT_SUBAGENT_MAX_CONCURRENT;
    mutated = true;
  }

  if (!mutated) {
    return cfg;
  }

  return {
    ...cfg,
    agents: {
      ...agents,
      defaults: {
        ...nextDefaults,
        subagents: nextSubagents,
      },
    },
  };
}

export function applyLoggingDefaults(cfg: OpenClawConfig): OpenClawConfig {
  const logging = cfg.logging;
  if (!logging) {
    return cfg;
  }
  if (logging.redactSensitive) {
    return cfg;
  }
  return {
    ...cfg,
    logging: {
      ...logging,
      redactSensitive: "tools",
    },
  };
}

export function applyContextPruningDefaults(cfg: OpenClawConfig): OpenClawConfig {
  const defaults = cfg.agents?.defaults;
  if (!defaults) {
    return cfg;
  }

  let mutated = false;
  const nextDefaults = { ...defaults };
  const contextPruning = defaults.contextPruning ?? {};
  const heartbeat = defaults.heartbeat ?? {};

  if (defaults.contextPruning?.mode === undefined) {
    nextDefaults.contextPruning = {
      ...contextPruning,
      mode: "cache-ttl",
      ttl: defaults.contextPruning?.ttl ?? "1h",
    };
    mutated = true;
  }

  if (defaults.heartbeat?.every === undefined) {
    nextDefaults.heartbeat = {
      ...heartbeat,
      every: "30m",
    };
    mutated = true;
  }

  if (!mutated) {
    return cfg;
  }

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: nextDefaults,
    },
  };
}

export function applyCompactionDefaults(cfg: OpenClawConfig): OpenClawConfig {
  const defaults = cfg.agents?.defaults;
  if (!defaults) {
    return cfg;
  }
  const compaction = defaults?.compaction;
  if (compaction?.mode) {
    return cfg;
  }

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...defaults,
        compaction: {
          ...compaction,
          mode: "safeguard",
        },
      },
    },
  };
}

export function resetSessionDefaultsWarningForTests() {
  defaultWarnState = { warned: false };
}
