import type { OpenClawConfig, GatewayAuthConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  applyModelAllowlist,
  applyModelFallbacksFromSelection,
  applyPrimaryModel,
  promptDefaultModel,
  promptModelAllowlist,
} from "./model-picker.js";

type GatewayAuthChoice = "token" | "password";

export function buildGatewayAuthConfig(params: {
  existing?: GatewayAuthConfig;
  mode: GatewayAuthChoice;
  token?: string;
  password?: string;
}): GatewayAuthConfig | undefined {
  const allowTailscale = params.existing?.allowTailscale;
  const base: GatewayAuthConfig = {};
  if (typeof allowTailscale === "boolean") {
    base.allowTailscale = allowTailscale;
  }

  if (params.mode === "token") {
    return { ...base, mode: "token", token: params.token };
  }
  return { ...base, mode: "password", password: params.password };
}

export async function promptAuthConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  void runtime;
  let next = cfg;
  const modelSelection = await promptDefaultModel({
    config: next,
    prompter,
    allowKeep: true,
    ignoreAllowlist: true,
    preferredProvider: "ollama",
  });
  if (modelSelection.model) {
    next = applyPrimaryModel(next, modelSelection.model);
  }

  const allowlistSelection = await promptModelAllowlist({
    config: next,
    prompter,
  });
  if (allowlistSelection.models) {
    next = applyModelAllowlist(next, allowlistSelection.models);
    next = applyModelFallbacksFromSelection(next, allowlistSelection.models);
  }

  return next;
}
