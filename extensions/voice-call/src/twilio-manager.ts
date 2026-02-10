import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { VoiceCallServer } from "./server.js";
import type {
  VoiceCallActionResult,
  VoiceCallConfig,
  VoiceCallContinueParams,
  VoiceCallEndParams,
  VoiceCallEventBus,
  VoiceCallInitiateParams,
  VoiceCallManager,
  VoiceCallRecord,
  VoiceCallSpeakParams,
} from "./types.js";
import { resolveDefaultMode } from "./config.js";
import { updateRecordFromStatus } from "./server.js";
import {
  buildPauseTwiml,
  buildTwiml,
  resolveStreamUrl,
  resolveTwilioCredentials,
  twilioRequest,
} from "./twilio.js";

export class TwilioVoiceCallManager implements VoiceCallManager {
  private readonly calls = new Map<string, VoiceCallRecord>();

  constructor(
    private readonly config: VoiceCallConfig,
    private readonly server: VoiceCallServer | null,
    private readonly logger: { warn: (message: string) => void },
    private readonly coreConfig: OpenClawConfig,
    private readonly events: VoiceCallEventBus,
    private readonly tts: {
      textToSpeechTelephony: (params: { text: string; cfg: OpenClawConfig }) => Promise<{
        success: boolean;
        audioBuffer?: Buffer;
        error?: string;
      }>;
    },
  ) {}

  private emit(event: Parameters<VoiceCallEventBus["emit"]>[0]) {
    this.events.emit(event);
  }

  async initiateCall(params: VoiceCallInitiateParams): Promise<VoiceCallActionResult> {
    const creds = resolveTwilioCredentials(this.config);
    if (!creds) {
      this.emit({ type: "error", ts: Date.now(), message: "twilio credentials missing" });
      return { success: false, error: "twilio credentials missing" };
    }
    const to = params.to;
    const from = creds.fromNumber;
    if (!from) {
      this.emit({ type: "error", ts: Date.now(), message: "fromNumber required" });
      return { success: false, error: "fromNumber required" };
    }

    const mode = params.mode ?? resolveDefaultMode(this.config);
    const streamUrl =
      mode === "conversation" ? (resolveStreamUrl(this.config) ?? undefined) : undefined;
    if (mode === "conversation" && !streamUrl) {
      this.logger.warn("voice-call: streaming requested but no public stream URL configured");
    }
    const twiml = this.config.twilio?.twimlUrl
      ? undefined
      : buildTwiml({ message: params.message, streamUrl, mode });

    const statusCallback =
      this.config.twilio?.statusCallbackUrl ?? this.config.publicUrl ?? undefined;
    const statusEvents = this.config.twilio?.statusCallbackEvents?.join(" ") ?? undefined;

    const result = await twilioRequest({
      accountSid: creds.accountSid,
      authToken: creds.authToken,
      path: "Calls.json",
      body: {
        To: to,
        From: from,
        Twiml: twiml,
        Url: this.config.twilio?.twimlUrl,
        StatusCallback: statusCallback,
        StatusCallbackEvent: statusEvents,
        StatusCallbackMethod: statusCallback ? "POST" : undefined,
      },
    });

    if (!result.ok) {
      this.emit({ type: "error", ts: Date.now(), message: result.error });
      return { success: false, error: result.error };
    }

    const callSid = String(result.data.sid ?? "").trim();
    if (!callSid) {
      this.emit({ type: "error", ts: Date.now(), message: "Twilio did not return CallSid" });
      return { success: false, error: "Twilio did not return CallSid" };
    }

    const now = Date.now();
    const record: VoiceCallRecord = {
      callId: callSid,
      to,
      from,
      mode,
      provider: this.config.provider,
      providerCallId: callSid,
      status: "active",
      createdAtMs: now,
      updatedAtMs: now,
      transcript: [params.message],
    };
    this.calls.set(callSid, record);
    this.emit({
      type: "outbound.initiated",
      ts: now,
      callId: callSid,
      to,
      mode,
      provider: this.config.provider,
    });

    return { success: true, callId: callSid };
  }

  async continueCall(params: VoiceCallContinueParams): Promise<VoiceCallActionResult> {
    return await this.sendMessage(
      { callId: params.callId, message: params.message },
      "outbound.continue",
    );
  }

  async speak(params: VoiceCallSpeakParams): Promise<VoiceCallActionResult> {
    return await this.sendMessage(params, "outbound.speak");
  }

