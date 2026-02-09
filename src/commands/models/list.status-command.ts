import type { RuntimeEnv } from "../../runtime.js";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";
import { resolveAgentDir, resolveAgentModelFallbacksOverride } from "../../agents/agent-scope.js";
import {
  resolveConfiguredModelRef,
  resolveDefaultModelForAgent,
} from "../../agents/model-selection.js";
import { loadConfig } from "../../config/config.js";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  ensureFlagCompatibility,
  resolveKnownAgentId,
} from "./shared.js";

export async function modelsStatusCommand(
  opts: {
    json?: boolean;
    plain?: boolean;
    agent?: string;
  },
  runtime: RuntimeEnv,
) {
  ensureFlagCompatibility(opts);
  const cfg = loadConfig();
  const mainAgentDir = resolveOpenClawAgentDir();
  const agentId = resolveKnownAgentId({ cfg, rawAgentId: opts.agent });
  const agentDir = agentId ? resolveAgentDir(cfg, agentId) : mainAgentDir;

  const resolved = agentId
    ? resolveDefaultModelForAgent({ cfg, agentId })
    : resolveConfiguredModelRef({
        cfg,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
      });

  const modelConfig = cfg.agents?.defaults?.model as
    | { primary?: string; fallbacks?: string[] }
    | string
    | undefined;
  const imageConfig = cfg.agents?.defaults?.imageModel as
    | { primary?: string; fallbacks?: string[] }
    | string
    | undefined;

  const rawDefaultsModel =
    typeof modelConfig === "string" ? modelConfig.trim() : (modelConfig?.primary?.trim() ?? "");
  const resolvedDefault = `${resolved.provider}/${resolved.model}`;
  const defaultLabel = agentId ? resolvedDefault : rawDefaultsModel || resolvedDefault;
  const defaultsFallbacks = typeof modelConfig === "object" ? (modelConfig?.fallbacks ?? []) : [];
  const fallbacks = agentId
    ? (resolveAgentModelFallbacksOverride(cfg, agentId) ?? defaultsFallbacks)
    : defaultsFallbacks;
  const imageModel =
    typeof imageConfig === "string" ? imageConfig.trim() : (imageConfig?.primary?.trim() ?? "");
  const imageFallbacks = typeof imageConfig === "object" ? (imageConfig?.fallbacks ?? []) : [];

  const payload = {
    agentId: agentId ?? undefined,
    agentDir,
    resolvedDefault,
    defaultModel: defaultLabel,
    fallbacks,
    imageModel: imageModel || null,
    imageFallbacks,
    providers: Object.keys(cfg.models?.providers ?? {}),
  };

  if (opts.json) {
    runtime.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (opts.plain) {
    runtime.log(defaultLabel);
    return;
  }

  runtime.log(`Default model: ${defaultLabel}`);
  if (fallbacks.length > 0) {
    runtime.log(`Fallbacks: ${fallbacks.join(", ")}`);
  }
  if (imageModel) {
    runtime.log(`Image model: ${imageModel}`);
  }
  if (imageFallbacks.length > 0) {
    runtime.log(`Image fallbacks: ${imageFallbacks.join(", ")}`);
  }
}
