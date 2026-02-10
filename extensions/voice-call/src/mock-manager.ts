import { randomUUID } from "node:crypto";
import type {
  VoiceCallActionResult,
  VoiceCallConfig,
  VoiceCallEventBus,
  VoiceCallManager,
  VoiceCallRecord,
  VoiceCallSpeakParams,
  VoiceCallContinueParams,
  VoiceCallEndParams,
  VoiceCallInitiateParams,
} from "./types.js";

export class MockVoiceCallManager implements VoiceCallManager {
  private readonly calls = new Map<string, VoiceCallRecord>();
  private readonly providerCallIndex = new Map<string, string>();

  constructor(
    private readonly config: VoiceCallConfig,
    private readonly events?: VoiceCallEventBus,
  ) {}

  private emit(event: Parameters<VoiceCallEventBus["emit"]>[0]) {
    this.events?.emit(event);
  }

  async initiateCall(params: VoiceCallInitiateParams): Promise<VoiceCallActionResult> {
    const callId = `call-${randomUUID()}`;
    const now = Date.now();
    const record: VoiceCallRecord = {
      callId,
      to: params.to,
      from: this.config.fromNumber,
      mode: params.mode,
      provider: this.config.provider,
      status: "active",
      createdAtMs: now,
      updatedAtMs: now,
      transcript: [params.message],
    };
    this.calls.set(callId, record);
    if (record.providerCallId) {
      this.providerCallIndex.set(record.providerCallId, callId);
    }
    this.emit({
      type: "outbound.initiated",
      ts: now,
      callId,
      to: params.to,
      mode: params.mode,
      provider: this.config.provider,
    });
    return { success: true, callId };
  }

  async continueCall(params: VoiceCallContinueParams): Promise<VoiceCallActionResult> {
    const record = this.calls.get(params.callId);
    if (!record) {
      return { success: false, error: "call not found" };
    }
    record.transcript ??= [];
    record.transcript.push(params.message);
    record.updatedAtMs = Date.now();
    this.emit({
      type: "outbound.continue",
      ts: record.updatedAtMs,
      callId: record.callId,
      message: params.message,
    });
    return { success: true, callId: record.callId, transcript: params.message };
  }

  async speak(params: VoiceCallSpeakParams): Promise<VoiceCallActionResult> {
    const record = this.calls.get(params.callId);
    if (!record) {
      return { success: false, error: "call not found" };
    }
    record.transcript ??= [];
    record.transcript.push(params.message);
    record.updatedAtMs = Date.now();
    this.emit({
      type: "outbound.speak",
      ts: record.updatedAtMs,
      callId: record.callId,
      message: params.message,
    });
    return { success: true, callId: record.callId };
  }

  async endCall(params: VoiceCallEndParams): Promise<VoiceCallActionResult> {
    const record = this.calls.get(params.callId);
    if (!record) {
      return { success: false, error: "call not found" };
    }
    record.status = "ended";
    record.updatedAtMs = Date.now();
    this.emit({
      type: "outbound.end",
      ts: record.updatedAtMs,
      callId: record.callId,
    });
    return { success: true, callId: record.callId };
  }

  getCall(callId: string): VoiceCallRecord | undefined {
    return this.calls.get(callId);
  }

  getCallByProviderCallId(providerCallId: string): VoiceCallRecord | undefined {
    const callId = this.providerCallIndex.get(providerCallId);
    if (!callId) {
      return undefined;
    }
    return this.calls.get(callId);
  }
}
