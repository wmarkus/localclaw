import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import {
  getTtsProvider,
  resolveTtsAutoMode,
  resolveTtsConfig,
  resolveTtsPrefsPath,
} from "../../tts/tts.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";

export const ttsHandlers: GatewayRequestHandlers = {
  "tts.status": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      const provider = getTtsProvider(config, prefsPath);
      const autoMode = resolveTtsAutoMode({ config, prefsPath });
      respond(true, {
        enabled: false,
        auto: autoMode,
        provider,
        fallbackProvider: null,
        fallbackProviders: [],
        prefsPath,
        edgeEnabled: false,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "tts.enable": async ({ respond }) => {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, "TTS is disabled in the local-only build."),
    );
  },
  "tts.disable": async ({ respond }) => {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, "TTS is disabled in the local-only build."),
    );
  },
  "tts.convert": async ({ params, respond }) => {
    void params;
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, "TTS is disabled in the local-only build."),
    );
  },
  "tts.setProvider": async ({ params, respond }) => {
    void params;
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, "TTS is disabled in the local-only build."),
    );
  },
  "tts.providers": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      respond(true, {
        providers: [],
        active: getTtsProvider(config, prefsPath),
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
