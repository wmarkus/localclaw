import type { VoiceCallRuntime } from "./types.js";
import { resolveDefaultMode } from "./config.js";

type HandlerOpts = {
  params: Record<string, unknown>;
  respond: (ok: boolean, payload?: unknown, error?: { code: string; message: string }) => void;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readMode(value: unknown): "notify" | "conversation" | undefined {
  if (value === "notify" || value === "conversation") {
    return value;
  }
  return undefined;
}

function respondError(opts: HandlerOpts, message: string, code: string = "INVALID_REQUEST") {
  opts.respond(false, undefined, { code, message });
}

export function createVoiceCallGatewayHandlers(runtimePromise: Promise<VoiceCallRuntime>) {
  const initiate = async (opts: HandlerOpts) => {
    const runtime = await runtimePromise;
    const message = readString(opts.params.message);
    const to = readString(opts.params.to) ?? runtime.config.toNumber;
    if (!message) {
      respondError(opts, "message required");
      return;
    }
    if (!to) {
      respondError(opts, "to required");
      return;
    }
    const mode = readMode(opts.params.mode) ?? resolveDefaultMode(runtime.config);
    const result = await runtime.manager.initiateCall({ to, message, mode });
    opts.respond(true, result, undefined);
  };

  const start = async (opts: HandlerOpts) => {
    await initiate(opts);
  };

  const continueCall = async (opts: HandlerOpts) => {
    const runtime = await runtimePromise;
    const callId = readString(opts.params.callId);
    const message = readString(opts.params.message);
    if (!callId) {
      respondError(opts, "callId required");
      return;
    }
    if (!message) {
      respondError(opts, "message required");
      return;
    }
    const result = await runtime.manager.continueCall({ callId, message });
    opts.respond(true, result, undefined);
  };

  const speak = async (opts: HandlerOpts) => {
    const runtime = await runtimePromise;
    const callId = readString(opts.params.callId);
    const message = readString(opts.params.message);
    if (!callId) {
      respondError(opts, "callId required");
      return;
    }
    if (!message) {
      respondError(opts, "message required");
      return;
    }
    const result = await runtime.manager.speak({ callId, message });
    opts.respond(true, result, undefined);
  };

  const end = async (opts: HandlerOpts) => {
    const runtime = await runtimePromise;
    const callId = readString(opts.params.callId);
    if (!callId) {
      respondError(opts, "callId required");
      return;
    }
    const result = await runtime.manager.endCall({ callId });
    opts.respond(true, result, undefined);
  };

  const status = async (opts: HandlerOpts) => {
    const runtime = await runtimePromise;
    const callId = readString(opts.params.callId);
    const providerCallId = readString(opts.params.providerCallId) ?? readString(opts.params.sid);
    if (!callId && !providerCallId) {
      respondError(opts, "callId required");
      return;
    }
    const record = callId
      ? runtime.manager.getCall(callId)
      : providerCallId
        ? runtime.manager.getCallByProviderCallId(providerCallId)
        : undefined;
    opts.respond(
      true,
      record
        ? { found: true, callId: record.callId, call: record }
        : { found: false, callId: callId ?? providerCallId },
      undefined,
    );
  };

  return {
    initiate,
    start,
    continueCall,
    speak,
    end,
    status,
  };
}
