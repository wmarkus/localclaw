import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { ChannelId } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  TtsConfig,
  TtsAutoMode,
  TtsMode,
  TtsProvider,
  TtsModelOverrideConfig,
} from "../config/types.tts.js";
import { CONFIG_DIR } from "../utils.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TTS_MAX_LENGTH = 1500;
const DEFAULT_TTS_SUMMARIZE = true;
const DEFAULT_PROVIDER: TtsProvider = "local";
const DEFAULT_MODE: TtsMode = "final";

const TTS_AUTO_MODES = new Set<TtsAutoMode>(["off", "always", "inbound", "tagged"]);

export type ResolvedTtsModelOverrides = {
  enabled: boolean;
  allowText: boolean;
  allowProvider: boolean;
  allowVoice: boolean;
  allowModelId: boolean;
  allowVoiceSettings: boolean;
  allowNormalization: boolean;
  allowSeed: boolean;
};

export type ResolvedTtsConfig = {
  auto: TtsAutoMode;
  mode: TtsMode;
  provider: TtsProvider;
  providerSource: "config" | "default";
  summaryModel?: string;
  modelOverrides: ResolvedTtsModelOverrides;
  prefsPath?: string;
  maxTextLength: number;
  timeoutMs: number;
};

type TtsUserPrefs = {
  tts?: {
    auto?: TtsAutoMode;
    enabled?: boolean;
    provider?: TtsProvider;
    maxLength?: number;
    summarize?: boolean;
  };
};

export type TtsResult = {
  success: boolean;
  audioPath?: string;
  error?: string;
  latencyMs?: number;
  provider?: string;
  outputFormat?: string;
  voiceCompatible?: boolean;
};

export type TtsTelephonyResult = {
  success: boolean;
  audioBuffer?: Buffer;
  error?: string;
  latencyMs?: number;
  provider?: string;
  outputFormat?: string;
  sampleRate?: number;
};

type TtsStatusEntry = {
  timestamp: number;
  success: boolean;
  textLength: number;
  summarized: boolean;
  provider?: string;
  latencyMs?: number;
  error?: string;
};

let lastTtsAttempt: TtsStatusEntry | undefined;

export function normalizeTtsAutoMode(value: unknown): TtsAutoMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (TTS_AUTO_MODES.has(normalized as TtsAutoMode)) {
    return normalized as TtsAutoMode;
  }
  return undefined;
}

function resolveModelOverridePolicy(
  overrides: TtsModelOverrideConfig | undefined,
): ResolvedTtsModelOverrides {
  const enabled = overrides?.enabled ?? false;
  return {
    enabled,
    allowText: enabled && overrides?.allowText !== false,
    allowProvider: enabled && overrides?.allowProvider !== false,
    allowVoice: enabled && overrides?.allowVoice !== false,
    allowModelId: enabled && overrides?.allowModelId !== false,
    allowVoiceSettings: enabled && overrides?.allowVoiceSettings !== false,
    allowNormalization: enabled && overrides?.allowNormalization !== false,
    allowSeed: enabled && overrides?.allowSeed !== false,
  };
}

export function resolveTtsConfig(cfg: OpenClawConfig): ResolvedTtsConfig {
  const raw: TtsConfig = cfg.messages?.tts ?? {};
  const auto =
    normalizeTtsAutoMode(raw.auto) ??
    (typeof raw.enabled === "boolean" ? (raw.enabled ? "always" : "off") : "off");
  const mode = raw.mode ?? DEFAULT_MODE;
  const provider = raw.provider ?? DEFAULT_PROVIDER;
  const providerSource = raw.provider ? "config" : "default";
  const modelOverrides = resolveModelOverridePolicy(raw.modelOverrides);
  const prefsPath = raw.prefsPath?.trim();
  const maxTextLength = raw.maxTextLength ?? DEFAULT_TTS_MAX_LENGTH;
  const timeoutMs = raw.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    auto,
    mode,
    provider,
    providerSource,
    summaryModel: raw.summaryModel?.trim() || undefined,
    modelOverrides,
    prefsPath,
    maxTextLength,
    timeoutMs,
  };
}

export function resolveTtsPrefsPath(config: ResolvedTtsConfig): string {
  if (config.prefsPath?.trim()) {
    return config.prefsPath.trim();
  }
  return path.join(CONFIG_DIR, "settings", "tts.json");
}

function readPrefs(prefsPath: string): TtsUserPrefs {
  try {
    if (!existsSync(prefsPath)) {
      return {};
    }
    const raw = readFileSync(prefsPath, "utf-8");
    return JSON.parse(raw) as TtsUserPrefs;
  } catch {
    return {};
  }
}

