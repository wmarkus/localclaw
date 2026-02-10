import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import type { VoiceCallRuntime } from "./types.js";
import { resolveDefaultMode } from "./config.js";

const ACTIONS = [
  "initiate_call",
  "continue_call",
  "speak_to_user",
  "end_call",
  "get_status",
] as const;

type ToolAction = (typeof ACTIONS)[number];

type ToolParams = {
  action?: ToolAction;
  callId?: string;
  message?: string;
  to?: string;
  mode?: string;
  sid?: string;
};

function stringEnum<T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

export const VoiceCallToolSchema = Type.Object(
  {
    action: Type.Optional(
      stringEnum(ACTIONS, { description: `Action to perform: ${ACTIONS.join(", ")}` }),
    ),
    callId: Type.Optional(Type.String({ description: "Call identifier" })),
    message: Type.Optional(Type.String({ description: "Message text" })),
    to: Type.Optional(Type.String({ description: "Destination phone number" })),
    mode: Type.Optional(Type.String({ description: "Call mode (notify | conversation)" })),
    sid: Type.Optional(Type.String({ description: "Legacy provider call SID" })),
  },
  { additionalProperties: false },
);

export function createVoiceCallTool(runtimePromise: Promise<VoiceCallRuntime>) {
  return {
    name: "voice_call",
    label: "Voice Call",
    description:
      "Start or manage outbound voice calls. Actions: initiate_call, continue_call, " +
      "speak_to_user, end_call, get_status.",
    parameters: VoiceCallToolSchema,
    execute: async (_toolCallId: string, params: ToolParams) => {
      try {
        const runtime = await runtimePromise;
        const action = params.action;

        if (!action && params.mode === "status") {
          if (!params.sid && !params.callId) {
            return jsonResult({ error: "sid required" });
          }
          const callId = params.callId ?? params.sid;
          const record = callId ? runtime.manager.getCall(callId) : undefined;
          return jsonResult({
            found: Boolean(record),
            callId,
            call: record ?? undefined,
          });
        }

        if (!action) {
          return jsonResult({ error: "action required" });
        }

        switch (action) {
          case "initiate_call": {
            if (!params.message) {
              return jsonResult({ error: "message required" });
            }
            const to = params.to ?? runtime.config.toNumber;
            if (!to) {
              return jsonResult({ error: "to required" });
            }
            const mode =
              params.mode === "notify" || params.mode === "conversation"
                ? params.mode
                : resolveDefaultMode(runtime.config);
            const result = await runtime.manager.initiateCall({
              to,
              message: params.message,
              mode,
            });
            return jsonResult(result);
          }

          case "continue_call": {
            if (!params.callId) {
              return jsonResult({ error: "callId required" });
            }
            if (!params.message) {
              return jsonResult({ error: "message required" });
            }
            const result = await runtime.manager.continueCall({
              callId: params.callId,
              message: params.message,
            });
            return jsonResult(result);
          }

          case "speak_to_user": {
            if (!params.callId) {
              return jsonResult({ error: "callId required" });
            }
            if (!params.message) {
              return jsonResult({ error: "message required" });
            }
            const result = await runtime.manager.speak({
              callId: params.callId,
              message: params.message,
            });
            return jsonResult(result);
          }

          case "end_call": {
            if (!params.callId) {
              return jsonResult({ error: "callId required" });
            }
            const result = await runtime.manager.endCall({ callId: params.callId });
            return jsonResult(result);
          }

          case "get_status": {
            if (!params.callId) {
              return jsonResult({ error: "callId required" });
            }
            const record = runtime.manager.getCall(params.callId);
            return jsonResult({
              found: Boolean(record),
              callId: params.callId,
              call: record ?? undefined,
            });
          }

          default: {
            action satisfies never;
            return jsonResult({ error: `Unknown action: ${String(action)}` });
          }
        }
      } catch (err) {
        return jsonResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
