import crypto from "node:crypto";
import type { VoiceCallConfig, VoiceCallMode } from "./types.js";

export type TwilioRequestResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; data?: Record<string, unknown> };

export function resolveTwilioCredentials(config: VoiceCallConfig): {
  accountSid: string;
  authToken: string;
  fromNumber?: string;
} | null {
  const accountSid = config.twilio?.accountSid ?? "";
  const authToken = config.twilio?.authToken ?? "";
  if (!accountSid || !authToken) {
    return null;
  }
  return {
    accountSid,
    authToken,
    fromNumber: config.twilio?.fromNumber ?? config.fromNumber,
  };
}

function encodeAuth(accountSid: string, authToken: string): string {
  return Buffer.from(`${accountSid}:${authToken}`, "utf-8").toString("base64");
}

export async function twilioRequest(params: {
  accountSid: string;
  authToken: string;
  path: string;
  body: Record<string, string | undefined>;
}): Promise<TwilioRequestResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/${params.path}`;
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params.body)) {
    if (typeof value === "string" && value.trim().length > 0) {
      form.set(key, value);
    }
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeAuth(params.accountSid, params.authToken)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  let payload: Record<string, unknown> | undefined;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const error =
      (payload?.message as string | undefined) ??
      (payload?.error_message as string | undefined) ??
      res.statusText ??
      "Twilio request failed";
    return { ok: false, status: res.status, error, data: payload };
  }

  return { ok: true, data: payload ?? {} };
}

export function buildTwiml(params: {
  message?: string;
  streamUrl?: string;
  mode?: VoiceCallMode;
}): string {
  const parts: string[] = [];
  if (params.message) {
    parts.push(`<Say>${escapeXml(params.message)}</Say>`);
  }
  if (params.mode === "conversation" && params.streamUrl) {
    parts.push(`<Connect><Stream url="${escapeXml(params.streamUrl)}" track="both" /></Connect>`);
  }
  if (parts.length === 0) {
    parts.push("<Say></Say>");
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>`;
}

export function buildRejectTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>';
}

export function buildPauseTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="60"/></Response>';
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildTwilioSignatureBase(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).toSorted();
  let base = url;
  for (const key of keys) {
    const value = params[key] ?? "";
    base += key + value;
  }
  return base;
}

export function validateTwilioSignature(params: {
  url: string;
  params: Record<string, string>;
  signature: string | undefined;
  authToken: string;
}): boolean {
  const signature = params.signature;
  if (!signature) {
    return false;
  }
  const base = buildTwilioSignatureBase(params.url, params.params);
  const digest = crypto.createHmac("sha1", params.authToken).update(base).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function resolvePublicWebhookUrl(config: VoiceCallConfig): string | null {
  if (config.publicUrl) {
    return config.publicUrl;
  }
  return null;
}

export function resolveStreamUrl(config: VoiceCallConfig): string | null {
  const streamUrl = config.streaming?.publicUrl;
  if (streamUrl) {
    return streamUrl;
  }
  if (config.publicUrl && config.streaming?.streamPath) {
    try {
      const base = new URL(config.publicUrl);
      const path = config.streaming.streamPath.startsWith("/")
        ? config.streaming.streamPath
        : `/${config.streaming.streamPath}`;
      base.protocol = base.protocol.replace("http", "ws");
      base.pathname = path;
      base.search = "";
      return base.toString();
    } catch {
      return null;
    }
  }
  return null;
}
