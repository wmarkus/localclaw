import type { VoiceCallConfig, VoiceCallMode, VoiceCallProvider } from "./types.js";

const DEFAULT_PROVIDER: VoiceCallProvider = "mock";
const DEFAULT_MODE: VoiceCallMode = "notify";
const DEFAULT_WEBHOOK_PATH = "/voice/webhook";
const DEFAULT_STREAM_PATH = "/voice/stream";

const PROVIDERS = new Set<VoiceCallProvider>(["mock", "twilio", "telnyx", "plivo"]);

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readProvider(value: unknown): VoiceCallProvider {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (PROVIDERS.has(normalized as VoiceCallProvider)) {
      return normalized as VoiceCallProvider;
    }
  }
  return DEFAULT_PROVIDER;
}

function readMode(value: unknown): VoiceCallMode | undefined {
  if (value === "notify" || value === "conversation") {
    return value;
  }
  return undefined;
}

export function normalizeVoiceCallConfig(
  raw: Record<string, unknown> | undefined,
): VoiceCallConfig {
  const base: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const provider = readProvider(raw?.provider);
  const fromNumber = readString(raw?.fromNumber);
  const toNumber = readString(raw?.toNumber);

  const outboundRaw = readRecord(raw?.outbound);
  const outbound = outboundRaw
    ? {
        defaultMode: readMode(outboundRaw.defaultMode),
      }
    : undefined;

  const inboundPolicy =
    raw?.inboundPolicy === "allowlist" || raw?.inboundPolicy === "disabled"
      ? raw.inboundPolicy
      : undefined;
  const allowFrom = readStringArray(raw?.allowFrom);
  const inboundGreeting = readString(raw?.inboundGreeting);
  const responseModel = readString(raw?.responseModel);
  const responseSystemPrompt = readString(raw?.responseSystemPrompt);
  const responseTimeoutMs = readNumber(raw?.responseTimeoutMs);
  const publicUrl = readString(raw?.publicUrl);

  const serveRaw = readRecord(raw?.serve);
  const serve = serveRaw
    ? {
        port: readNumber(serveRaw.port),
        bind: readString(serveRaw.bind),
        path: readString(serveRaw.path) ?? DEFAULT_WEBHOOK_PATH,
      }
    : undefined;

  const streamingRaw = readRecord(raw?.streaming);
  const streaming = streamingRaw
    ? {
        enabled: readBoolean(streamingRaw.enabled),
        streamPath: readString(streamingRaw.streamPath) ?? DEFAULT_STREAM_PATH,
        publicUrl: readString(streamingRaw.publicUrl),
      }
    : undefined;

  const twilioRaw = readRecord(raw?.twilio);
  const twilio = twilioRaw
    ? {
        accountSid: readString(twilioRaw.accountSid),
        authToken: readString(twilioRaw.authToken),
        fromNumber: readString(twilioRaw.fromNumber),
        statusCallbackUrl: readString(twilioRaw.statusCallbackUrl),
        statusCallbackEvents: readStringArray(twilioRaw.statusCallbackEvents),
        twimlUrl: readString(twilioRaw.twimlUrl),
        skipSignatureVerification:
          readBoolean(twilioRaw.skipSignatureVerification) ??
          readBoolean(raw?.skipSignatureVerification),
      }
    : readBoolean(raw?.skipSignatureVerification)
      ? { skipSignatureVerification: readBoolean(raw?.skipSignatureVerification) }
      : undefined;

  const config: VoiceCallConfig = {
    ...base,
    provider,
    fromNumber,
    toNumber,
    outbound,
    inboundPolicy,
    allowFrom,
    inboundGreeting,
    responseModel,
    responseSystemPrompt,
    responseTimeoutMs,
    publicUrl,
    serve,
    streaming,
    twilio,
  };

  return config;
}

export function resolveDefaultMode(config: VoiceCallConfig): VoiceCallMode {
  return config.outbound?.defaultMode ?? DEFAULT_MODE;
}