function writePrefs(prefsPath: string, prefs: TtsUserPrefs): void {
  const dir = path.dirname(prefsPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(prefsPath, `${JSON.stringify(prefs, null, 2)}\n`, "utf-8");
}

export function resolveTtsAutoMode(params: {
  config: ResolvedTtsConfig;
  prefsPath: string;
  sessionAuto?: string;
}): TtsAutoMode {
  const sessionAuto = normalizeTtsAutoMode(params.sessionAuto);
  if (sessionAuto) {
    return sessionAuto;
  }
  const prefs = readPrefs(params.prefsPath);
  if (normalizeTtsAutoMode(prefs.tts?.auto)) {
    return prefs.tts?.auto as TtsAutoMode;
  }
  if (typeof prefs.tts?.enabled === "boolean") {
    return prefs.tts.enabled ? "always" : "off";
  }
  return params.config.auto ?? "off";
}

export function buildTtsSystemPromptHint(_cfg: OpenClawConfig): string | undefined {
  return undefined;
}

export function isTtsEnabled(_config: ResolvedTtsConfig, _prefsPath: string): boolean {
  return false;
}

export function setTtsAutoMode(prefsPath: string, mode: TtsAutoMode): void {
  const prefs = readPrefs(prefsPath);
  prefs.tts = { ...prefs.tts, auto: mode };
  writePrefs(prefsPath, prefs);
}

export function setTtsEnabled(prefsPath: string, enabled: boolean): void {
  const prefs = readPrefs(prefsPath);
  prefs.tts = { ...prefs.tts, enabled };
  writePrefs(prefsPath, prefs);
}

export function getTtsProvider(config: ResolvedTtsConfig, prefsPath: string): TtsProvider {
  const prefs = readPrefs(prefsPath);
  return prefs.tts?.provider ?? config.provider ?? DEFAULT_PROVIDER;
}

export function setTtsProvider(prefsPath: string, provider: TtsProvider): void {
  const prefs = readPrefs(prefsPath);
  prefs.tts = { ...prefs.tts, provider };
  writePrefs(prefsPath, prefs);
}

export function getTtsMaxLength(prefsPath: string): number {
  const prefs = readPrefs(prefsPath);
  return prefs.tts?.maxLength ?? DEFAULT_TTS_MAX_LENGTH;
}

export function setTtsMaxLength(prefsPath: string, maxLength: number): void {
  const prefs = readPrefs(prefsPath);
  prefs.tts = { ...prefs.tts, maxLength };
  writePrefs(prefsPath, prefs);
}

export function isSummarizationEnabled(prefsPath: string): boolean {
  const prefs = readPrefs(prefsPath);
  return prefs.tts?.summarize ?? DEFAULT_TTS_SUMMARIZE;
}

export function setSummarizationEnabled(prefsPath: string, enabled: boolean): void {
  const prefs = readPrefs(prefsPath);
  prefs.tts = { ...prefs.tts, summarize: enabled };
  writePrefs(prefsPath, prefs);
}

export function getLastTtsAttempt(): TtsStatusEntry | undefined {
  return lastTtsAttempt;
}

export function setLastTtsAttempt(entry: TtsStatusEntry | undefined): void {
  lastTtsAttempt = entry;
}

export function resolveTtsApiKey(
  _config: ResolvedTtsConfig,
  _provider: TtsProvider,
): string | null {
  return null;
}

export const TTS_PROVIDERS = ["local"] as const;

export function resolveTtsProviderOrder(primary: TtsProvider): TtsProvider[] {
  return [primary];
}

export function isTtsProviderConfigured(
  _config: ResolvedTtsConfig,
  _provider: TtsProvider,
): boolean {
  return false;
}

export async function textToSpeech(_params: {
  text: string;
  cfg: OpenClawConfig;
  channel?: ChannelId;
  prefsPath?: string;
}): Promise<TtsResult> {
  return {
    success: false,
    error: "TTS is disabled in the local-only build.",
  };
}

export async function textToSpeechTelephony(_params: {
  text: string;
  cfg: OpenClawConfig;
}): Promise<TtsTelephonyResult> {
  return {
    success: false,
    error: "TTS is disabled in the local-only build.",
  };
}

export async function maybeApplyTtsToPayload(params: {
  payload: ReplyPayload;
  cfg: OpenClawConfig;
  channel?: string;
  kind?: "tool" | "block" | "final";
  inboundAudio?: boolean;
  ttsAuto?: string;
}): Promise<ReplyPayload> {
  void params;
  return params.payload;
}

export const _test = {
  resolveModelOverridePolicy,
};
