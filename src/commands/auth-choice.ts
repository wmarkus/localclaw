import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { AuthChoice } from "./onboard-types.js";

export type ApplyAuthChoiceParams = {
  authChoice: AuthChoice;
  config: OpenClawConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  agentDir?: string;
  setDefaultModel: boolean;
  agentId?: string;
};

export type ApplyAuthChoiceResult = {
  config: OpenClawConfig;
  agentModelOverride?: string;
};

export async function applyAuthChoice(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult> {
  void params;
  return { config: params.config };
}

export async function warnIfModelConfigLooksOff(
  cfg: OpenClawConfig,
  prompter: WizardPrompter,
  opts?: { onAction?: () => void | Promise<void> },
): Promise<void> {
  const providers = cfg.models?.providers ?? {};
  const providerKeys = Object.keys(providers);
  const warnings: string[] = [];

  if (providerKeys.length === 0) {
    warnings.push(
      [
        "No model providers are configured yet.",
        "OpenClaw will auto-discover the local Ollama instance and fall back to gpt-oss-120b.",
        "Make sure Ollama is running on http://127.0.0.1:11434.",
      ].join("\n"),
    );
  }

  const unknownProviders = providerKeys.filter((key) => key.trim().toLowerCase() !== "ollama");
  if (unknownProviders.length > 0) {
    warnings.push(
      [
        "This build is local-only and ignores non-Ollama providers:",
        ...unknownProviders.map((key) => `- ${key}`),
        "Remove these entries to avoid confusion.",
      ].join("\n"),
    );
  }

  const ollama = providers.ollama;
  if (ollama?.baseUrl && !isLoopbackUrl(ollama.baseUrl)) {
    warnings.push(
      [
        "Ollama must be served from loopback only (no LAN).",
        `Update models.providers.ollama.baseUrl to http://127.0.0.1:11434/v1 (current: ${ollama.baseUrl}).`,
      ].join("\n"),
    );
  }

  if (warnings.length === 0) {
    return;
  }

  await prompter.note(warnings.join("\n\n"), "Models");
  if (opts?.onAction) {
    await opts.onAction();
  }
}

export function resolvePreferredProviderForAuthChoice(_choice?: AuthChoice): string | null {
  return "ollama";
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