  private async sendMessage(
    params: VoiceCallSpeakParams,
    eventType: "outbound.speak" | "outbound.continue",
  ): Promise<VoiceCallActionResult> {
    const record = this.calls.get(params.callId);
    if (!record) {
      this.emit({ type: "error", ts: Date.now(), message: "call not found" });
      return { success: false, error: "call not found" };
    }

    record.transcript ??= [];
    record.transcript.push(params.message);
    record.updatedAtMs = Date.now();
    this.emit({
      type: eventType,
      ts: record.updatedAtMs,
      callId: record.callId,
      message: params.message,
    });

    if (this.server?.hasStream(params.callId)) {
      const ttsResult = await this.tts.textToSpeechTelephony({
        text: params.message,
        cfg: this.coreConfig,
      });
      if (!ttsResult.success || !ttsResult.audioBuffer) {
        this.emit({
          type: "error",
          ts: Date.now(),
          message: ttsResult.error ?? "TTS failed for streaming",
        });
        return {
          success: false,
          error: ttsResult.error ?? "TTS failed for streaming",
        };
      }
      const sent = this.server.sendStreamAudio(params.callId, ttsResult.audioBuffer);
      if (!sent) {
        this.emit({ type: "error", ts: Date.now(), message: "stream not ready" });
        return { success: false, error: "stream not ready" };
      }
      return { success: true, callId: params.callId };
    }

    const creds = resolveTwilioCredentials(this.config);
    if (!creds) {
      this.emit({ type: "error", ts: Date.now(), message: "twilio credentials missing" });
      return { success: false, error: "twilio credentials missing" };
    }

    const result = await twilioRequest({
      accountSid: creds.accountSid,
      authToken: creds.authToken,
      path: `Calls/${params.callId}.json`,
      body: {
        Twiml: buildTwiml({ message: params.message, mode: "notify" }),
      },
    });

    if (!result.ok) {
      this.emit({ type: "error", ts: Date.now(), message: result.error });
      return { success: false, error: result.error };
    }

    return { success: true, callId: params.callId };
  }

  async endCall(params: VoiceCallEndParams): Promise<VoiceCallActionResult> {
    const record = this.calls.get(params.callId);
    if (record) {
      record.status = "ended";
      record.updatedAtMs = Date.now();
      this.emit({
        type: "outbound.end",
        ts: record.updatedAtMs,
        callId: record.callId,
      });
    }

    const creds = resolveTwilioCredentials(this.config);
    if (!creds) {
      this.emit({ type: "error", ts: Date.now(), message: "twilio credentials missing" });
      return { success: false, error: "twilio credentials missing" };
    }

    const result = await twilioRequest({
      accountSid: creds.accountSid,
      authToken: creds.authToken,
      path: `Calls/${params.callId}.json`,
      body: {
        Status: "completed",
      },
    });

    if (!result.ok) {
      this.emit({ type: "error", ts: Date.now(), message: result.error });
      return { success: false, error: result.error };
    }

    return { success: true, callId: params.callId };
  }

  getCall(callId: string): VoiceCallRecord | undefined {
    return this.calls.get(callId);
  }

  getCallByProviderCallId(providerCallId: string): VoiceCallRecord | undefined {
    return this.calls.get(providerCallId);
  }

  handleInbound(params: { callSid: string; from: string; to: string }) {
    const now = Date.now();
    const record: VoiceCallRecord = this.calls.get(params.callSid) ?? {
      callId: params.callSid,
      to: params.to,
      from: params.from,
      provider: this.config.provider,
      providerCallId: params.callSid,
      status: "active",
      createdAtMs: now,
      updatedAtMs: now,
    };
    record.to = params.to;
    record.from = params.from;
    record.updatedAtMs = now;
    this.calls.set(params.callSid, record);
    this.emit({
      type: "inbound.call",
      ts: now,
      callId: params.callSid,
      from: params.from,
      to: params.to,
    });
  }

  handleStatus(params: { callSid: string; status?: string }) {
    const record = this.calls.get(params.callSid);
    if (!record) {
      return;
    }
    updateRecordFromStatus(record, params.status);
    this.emit({
      type: "status",
      ts: record.updatedAtMs,
      callId: params.callSid,
      status: params.status,
    });
  }

  warnIfMissingServer() {
    if (!this.server) {
      this.logger.warn("voice-call: twilio server not running (inbound/streaming disabled)");
    }
  }

  async ensureStreamingKeepsAlive(callSid: string) {
    if (!this.server?.hasStream(callSid)) {
      return;
    }
    const creds = resolveTwilioCredentials(this.config);
    if (!creds) {
      return;
    }
    await twilioRequest({
      accountSid: creds.accountSid,
      authToken: creds.authToken,
      path: `Calls/${callSid}.json`,
      body: {
        Twiml: buildPauseTwiml(),
      },
    });
  }
}
