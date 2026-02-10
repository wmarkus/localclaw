import type { Command } from "commander";
import {
  disableTailscaleFunnel,
  disableTailscaleServe,
  enableTailscaleFunnel,
  enableTailscaleServe,
} from "openclaw/plugin-sdk";
import type { VoiceCallEvent, VoiceCallRuntime } from "./types.js";
import { resolveDefaultMode } from "./config.js";

type CliParams = {
  runtimePromise: Promise<VoiceCallRuntime>;
  logger: { error: (message: string) => void };
};

type RawOptions = Record<string, unknown>;
type CommandHandler = (opts: RawOptions) => Promise<void>;

function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function formatEvent(event: VoiceCallEvent): string {
  const ts = new Date(event.ts).toISOString();
  switch (event.type) {
    case "outbound.initiated":
      return `${ts} outbound.initiated callId=${event.callId} to=${event.to} mode=${event.mode ?? "notify"}`;
    case "outbound.continue":
      return `${ts} outbound.continue callId=${event.callId} message=${event.message}`;
    case "outbound.speak":
      return `${ts} outbound.speak callId=${event.callId} message=${event.message}`;
    case "outbound.end":
      return `${ts} outbound.end callId=${event.callId}`;
    case "inbound.call":
      return `${ts} inbound.call callId=${event.callId} from=${event.from} to=${event.to}`;
    case "status":
      return `${ts} status callId=${event.callId} status=${event.status ?? "unknown"}`;
    case "stream.start":
      return `${ts} stream.start callId=${event.callId ?? "unknown"} streamSid=${event.streamSid ?? "unknown"}`;
    case "stream.media":
      return `${ts} stream.media callId=${event.callId ?? "unknown"} streamSid=${event.streamSid ?? "unknown"} bytes=${event.bytes}`;
    case "stream.stop":
      return `${ts} stream.stop callId=${event.callId ?? "unknown"} streamSid=${event.streamSid ?? "unknown"}`;
    case "error":
      return `${ts} error ${event.message}`;
    default:
      return `${ts} event`;
  }
}

export function registerVoiceCallCli(program: Command, params: CliParams) {
  const command = program
    .command("voicecall")
    .description("Voice call plugin commands")
    .showHelpAfterError();

  const withRuntime = (handler: (runtime: VoiceCallRuntime, opts: RawOptions) => Promise<void>) => {
    return async (opts: RawOptions) => {
      try {
        const runtime = await params.runtimePromise;
        await handler(runtime, opts);
      } catch (err) {
        params.logger.error(`voicecall command failed: ${String(err)}`);
        printJson({ ok: false, error: String(err) });
      }
    };
  };

  const registerStartLike = (name: string, handler: CommandHandler) => {
    command
      .command(name)
      .description("Initiate an outbound call")
      .option("--to <number>", "Destination number")
      .option("--message <text>", "Message text")
      .option("--mode <mode>", "Call mode (notify | conversation)")
      .action(handler);
  };

  const startHandler: CommandHandler = withRuntime(async (runtime, opts) => {
    const to = readString(opts.to) ?? runtime.config.toNumber;
    const message = readString(opts.message);
    if (!message) {
      printJson({ ok: false, error: "message required" });
      return;
    }
    if (!to) {
      printJson({ ok: false, error: "to required" });
      return;
    }
    const mode =
      opts.mode === "notify" || opts.mode === "conversation"
        ? opts.mode
        : resolveDefaultMode(runtime.config);
    const result = await runtime.manager.initiateCall({ to, message, mode });
    printJson(result);
  });

  registerStartLike("start", startHandler);
  registerStartLike("call", startHandler);

  command
    .command("continue")
    .description("Continue an active call")
    .requiredOption("--call-id <id>", "Call ID")
    .requiredOption("--message <text>", "Message text")
    .action(
      withRuntime(async (runtime, opts) => {
        const callId = readString(opts.callId);
        const message = readString(opts.message);
        if (!callId || !message) {
          printJson({ ok: false, error: "call-id and message required" });
          return;
        }
        const result = await runtime.manager.continueCall({ callId, message });
        printJson(result);
      }),
    );

  command
    .command("speak")
    .description("Speak a message during the call")
    .requiredOption("--call-id <id>", "Call ID")
    .requiredOption("--message <text>", "Message text")
    .action(
      withRuntime(async (runtime, opts) => {
        const callId = readString(opts.callId);
        const message = readString(opts.message);
        if (!callId || !message) {
          printJson({ ok: false, error: "call-id and message required" });
          return;
        }
        const result = await runtime.manager.speak({ callId, message });
        printJson(result);
      }),
    );

  command
    .command("end")
    .description("End an active call")
    .requiredOption("--call-id <id>", "Call ID")
    .action(
      withRuntime(async (runtime, opts) => {
        const callId = readString(opts.callId);
        if (!callId) {
          printJson({ ok: false, error: "call-id required" });
          return;
        }
        const result = await runtime.manager.endCall({ callId });
        printJson(result);
      }),
    );

  command
    .command("status")
    .description("Inspect an active call")
    .requiredOption("--call-id <id>", "Call ID")
    .action(
      withRuntime(async (runtime, opts) => {
        const callId = readString(opts.callId);
        if (!callId) {
          printJson({ ok: false, error: "call-id required" });
          return;
        }
        const record = runtime.manager.getCall(callId);
        printJson({ found: Boolean(record), callId, call: record ?? undefined });
      }),
    );

  command
    .command("tail")
    .description("Tail voice call events")
    .option("--json", "Output JSON events", false)
    .action(
      withRuntime(async (runtime, opts) => {
        const json = Boolean(opts.json);
        const handler = (event: VoiceCallEvent) => {
          if (json) {
            printJson(event);
          } else {
            console.log(formatEvent(event));
          }
        };
        runtime.events.on(handler);

        const shutdown = async () => {
          runtime.events.off(handler);
          await runtime.stop();
        };

        process.on("SIGINT", () => {
          void shutdown().finally(() => process.exit(0));
        });
        process.on("SIGTERM", () => {
          void shutdown().finally(() => process.exit(0));
        });

        process.stdin.resume();
        await new Promise(() => {});
      }),
    );

  command
    .command("expose")
    .description("Expose webhook via Tailscale")
    .option("--mode <mode>", "Tailscale mode (serve|funnel)", "serve")
    .option("--port <port>", "Port to expose (defaults to webhook port)")
    .action(
      withRuntime(async (runtime, opts) => {
        const mode = readString(opts.mode) ?? "serve";
        if (mode !== "serve" && mode !== "funnel") {
          printJson({ ok: false, error: 'Invalid --mode (use "serve" or "funnel")' });
          return;
        }
        const port = readNumber(opts.port) ?? runtime.config.serve?.port ?? 3334;
        try {
          if (mode === "serve") {
            await enableTailscaleServe(port);
          } else {
            await enableTailscaleFunnel(port);
          }
          printJson({ ok: true, mode, port });
        } catch (err) {
          printJson({ ok: false, error: String(err) });
        }
      }),
    );

  command
    .command("unexpose")
    .description("Disable Tailscale expose for webhook")
    .action(async () => {
      try {
        await disableTailscaleServe();
      } catch {
        // ignore serve reset errors; funnel reset may still succeed
      }
      try {
        await disableTailscaleFunnel();
      } catch (err) {
        printJson({ ok: false, error: String(err) });
        return;
      }
      printJson({ ok: true });
    });
}
