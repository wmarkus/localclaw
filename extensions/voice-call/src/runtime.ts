import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { VoiceCallManager, VoiceCallRuntime } from "./types.js";
import { normalizeVoiceCallConfig } from "./config.js";
import { createVoiceCallEventBus } from "./events.js";
import { MockVoiceCallManager } from "./mock-manager.js";
import { createVoiceCallServer, type VoiceCallServer } from "./server.js";
import { TwilioVoiceCallManager } from "./twilio-manager.js";

function createUnsupportedManager(provider: string): VoiceCallManager {
  const error = `provider not available in local build: ${provider}`;
  const failed = async () => ({ success: false, error });
  return {
    initiateCall: failed,
    continueCall: failed,
    speak: failed,
    endCall: failed,
    getCall: () => undefined,
    getCallByProviderCallId: () => undefined,
  };
}

export async function createVoiceCallRuntime(api: OpenClawPluginApi): Promise<VoiceCallRuntime> {
  const config = normalizeVoiceCallConfig(api.pluginConfig);
  const events = createVoiceCallEventBus();

  let manager: VoiceCallManager;
  let server: VoiceCallServer | null = null;
  if (config.provider === "mock") {
    manager = new MockVoiceCallManager(config, events);
  } else if (config.provider === "twilio") {
    const needsServer = config.streaming?.enabled === true || config.inboundPolicy === "allowlist";
    let twilioManager: TwilioVoiceCallManager | null = null;
    if (needsServer) {
      server = createVoiceCallServer({
        config,
        handlers: {
          onInboundCall: ({ callSid, from, to }) => {
            twilioManager?.handleInbound({ callSid, from, to });
          },
          onStatus: ({ callSid, status }) => {
            twilioManager?.handleStatus({ callSid, status });
          },
          onStreamStart: ({ callSid, streamSid }) => {
            events.emit({
              type: "stream.start",
              ts: Date.now(),
              callId: callSid,
              streamSid,
            });
          },
          onStreamMedia: ({ callSid, streamSid, payload }) => {
            const bytes = payload ? Buffer.byteLength(payload, "base64") : 0;
            events.emit({
              type: "stream.media",
              ts: Date.now(),
              callId: callSid,
              streamSid,
              bytes,
            });
          },
          onStreamStop: ({ callSid, streamSid }) => {
            events.emit({
              type: "stream.stop",
              ts: Date.now(),
              callId: callSid,
              streamSid,
            });
          },
        },
        logger: api.logger,
      });
      try {
        await server.start();
      } catch (err) {
        api.logger.error(`voice-call: failed to start webhook server (${String(err)})`);
        events.emit({
          type: "error",
          ts: Date.now(),
          message: `failed to start webhook server: ${String(err)}`,
        });
        server = null;
      }
    }

    twilioManager = new TwilioVoiceCallManager(
      config,
      server,
      api.logger,
      api.config,
      events,
      api.runtime.tts,
    );
    manager = twilioManager;
    if (!needsServer) {
      twilioManager.warnIfMissingServer();
    }
  } else {
    api.logger.warn(`voice-call: using unsupported provider "${config.provider}" (mock only)`);
    events.emit({
      type: "error",
      ts: Date.now(),
      message: `provider not available in local build: ${config.provider}`,
    });
    manager = createUnsupportedManager(config.provider);
  }

  return {
    config,
    manager,
    events,
    stop: async () => {
      if (server) {
        await server.stop();
      }
    },
  };
}
