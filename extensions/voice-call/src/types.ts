export type VoiceCallProvider = "mock" | "twilio" | "telnyx" | "plivo";
export type VoiceCallMode = "notify" | "conversation";
export type VoiceCallEvent =
  | {
      type: "outbound.initiated";
      ts: number;
      callId: string;
      to: string;
      mode?: VoiceCallMode;
      provider: VoiceCallProvider;
    }
  | {
      type: "outbound.continue";
      ts: number;
      callId: string;
      message: string;
    }
  | {
      type: "outbound.speak";
      ts: number;
      callId: string;
      message: string;
    }
  | {
      type: "outbound.end";
      ts: number;
      callId: string;
    }
  | {
      type: "inbound.call";
      ts: number;
      callId: string;
      from: string;
      to: string;
    }
  | {
      type: "status";
      ts: number;
      callId: string;
      status?: string;
    }
  | {
      type: "stream.start";
      ts: number;
      callId?: string;
      streamSid?: string;
    }
  | {
      type: "stream.media";
      ts: number;
      callId?: string;
      streamSid?: string;
      bytes: number;
    }
  | {
      type: "stream.stop";
      ts: number;
      callId?: string;
      streamSid?: string;
    }
  | {
      type: "error";
      ts: number;
      message: string;
    };

export type VoiceCallEventBus = {
  on: (handler: (event: VoiceCallEvent) => void) => void;
  off: (handler: (event: VoiceCallEvent) => void) => void;
  emit: (event: VoiceCallEvent) => void;
};

export type VoiceCallConfig = {
  provider: VoiceCallProvider;
  fromNumber?: string;
  toNumber?: string;
  outbound?: {
    defaultMode?: VoiceCallMode;
  };
  inboundPolicy?: "disabled" | "allowlist";
  allowFrom?: string[];
  inboundGreeting?: string;
  responseModel?: string;
  responseSystemPrompt?: string;
  responseTimeoutMs?: number;
  publicUrl?: string;
  serve?: {
    port?: number;
    bind?: string;
    path?: string;
  };
  streaming?: {
    enabled?: boolean;
    streamPath?: string;
    publicUrl?: string;
  };
  twilio?: {
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
    statusCallbackUrl?: string;
    statusCallbackEvents?: string[];
    twimlUrl?: string;
    skipSignatureVerification?: boolean;
  };
  [key: string]: unknown;
};

export type VoiceCallRecord = {
  callId: string;
  to: string;
  from?: string;
  mode?: VoiceCallMode;
  provider: VoiceCallProvider;
  providerCallId?: string;
  status: "active" | "ended";
  createdAtMs: number;
  updatedAtMs: number;
  transcript?: string[];
};

export type VoiceCallInitiateParams = {
  to: string;
  message: string;
  mode?: VoiceCallMode;
};

export type VoiceCallContinueParams = {
  callId: string;
  message: string;
};

export type VoiceCallSpeakParams = {
  callId: string;
  message: string;
};

export type VoiceCallEndParams = {
  callId: string;
};

export type VoiceCallManager = {
  initiateCall: (params: VoiceCallInitiateParams) => Promise<VoiceCallActionResult>;
  continueCall: (params: VoiceCallContinueParams) => Promise<VoiceCallActionResult>;
  speak: (params: VoiceCallSpeakParams) => Promise<VoiceCallActionResult>;
  endCall: (params: VoiceCallEndParams) => Promise<VoiceCallActionResult>;
  getCall: (callId: string) => VoiceCallRecord | undefined;
  getCallByProviderCallId: (providerCallId: string) => VoiceCallRecord | undefined;
};

export type VoiceCallActionResult = {
  success: boolean;
  callId?: string;
  transcript?: string;
  details?: Record<string, unknown>;
  error?: string;
};

export type VoiceCallRuntime = {
  config: VoiceCallConfig;
  manager: VoiceCallManager;
  events: VoiceCallEventBus;
  stop: () => Promise<void>;
};
